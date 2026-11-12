import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { db, save, id, now, audit, postMessage, saveEvidenceFile, readEvidenceFile } from './db.js';
import { requireUser, requireVerifiedEmail, startSession, endSession, currentUser, signup, login, verifyEmail, requestPasswordReset, completePasswordReset } from './auth.js';
import { sendMail, recentMail, emailConfigured } from './services/email.js';
import { issueResend } from './auth-helpers.js';
import { rateLimit } from './services/ratelimit.js';
import { HttpError, fail, loadProject, touch, msState, newDraftFrom, validateAgreement, finalizeIfApproved, refreshFunding, inviteCode, projectView, partyOf, moneySummary, pendingActions, evaluatePrecheck, withFreelancer, latestSubmission } from './logic.js';
import { activeAgreement, draftAgreement, askPM, AGENTS, coordinate } from './services/pm.js';
import { extractSOW, recommendFunding } from './services/sow.js';
import { runKernelInspection, kernelConfigured, computerAgentMode } from './services/kernel.js';
import { runQA, classifyFeedback } from './services/qa.js';
import { computeAllocation, aggregateVotes } from './services/allocation.js';
import { selectPanel, simulateVote } from './services/experts.js';
import * as pp from './services/paypal.js';
import { aiJSON, aiLabel, aiProvider } from './services/ai.js';
import { seed, SAMPLE_SOW, TOOLSHOP_SOW } from './seed.js';
import type { Party, Project, Transaction, User, ExpertReview, Requirement, Milestone, FundingOption } from './types.js';

export const api = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 8 } });

// async wrapper + error mapping
const h = (fn: (req: Request, res: Response) => Promise<any> | any) => async (req: Request, res: Response, next: NextFunction) => {
  try { const out = await fn(req, res); if (!res.headersSent) res.json(out ?? { ok: true }); } catch (e) { next(e); }
};
const str = (v: any, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: any) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : NaN);
const U = (req: Request) => req.user!;

/** Operator-readable PayPal failure, keeping the debug_id PayPal support asks for. */
function ppFail(e: unknown) {
  if (e instanceof pp.PayPalCallError) {
    return [e.message, e.debugId ? `PayPal debug_id ${e.debugId} — quote this to PayPal support.` : null,
      e.retryable ? 'This looks transient; retrying is safe.' : 'This is not a transient failure; retrying as-is will fail again.'].filter(Boolean).join(' ');
  }
  return e instanceof Error ? e.message : String(e);
}

function tx(t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'currency'> & { currency?: string }) {
  const rec: Transaction = { id: id('tx'), currency: 'USD', createdAt: now(), updatedAt: now(), ...t } as Transaction;
  db().transactions.push(rec);
  audit({ projectId: t.projectId, actor: t.mode === 'SIMULATED' ? 'payment-simulator' : 'paypal', actorType: 'paypal', action: `TX_${t.type}`, details: `${t.mode === 'SIMULATED' ? '[SIMULATED] ' : ''}${t.type} $${t.amount} → ${t.status}. ${t.note}`, refs: [{ type: 'transaction', id: rec.id }] });
  return rec;
}

// ───────────────────────── config / auth ─────────────────────────
api.get('/config', h(() => ({
  ai: { configured: !!aiProvider(), label: aiLabel() },
  kernel: { configured: kernelConfigured(), mode: computerAgentMode() },
  paypal: { mode: pp.paypalMode(), clientId: pp.paypalConfigured() ? process.env.PAYPAL_CLIENT_ID : null, webhookVerification: !!process.env.PAYPAL_WEBHOOK_ID },
  apimatic: { sdk: '@paypal/paypal-server-sdk (APIMatic-generated)', openapi: '/openapi.yaml', sdkGeneration: !!process.env.APIMATIC_API_KEY },
  publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
})));

api.get('/auth/demo-users', h(() => db().users.filter((u) => u.isDemo).map((u) => ({ id: u.id, name: u.name, role: u.role, email: u.email }))));
const demoAllowed = () => process.env.DISABLE_DEMO_LOGIN !== 'true';
api.post('/auth/demo-login', rateLimit('demo', { perMinute: 30, burst: 10 }), h((req, res) => {
  if (!demoAllowed()) fail(403, 'Demo accounts are disabled on this deployment');
  const u = db().users.find((x) => x.id === req.body?.userId && x.isDemo) || fail(404, 'Demo user not found');
  startSession(req, res, u.id);
  return { user: u };
}));
// Real accounts
api.post('/auth/signup', rateLimit('signup', { perMinute: 5, burst: 5 }), h(async (req, res) => { await signup(req, res, req.body); }));
api.post('/auth/login', rateLimit('login', { perMinute: 10, burst: 5 }), h((req, res) => login(req, res, req.body)));
api.post('/auth/verify-email', h((req, res) => {
  const r = verifyEmail(str(req.body?.token, 200));
  if (!r.ok) return res.status(400).json({ error: r.error });
  if (r.user) startSession(req, res, r.user.id);
  return { user: r.user };
}));
api.post('/auth/resend-verification', rateLimit('resend', { perMinute: 2, burst: 3 }), h(async (req, res) => {
  const email = str(req.body?.email, 120).toLowerCase();
  const u = db().users.find((x) => x.email === email && x.passwordHash && !x.emailVerifiedAt);
  if (u) await issueResend(req, u);
  res.status(202).json({ ok: true });
}));
api.post('/auth/forgot-password', rateLimit('forgot', { perMinute: 3, burst: 3 }), h(async (req, res) => {
  await requestPasswordReset(req, str(req.body?.email, 120).toLowerCase());
  res.status(202).json({ ok: true }); // always 202 to avoid enumeration
}));
api.post('/auth/reset-password', rateLimit('reset', { perMinute: 5, burst: 5 }), h((req, res) => {
  const r = completePasswordReset(str(req.body?.token, 200), String(req.body?.password || ''));
  if (!r.ok) return res.status(400).json({ error: r.error });
  return { ok: true };
}));
api.post('/auth/logout', h((req, res) => { endSession(req, res); }));
api.get('/auth/me', h((req) => ({ user: currentUser(req) })));
// Dev mailbox — only when SMTP isn't configured, so real deployments don't leak mail.
api.get('/auth/dev-mailbox', h((_req, res) => {
  if (emailConfigured()) return res.status(404).json({ error: 'Not available' });
  return { messages: recentMail() };
}));

// Reset & reseed the demo dataset (local demo convenience; requires a session).
api.post('/demo/reset', requireUser, h(async (req, res) => { await seed(true); endSession(req, res); return { ok: true }; }));

api.get('/demo/sample-sow', h((req) => (req.query.kind === 'toolshop' ? { text: TOOLSHOP_SOW, title: 'Toolshop — Online Hardware Store' } : { text: SAMPLE_SOW, title: 'Northwind Outfitters — E-Commerce Storefront' })));

api.use(requireUser);

api.patch('/me/payout', h((req) => {
  const email = str(req.body?.paypalEmail, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Valid PayPal email required');
  const u = U(req);
  u.paypalEmail = email; u.payoutOnboarded = true; save();
  audit({ projectId: null, actor: u.id, actorType: 'user', action: 'PAYOUT_ONBOARDED', details: `Payout receiver set (${pp.paypalMode()}).`, refs: [] });
  return { user: u };
}));

// ───────────────────────── dashboard ─────────────────────────
api.get('/dashboard', h((req) => {
  const u = U(req);
  const d = db();
  const mine = d.projects.filter((p) => partyOf(p, u));
  const projects = mine.map((p) => {
    const ag = activeAgreement(p) || draftAgreement(p);
    const m = moneySummary(p);
    const current = ag?.milestones.find((ms) => { const s = p.milestoneStates.find((x) => x.milestoneId === ms.id); return s && s.workStatus !== 'CLOSED' && s.workStatus !== 'ACCEPTED'; });
    const next = ag?.milestones.map((ms) => ms.dueDate).filter((x) => x && Date.parse(x) > Date.now()).sort()[0] || null;
    const done = p.milestoneStates.filter((s) => s.workStatus === 'ACCEPTED' || s.workStatus === 'CLOSED').length;
    const party = partyOf(p, u)!;
    const pending = pendingActions(p, party);
    return {
      id: p.id, title: p.title, status: p.status, role: party, isDemo: p.isDemo, demoLabel: p.demoLabel,
      counterpart: d.users.find((x) => x.id === (party === 'client' ? p.freelancerId : p.clientId))?.name || '(invite pending)',
      currentMilestone: current ? `${current.id} ${current.title}` : '—', currentWork: current ? p.milestoneStates.find((x) => x.milestoneId === current.id)?.workStatus : '—',
      currentFunding: current ? p.milestoneStates.find((x) => x.milestoneId === current.id)?.fundingStatus : '—',
      nextDeadline: next, milestonesDone: done, milestonesTotal: ag?.milestones.length || 0,
      awaitingReview: d.submissions.filter((s) => s.projectId === p.id).length && p.milestoneStates.filter((s) => ['SUBMITTED', 'QA_COMPLETE', 'IN_EXPERT_REVIEW'].includes(s.workStatus)).length,
      expertReview: d.expertReviews.filter((r) => r.projectId === p.id).at(-1)?.status || 'NONE',
      pending, ...m,
    };
  });
  const txs = d.transactions.filter((t) => mine.some((p) => p.id === t.projectId)).map((t) => ({ ...t, project: mine.find((p) => p.id === t.projectId)?.title }));
  const milestones = mine.flatMap((p) => (activeAgreement(p)?.milestones || []).map((m) => ({ project: p.title, projectId: p.id, ...m, ...p.milestoneStates.find((s) => s.milestoneId === m.id) })));
  return { projects, transactions: txs, milestones };
}));

// ───────────────────────── delivery board & review triage ─────────────────────────
// Feeds the cross-project Gantt and the expert-review Scheduler. Read-only: this endpoint
// never moves a date. The agreed baseline can only change through an approved agreement
// version, so everything here is a flag or a proposal, never an applied reschedule.
api.get('/board', h((req) => {
  const u = U(req);
  const d = db();
  const mine = d.projects.filter((p) => partyOf(p, u));
  const nowMs = Date.now();
  const DAY = 864e5;

  const projects = mine.map((p) => {
    const ag = activeAgreement(p) || draftAgreement(p);
    if (!ag) return null;
    const party = partyOf(p, u)!;
    const counterpart = d.users.find((x) => x.id === (party === 'client' ? p.freelancerId : p.clientId))?.name || '(not joined)';

    const milestones = ag.milestones.map((m, i) => {
      const st = p.milestoneStates.find((s) => s.milestoneId === m.id);
      const funded = (st?.authorized || 0) + (st?.captured || 0);
      const fundingGap = Math.max(0, m.amount - funded);
      // Our product rule: work cannot begin on an unfunded milestone. That makes funding a
      // genuine predecessor of the work, not just a status column.
      const blockedByFunding = fundingGap > 0 && st?.workStatus === 'NOT_STARTED';
      const due = Date.parse(m.dueDate);
      const start = Date.parse(m.startDate) || Date.parse(ag.milestones[i - 1]?.dueDate) || nowMs;
      const overdue = !isNaN(due) && due < nowMs && !['ACCEPTED', 'CLOSED'].includes(st?.workStatus || '');
      // A funding hold that lapses before the work is assessed cannot be captured.
      const authExpiresBeforeDue = !!st?.authorizationExpires && !isNaN(due) && Date.parse(st.authorizationExpires) < due;
      return {
        id: m.id, title: m.title, amount: m.amount,
        startDate: m.startDate || new Date(start).toISOString().slice(0, 10),
        dueDate: m.dueDate || new Date(start + 7 * DAY).toISOString().slice(0, 10),
        dependsOn: m.dependsOn || [],
        workStatus: st?.workStatus || 'DRAFT', fundingStatus: st?.fundingStatus || 'DRAFT',
        funded, fundingGap, blockedByFunding, overdue, authExpiresBeforeDue,
        authorizationExpires: st?.authorizationExpires || null,
        paid: st?.paid || 0, platformFee: st?.platformFee || 0, captured: st?.captured || 0,
        daysToDue: isNaN(due) ? null : Math.round((due - nowMs) / DAY),
      };
    });

    return {
      id: p.id, title: p.title, status: p.status, party, counterpart, isDemo: p.isDemo,
      advance: { ...p.advance, blocking: ag.advanceAmount > 0 && !['CAPTURED', 'PAID', 'PARTIALLY_PAID', 'AWAITING_DISBURSEMENT'].includes(p.advance.status) },
      milestones,
    };
  }).filter(Boolean);

  // ── Expert review triage: one row per reviewer, one block per assigned review.
  const reviews = d.expertReviews.filter((r) => mine.some((p) => p.id === r.projectId));
  const expertIds = [...new Set(reviews.flatMap((r) => r.assignments.map((a) => a.expertId)))];
  const reviewers = expertIds.map((id) => {
    const prof = d.experts.find((e) => e.userId === id);
    return { id, name: d.users.find((x) => x.id === id)?.name || id, expertise: prof?.expertise || [], simulated: !!prof?.isSimulated, rating: prof?.rating ?? null };
  });

  const assignments = reviews.flatMap((r) => {
    const p = mine.find((x) => x.id === r.projectId)!;
    const alloc = d.allocations.filter((a) => a.projectId === r.projectId && a.milestoneId === r.milestoneId).at(-1);
    const qa = d.qaRuns.filter((q) => q.projectId === r.projectId && q.milestoneId === r.milestoneId && q.status === 'COMPLETE').at(-1);
    // Evidence readiness: a packet whose requirements are all UNVERIFIED gives reviewers nothing to judge.
    const covered = r.requirementIds.filter((id) => {
      const res = qa?.results.find((x) => x.requirementId === id);
      return res && res.status !== 'UNVERIFIED' && res.evidence.length > 0;
    }).length;
    const voted = new Set(r.votes.map((v) => v.expertId)).size;
    const open = r.status === 'VOTING' || r.status === 'AWAITING_FEE_ACK';
    const closes = Date.parse(r.closesAt);
    const hoursLeft = isNaN(closes) ? null : Math.round((closes - nowMs) / 36e5);
    // The real failure mode: the window closes without enough votes, the panel is INCONCLUSIVE
    // and the disputed amount stays frozen. Equivalent to "a deadline with no time allocated".
    const quorumAtRisk = open && voted < r.quorum && hoursLeft !== null && hoursLeft < 24;
    return r.assignments.map((a) => ({
      reviewId: r.id, expertId: a.expertId, project: p.title, projectId: p.id, milestoneId: r.milestoneId,
      requirementIds: r.requirementIds, status: r.status, assignmentStatus: a.status,
      startDate: a.acceptedAt || r.createdAt, closesAt: r.closesAt, hoursLeft,
      disputedAmount: alloc?.disputedAmount ?? 0, fee: r.fee,
      evidenceReady: `${covered}/${r.requirementIds.length}`,
      evidenceThin: covered < r.requirementIds.length,
      votesIn: voted, quorum: r.quorum, quorumAtRisk,
      // Accepted the assignment but never voted while the clock runs down.
      stalled: open && a.status === 'ACCEPTED' && hoursLeft !== null && hoursLeft < 24,
      unanswered: open && a.status === 'INVITED',
    }));
  });

  // ── Payment-event flags the AI PM raises. Proposals only — nothing is auto-applied.
  const flags: { severity: 'critical' | 'warning' | 'info'; projectId: string; project: string; milestoneId: string | null; text: string; tab: string }[] = [];
  for (const p of projects as any[]) {
    if (p.advance.blocking) flags.push({ severity: 'critical', projectId: p.id, project: p.title, milestoneId: null, text: `The agreed advance is ${p.advance.status.replace(/_/g, ' ').toLowerCase()}, so no milestone can start.`, tab: 'funding' });
    for (const m of p.milestones) {
      if (m.blockedByFunding) flags.push({ severity: m.daysToDue !== null && m.daysToDue < 7 ? 'critical' : 'warning', projectId: p.id, project: p.title, milestoneId: m.id, text: `${m.id} needs ${money0(m.fundingGap)} before work can begin${m.daysToDue !== null ? `, and is due in ${m.daysToDue} day(s)` : ''}.`, tab: 'funding' });
      if (m.overdue) flags.push({ severity: 'warning', projectId: p.id, project: p.title, milestoneId: m.id, text: `${m.id} passed its due date while ${m.workStatus.replace(/_/g, ' ').toLowerCase()}.`, tab: 'delivery' });
      if (m.authExpiresBeforeDue) flags.push({ severity: 'critical', projectId: p.id, project: p.title, milestoneId: m.id, text: `The PayPal authorization for ${m.id} lapses ${m.authorizationExpires?.slice(0, 10)}, before the ${m.dueDate} due date — it cannot be captured after that, so re-funding will be needed.`, tab: 'funding' });
    }
  }
  for (const a of assignments) {
    if (a.quorumAtRisk) flags.push({ severity: 'critical', projectId: a.projectId, project: a.project, milestoneId: a.milestoneId, text: `Expert review on ${a.milestoneId} closes in ${a.hoursLeft}h with ${a.votesIn}/${a.quorum} votes — short of quorum it is INCONCLUSIVE and ${money0(a.disputedAmount)} stays frozen.`, tab: 'experts' });
    else if (a.evidenceThin && a.status === 'VOTING') flags.push({ severity: 'warning', projectId: a.projectId, project: a.project, milestoneId: a.milestoneId, text: `Reviewers on ${a.milestoneId} have evidence for only ${a.evidenceReady} requirements — expect INSUFFICIENT_EVIDENCE votes.`, tab: 'delivery' });
  }
  const seen = new Set<string>();
  const unique = flags.filter((f) => { const k = `${f.projectId}|${f.milestoneId}|${f.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const rank = { critical: 0, warning: 1, info: 2 };
  unique.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return { projects, reviewers, assignments, flags: unique };
}));
const money0 = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// ───────────────────────── analytics ─────────────────────────
// Aggregates only over projects the signed-in user is a party to.
api.get('/analytics', h((req) => {
  const u = U(req);
  const d = db();
  const mine = d.projects.filter((p) => partyOf(p, u));
  const ids = new Set(mine.map((p) => p.id));
  const agOf = (p: Project) => activeAgreement(p) || draftAgreement(p);

  // 1) Money over time — cumulative, from confirmed (non-failed) transactions.
  const ok = (t: Transaction) => !/FAILED|DENIED|VOIDED|DECLINED|RETRIED/.test(t.status);
  const money = d.transactions.filter((t) => ids.has(t.projectId) && ok(t)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const byDay = new Map<string, { funded: number; released: number; fees: number }>();
  for (const t of money) {
    const day = t.createdAt.slice(0, 10);
    const e = byDay.get(day) || { funded: 0, released: 0, fees: 0 };
    if (t.type === 'MILESTONE_AUTHORIZATION' || t.type === 'ADVANCE_PAYMENT') e.funded += t.amount;
    if (t.type === 'FREELANCER_PAYOUT') e.released += t.amount;
    if (t.type === 'PLATFORM_FEE' || t.type === 'EXPERT_FEE_PAYOUT') e.fees += t.amount;
    byDay.set(day, e);
  }
  let cf = 0, cr = 0, cx = 0;
  const overTime = [...byDay.entries()].sort().map(([date, e]) => {
    cf += e.funded; cr += e.released; cx += e.fees;
    return { date, funded: Math.round(cf * 100) / 100, released: Math.round(cr * 100) / 100, fees: Math.round(cx * 100) / 100 };
  });

  // 2) QA outcomes by requirement category — latest completed QA run per milestone.
  const CATS = ['frontend', 'backend', 'design', 'content', 'qa'];
  const qaByCat: Record<string, any> = Object.fromEntries(CATS.map((c) => [c, { category: c, PASS: 0, PARTIAL: 0, FAIL: 0, UNVERIFIED: 0, NEEDS_CLARIFICATION: 0, OUT_OF_SCOPE: 0 }]));
  for (const p of mine) {
    const ag = agOf(p);
    if (!ag) continue;
    for (const ms of ag.milestones) {
      const run = d.qaRuns.filter((q) => q.projectId === p.id && q.milestoneId === ms.id && q.status === 'COMPLETE').at(-1);
      if (!run) continue;
      for (const r of run.results) {
        const req = ag.requirements.find((x) => x.id === r.requirementId);
        const cat = req && CATS.includes(req.category) ? req.category : 'frontend';
        qaByCat[cat][r.status] = (qaByCat[cat][r.status] || 0) + 1;
      }
    }
  }
  const qaOutcomes = CATS.map((c) => qaByCat[c]).filter((r) => CATS.some(() => r.PASS + r.PARTIAL + r.FAIL + r.UNVERIFIED + r.NEEDS_CLARIFICATION + r.OUT_OF_SCOPE > 0));

  // 3) Expert panel outcomes — one cell per (expert, requirement) vote, revealed reviews only.
  const VOTES = ['COMPLIANT', 'PARTIALLY_COMPLIANT', 'NOT_COMPLIANT', 'INSUFFICIENT_EVIDENCE'];
  const expertRows: any[] = [];
  const panelTally: Record<string, number> = Object.fromEntries(VOTES.map((v) => [v, 0]));
  for (const r of d.expertReviews.filter((x) => ids.has(x.projectId) && (x.status === 'CLOSED' || x.status === 'INCONCLUSIVE'))) {
    const p = mine.find((x) => x.id === r.projectId)!;
    for (const a of r.assignments) {
      const prof = d.experts.find((e) => e.userId === a.expertId);
      const name = d.users.find((x) => x.id === a.expertId)?.name || a.expertId;
      for (const reqId of r.requirementIds) {
        const v = r.votes.find((x) => x.expertId === a.expertId && x.requirementId === reqId);
        expertRows.push({
          reviewId: r.id, project: p.title, projectId: p.id, milestoneId: r.milestoneId, requirementId: reqId,
          expert: name, expertise: prof?.expertise?.[0] || '—', simulated: !!prof?.isSimulated,
          vote: v?.vote || 'NO_VOTE', reasoning: v?.reasoning || '', panelOutcome: r.result?.perRequirement.find((x) => x.requirementId === reqId)?.outcome || 'INCONCLUSIVE',
        });
        if (v) panelTally[v.vote]++;
      }
    }
  }

  // 4) Release-type distribution — latest allocation per milestone.
  const relTally: Record<string, { count: number; amount: number }> = {};
  for (const p of mine) for (const s of p.milestoneStates) {
    const a = d.allocations.filter((x) => x.projectId === p.id && x.milestoneId === s.milestoneId).at(-1);
    if (!a) continue;
    const e = relTally[a.releaseType] || { count: 0, amount: 0 };
    e.count++; e.amount += a.eligibleAmount;
    relTally[a.releaseType] = e;
  }
  const releaseTypes = Object.entries(relTally).map(([type, e]) => ({ type, count: e.count, amount: Math.round(e.amount * 100) / 100 }));

  // Headline figures
  const fees = d.transactions.filter((t) => ids.has(t.projectId) && t.type === 'PLATFORM_FEE' && ok(t)).reduce((a, t) => a + t.amount, 0);
  const allQa = qaOutcomes.reduce((a, r) => ({ pass: a.pass + r.PASS, total: a.total + r.PASS + r.PARTIAL + r.FAIL + r.UNVERIFIED + r.NEEDS_CLARIFICATION }), { pass: 0, total: 0 });
  const escalated = d.expertReviews.filter((r) => ids.has(r.projectId)).length;
  const submissions = d.submissions.filter((s) => ids.has(s.projectId)).length;
  return {
    overTime, qaOutcomes, expertRows, releaseTypes,
    voteTally: VOTES.map((v) => ({ vote: v, count: panelTally[v] })),
    headline: {
      platformFees: Math.round(fees * 100) / 100,
      firstPassRate: allQa.total ? Math.round((allQa.pass / allQa.total) * 100) : null,
      escalationRate: submissions ? Math.round((escalated / submissions) * 100) : null,
      reviewsClosed: d.expertReviews.filter((r) => ids.has(r.projectId) && r.status === 'CLOSED').length,
      simulated: d.transactions.some((t) => ids.has(t.projectId) && t.mode === 'SIMULATED'),
    },
  };
}));

// ───────────────────────── projects & invitations ─────────────────────────
api.get('/projects/:id', h((req) => projectView(loadProject(String(req.params.id), U(req)).p, U(req))));

api.post('/projects', requireVerifiedEmail, h(async (req) => {
  const u = U(req);
  if (u.role === 'expert') fail(403, 'Experts cannot create projects');
  const title = str(req.body?.title, 140), description = str(req.body?.description, 4000), category = str(req.body?.category, 40) || 'website';
  if (!title) fail(400, 'Title is required');
  const role: Party = u.role as Party;
  const p: Project = {
    id: id('prj'), title, description, category, createdBy: u.id, initiatorRole: role,
    clientId: role === 'client' ? u.id : null, freelancerId: role === 'freelancer' ? u.id : null, invite: null,
    status: 'DRAFT', agreementVersions: [], activeAgreementId: null, draftAgreementId: null, milestoneStates: [],
    advance: { status: 'FUNDING_REQUIRED', amount: 0, paid: 0, platformFee: 0 }, isDemo: false, createdAt: now(), updatedAt: now(),
  };
  db().projects.push(p);
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'PROJECT_CREATED', details: `${role}-initiated project "${title}"`, refs: [] });
  touch(p);
  return { project: p };
}));

api.post('/projects/:id/sow', upload.single('file'), h(async (req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u);
  if (activeAgreement(p) && !draftAgreement(p)) fail(409, 'An approved agreement exists. Propose a change (new version) instead of re-extracting.');
  let text = str(req.body?.sowText, 60000);
  if (req.file) {
    if (!/text|markdown|json|csv/.test(req.file.mimetype) && !/\.(txt|md|csv|json)$/i.test(req.file.originalname)) fail(400, 'Upload a .txt or .md SOW (PDF text extraction is not supported — paste the text instead).');
    text = req.file.buffer.toString('utf8').slice(0, 60000);
  }
  if (text.length < 40) fail(400, 'SOW text is too short');
  const r = await extractSOW(text);
  const draft = draftAgreement(p) || newDraftFrom(p, null, u, 'Initial SOW extraction');
  const budget = r.extraction.budget ?? r.milestones.reduce((a, m) => a + m.amount, 0) + (r.extraction.advanceAmount || 0);
  Object.assign(draft, {
    sowText: text, extraction: r.extraction, requirements: r.requirements, milestones: r.milestones, budget, advanceAmount: r.extraction.advanceAmount || 0,
    partialPaymentRule: r.requirements.length && r.requirements.every((x) => typeof x.amount === 'number') ? 'PER_REQUIREMENT_AMOUNTS' : 'MUTUAL_AGREEMENT_ONLY',
    approvals: { client: null, freelancer: null }, fundingPlan: null,
  });
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'SOW_UPLOADED', details: `SOW (${text.length} chars) analysed by ${r.extraction.source}: ${r.requirements.length} requirements, ${r.milestones.length} milestones, ${r.extraction.ambiguities.length} ambiguities flagged.`, refs: [{ type: 'agreement', id: draft.id }] });
  postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.coordinator, audience: 'all', kind: 'notice', text: `SOW analysed (${r.extraction.source}). Extracted ${r.requirements.length} requirements and ${r.milestones.length} milestones. Nothing was added that is not in the SOW; ${r.extraction.ambiguities.length} item(s) need clarification. Please review and correct before approving.` });
  touch(p);
  return { draft, recommendation: recommendFunding(r.requirements, r.milestones, r.extraction.ambiguities.length) };
}));

api.post('/projects/:id/invite', requireVerifiedEmail, h((req) => {
  const u = U(req);
  const { p, party } = loadProject(String(req.params.id), u);
  const other: Party = party === 'client' ? 'freelancer' : 'client';
  if (p[other === 'client' ? 'clientId' : 'freelancerId']) fail(409, `The ${other} has already joined`);
  p.invite = { code: inviteCode(), role: other, email: str(req.body?.email, 120), status: 'PENDING' };
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'INVITE_CREATED', details: `Invited ${other} ${p.invite.email || ''} (code ${p.invite.code})`, refs: [] });
  touch(p);
  return { invite: p.invite };
}));

api.get('/invites/:code', h((req) => {
  const p = db().projects.find((x) => x.invite?.code === String(req.params.code).toUpperCase() && x.invite.status === 'PENDING') || fail(404, 'Invite not found or already used');
  const by = db().users.find((x) => x.id === p.createdBy);
  return { projectId: p.id, title: p.title, description: p.description, role: p.invite!.role, invitedBy: by?.name, draft: draftAgreement(p) };
}));

api.post('/invites/:code/accept', requireVerifiedEmail, h((req) => {
  const u = U(req);
  const p = db().projects.find((x) => x.invite?.code === String(req.params.code).toUpperCase() && x.invite.status === 'PENDING') || fail(404, 'Invite not found or already used');
  if (u.role !== p.invite!.role) fail(403, `This invite is for a ${p.invite!.role} account`);
  if (partyOf(p, u)) fail(409, 'Already a party');
  if (p.invite!.role === 'client') p.clientId = u.id; else p.freelancerId = u.id;
  p.invite!.status = 'ACCEPTED';
  if (p.status === 'DRAFT') p.status = 'NEGOTIATING';
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'INVITE_ACCEPTED', details: `${u.name} joined as ${p.invite!.role}`, refs: [] });
  postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.coordinator, audience: 'all', kind: 'notice', text: `${u.name} joined the project as ${p.invite!.role}. Both parties now review the requirements, milestones and payment terms. The agreement locks only when both approve.` });
  touch(p);
  return { projectId: p.id };
}));

// ───────────────────────── agreement (SOW baseline) ─────────────────────────
api.post('/projects/:id/agreement/propose-change', h((req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u);
  if (draftAgreement(p)) fail(409, 'A draft version is already being negotiated');
  const src = activeAgreement(p) || fail(409, 'No approved agreement to change');
  const v = newDraftFrom(p, src, u, str(req.body?.changeSummary, 500) || 'Proposed change');
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'AGREEMENT_CHANGE_PROPOSED', details: `Draft v${v.version} created from v${src.version}: ${v.changeSummary}`, refs: [{ type: 'agreement', id: v.id }] });
  touch(p);
  return { draft: v };
}));

api.put('/projects/:id/agreement/draft', h((req) => {
  const u = U(req);
  const { p, party } = loadProject(String(req.params.id), u);
  const v = draftAgreement(p) || fail(409, 'No draft version — the approved agreement cannot be edited directly');
  const b = req.body || {};
  const active = activeAgreement(p);
  if (Array.isArray(b.milestones)) {
    v.milestones = b.milestones.map((m: any, i: number): Milestone => {
      const amount = num(m.amount);
      if (!(amount >= 0)) fail(400, `Invalid amount for milestone ${i + 1}`);
      const mid = str(m.id, 10) || `M${i + 1}`;
      // Milestones that already have released money cannot be reduced below what was released.
      const st = p.milestoneStates.find((s) => s.milestoneId === mid);
      if (st && amount < st.captured) fail(400, `${mid} already has $${st.captured} released; amount cannot go below that.`);
      return { id: mid, title: str(m.title, 140) || `Milestone ${i + 1}`, description: str(m.description, 1000), startDate: str(m.startDate, 10), dueDate: str(m.dueDate, 10), amount, dependsOn: Array.isArray(m.dependsOn) ? m.dependsOn.map(String) : [], owner: 'freelancer' };
    });
    if (active) for (const am of active.milestones) if (!v.milestones.some((m) => m.id === am.id) && (p.milestoneStates.find((s) => s.milestoneId === am.id)?.authorized || 0) + (p.milestoneStates.find((s) => s.milestoneId === am.id)?.captured || 0) > 0) fail(400, `${am.id} has funding/payments and cannot be removed`);
  }
  if (Array.isArray(b.requirements)) {
    v.requirements = b.requirements.map((r: any, i: number): Requirement => ({
      id: str(r.id, 12) || `REQ-${String(i + 1).padStart(2, '0')}`, sowRef: str(r.sowRef, 20) || '—', title: str(r.title, 200), description: str(r.description, 2000),
      expectedOutcome: str(r.expectedOutcome, 1000), acceptanceCriteria: Array.isArray(r.acceptanceCriteria) ? r.acceptanceCriteria.map((c: any) => str(c, 500)).filter(Boolean) : [],
      deliverable: str(r.deliverable, 200), milestoneId: str(r.milestoneId, 10), evidenceRequired: Array.isArray(r.evidenceRequired) ? r.evidenceRequired.filter((x: any) => ['visual', 'functional', 'document'].includes(x)) : ['functional'],
      category: ['frontend', 'backend', 'design', 'content', 'qa'].includes(r.category) ? r.category : 'frontend', amount: r.amount === null || r.amount === '' || r.amount === undefined ? null : num(r.amount),
      ambiguity: str(r.ambiguity, 1000) || null, clarification: str(r.clarification, 1000) || null, status: r.status || 'UNVERIFIED',
    }));
  }
  if (b.budget !== undefined) v.budget = num(b.budget);
  if (b.advanceAmount !== undefined) v.advanceAmount = num(b.advanceAmount);
  if (b.partialPaymentRule) v.partialPaymentRule = b.partialPaymentRule === 'PER_REQUIREMENT_AMOUNTS' ? 'PER_REQUIREMENT_AMOUNTS' : 'MUTUAL_AGREEMENT_ONLY';
  if (typeof b.platformFeePercent === 'number') v.platformFeePercent = Math.max(0, Math.min(20, num(b.platformFeePercent)));
  if (b.expertReview) {
    const e = b.expertReview;
    v.expertReview = { mode: 'ADVISORY', panelSize: Math.min(7, Math.max(1, Math.round(num(e.panelSize) || 3))), quorum: Math.max(1, Math.round(num(e.quorum) || 2)), feePerReview: Math.max(0, num(e.feePerReview) || 0), feePayer: ['client', 'freelancer', 'split'].includes(e.feePayer) ? e.feePayer : 'client' };
    if (v.expertReview.quorum > v.expertReview.panelSize) fail(400, 'Quorum cannot exceed panel size');
  }
  if (b.changeSummary) v.changeSummary = str(b.changeSummary, 500);
  if (party === 'freelancer' && b.fundingPlan) fail(403, 'Only the client chooses the funding plan');
  // Any edit invalidates prior approvals: no party can change terms the other already accepted.
  const hadApprovals = v.approvals.client || v.approvals.freelancer;
  v.approvals = { client: null, freelancer: null };
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'AGREEMENT_DRAFT_EDITED', details: `Draft v${v.version} edited by ${party}${hadApprovals ? ' — prior approvals cleared' : ''}.`, refs: [{ type: 'agreement', id: v.id }] });
  touch(p);
  return { draft: v, issues: validateAgreement(v) };
}));

api.post('/projects/:id/agreement/funding-plan', h((req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u, ['client']);
  const v = draftAgreement(p) || fail(409, 'Funding plan is part of the agreement; propose a change to modify it');
  const option = req.body?.option as FundingOption;
  if (!['ADVANCE', 'PARTIAL', 'FULL'].includes(option)) fail(400, 'Invalid option');
  let committed: string[] = Array.isArray(req.body?.committedMilestones) ? req.body.committedMilestones.map(String).filter((m: string) => v.milestones.some((x) => x.id === m)) : [];
  if (option === 'FULL') committed = v.milestones.map((m) => m.id);
  if (option === 'ADVANCE') committed = [];
  if (option === 'PARTIAL' && !committed.length) fail(400, 'Select at least one milestone to commit for partial funding');
  v.fundingPlan = { option, committedMilestones: committed, chosenBy: u.id, chosenAt: now(), aiRecommendation: recommendFunding(v.requirements, v.milestones, v.extraction.ambiguities.length) };
  v.approvals = { client: null, freelancer: null };
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'FUNDING_PLAN_CHOSEN', details: `${option} funding${committed.length ? ` (committed: ${committed.join(', ')})` : ''}. Freelancer must accept as part of agreement v${v.version}.`, refs: [{ type: 'agreement', id: v.id }] });
  touch(p);
  return { draft: v };
}));

api.post('/projects/:id/agreement/approve', h((req) => {
  const u = U(req);
  const { p, party } = loadProject(String(req.params.id), u);
  const v = draftAgreement(p) || fail(409, 'Nothing to approve');
  if (!p.clientId || !p.freelancerId) fail(409, 'Both parties must join before approval');
  const blocking = validateAgreement(v).filter((i) => !i.startsWith('Warning'));
  if (blocking.length) fail(400, blocking.join(' '));
  v.approvals[party] = now();
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'AGREEMENT_APPROVAL', details: `${party} approved agreement v${v.version} (scope, milestones, payment terms, funding plan ${v.fundingPlan?.option}).`, refs: [{ type: 'agreement', id: v.id }] });
  const locked = finalizeIfApproved(p, v, u);
  touch(p);
  return { locked };
}));

// ───────────────────────── funding (PayPal) ─────────────────────────
function fundingTarget(p: Project, target: string) {
  const ag = activeAgreement(p) || fail(409, 'Agreement must be approved by both parties before funding');
  if (target === 'ADVANCE') {
    if (!ag.advanceAmount) fail(400, 'No advance in this agreement');
    if (p.advance.status !== 'FUNDING_REQUIRED' && p.advance.status !== 'PAYMENT_FAILED' && p.advance.status !== 'FUNDING_PENDING') fail(409, 'Advance already funded');
    return { amount: ag.advanceAmount, intent: 'CAPTURE' as const, label: `Advance — ${p.title}`, mid: null };
  }
  if (target.startsWith('FEE:')) {
    const r = db().expertReviews.find((x) => x.id === target.slice(4) && x.projectId === p.id) || fail(404, 'Review not found');
    return { amount: 0, intent: 'CAPTURE' as const, label: `Expert review fee — ${p.title}`, mid: r.milestoneId, review: r };
  }
  const m = ag.milestones.find((x) => x.id === target) || fail(404, 'Milestone not found');
  const st = msState(p, m.id);
  const needed = m.amount - st.authorized - st.captured;
  if (needed <= 0) fail(409, 'Milestone already fully funded');
  return { amount: needed, intent: 'AUTHORIZE' as const, label: `${m.id} ${m.title} — ${p.title}`, mid: m.id };
}

api.post('/projects/:id/fund', h(async (req) => {
  const u = U(req);
  const target = str(req.body?.target, 60);
  const { p, party } = loadProject(String(req.params.id), u, target.startsWith('FEE:') ? ['client', 'freelancer'] : ['client']);
  const t: any = fundingTarget(p, target);
  if (t.review) {
    const share = (t.review as ExpertReview).feeFunding.find((f) => f.party === party && f.status === 'REQUIRED') || fail(409, 'No expert fee share due from you');
    t.amount = share.amount;
  }
  const order = await pp.createOrder({ amount: t.amount, intent: t.intent, description: t.label, customId: `${p.id}:${target}` });
  if (t.mid && !t.review) { const st = msState(p, t.mid); if (st.fundingStatus === 'FUNDING_REQUIRED' || st.fundingStatus === 'PAYMENT_FAILED') st.fundingStatus = 'FUNDING_PENDING'; }
  if (target === 'ADVANCE') p.advance.status = 'FUNDING_PENDING';
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'FUNDING_INITIATED', details: `${order.mode === 'SIMULATED' ? '[SIMULATED] ' : ''}PayPal order ${order.orderId} (${t.intent}) for $${t.amount} — ${t.label}`, refs: [] });
  touch(p);
  return { ...order, amount: t.amount, intent: t.intent };
}));

api.post('/projects/:id/fund/confirm', h(async (req) => {
  const u = U(req);
  const target = str(req.body?.target, 60), orderId = str(req.body?.orderId, 60);
  const { p, party } = loadProject(String(req.params.id), u, target.startsWith('FEE:') ? ['client', 'freelancer'] : ['client']);
  if (!orderId) fail(400, 'orderId required');
  if (orderId.startsWith('SIM-') !== (pp.paypalMode() === 'SIMULATED')) fail(400, 'Order mode mismatch');
  const t: any = fundingTarget(p, target);
  if (t.review) t.amount = (t.review as ExpertReview).feeFunding.find((f) => f.party === party && f.status === 'REQUIRED')?.amount || fail(409, 'No fee share due');
  let r;
  try { r = await pp.completeOrder(orderId, t.intent, t.amount); } catch (e: any) {
    if (t.mid && !t.review) msState(p, t.mid).fundingStatus = 'PAYMENT_FAILED';
    if (target === 'ADVANCE') p.advance.status = 'PAYMENT_FAILED';
    touch(p);
    fail(502, `PayPal did not confirm the payment. ${ppFail(e)}`);
  }
  r = r!;
  if (!r.verified) {
    if (target === 'ADVANCE') p.advance.status = 'PAYMENT_FAILED';
    touch(p);
    fail(502, `PayPal response could not be verified (status ${r.status}, amount ${r.amount}). Funding status not updated.`);
  }
  const ag = activeAgreement(p)!;
  if (t.review) {
    const rv = t.review as ExpertReview;
    const share = rv.feeFunding.find((f) => f.party === party)!;
    const rec = tx({ projectId: p.id, milestoneId: rv.milestoneId, type: 'EXPERT_FEE_COLLECTION', amount: t.amount, status: r.status, mode: r.mode, paypal: { orderId, captureId: r.captureId }, initiatedBy: u.id, note: `Expert review fee collected from ${party} (separate expense, not deducted from milestone pay)` });
    share.status = 'PAID'; share.txId = rec.id;
    maybeOpenVoting(rv, p);
  } else if (target === 'ADVANCE') {
    const rec = tx({ projectId: p.id, milestoneId: null, type: 'ADVANCE_PAYMENT', amount: t.amount, status: r.status, mode: r.mode, paypal: { orderId, captureId: r.captureId }, initiatedBy: u.id, note: 'Agreed advance captured per the approved funding agreement' });
    p.advance.status = 'CAPTURED';
    await payoutTo(p, null, rec, 'freelancer', t.amount, `Advance for ${p.title}`, u);
  } else {
    const st = msState(p, t.mid);
    tx({ projectId: p.id, milestoneId: t.mid, type: 'MILESTONE_AUTHORIZATION', amount: t.amount, status: r.status, mode: r.mode, paypal: { orderId, authorizationId: r.authorizationId }, initiatedBy: u.id, note: `Authorization valid until ${r.expirationTime?.slice(0, 10)}; honor period ends ${r.honorPeriodEnds?.slice(0, 10)}. Funds are reserved on the payer's PayPal account by authorization — this is not escrow.` });
    st.authorized += t.amount; st.authorizationId = r.authorizationId; st.authorizationExpires = r.expirationTime; st.honorPeriodEnds = r.honorPeriodEnds;
    refreshFunding(st, ag.milestones.find((m) => m.id === t.mid)!.amount, false);
  }
  touch(p);
  return { ok: true, status: r.status, mode: r.mode };
}));

/** Disburse to freelancer or expert via PayPal Payouts. Status reflects PayPal's response, never assumed.
 *  Platform fee (SaaS revenue): deducted from the gross captured amount — the receiver gets gross − fee,
 *  the fee is retained on the platform PayPal account and recorded as a separate PLATFORM_FEE transaction. */
async function payoutTo(p: Project, mid: string | null, source: Transaction | null, who: 'freelancer' | string, gross: number, note: string, actor: User, allocationId?: string) {
  const receiver = db().users.find((x) => x.id === (who === 'freelancer' ? p.freelancerId : who))!;
  const type = who === 'freelancer' ? 'FREELANCER_PAYOUT' : 'EXPERT_FEE_PAYOUT';
  const mode = pp.paypalMode();
  const ag = activeAgreement(p);
  const feePct = ag?.platformFeePercent ?? 0;
  const feeAmount = Math.round(gross * feePct) / 100;
  const net = Math.round((gross - feeAmount) * 100) / 100;
  const apply = (paidAmt: number) => {
    if (who !== 'freelancer') return;
    if (mid) {
      const st = msState(p, mid);
      st.paid += paidAmt;
      st.platformFee = (st.platformFee || 0) + feeAmount;
    } else {
      p.advance.paid += paidAmt;
      p.advance.platformFee = (p.advance.platformFee || 0) + feeAmount;
      // The fee is retained revenue, not an unpaid remainder — settle against paid + fee.
      p.advance.status = p.advance.paid + p.advance.platformFee >= p.advance.amount - 0.005 ? 'PAID' : 'PARTIALLY_PAID';
    }
  };
  // Disbursing money that only ever existed in simulation must stay simulated, even once
  // real PayPal credentials are configured — otherwise it would move real sandbox funds.
  const simulatedSource = source?.mode === 'SIMULATED';
  if (!receiver.paypalEmail && mode !== 'SIMULATED' && !simulatedSource) {
    if (!mid) p.advance.status = 'AWAITING_DISBURSEMENT';
    return tx({ projectId: p.id, milestoneId: mid, type: type as any, amount: net, status: 'AWAITING_DISBURSEMENT', mode, paypal: {}, payee: receiver.id, initiatedBy: actor.id, allocationId, note: `${receiver.name} has not completed payout onboarding (PayPal email). Funds captured; disbursement waits. Platform fee ${feePct}% = $${feeAmount} (deducted on release).` });
  }
  try {
    const batch = id('batch');
    const r = await pp.sendPayout({ receiverEmail: receiver.paypalEmail || `${receiver.id}@simulated.invalid`, amount: net, note: `${note}${feePct > 0 ? ` (net of ${feePct}% platform fee)` : ''}`, senderItemId: source?.id || batch, batchId: batch, simulate: simulatedSource });
    const done = r.itemStatus === 'SUCCESS';
    if (done) apply(net);
    else if (!mid) p.advance.status = 'AWAITING_DISBURSEMENT';
    const extra = (r as any).fallbackNote ? ` ${(r as any).fallbackNote}` : '';
    const rec = tx({ projectId: p.id, milestoneId: mid, type: type as any, amount: net, status: done ? 'SUCCESS' : `PENDING (${r.batchStatus})`, mode: r.mode, paypal: { payoutBatchId: r.payoutBatchId }, payee: receiver.id, initiatedBy: actor.id, allocationId, note: `${note}${feePct > 0 ? ` · gross $${gross}, platform fee ${feePct}% = $${feeAmount}, net to ${receiver.name} $${net}` : ''}${extra}` });
    if (done && feeAmount > 0) tx({ projectId: p.id, milestoneId: mid, type: 'PLATFORM_FEE', amount: feeAmount, status: 'RETAINED', mode: r.mode, paypal: {}, initiatedBy: 'platform', allocationId, note: `Platform fee ${feePct}% on gross $${gross} retained on the platform PayPal account` });
    return rec;
  } catch (e: any) {
    if (!mid && who === 'freelancer') p.advance.status = 'AWAITING_DISBURSEMENT';
    return tx({ projectId: p.id, milestoneId: mid, type: type as any, amount: net, status: 'PAYMENT_FAILED', mode, paypal: {}, payee: receiver.id, initiatedBy: actor.id, allocationId, note: `Payout failed: ${ppFail(e)} Captured funds remain with the platform PayPal account; retry from the Payments tab.` });
  }
}

api.post('/transactions/:tid/refresh', h(async (req) => {
  const u = U(req);
  const t = db().transactions.find((x) => x.id === req.params.tid) || fail(404, 'Not found');
  const { p } = loadProject(t.projectId, u);
  if (t.status === 'PAYMENT_FAILED' || t.status === 'AWAITING_DISBURSEMENT') {
    // retry a failed / waiting payout
    if (t.type !== 'FREELANCER_PAYOUT' && t.type !== 'EXPERT_FEE_PAYOUT') fail(400, 'Only payouts can be retried');
    t.status = 'RETRIED';
    const n = await payoutTo(p, t.milestoneId, t, t.type === 'FREELANCER_PAYOUT' ? 'freelancer' : t.payee!, t.amount, t.note, u, t.allocationId);
    if (t.milestoneId) refreshFunding(msState(p, t.milestoneId), activeAgreement(p)!.milestones.find((m) => m.id === t.milestoneId)!.amount, false);
    touch(p);
    return { transaction: n };
  }
  if (!t.paypal.payoutBatchId || !t.status.startsWith('PENDING')) return { transaction: t };
  const s = await pp.getPayoutStatus(t.paypal.payoutBatchId);
  if (s.itemStatus === 'SUCCESS') {
    t.status = 'SUCCESS';
    if (t.type === 'FREELANCER_PAYOUT') {
      if (t.milestoneId) { const st = msState(p, t.milestoneId); st.paid += t.amount; refreshFunding(st, activeAgreement(p)!.milestones.find((m) => m.id === t.milestoneId)!.amount, false); }
      else { p.advance.paid += t.amount; p.advance.status = p.advance.paid >= p.advance.amount ? 'PAID' : 'PARTIALLY_PAID'; }
    }
  } else if (/FAILED|RETURNED|BLOCKED|DENIED/.test(String(s.itemStatus))) t.status = 'PAYMENT_FAILED';
  else t.status = `PENDING (${s.itemStatus || s.batchStatus})`;
  t.updatedAt = now();
  audit({ projectId: p.id, actor: 'paypal', actorType: 'paypal', action: 'PAYOUT_STATUS', details: `Payout ${t.paypal.payoutBatchId}: ${t.status}`, refs: [{ type: 'transaction', id: t.id }] });
  touch(p);
  return { transaction: t };
}));

// ───────────────────────── milestones: start, submit, QA ─────────────────────────
api.post('/projects/:id/milestones/:mid/start', h((req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u, ['freelancer']);
  const ag = activeAgreement(p) || fail(409, 'No approved agreement');
  const st = msState(p, String(req.params.mid));
  if (ag.advanceAmount > 0 && !['CAPTURED', 'PAID', 'AWAITING_DISBURSEMENT', 'PARTIALLY_PAID'].includes(p.advance.status)) fail(409, 'The agreed advance has not been confirmed by PayPal yet');
  if (st.authorized + st.captured <= 0) fail(409, 'This milestone is not funded. Work can only begin on funded milestones.');
  if (st.workStatus !== 'NOT_STARTED') fail(409, 'Milestone already started');
  st.workStatus = 'IN_PROGRESS';
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'MILESTONE_STARTED', details: `${st.milestoneId} started (funding ${st.fundingStatus})`, refs: [] });
  touch(p);
}));

api.post('/projects/:id/milestones/:mid/submissions', upload.array('files', 8), h(async (req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u, ['freelancer']);
  const mid = String(req.params.mid);
  const st = msState(p, mid);
  if (!['IN_PROGRESS', 'REVISION_REQUESTED', 'QA_COMPLETE', 'SUBMITTED', 'IN_EXPERT_REVIEW'].includes(st.workStatus)) fail(409, `Cannot submit while milestone is ${st.workStatus}`);
  const url = str(req.body?.url, 500) || null;
  if (url && !/^https?:\/\//i.test(url)) fail(400, 'URL must start with http(s)://');
  let claims: any[] = [];
  try { claims = JSON.parse(req.body?.claims || '[]'); } catch { fail(400, 'Invalid claims'); }
  const files = (req.files as Express.Multer.File[]) || [];
  const evidence = files.map((f) => {
    const isImg = /^image\/(png|jpe?g|webp|gif)$/.test(f.mimetype);
    const isText = /text|markdown|json|csv/.test(f.mimetype) || /\.(txt|md|csv|json|log)$/i.test(f.originalname);
    const ext = (f.originalname.split('.').pop() || 'bin').toLowerCase();
    return { id: id('ev'), kind: isImg ? 'screenshot' : 'file', label: f.originalname.slice(0, 120), path: saveEvidenceFile(f.buffer, isImg ? ext : isText ? 'txt' : ext), mime: isImg ? f.mimetype : isText ? 'text/plain' : f.mimetype, text: isText ? f.buffer.toString('utf8').slice(0, 20000) : undefined, source: 'freelancer' } as any;
  });
  if (req.body?.demoEvidence === 'true') evidence.push({ id: id('ev'), kind: 'file', label: 'DEMO sample test report (seeded file, not produced by the freelancer)', text: DEMO_TEST_REPORT(activeAgreement(p)!.requirements.filter((r) => r.milestoneId === mid), !p.demoUrls), mime: 'text/plain', source: 'seed' });
  if (!url && !evidence.length && !str(req.body?.notes)) fail(400, 'Provide a URL, files, or notes');
  const revision = db().submissions.filter((s) => s.projectId === p.id && s.milestoneId === mid).length + 1;
  const sub = {
    id: id('sub'), projectId: p.id, milestoneId: mid, submittedBy: u.id, url, notes: str(req.body?.notes, 5000),
    claims: claims.filter((c) => c?.requirementId).map((c) => ({ requirementId: String(c.requirementId), note: str(c.note, 1000) })),
    evidence, authorization: url ? { granted: req.body?.authorizeInspection === 'true', scope: 'Read-only navigation and non-destructive input probes. No purchases, payments, account changes or deletions.', credentialsProvided: false } : null,
    revision, createdAt: now(),
  };
  db().submissions.push(sub);
  st.workStatus = 'SUBMITTED';
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'DELIVERABLE_SUBMITTED', details: `${mid} revision ${revision}: ${url || 'no URL'}, ${evidence.length} file(s), ${sub.claims.length} completion claim(s). Inspection ${sub.authorization?.granted ? 'authorized' : 'not authorized'}.`, refs: [{ type: 'submission', id: sub.id }] });
  touch(p);
  startQA(p, sub.id, u);
  return { submission: sub };
}));

function DEMO_TEST_REPORT(reqs: Requirement[], northwind = true) {
  // Deterministic sample. For Northwind it matches the hosted store; for the live-site demo it is
  // the freelancer's blanket claim, which the browser run then confirms or contradicts.
  if (!northwind) return ['DEMO TEST REPORT — generated sample evidence for the hackathon demo', ...reqs.map((r) => `${r.id} PASS: checked manually in Chrome against every acceptance criterion.`)].join('\n');
  return ['DEMO TEST REPORT — generated sample evidence for the hackathon demo', ...reqs.map((r) => {
    if (/search/i.test(r.title)) return `${r.id} PASS: typing "linen" narrows 12 products to 2 within ~300ms; category and price filters combine; zero-result state shown. No typo tolerance implemented (not specified).`;
    if (/checkout/i.test(r.title)) return `${r.id} PASS: add/remove/update quantity works; totals recalc; checkout form validates required fields; order confirmation shown in sandbox mode.`;
    return `${r.id} PASS: verified manually against acceptance criteria.`;
  })].join('\n');
}

function startQA(p: Project, submissionId: string, actor: User) {
  const sub = db().submissions.find((s) => s.id === submissionId)!;
  const ag = activeAgreement(p)!;
  const run: any = { id: id('qa'), projectId: p.id, milestoneId: sub.milestoneId, submissionId, createdAt: now(), status: 'RUNNING', kernel: { mode: 'SKIPPED', note: 'running', actions: [], pages: [], consoleErrors: [], screenshots: [] }, vision: { source: '', findings: [], note: '' }, text: { source: '', findings: [], note: '' }, domainAgents: [], results: [], mediatorSummary: '', overall: 'UNVERIFIABLE', aiSource: '' };
  db().qaRuns.push(run);
  save();
  (async () => {
    try {
      const kernel = sub.url ? await runKernelInspection({ url: sub.url, authorized: !!sub.authorization?.granted }) : { mode: 'SKIPPED' as const, note: 'No URL submitted', actions: [], pages: [], consoleErrors: [], screenshots: [] };
      audit({ projectId: p.id, actor: kernel.mode === 'KERNEL_LIVE' ? 'kernel' : 'kernel-demo-adapter', actorType: 'kernel', action: 'BROWSER_INSPECTION', details: `${kernel.mode}: ${kernel.pages.length} page(s), ${kernel.screenshots.length} screenshot(s), ${kernel.actions.length} action(s). ${kernel.error ? 'Error: ' + kernel.error : ''}`, refs: [{ type: 'qa', id: run.id }] });
      const prev = db().submissions.filter((s) => s.projectId === p.id && s.milestoneId === sub.milestoneId && s.id !== sub.id).flatMap((s) => s.evidence.filter((e) => e.text));
      const docTexts = [...sub.evidence, ...prev].filter((e) => e.text).map((e) => ({ label: e.label, text: e.text! }));
      const reqs = ag.requirements.filter((r) => r.milestoneId === sub.milestoneId);
      const fb = db().feedback.filter((f) => f.projectId === p.id && f.milestoneId === sub.milestoneId).at(-1) || null;
      const out = await runQA({ requirements: reqs, submission: sub, kernel, docTexts, priorFeedback: fb });
      Object.assign(run, out, { kernel, status: 'COMPLETE' });
      for (const r of out.results) { const rq = ag.requirements.find((x) => x.id === r.requirementId); if (rq) rq.status = r.status; }
      const st = msState(p, sub.milestoneId);
      // Pre-check: too much unfinished → back to the freelancer before the client is asked.
      sub.precheck = evaluatePrecheck(out.results);
      const returned = !sub.precheck.passed;
      if (returned) st.workStatus = 'IN_PROGRESS';
      else if (st.workStatus === 'SUBMITTED') st.workStatus = 'QA_COMPLETE';
      audit({ projectId: p.id, actor: 'qa-mediator', actorType: 'agent', action: 'QA_COMPLETED', details: `${out.overall}. ${out.mediatorSummary} (AI: ${out.aiSource})`, refs: [{ type: 'qa', id: run.id }] });
      if (returned) {
        audit({ projectId: p.id, actor: 'qa-mediator', actorType: 'agent', action: 'PRECHECK_RETURNED', details: `Revision ${sub.revision} returned to the freelancer before client review: ${sub.precheck.unfinished.length} of ${sub.precheck.considered} requirements unfinished (${sub.precheck.unfinished.join(', ')}); limit ${Math.round(sub.precheck.threshold * 100)}%.`, refs: [{ type: 'qa', id: run.id }, { type: 'submission', id: sub.id }] });
      }
      // The verdict goes to both parties only once the work is actually in front of the client.
      postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.mediator, audience: returned ? 'freelancer' : 'all', kind: 'notice', text: `Verification of ${sub.milestoneId} (revision ${sub.revision}) is done: ${out.overall.replace(/_/g, ' ').toLowerCase()}. ${out.mediatorSummary}`, ref: { type: 'qa', id: run.id } });
      // …and the freelancer gets concrete, per-requirement next steps, so they can fix and
      // resubmit without waiting for the client to read the report.
      const todo = out.results.filter((r) => r.status !== 'PASS' && r.status !== 'OUT_OF_SCOPE');
      const reqTitle = (rid: string) => ag.requirements.find((x) => x.id === rid)?.title || '';
      if (todo.length) {
        const lines = todo.map((r) => {
          const why = r.guardrail || r.explanation;
          const ask = r.status === 'UNVERIFIED' ? 'Add evidence that shows it working — a test report, a recording, or a page the agent can reach.'
            : r.status === 'NEEDS_CLARIFICATION' ? 'The agreed wording cannot be measured. Ask the client what threshold they mean, or offer one in Messages.'
              : r.status === 'FAIL' ? 'This criterion is not met yet. Fix it and resubmit.'
                : 'Part of this is in place; finish the rest and resubmit.';
          return `• ${r.requirementId} ${reqTitle(r.requirementId)} — ${r.status.replace(/_/g, ' ').toLowerCase()}. ${why} ${ask}`;
        });
        const head = returned
          ? `This revision has not gone to the client yet: ${sub.precheck.unfinished.length} of ${sub.precheck.considered} requirements still need work, and more than ${Math.round(sub.precheck.threshold * 100)}% unfinished goes back to you first. Here is what each needs:`
          : `Here is what the checks found on ${sub.milestoneId} and what would move each item forward:`;
        const tail = returned
          ? `\n\nFix these and submit a revision. If you think a check could not see your work properly — for example the site is not publicly reachable — you can send this revision to the client anyway, with a reason.`
          : '';
        postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.freelancer, audience: 'freelancer', kind: 'evidence_request', text: `${head}\n${lines.join('\n')}${tail}`, ref: { type: 'qa', id: run.id } });
      } else {
        postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.freelancer, audience: 'freelancer', kind: 'notice', text: `Every requirement on ${sub.milestoneId} passed verification. The client now reviews it; you will be notified when a payment decision is ready.`, ref: { type: 'qa', id: run.id } });
      }
      if (!returned) {
        postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.client, audience: 'client', kind: 'notice', text: `${sub.milestoneId} has been verified. Please review it and say how satisfied you are — your feedback is weighed against the agreed scope, so be specific about which requirement any concern relates to.`, ref: { type: 'qa', id: run.id } });
      }
    } catch (e: any) {
      run.status = 'ERROR'; run.error = e.message;
      audit({ projectId: p.id, actor: 'qa-mediator', actorType: 'agent', action: 'QA_ERROR', details: e.message, refs: [{ type: 'qa', id: run.id }] });
    }
    touch(p);
  })();
}

api.post('/projects/:id/submissions/:sid/rerun-qa', h((req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u);
  const sub = db().submissions.find((s) => s.id === req.params.sid && s.projectId === p.id) || fail(404, 'Submission not found');
  startQA(p, sub.id, u);
}));

/** The freelancer disagrees with the pre-check (e.g. the agent could not reach the site) and
 *  asks the client to review anyway. Recorded with the reason, which the client sees. */
api.post('/projects/:id/submissions/:sid/send-to-client', h((req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u, ['freelancer']);
  const sub = db().submissions.find((s) => s.id === req.params.sid && s.projectId === p.id) || fail(404, 'Submission not found');
  if (!withFreelancer(sub)) fail(409, 'This revision is not being held back');
  if (latestSubmission(p.id, sub.milestoneId)?.id !== sub.id) fail(409, 'Only the latest revision can be sent on');
  const reason = str(req.body?.reason, 1000);
  if (reason.length < 10) fail(400, 'Say briefly why the client should review it as it is');
  sub.precheck!.sentAnywayAt = now();
  sub.precheck!.sentAnywayReason = reason;
  const st = msState(p, sub.milestoneId);
  if (['IN_PROGRESS', 'SUBMITTED'].includes(st.workStatus)) st.workStatus = 'QA_COMPLETE';
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'PRECHECK_OVERRIDDEN', details: `Freelancer sent revision ${sub.revision} to the client despite the pre-check (${sub.precheck!.unfinished.join(', ')} unfinished). Reason: ${reason}`, refs: [{ type: 'submission', id: sub.id }] });
  postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.client, audience: 'client', kind: 'notice', text: `${sub.milestoneId} revision ${sub.revision} is ready for your review. The automated checks could not confirm ${sub.precheck!.unfinished.join(', ')}; the freelancer asked you to review it anyway and said: "${reason}". You will see the full verification report, including what was not confirmed.` });
  touch(p);
}));

// ───────────────────────── client satisfaction ─────────────────────────
api.post('/projects/:id/milestones/:mid/feedback', h(async (req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u, ['client']);
  const mid = String(req.params.mid);
  const ag = activeAgreement(p)!;
  const sub = db().submissions.filter((s) => s.projectId === p.id && s.milestoneId === mid).at(-1) || fail(409, 'Nothing has been submitted for this milestone');
  if (withFreelancer(sub)) fail(409, 'The latest revision went back to the freelancer before review. You will be asked for feedback once they resubmit.');
  const rating = req.body?.rating;
  if (!['FULLY_SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED'].includes(rating)) fail(400, 'Choose a satisfaction level');
  const items = (Array.isArray(req.body?.items) ? req.body.items : []).map((i: any) => ({ text: str(i.text, 1000), requirementId: str(i.requirementId, 12) || null })).filter((i: any) => i.text);
  const additional = str(req.body?.additional, 3000);
  if (rating !== 'FULLY_SATISFIED' && !items.length && !additional) fail(400, 'Please explain what you are dissatisfied with');
  const reqs = ag.requirements.filter((r) => r.milestoneId === mid);
  const c = rating === 'FULLY_SATISFIED' && !items.length && !additional ? { classification: [], source: 'n/a' } : await classifyFeedback(items, additional, reqs, ag.extraction.exclusions);
  const fb = { id: id('fb'), projectId: p.id, milestoneId: mid, submissionId: sub.id, rating, items, additional, classification: c.classification, aiSource: c.source, createdAt: now() };
  db().feedback.push(fb);
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'CLIENT_FEEDBACK', details: `${rating} on ${mid}. Classified (${c.source}): ${c.classification.map((x: any) => x.category).join(', ') || 'none'}`, refs: [{ type: 'feedback', id: fb.id }] });
  // Out-of-scope requests automatically become scope-change requests (they never reduce this milestone's payment).
  for (const o of c.classification.filter((x: any) => x.category === 'OUT_OF_SCOPE_REQUEST')) {
    if (!db().scopeChanges.some((s) => s.sourceFeedbackId === fb.id && s.description === o.text)) {
      db().scopeChanges.push({ id: id('scr'), projectId: p.id, requestedBy: u.id, description: o.text, sourceFeedbackId: fb.id, analysis: { outOfScope: true, reason: o.rationale, relatedRequirements: o.requirementId ? [o.requirementId] : [], source: c.source }, freelancerResponse: null, clientDecision: null, status: 'AWAITING_FREELANCER', createdAt: now() });
      audit({ projectId: p.id, actor: 'client-expectation-agent', actorType: 'agent', action: 'SCOPE_CHANGE_CREATED', details: `Out-of-scope request routed to scope change: "${o.text.slice(0, 120)}"`, refs: [] });
    }
  }
  touch(p);
  return { feedback: fb };
}));

api.post('/projects/:id/milestones/:mid/request-revision', h((req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u, ['client']);
  const st = msState(p, String(req.params.mid));
  const reason = str(req.body?.reason, 2000) || fail(400, 'Explain which agreed criteria need correction');
  st.workStatus = 'REVISION_REQUESTED';
  postMessage({ projectId: p.id, from: u.id, fromType: 'user', audience: 'all', kind: 'notice', text: `Revision requested for ${st.milestoneId}: ${reason}` });
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'REVISION_REQUESTED', details: `${st.milestoneId}: ${reason}`, refs: [] });
  touch(p);
}));

// Challenges: either party can challenge an AI finding, expert result or allocation.
api.post('/projects/:id/challenges', h((req) => {
  const u = U(req);
  const { p, party } = loadProject(String(req.params.id), u);
  const targetType = str(req.body?.targetType, 20), targetId = str(req.body?.targetId, 60), text = str(req.body?.text, 3000) || fail(400, 'Explain your challenge');
  if (!['qa', 'expert', 'allocation'].includes(targetType)) fail(400, 'Invalid target');
  const requirementId = str(req.body?.requirementId, 12) || null;
  if (targetType === 'allocation') { const a = db().allocations.find((x) => x.id === targetId && x.projectId === p.id) || fail(404, 'Not found'); if (a.status === 'EXECUTED') fail(409, 'Executed allocations cannot be challenged here; raise a dispute'); a.status = 'CHALLENGED'; a.challenges.push({ by: u.id, text, at: now() }); }
  postMessage({ projectId: p.id, from: u.id, fromType: 'user', audience: 'all', kind: 'challenge', text: `${party} challenges ${targetType}${requirementId ? ` on ${requirementId}` : ''}: ${text}`, ref: { type: targetType, id: targetId } });
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'CHALLENGE', details: `${party} challenged ${targetType} ${targetId}${requirementId ? ` (${requirementId})` : ''}: ${text.slice(0, 200)}`, refs: [{ type: targetType, id: targetId }] });
  postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.coordinator, audience: 'all', kind: 'notice', text: `Challenge recorded. ${party === 'client' ? 'The freelancer' : 'The client'} can respond; new evidence can be added via a resubmission, and either party may request independent expert review.` });
  touch(p);
}));

// ───────────────────────── expert review ─────────────────────────
api.post('/projects/:id/milestones/:mid/expert-review', h((req) => {
  const u = U(req);
  const { p, party } = loadProject(String(req.params.id), u);
  const mid = String(req.params.mid);
  const ag = activeAgreement(p)!;
  const st = msState(p, mid);
  if (db().expertReviews.some((r) => r.projectId === p.id && r.milestoneId === mid && (r.status === 'AWAITING_FEE_ACK' || r.status === 'VOTING'))) fail(409, 'An expert review is already open for this milestone');
  if (withFreelancer(latestSubmission(p.id, mid))) fail(409, 'The latest revision is back with the freelancer after the pre-check. Expert review starts from work the client has been asked to review.');
  const qa = db().qaRuns.filter((q) => q.projectId === p.id && q.milestoneId === mid && q.status === 'COMPLETE').at(-1) || fail(409, 'Run QA first — expert review needs an evidence packet');
  const fb = db().feedback.filter((f) => f.projectId === p.id && f.milestoneId === mid).at(-1) || null;
  let reqIds: string[] = Array.isArray(req.body?.requirementIds) ? req.body.requirementIds.map(String) : [];
  // Trigger rules (spec §8): only escalate requirements that are genuinely ambiguous or disputed.
  const triggers: string[] = [];
  for (const r of qa.results) {
    if (r.status === 'NEEDS_CLARIFICATION') triggers.push(`${r.requirementId}: AI returned NEEDS_CLARIFICATION`);
    if (r.confidence === 'LOW' && r.status !== 'UNVERIFIED') triggers.push(`${r.requirementId}: AI confidence LOW`);
    const conflict = fb?.classification.find((c) => c.requirementId === r.requirementId && (c.category === 'SOW_DISSATISFACTION' || c.category === 'QUALITY_CONCERN') && r.status === 'PASS');
    if (conflict) triggers.push(`${r.requirementId}: client feedback conflicts with AI PASS`);
  }
  if (!reqIds.length) reqIds = [...new Set(triggers.map((t) => t.split(':')[0]))];
  if (!reqIds.length && !str(req.body?.reason)) fail(400, 'No ambiguity or dispute detected. Expert review is not needed for routine submissions — give a reason if you still want one.');
  if (!reqIds.length) reqIds = qa.results.map((r) => r.requirementId);
  if (str(req.body?.reason)) triggers.push(`${party} requested review: ${str(req.body.reason, 500)}`);
  const reqs = ag.requirements.filter((r) => reqIds.includes(r.id));
  const cfg = ag.expertReview;
  const { panel, excluded } = selectPanel([...db().experts], p, reqs, cfg.panelSize);
  if (panel.length < cfg.quorum) fail(409, `Only ${panel.length} conflict-free expert(s) match — quorum of ${cfg.quorum} cannot be reached`);
  const sub = db().submissions.find((s) => s.id === qa.submissionId)!;
  const total = cfg.feePerReview * panel.length;
  const feeFunding = cfg.feePayer === 'split' ? [{ party: 'client' as const, amount: total / 2, txId: null, status: 'REQUIRED' as const }, { party: 'freelancer' as const, amount: total / 2, txId: null, status: 'REQUIRED' as const }] : [{ party: cfg.feePayer, amount: total, txId: null, status: 'REQUIRED' as const }];
  const review: ExpertReview = {
    id: id('rev'), projectId: p.id, milestoneId: mid, requirementIds: reqIds, triggers, requestedBy: u.id, status: 'AWAITING_FEE_ACK',
    panelSize: panel.length, quorum: cfg.quorum, fee: cfg.feePerReview, feePayer: cfg.feePayer, feeAcks: { client: null, freelancer: null }, feeFunding: feeFunding as any,
    closesAt: new Date(Date.now() + 3 * 864e5).toISOString(),
    assignments: panel.map((e) => ({ expertId: e.userId, status: 'INVITED', conflictDeclaration: null, feeDisclosedAt: now() })), excludedExperts: excluded, votes: [],
    packet: {
      requirements: reqs, clarifications: reqs.filter((r) => r.clarification).map((r) => ({ id: r.id, text: r.clarification })), agreementVersion: ag.version,
      scopeChanges: db().scopeChanges.filter((s) => s.projectId === p.id).map((s) => ({ description: s.description, status: s.status })),
      submission: { url: sub.url, notes: sub.notes, claims: sub.claims, evidence: sub.evidence.map((e) => ({ label: e.label, path: e.path, kind: e.kind, text: e.text?.slice(0, 4000) })) },
      kernel: qa.kernel, qaResults: qa.results.filter((r) => reqIds.includes(r.requirementId)), qaRunId: qa.id,
      feedback: fb ? { rating: fb.rating, classification: fb.classification } : null,
      freelancerResponses: db().messages.filter((m) => m.projectId === p.id && m.from === p.freelancerId && (m.kind === 'response' || m.kind === 'challenge')).map((m) => m.text),
    },
    result: null, createdAt: now(),
  };
  db().expertReviews.push(review);
  st.workStatus = 'IN_EXPERT_REVIEW';
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'EXPERT_REVIEW_REQUESTED', details: `Requirements ${reqIds.join(', ')}. Triggers: ${triggers.join('; ')}. Panel: ${panel.length} (quorum ${cfg.quorum}). Fee $${cfg.feePerReview}/review paid by ${cfg.feePayer} — awaiting acknowledgement by both parties. Excluded: ${excluded.map((x) => x.reason).join('; ') || 'none'}.`, refs: [{ type: 'review', id: review.id }] });
  postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.coordinator, audience: 'all', kind: 'escalation', text: `Independent expert review proposed for ${reqIds.join(', ')}. Fixed fee: $${cfg.feePerReview} per completed review × ${panel.length} = $${total}, paid by ${cfg.feePayer}, never contingent on the vote and never deducted from milestone pay. Both parties must acknowledge before reviewers start.` });
  touch(p);
  return { review };
}));

function maybeOpenVoting(r: ExpertReview, p: Project) {
  if (r.status !== 'AWAITING_FEE_ACK') return;
  if (!r.feeAcks.client || !r.feeAcks.freelancer) return;
  if (r.fee > 0 && r.feeFunding.some((f) => f.status !== 'PAID')) return;
  r.status = 'VOTING';
  audit({ projectId: p.id, actor: 'system', actorType: 'system', action: 'EXPERT_VOTING_OPEN', details: `Blind voting open until ${r.closesAt.slice(0, 16)}. Votes are sealed until the review closes.`, refs: [{ type: 'review', id: r.id }] });
}

function loadReview(rid: string) { return db().expertReviews.find((r) => r.id === rid) || fail(404, 'Review not found'); }

api.post('/reviews/:rid/ack-fee', h((req) => {
  const u = U(req);
  const r = loadReview(String(req.params.rid));
  const { p, party } = loadProject(r.projectId, u);
  if (r.status !== 'AWAITING_FEE_ACK') fail(409, 'Fee already acknowledged');
  r.feeAcks[party] = now();
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'EXPERT_FEE_ACKNOWLEDGED', details: `${party} acknowledged fixed fee $${r.fee}/review × ${r.panelSize}, payer: ${r.feePayer}`, refs: [{ type: 'review', id: r.id }] });
  maybeOpenVoting(r, p);
  touch(p);
}));

// Expert-side endpoints
const loadExpert = (u: User) => (u.role === 'expert' ? db().experts.find((e) => e.userId === u.id) : null) || fail(403, 'Expert account required');

api.get('/expert/assignments', h((req) => {
  const u = U(req);
  const prof = loadExpert(u);
  return {
    profile: { ...prof, name: u.name, email: u.email, paypalEmail: u.paypalEmail },
    reviews: db().expertReviews.filter((r) => r.assignments.some((a) => a.expertId === u.id)).map((r) => {
      const p = db().projects.find((x) => x.id === r.projectId)!;
      const mine = r.assignments.find((a) => a.expertId === u.id)!;
      const closed = r.status === 'CLOSED' || r.status === 'INCONCLUSIVE';
      return {
        ...r, project: { id: p.id, title: p.title, category: p.category }, myAssignment: mine,
        votes: closed ? r.votes : r.votes.filter((v) => v.expertId === u.id), // blind: only own votes until close
        packet: mine.status === 'ACCEPTED' || mine.status === 'SUBMITTED' ? r.packet : null,
        parties: { client: db().users.find((x) => x.id === p.clientId)?.name, freelancer: db().users.find((x) => x.id === p.freelancerId)?.name },
      };
    }),
  };
}));

api.post('/reviews/:rid/respond', h((req) => {
  const u = U(req);
  loadExpert(u);
  const r = loadReview(String(req.params.rid));
  const a = r.assignments.find((x) => x.expertId === u.id) || fail(403, 'Not assigned');
  if (a.status !== 'INVITED') fail(409, 'Already responded');
  if (req.body?.accept) {
    const decl = str(req.body?.conflictDeclaration, 1000);
    if (!decl) fail(400, 'A conflict-of-interest declaration is required');
    if (req.body?.hasConflict) { a.status = 'DECLINED'; a.conflictDeclaration = decl; }
    else { a.status = 'ACCEPTED'; a.conflictDeclaration = decl; a.acceptedAt = now(); }
  } else a.status = 'DECLINED';
  audit({ projectId: r.projectId, actor: u.id, actorType: 'user', action: 'EXPERT_ASSIGNMENT', details: `${u.name} ${a.status.toLowerCase()} (fee $${r.fee} disclosed ${a.feeDisclosedAt.slice(0, 10)}). Declaration: ${a.conflictDeclaration || '—'}`, refs: [{ type: 'review', id: r.id }] });
  save();
}));

async function recordVotes(r: ExpertReview, u: User, votes: any[], generated: boolean) {
  const prof = db().experts.find((e) => e.userId === u.id)!;
  const a = r.assignments.find((x) => x.expertId === u.id)!;
  if (r.status !== 'VOTING') fail(409, 'Voting is not open');
  if (a.status !== 'ACCEPTED') fail(409, 'Accept the assignment (with conflict declaration) first');
  for (const reqId of r.requirementIds) {
    const v = votes.find((x) => x.requirementId === reqId) || fail(400, `Vote required for ${reqId}`);
    if (!['COMPLIANT', 'PARTIALLY_COMPLIANT', 'NOT_COMPLIANT', 'INSUFFICIENT_EVIDENCE'].includes(v.vote)) fail(400, 'Invalid vote');
    if (str(v.reasoning).length < 10) fail(400, `Reasoning required for ${reqId}`);
    if (!str(v.evidence)) fail(400, `Cite supporting evidence for ${reqId}`);
  }
  for (const reqId of r.requirementIds) {
    const v = votes.find((x) => x.requirementId === reqId);
    r.votes.push({ expertId: u.id, requirementId: reqId, vote: v.vote, reasoning: str(v.reasoning, 2000), evidence: str(v.evidence, 2000), recommendation: str(v.recommendation, 1000), submittedAt: now(), simulated: prof.isSimulated, generated });
  }
  a.status = 'SUBMITTED';
  const p = db().projects.find((x) => x.id === r.projectId)!;
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'EXPERT_VOTE_SUBMITTED', details: `${prof.isSimulated ? '[SIMULATED EXPERT] ' : ''}${u.name} submitted a sealed vote${generated ? ' (auto-generated by demo simulator)' : ''}.`, refs: [{ type: 'review', id: r.id }] });
  // Fixed fee for a valid completed review — identical regardless of the vote.
  if (r.fee > 0) {
    const t = await payoutTo(p, r.milestoneId, null, u.id, r.fee, `Fixed expert review fee — review ${r.id} (independent of vote)`, u);
    a.feePaymentId = t.id;
  }
  if (r.assignments.filter((x) => x.status === 'ACCEPTED' || x.status === 'INVITED').length === 0) closeReview(r, p, 'all assigned reviewers submitted');
}

function closeReview(r: ExpertReview, p: Project, why: string) {
  const submitted = new Set(r.votes.map((v) => v.expertId)).size;
  r.result = aggregateVotes(r);
  r.status = submitted < r.quorum || r.result.perRequirement.some((x) => x.outcome === 'INCONCLUSIVE') ? 'INCONCLUSIVE' : 'CLOSED';
  r.closedAt = now();
  const st = msState(p, r.milestoneId);
  if (st.workStatus === 'IN_EXPERT_REVIEW') st.workStatus = 'QA_COMPLETE';
  audit({ projectId: p.id, actor: 'system', actorType: 'system', action: 'EXPERT_REVIEW_CLOSED', details: `${r.status} (${why}). ${submitted}/${r.panelSize} votes, quorum ${r.quorum}. ${r.result.summary}`, refs: [{ type: 'review', id: r.id }] });
  postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.coordinator, audience: 'all', kind: 'notice', text: `Expert panel ${r.status === 'CLOSED' ? 'result' : 'is INCONCLUSIVE'}: ${r.result.summary}. Votes and reasoning are now visible. ${r.status === 'INCONCLUSIVE' ? 'The disputed amount stays under review; more evidence or another review is needed.' : 'Generate the payment recommendation on the Payments tab.'}` });
}

api.post('/reviews/:rid/votes', h(async (req) => {
  const u = U(req);
  loadExpert(u);
  const r = loadReview(String(req.params.rid));
  if (r.votes.some((v) => v.expertId === u.id)) fail(409, 'You have already voted');
  await recordVotes(r, u, Array.isArray(req.body?.votes) ? req.body.votes : [], false);
  save();
}));

// DEMO: generate sealed votes for SIMULATED expert profiles that have not voted. Never applies to real experts.
api.post('/reviews/:rid/simulate', h(async (req) => {
  const u = U(req);
  const r = loadReview(String(req.params.rid));
  const { p } = loadProject(r.projectId, u);
  if (r.status !== 'VOTING') fail(409, 'Voting is not open (both parties must acknowledge and fund the fee first)');
  const ag = activeAgreement(p)!;
  let n = 0;
  for (const a of r.assignments) {
    const prof = db().experts.find((e) => e.userId === a.expertId)!;
    if (!prof.isSimulated || a.status === 'SUBMITTED' || a.status === 'DECLINED') continue;
    const eu = db().users.find((x) => x.id === a.expertId)!;
    if (a.status === 'INVITED') { a.status = 'ACCEPTED'; a.acceptedAt = now(); a.conflictDeclaration = '[SIMULATED] No relationship with either party declared.'; }
    const votes = [];
    for (const reqId of r.requirementIds) votes.push({ requirementId: reqId, ...(await simulateVote(prof, eu, r, ag.requirements.find((x) => x.id === reqId)!)) });
    await recordVotes(r, eu, votes, true);
    n++;
  }
  touch(p);
  return { simulated: n };
}));

api.post('/reviews/:rid/close', h((req) => {
  const u = U(req);
  const r = loadReview(String(req.params.rid));
  const { p } = loadProject(r.projectId, u);
  if (r.status !== 'VOTING') fail(409, 'Review is not open');
  if (Date.parse(r.closesAt) > Date.now() && r.assignments.some((a) => a.status === 'ACCEPTED' || a.status === 'INVITED')) fail(409, `Voting period runs until ${r.closesAt.slice(0, 16)} and reviewers are still pending`);
  closeReview(r, p, 'closed after voting period');
  touch(p);
}));

// ───────────────────────── allocation & release ─────────────────────────
api.post('/projects/:id/milestones/:mid/allocation', h((req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u);
  const mid = String(req.params.mid);
  const ag = activeAgreement(p) || fail(409, 'No approved agreement');
  const st = msState(p, mid);
  const d = db();
  if (withFreelancer(latestSubmission(p.id, mid))) fail(409, 'The latest revision is back with the freelancer after the pre-check, so there is nothing to decide payment on yet.');
  const qa = d.qaRuns.filter((q) => q.projectId === p.id && q.milestoneId === mid && q.status === 'COMPLETE').at(-1) || null;
  const feedback = d.feedback.filter((f) => f.projectId === p.id && f.milestoneId === mid).at(-1) || null;
  const review = d.expertReviews.filter((r) => r.projectId === p.id && r.milestoneId === mid).at(-1) || null;
  const settlement = d.settlements.filter((s) => s.projectId === p.id && s.milestoneId === mid && s.status === 'AGREED').at(-1) || null;
  for (const a of d.allocations.filter((a) => a.projectId === p.id && a.milestoneId === mid && (a.status === 'PROPOSED' || a.status === 'CHALLENGED'))) a.status = 'SUPERSEDED';
  const calc = computeAllocation({ agreement: ag, milestoneId: mid, state: st, qa, feedback, review, settlement });
  const alloc = { id: id('alc'), projectId: p.id, ...calc, approvals: { client: null, freelancer: null }, challenges: [], status: 'PROPOSED' as const, createdAt: now() };
  d.allocations.push(alloc);
  st.underReview = calc.disputedAmount;
  refreshFunding(st, calc.milestoneAmount, calc.releaseType === 'UNDER_REVIEW' && calc.disputedAmount > 0 && !!review && review.status !== 'CLOSED');
  if (calc.releaseType === 'REVISION_REQUIRED' && st.workStatus !== 'REVISION_REQUESTED') st.workStatus = 'REVISION_REQUESTED';
  audit({ projectId: p.id, actor: 'allocation-engine', actorType: 'system', action: 'ALLOCATION_RECOMMENDED', details: `${calc.releaseType}: eligible $${calc.eligibleAmount}, held $${calc.disputedAmount}. Rule: ${calc.rule}`, refs: [{ type: 'allocation', id: alloc.id }, ...(qa ? [{ type: 'qa', id: qa.id }] : []), ...(review ? [{ type: 'review', id: review.id }] : [])] });
  touch(p);
  return { allocation: alloc };
}));

api.post('/allocations/:aid/approve', h((req) => {
  const u = U(req);
  const a = db().allocations.find((x) => x.id === req.params.aid) || fail(404, 'Not found');
  const { p, party } = loadProject(a.projectId, u);
  if (a.status !== 'PROPOSED' && a.status !== 'APPROVED') fail(409, `Allocation is ${a.status}`);
  a.approvals[party] = now();
  if (a.approvals.client && a.approvals.freelancer) a.status = 'APPROVED';
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: party === 'client' ? 'ALLOCATION_APPROVED' : 'ALLOCATION_ACKNOWLEDGED', details: `${party} ${party === 'client' ? 'approved release of' : 'acknowledged'} $${a.eligibleAmount} for ${a.milestoneId} (${a.releaseType})`, refs: [{ type: 'allocation', id: a.id }] });
  touch(p);
}));

api.post('/allocations/:aid/execute', h(async (req) => {
  const u = U(req);
  const a = db().allocations.find((x) => x.id === req.params.aid) || fail(404, 'Not found');
  const { p } = loadProject(a.projectId, u, ['client']);
  if (a.status !== 'APPROVED' || !a.approvals.client || !a.approvals.freelancer) fail(409, 'Release requires client approval AND freelancer acknowledgement');
  if (a.eligibleAmount <= 0) fail(409, 'Nothing eligible for release');
  const ag = activeAgreement(p)!;
  const ms = ag.milestones.find((m) => m.id === a.milestoneId)!;
  const st = msState(p, a.milestoneId);
  if (st.authorized < a.eligibleAmount || !st.authorizationId) fail(409, `Only $${st.authorized} is authorized for ${ms.id}. Fund the milestone before release.`);
  const remainingAfter = st.authorized - a.eligibleAmount;
  let cap;
  try { cap = await pp.captureAuthorization(st.authorizationId!, a.eligibleAmount, remainingAfter <= 0, `${a.id}`); }
  catch (e: unknown) {
    const detail = ppFail(e);
    tx({ projectId: p.id, milestoneId: ms.id, type: 'MILESTONE_CAPTURE', amount: a.eligibleAmount, status: 'PAYMENT_FAILED', mode: pp.paypalMode(), paypal: { authorizationId: st.authorizationId }, initiatedBy: u.id, allocationId: a.id, note: detail });
    st.fundingStatus = 'PAYMENT_FAILED'; touch(p);
    fail(502, `Capture failed. ${detail}`);
  }
  const capRec = tx({ projectId: p.id, milestoneId: ms.id, type: 'MILESTONE_CAPTURE', amount: a.eligibleAmount, status: cap!.status, mode: cap!.mode, paypal: { authorizationId: st.authorizationId, captureId: cap!.captureId }, initiatedBy: u.id, approvals: [a.approvals.client!, a.approvals.freelancer!], allocationId: a.id, note: `${a.releaseType} per allocation ${a.id}${remainingAfter > 0 ? `; $${remainingAfter} remains authorized (under review)` : ''}` });
  st.authorized = remainingAfter; st.captured += a.eligibleAmount;
  a.status = 'EXECUTED';
  await payoutTo(p, ms.id, capRec, 'freelancer', a.eligibleAmount, `${a.releaseType.replace('_', ' ')} — ${ms.id} ${ms.title}`, u, a.id);
  if (st.captured >= ms.amount - 0.005) st.workStatus = 'ACCEPTED';
  refreshFunding(st, ms.amount, remainingAfter > 0 && a.disputedAmount > 0);
  if (p.milestoneStates.every((s) => s.workStatus === 'ACCEPTED' || s.workStatus === 'CLOSED')) p.status = 'COMPLETED';
  touch(p);
}));

// Mutually agreed partial settlement (when no measurable payment units exist)
api.post('/projects/:id/milestones/:mid/settlements', h((req) => {
  const u = U(req);
  const { p, party } = loadProject(String(req.params.id), u);
  const mid = String(req.params.mid);
  const ms = activeAgreement(p)!.milestones.find((m) => m.id === mid) || fail(404, 'Milestone not found');
  const amount = num(req.body?.amount);
  if (!(amount > 0 && amount <= ms.amount)) fail(400, `Amount must be between 0 and ${ms.amount}`);
  const s = { id: id('stl'), projectId: p.id, milestoneId: mid, amount, reason: str(req.body?.reason, 1000) || fail(400, 'Reason required'), proposedBy: u.id, approvals: { client: party === 'client' ? now() : null, freelancer: party === 'freelancer' ? now() : null }, status: 'PROPOSED' as const, createdAt: now() };
  db().settlements.push(s);
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'PARTIAL_SETTLEMENT_PROPOSED', details: `${party} proposes $${amount} of $${ms.amount} for ${mid}: ${s.reason}`, refs: [] });
  touch(p);
  return { settlement: s };
}));

api.post('/settlements/:sid/decide', h((req) => {
  const u = U(req);
  const s = db().settlements.find((x) => x.id === req.params.sid) || fail(404, 'Not found');
  const { p, party } = loadProject(s.projectId, u);
  if (s.status !== 'PROPOSED') fail(409, 'Already decided');
  if (s.approvals[party]) fail(409, 'Waiting for the other party');
  if (req.body?.approve) { s.approvals[party] = now(); s.status = 'AGREED'; } else s.status = 'DECLINED';
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'PARTIAL_SETTLEMENT_DECISION', details: `${party} ${s.status === 'AGREED' ? 'agreed' : 'declined'} $${s.amount} for ${s.milestoneId}`, refs: [] });
  touch(p);
}));

// ───────────────────────── scope changes ─────────────────────────
api.post('/projects/:id/scope-changes', h(async (req) => {
  const u = U(req);
  const { p } = loadProject(String(req.params.id), u);
  const ag = activeAgreement(p) || fail(409, 'No approved agreement');
  const description = str(req.body?.description, 2000) || fail(400, 'Describe the request');
  const ai = await aiJSON<any>('You compare a change request against an approved SOW. Decide if it is already covered (in scope) or new work (out of scope). Quote the relevant requirement ids.',
    `REQUIREMENTS: ${JSON.stringify(ag.requirements.map((r) => ({ id: r.id, title: r.title, criteria: r.acceptanceCriteria })))}\nEXCLUSIONS: ${JSON.stringify(ag.extraction.exclusions)}\nREQUEST: ${description}\nReturn {"outOfScope":boolean,"reason":string,"relatedRequirements":string[]}`);
  const words = description.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const related = ag.requirements.filter((r) => words.some((w) => (r.title + ' ' + r.acceptanceCriteria.join(' ')).toLowerCase().includes(w))).map((r) => r.id);
  const analysis = ai ? { outOfScope: !!ai.data.outOfScope, reason: String(ai.data.reason), relatedRequirements: ai.data.relatedRequirements || [], source: ai.source }
    : { outOfScope: true, reason: related.length ? `Touches ${related.join(', ')}, but asks for behaviour beyond their written acceptance criteria.` : 'No approved requirement covers this request.', relatedRequirements: related, source: 'heuristic' };
  const sc = { id: id('scr'), projectId: p.id, requestedBy: u.id, description, analysis, freelancerResponse: null, clientDecision: null, status: analysis.outOfScope ? 'AWAITING_FREELANCER' as const : 'WITHDRAWN' as const, createdAt: now() };
  db().scopeChanges.push(sc);
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'SCOPE_CHANGE_REQUESTED', details: `"${description.slice(0, 160)}" — ${analysis.outOfScope ? 'OUT OF SCOPE' : 'already covered by ' + analysis.relatedRequirements.join(', ')}: ${analysis.reason}`, refs: [] });
  touch(p);
  return { scopeChange: sc };
}));

api.post('/scope-changes/:sid/freelancer', h((req) => {
  const u = U(req);
  const sc = db().scopeChanges.find((x) => x.id === req.params.sid) || fail(404, 'Not found');
  const { p } = loadProject(sc.projectId, u, ['freelancer']);
  if (sc.status !== 'AWAITING_FREELANCER') fail(409, 'Not awaiting freelancer');
  const willing = !!req.body?.willing;
  const cost = num(req.body?.cost), days = Math.round(num(req.body?.days));
  if (willing && !(cost >= 0 && days >= 0)) fail(400, 'Provide cost and days');
  sc.freelancerResponse = { willing, cost: willing ? cost : 0, days: willing ? days : 0, note: str(req.body?.note, 1000), at: now() };
  sc.status = willing ? 'AWAITING_CLIENT' : 'DECLINED';
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'SCOPE_CHANGE_QUOTED', details: willing ? `Freelancer quotes $${cost}, ${days} days` : 'Freelancer declined the additional work', refs: [] });
  touch(p);
}));

api.post('/scope-changes/:sid/client', h((req) => {
  const u = U(req);
  const sc = db().scopeChanges.find((x) => x.id === req.params.sid) || fail(404, 'Not found');
  const { p } = loadProject(sc.projectId, u, ['client']);
  if (sc.status !== 'AWAITING_CLIENT') fail(409, 'Not awaiting client');
  if (draftAgreement(p)) fail(409, 'Another agreement draft is being negotiated; resolve it first');
  const approved = !!req.body?.approved;
  sc.clientDecision = { approved, at: now(), note: str(req.body?.note, 1000) };
  sc.status = approved ? 'APPROVED' : 'DECLINED';
  if (approved) {
    const src = activeAgreement(p)!;
    const v = newDraftFrom(p, src, u, `Change order ${sc.id}: ${sc.description.slice(0, 120)}`);
    const n = v.milestones.length + 1;
    const last = v.milestones.map((m) => m.dueDate).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 10);
    const due = new Date(Date.parse(last) + sc.freelancerResponse!.days * 864e5).toISOString().slice(0, 10);
    v.milestones.push({ id: `M${n}`, title: `Change order: ${sc.description.slice(0, 60)}`, description: sc.description, startDate: last, dueDate: due, amount: sc.freelancerResponse!.cost, dependsOn: [], owner: 'freelancer' });
    v.requirements.push({ id: `REQ-${String(v.requirements.length + 1).padStart(2, '0')}`, sowRef: `Change order ${sc.id}`, title: sc.description.slice(0, 80), description: sc.description, expectedOutcome: sc.description, acceptanceCriteria: [sc.description], deliverable: 'Change order', milestoneId: `M${n}`, evidenceRequired: ['functional'], category: 'frontend', amount: v.partialPaymentRule === 'PER_REQUIREMENT_AMOUNTS' ? sc.freelancerResponse!.cost : null, ambiguity: null, clarification: null, status: 'UNVERIFIED' });
    v.budget += sc.freelancerResponse!.cost;
    v.scopeChangeId = sc.id;
    // Both parties explicitly approved this exact change (freelancer quoted it, client accepted) → record both approvals.
    v.approvals = { freelancer: sc.freelancerResponse!.at, client: now() };
    finalizeIfApproved(p, v, u);
    sc.resultingAgreementVersion = v.version;
  }
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'SCOPE_CHANGE_DECISION', details: approved ? `Approved — agreement v${sc.resultingAgreementVersion} adds a funded-separately change-order milestone` : 'Client declined the quote', refs: [] });
  touch(p);
}));

// ───────────────────────── conversations ─────────────────────────
api.post('/projects/:id/messages', h(async (req) => {
  const u = U(req);
  const { p, party } = loadProject(String(req.params.id), u);
  const text = str(req.body?.text, 4000) || fail(400, 'Empty message');
  const audience = ['all', 'client', 'freelancer'].includes(req.body?.audience) ? req.body.audience : 'all';
  const kind = req.body?.kind === 'response' ? 'response' : 'chat';
  const m = postMessage({ projectId: p.id, from: u.id, fromType: 'user', audience, kind, text });
  audit({ projectId: p.id, actor: u.id, actorType: 'user', action: 'MESSAGE', details: `${party} → ${audience}: ${text.slice(0, 120)}`, refs: [{ type: 'message', id: m.id }] });
  if (req.body?.askPM) {
    const r = await askPM(p, text, party);
    postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: r.outOfScope ? AGENTS.client : AGENTS.coordinator, audience: party, kind: r.outOfScope ? 'clarification' : 'chat', text: r.text });
    // When the client asks for new work, prepare the change request for them rather than
    // making them re-type it — it still needs the freelancer's price and the client's approval.
    const isRequest = /(add|also|could you|can you|i want|i need|please|would like)/i.test(text);
    if (r.outOfScope && party === 'client' && isRequest && activeAgreement(p)) {
      const dup = db().scopeChanges.some((s) => s.projectId === p.id && s.description === text && ['AWAITING_FREELANCER', 'AWAITING_CLIENT'].includes(s.status));
      if (!dup) {
        const sc = { id: id('scr'), projectId: p.id, requestedBy: u.id, description: text, analysis: { outOfScope: true, reason: r.text.split('.').slice(0, 2).join('.') + '.', relatedRequirements: [], source: `AI project manager (${r.source})` }, freelancerResponse: null, clientDecision: null, status: 'AWAITING_FREELANCER' as const, createdAt: now() };
        db().scopeChanges.push(sc);
        audit({ projectId: p.id, actor: 'client-expectation-agent', actorType: 'agent', action: 'SCOPE_CHANGE_CREATED', details: `Out-of-scope request from a client message, prepared as a change request: "${text.slice(0, 140)}"`, refs: [{ type: 'scope', id: sc.id }] });
        postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.client, audience: 'client', kind: 'notice', text: 'I have opened a change request for this. The freelancer will be asked whether they can take it on and at what price and time; nothing changes until you approve their quote.' });
        postMessage({ projectId: p.id, from: 'ai-coordinator', fromType: 'agent', agent: AGENTS.freelancer, audience: 'freelancer', kind: 'notice', text: `The client asked for something outside the agreement: "${text.slice(0, 200)}". It does not affect payment for work already agreed. If you want to take it on, quote a price and timeline under Scope changes — or decline.` });
      }
    }
  }
  touch(p);
}));

// ───────────────────────── evidence files ─────────────────────────
export function evidenceHandler(req: Request, res: Response) {
  const u = currentUser(req);
  if (!u) return res.status(401).end();
  const path = `/evidence/${req.params.name}`;
  const d = db();
  const projectIds = new Set<string>([
    ...d.submissions.filter((s) => s.evidence.some((e) => e.path === path)).map((s) => s.projectId),
    ...d.qaRuns.filter((q) => q.kernel.screenshots.some((e) => e.path === path)).map((q) => q.projectId),
  ]);
  const allowed = [...projectIds].some((pid) => {
    const p = d.projects.find((x) => x.id === pid);
    if (p && partyOf(p, u)) return true;
    return d.expertReviews.some((r) => r.projectId === pid && r.assignments.some((a) => a.expertId === u.id && (a.status === 'ACCEPTED' || a.status === 'SUBMITTED')));
  });
  if (!allowed) return res.status(404).end();
  const buf = readEvidenceFile(path);
  if (!buf) return res.status(404).end();
  const ext = path.split('.').pop();
  res.setHeader('Content-Type', ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'txt' ? 'text/plain; charset=utf-8' : 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', /jpg|jpeg|png|webp|gif|txt/.test(ext || '') ? 'inline' : 'attachment');
  res.send(buf);
}

// ───────────────────────── PayPal webhook ─────────────────────────
export async function paypalWebhook(req: Request, res: Response) {
  const event = req.body;
  const ok = await pp.verifyWebhook(req.headers as any, event).catch(() => false);
  if (!ok) return res.status(400).json({ error: 'Webhook signature not verified' });
  const resId = event?.resource?.id;
  const batchId = event?.resource?.batch_header?.payout_batch_id || event?.resource?.payout_batch_id;
  const t = db().transactions.find((x) => x.paypal.captureId === resId || x.paypal.authorizationId === resId || (batchId && x.paypal.payoutBatchId === batchId));
  if (t) {
    const map: Record<string, string> = { 'PAYMENT.CAPTURE.COMPLETED': 'COMPLETED', 'PAYMENT.CAPTURE.DENIED': 'PAYMENT_FAILED', 'PAYMENT.CAPTURE.REFUNDED': 'REFUNDED', 'PAYMENT.AUTHORIZATION.VOIDED': 'VOIDED', 'PAYMENT.PAYOUTS-ITEM.FAILED': 'PAYMENT_FAILED', 'CUSTOMER.DISPUTE.CREATED': 'DISPUTED' };
    if (map[event.event_type]) { t.status = map[event.event_type]; t.updatedAt = now(); }
    audit({ projectId: t.projectId, actor: 'paypal', actorType: 'paypal', action: 'WEBHOOK', details: `${event.event_type} (verified) for ${t.type} ${t.id}`, refs: [{ type: 'transaction', id: t.id }] });
    if (event.event_type === 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED' && t.status.startsWith('PENDING')) {
      t.status = 'SUCCESS';
      const p = db().projects.find((x) => x.id === t.projectId)!;
      if (t.type === 'FREELANCER_PAYOUT') { if (t.milestoneId) msState(p, t.milestoneId).paid += t.amount; else p.advance.paid += t.amount; }
      // Note: the matching PLATFORM_FEE row already recorded the withheld amount at release time.
    }
    save();
  }
  res.json({ ok: true });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 8 MB)' });
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
}

export { coordinate };
