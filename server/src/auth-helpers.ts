// Small helpers split from auth.ts to keep the public surface clean.
import crypto from 'node:crypto';
import type { Request } from 'express';
import { db, save, now } from './db.js';
import { sendMail } from './services/email.js';
import type { User, VerificationToken } from './types.js';

export async function issueResend(req: Request, u: User) {
  const t: VerificationToken = { token: crypto.randomBytes(24).toString('base64url'), userId: u.id, purpose: 'verify_email', expiresAt: new Date(Date.now() + 2 * 864e5).toISOString() };
  db().tokens.push(t); save();
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  await sendMail({ to: u.email, subject: 'Verify your VeriPay email', text: `Hi ${u.name},\n\nVerify your email: ${base}/verify-email?token=${t.token}\n\nLink expires in 48 hours.` });
}
