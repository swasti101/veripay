// Real email/password auth alongside the demo accounts.
// - Passwords: scrypt (node:crypto) with per-user salt (N=2^15, memory ~32 MB).
// - Sessions: 256-bit opaque tokens in an HttpOnly cookie; rotated on each login.
// - Tokens: email verification, password reset, invite. Single-use, time-limited.
// - CSRF: mutating requests must carry `X-VeriPay: 1` (not sendable cross-site without CORS).
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, save, now, id, audit } from './db.js';
import { sendMail } from './services/email.js';
import type { User, VerificationToken } from './types.js';

const COOKIE = 'vp_session';
const SESSION_TTL_MS = 7 * 864e5;
const VERIFY_TTL_MS = 2 * 864e5;
const RESET_TTL_MS = 1 * 864e5;

const timingSafeEq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const emailOk = (s: string) => /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{1,24}$/.test(s);

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return `scrypt$15$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [scheme, n, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64'), 64, { N: 1 << Number(n), r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return timingSafeEq(hash.toString('base64'), hashB64);
}

export function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res: Response, token: string, maxAge: number) {
  const parts = [`${COOKIE}=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function startSession(req: Request, res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  db().sessions.push({ token, userId, createdAt: now(), ip: req.ip });
  // Prune old sessions for this user (keep last 5 + anything <14 days)
  const mine = db().sessions.filter((s) => s.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (mine.length > 5) {
    const drop = new Set(mine.slice(0, mine.length - 5).map((s) => s.token));
    db().sessions = db().sessions.filter((s) => !drop.has(s.token));
  }
  save();
  setCookie(res, token, SESSION_TTL_MS / 1000);
}

export function endSession(req: Request, res: Response) {
  const t = parseCookies(req)[COOKIE];
  const d = db();
  d.sessions = d.sessions.filter((s) => s.token !== t);
  save();
  setCookie(res, '', 0);
}

export function currentUser(req: Request): User | null {
  const t = parseCookies(req)[COOKIE];
  if (!t) return null;
  const s = db().sessions.find((x) => x.token === t);
  if (!s) return null;
  if (Date.now() - Date.parse(s.createdAt) > SESSION_TTL_MS) {
    db().sessions = db().sessions.filter((x) => x.token !== t); save(); return null;
  }
  return db().users.find((u) => u.id === s.userId) || null;
}

declare global { namespace Express { interface Request { user?: User } } }

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Sign in required' });
  if (req.method !== 'GET' && req.headers['x-veripay'] !== '1') return res.status(403).json({ error: 'Missing X-VeriPay header' });
  req.user = u;
  next();
}

export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' });
  if (!req.user.emailVerifiedAt && !req.user.isDemo) return res.status(403).json({ error: 'Please verify your email first' });
  next();
}

function issueToken(userId: string, purpose: VerificationToken['purpose'], ttlMs: number, payload?: Record<string, string>) {
  const t: VerificationToken = { token: crypto.randomBytes(24).toString('base64url'), userId, purpose, payload, expiresAt: new Date(Date.now() + ttlMs).toISOString() };
  db().tokens.push(t); save();
  return t;
}
function consumeToken(token: string, purpose: VerificationToken['purpose']): VerificationToken | null {
  const t = db().tokens.find((x) => x.token === token && x.purpose === purpose);
  if (!t || t.usedAt || Date.parse(t.expiresAt) < Date.now()) return null;
  t.usedAt = now(); save();
  return t;
}

function baseUrl(req: Request) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

export async function signup(req: Request, res: Response, body: any) {
  const name = String(body?.name || '').trim().slice(0, 80);
  const email = String(body?.email || '').trim().toLowerCase().slice(0, 120);
  const password = String(body?.password || '');
  const role = body?.role;
  if (!name || !emailOk(email)) return res.status(400).json({ error: 'A real name and a valid email are required' });
  if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });
  if (!['client', 'freelancer'].includes(role)) return res.status(400).json({ error: 'Choose a role' });
  const d = db();
  const existing = d.users.find((u) => u.email === email);
  if (existing) {
    // Enumeration protection: 202 regardless. If the existing account is unverified, re-send the verification.
    if (!existing.emailVerifiedAt && !existing.isDemo) {
      const t = issueToken(existing.id, 'verify_email', VERIFY_TTL_MS);
      await sendMail({ to: email, subject: 'Verify your VeriPay email', text: `Hi ${existing.name},\n\nVerify your email: ${baseUrl(req)}/verify-email?token=${t.token}\n\nLink expires in 48 hours.` });
    }
    return res.status(202).json({ ok: true, enumeration: true });
  }
  const u: User = { id: id('usr'), name, email, role, passwordHash: hashPassword(password), emailVerifiedAt: null, createdAt: now() };
  d.users.push(u); save();
  const t = issueToken(u.id, 'verify_email', VERIFY_TTL_MS);
  audit({ projectId: null, actor: u.id, actorType: 'user', action: 'SIGNUP', details: `${role} account created; verification email sent to ${email}`, refs: [] });
  await sendMail({ to: email, subject: 'Verify your VeriPay email', text: `Welcome to VeriPay, ${name}.\n\nVerify your email: ${baseUrl(req)}/verify-email?token=${t.token}\n\nLink expires in 48 hours.` });
  res.status(202).json({ ok: true });
}

export function login(req: Request, res: Response, body: any) {
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!emailOk(email) || !password) return res.status(400).json({ error: 'Email and password required' });
  const u = db().users.find((x) => x.email === email && x.passwordHash);
  if (!u || !verifyPassword(password, u.passwordHash!)) return res.status(401).json({ error: 'Incorrect email or password' });
  u.lastLoginAt = now();
  endSession(req, res); // rotate
  startSession(req, res, u.id);
  audit({ projectId: null, actor: u.id, actorType: 'user', action: 'LOGIN', details: `signed in from ${req.ip}`, refs: [] });
  res.json({ user: u });
}

export function verifyEmail(token: string): { ok: boolean; user?: User; error?: string } {
  const t = consumeToken(token, 'verify_email');
  if (!t) return { ok: false, error: 'Verification link is invalid or has expired. Request a new one by signing in.' };
  const u = db().users.find((x) => x.id === t.userId);
  if (!u) return { ok: false, error: 'Account not found' };
  u.emailVerifiedAt = now(); save();
  audit({ projectId: null, actor: u.id, actorType: 'user', action: 'EMAIL_VERIFIED', details: `email ${u.email} verified`, refs: [] });
  return { ok: true, user: u };
}

export async function requestPasswordReset(req: Request, email: string) {
  const u = db().users.find((x) => x.email === email && x.passwordHash);
  if (!u) return; // enumeration protection
  const t = issueToken(u.id, 'password_reset', RESET_TTL_MS);
  await sendMail({ to: email, subject: 'Reset your VeriPay password', text: `Reset your password: ${baseUrl(req)}/reset-password?token=${t.token}\n\nLink expires in 24 hours. If you did not request this, you can ignore this email.` });
}

export function completePasswordReset(token: string, newPassword: string): { ok: boolean; error?: string } {
  if (newPassword.length < 10) return { ok: false, error: 'Password must be at least 10 characters' };
  const t = consumeToken(token, 'password_reset');
  if (!t) return { ok: false, error: 'Reset link is invalid or has expired' };
  const u = db().users.find((x) => x.id === t.userId);
  if (!u) return { ok: false, error: 'Account not found' };
  u.passwordHash = hashPassword(newPassword);
  // Invalidate all sessions for this user.
  db().sessions = db().sessions.filter((s) => s.userId !== u.id);
  save();
  audit({ projectId: null, actor: u.id, actorType: 'user', action: 'PASSWORD_RESET', details: 'password changed via reset token; all sessions invalidated', refs: [] });
  return { ok: true };
}
