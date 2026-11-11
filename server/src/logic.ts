// Shared project logic: access control, agreement lifecycle, funding status, views.
import crypto from 'node:crypto';
import { db, save, id, now, audit } from './db.js';
import { activeAgreement, draftAgreement, coordinate } from './services/pm.js';
import type { AgreementVersion, MilestoneState, Party, Project, User, FundingStatus } from './types.js';

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
export const fail = (status: number, msg: string): never => { throw new HttpError(status, msg); };

export function partyOf(p: Project, u: User): Party | null {
  if (p.clientId === u.id) return 'client';
  if (p.freelancerId === u.id) return 'freelancer';
  return null;
}

export function loadProject(projectId: string, u: User, allowed?: Party[]) {
  const p = db().projects.find((x) => x.id === projectId) || fail(404, 'Project not found');
  const party = partyOf(p, u);
  if (!party) fail(403, 'You are not a party to this project');
  if (allowed && !allowed.includes(party!)) fail(403, `Only the ${allowed.join(' or ')} can do this`);
  return { p, party: party! };
}

export function touch(p: Project) { p.updatedAt = now(); save(); coordinate(p); }

export function msState(p: Project, mid: string): MilestoneState {
  return p.milestoneStates.find((s) => s.milestoneId === mid) || fail(404, 'Milestone not active in the approved agreement');
}

export function newDraftFrom(p: Project, src: AgreementVersion | null, u: User, changeSummary: string): AgreementVersion {
  const version = Math.max(0, ...p.agreementVersions.map((v) => v.version)) + 1;
  const base: AgreementVersion = src ? JSON.parse(JSON.stringify(src)) : {
    sowText: '', extraction: { scope: '', deliverables: [], responsibilities: { client: [], freelancer: [] }, dependencies: [], exclusions: [], assumptions: [], budget: null, advanceAmount: null, paymentTerms: '', ambiguities: [], source: 'manual' },
    requirements: [], milestones: [], budget: 0, advanceAmount: 0, currency: 'USD', fundingPlan: null, partialPaymentRule: 'MUTUAL_AGREEMENT_ONLY',
    expertReview: { mode: 'ADVISORY', panelSize: 3, quorum: 2, feePerReview: 25, feePayer: 'client' }, platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT || 5),
  } as any;
  const v: AgreementVersion = { ...base, id: id('agv'), version, status: 'DRAFT', approvals: { client: null, freelancer: null }, createdBy: u.id, createdAt: now(), changeSummary };
  p.agreementVersions.push(v);
  p.draftAgreementId = v.id;
  if (p.status === 'DRAFT') p.status = 'NEGOTIATING';
  return v;
}

export function validateAgreement(v: AgreementVersion): string[] {
  const issues: string[] = [];
  if (!v.milestones.length) issues.push('At least one milestone is required.');
  if (!v.requirements.length) issues.push('At least one requirement is required.');
  const total = v.milestones.reduce((a, m) => a + m.amount, 0) + v.advanceAmount;
  if (Math.abs(total - v.budget) > 0.01) issues.push(`Milestones + advance ($${total}) must equal the budget ($${v.budget}).`);
  for (const r of v.requirements) if (!v.milestones.some((m) => m.id === r.milestoneId)) issues.push(`${r.id} is not linked to a milestone.`);
  if (v.partialPaymentRule === 'PER_REQUIREMENT_AMOUNTS') for (const m of v.milestones) {
    const rs = v.requirements.filter((r) => r.milestoneId === m.id);
    const sum = rs.reduce((a, r) => a + (r.amount || 0), 0);
    if (rs.some((r) => typeof r.amount !== 'number') || Math.abs(sum - m.amount) > 0.01) issues.push(`${m.id}: per-requirement amounts ($${sum}) must sum to the milestone amount ($${m.amount}).`);
  }
  if (!v.fundingPlan) issues.push('The client must choose a funding plan.');
  const unresolved = v.requirements.filter((r) => r.ambiguity && !r.clarification);
  if (unresolved.length) issues.push(`Warning: ${unresolved.map((r) => r.id).join(', ')} still have unclarified wording — they will be assessed NEEDS_CLARIFICATION.`);
  return issues;
}

/** When both parties approved the draft: it becomes the active baseline; previous version is superseded. */
export function finalizeIfApproved(p: Project, v: AgreementVersion, actor: User) {
  if (!v.approvals.client || !v.approvals.freelancer) return false;
  const prev = activeAgreement(p);
  if (prev) prev.status = 'SUPERSEDED';
  v.status = 'APPROVED';
  p.activeAgreementId = v.id;
  p.draftAgreementId = null;
  p.status = 'ACTIVE';
  const advSettled = (p.advance?.paid || 0) + (p.advance?.platformFee || 0);
  p.advance = { status: advSettled >= v.advanceAmount && v.advanceAmount > 0 ? 'PAID' : v.advanceAmount > 0 ? (p.advance?.status && p.advance.status !== 'FUNDING_REQUIRED' ? p.advance.status : 'FUNDING_REQUIRED') : 'PAID', amount: v.advanceAmount, paid: p.advance?.paid || 0, platformFee: p.advance?.platformFee || 0 };
  for (const m of v.milestones) if (!p.milestoneStates.some((s) => s.milestoneId === m.id))
    p.milestoneStates.push({ milestoneId: m.id, fundingStatus: 'FUNDING_REQUIRED', workStatus: 'NOT_STARTED', authorized: 0, captured: 0, paid: 0, platformFee: 0, underReview: 0 });
  for (const r of v.requirements) r.status = r.status || 'UNVERIFIED';
  audit({ projectId: p.id, actor: actor.id, actorType: 'user', action: 'AGREEMENT_APPROVED', details: `Agreement v${v.version} approved by both parties and locked as the payment baseline. ${v.changeSummary}`, refs: [{ type: 'agreement', id: v.id }] });
  return true;
}

export function refreshFunding(st: MilestoneState, amount: number, pendingReview: boolean) {
  let s: FundingStatus;
  // The platform fee is retained revenue, not an unpaid remainder: a milestone is settled when
  // the net paid out plus the fee withheld covers the agreed gross.
  const settled = st.paid + (st.platformFee || 0);
  if (settled >= amount - 0.005 && amount > 0) s = 'PAID';
  else if (st.captured > settled + 0.005) s = 'AWAITING_DISBURSEMENT';
  else if (st.paid > 0) s = pendingReview ? 'DISPUTED' : 'PARTIALLY_PAID';
  else if (pendingReview && st.authorized > 0) s = 'DISPUTED';
  else if (st.authorized > 0) s = 'AUTHORIZED';
  else if (st.fundingStatus === 'FUNDING_PENDING' || st.fundingStatus === 'PAYMENT_FAILED' || st.fundingStatus === 'REFUNDED') s = st.fundingStatus;
  else s = 'FUNDING_REQUIRED';
  st.fundingStatus = s;
}

export function inviteCode() { return crypto.randomBytes(5).toString('hex').toUpperCase(); }

export function committedAmount(v: AgreementVersion | null) {
  if (!v?.fundingPlan) return 0;
  if (v.fundingPlan.option === 'FULL') return v.budget;
  const ms = v.milestones.filter((m) => v.fundingPlan!.committedMilestones.includes(m.id)).reduce((a, m) => a + m.amount, 0);
  return v.advanceAmount + (v.fundingPlan.option === 'PARTIAL' ? ms : 0);
}

export function moneySummary(p: Project) {
  const d = db();
  const ag = activeAgreement(p) || draftAgreement(p);
  const txs = d.transactions.filter((t) => t.projectId === p.id);
  const ok = (t: any) => !/FAILED|DENIED|VOIDED|DECLINED/.test(t.status);
  const authorizedNow = p.milestoneStates.reduce((a, s) => a + s.authorized, 0);
  const capturedMs = p.milestoneStates.reduce((a, s) => a + s.captured, 0);
  const advCaptured = txs.filter((t) => t.type === 'ADVANCE_PAYMENT' && ok(t)).reduce((a, t) => a + t.amount, 0);
  const paid = p.milestoneStates.reduce((a, s) => a + s.paid, 0) + (p.advance?.paid || 0);
  const latestAlloc = (mid: string) => d.allocations.filter((a) => a.projectId === p.id && a.milestoneId === mid && (a.status === 'PROPOSED' || a.status === 'APPROVED')).at(-1);
  const eligible = p.milestoneStates.reduce((a, s) => a + (latestAlloc(s.milestoneId)?.eligibleAmount || 0), 0);
  const underReview = p.milestoneStates.reduce((a, s) => a + (latestAlloc(s.milestoneId)?.disputedAmount ?? s.underReview ?? 0), 0);
  const funded = authorizedNow + capturedMs + advCaptured;
  return {
    currency: ag?.currency || 'USD', budget: ag?.budget || 0, advance: ag?.advanceAmount || 0, committed: committedAmount(ag),
    authorized: authorizedNow, captured: capturedMs + advCaptured, awaitingFunding: Math.max(0, (ag?.budget || 0) - funded - 0),
    eligible, paid, underReview,
    expertFees: txs.filter((t) => t.type === 'EXPERT_FEE_PAYOUT' && ok(t)).reduce((a, t) => a + t.amount, 0),
    platformFees: txs.filter((t) => t.type === 'PLATFORM_FEE' && ok(t)).reduce((a, t) => a + t.amount, 0),
    simulated: txs.some((t) => t.mode === 'SIMULATED'),
  };
}

/* ── Pre-check ──────────────────────────────────────────────────────────────
   A revision with too much left unfinished goes back to the freelancer before the client
   is asked to review it. "Unfinished" means something the freelancer can act on (FAIL,
   UNVERIFIED, PARTIAL). NEEDS_CLARIFICATION is excluded: it is waiting on the client's
   answer, so it must never hold the freelancer's work back. */
export const PRECHECK_MAX_UNFINISHED = () => {
  const v = Number(process.env.PRECHECK_MAX_UNFINISHED);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.5;
};

export function evaluatePrecheck(results: { requirementId: string; status: string }[]): NonNullable<import('./types.js').Submission['precheck']> {
  const unfinished = results.filter((r) => ['FAIL', 'UNVERIFIED', 'PARTIAL'].includes(r.status)).map((r) => r.requirementId);
  const awaitingClient = results.filter((r) => r.status === 'NEEDS_CLARIFICATION').map((r) => r.requirementId);
  const considered = results.filter((r) => !['OUT_OF_SCOPE', 'NEEDS_CLARIFICATION'].includes(r.status)).length;
  const threshold = PRECHECK_MAX_UNFINISHED();
  // Nothing the freelancer can act on (all clarifications or out of scope) → the client must look.
  const passed = considered === 0 || unfinished.length / considered <= threshold;
  return { passed, unfinished, awaitingClient, considered, threshold, at: now() };
}

/** True while a revision sits with the freelancer and has not been sent on to the client. */
export const withFreelancer = (s?: { precheck?: { passed: boolean; sentAnywayAt?: string } } | null) =>
  !!s?.precheck && !s.precheck.passed && !s.precheck.sentAnywayAt;

export function latestSubmission(projectId: string, milestoneId: string) {
  return db().submissions.filter((s) => s.projectId === projectId && s.milestoneId === milestoneId).at(-1) || null;
}

/** Project as seen by one party. Expert votes stay sealed until the review closes. */
export function projectView(p: Project, u: User) {
  const d = db();
  const party = partyOf(p, u)!;
  // A revision returned by the pre-check is the freelancer's working draft: the client sees
  // that it exists and went back, not the findings — those reach them once it is sent on.
  const heldSubs = new Set(d.submissions.filter((s) => s.projectId === p.id && withFreelancer(s)).map((s) => s.id));
  const visibleQa = d.qaRuns.filter((q) => q.projectId === p.id).map((q) =>
    party === 'client' && heldSubs.has(q.submissionId)
      ? { id: q.id, projectId: q.projectId, milestoneId: q.milestoneId, submissionId: q.submissionId, createdAt: q.createdAt, status: q.status, heldForFreelancer: true }
      : q);
  const userMap = Object.fromEntries(d.users.map((x) => [x.id, { id: x.id, name: x.name, role: x.role, isDemo: x.isDemo, payoutOnboarded: !!x.payoutOnboarded }]));
  const reviews = d.expertReviews.filter((r) => r.projectId === p.id).map((r) => {
    const sealed = r.status === 'VOTING' || r.status === 'AWAITING_FEE_ACK';
    return { ...r, votes: sealed ? [] : r.votes, votesSubmitted: new Set(r.votes.map((v) => v.expertId)).size, sealed };
  });
  return {
    project: p, party,
    activeAgreement: activeAgreement(p), draftAgreement: draftAgreement(p),
    submissions: d.submissions.filter((s) => s.projectId === p.id),
    qaRuns: visibleQa,
    feedback: d.feedback.filter((f) => f.projectId === p.id),
    reviews,
    experts: d.experts.map((e) => ({ ...e, name: d.users.find((x) => x.id === e.userId)?.name, conflicts: undefined, hasConflictWithParty: e.conflicts.includes(p.clientId || '') || e.conflicts.includes(p.freelancerId || '') })),
    allocations: d.allocations.filter((a) => a.projectId === p.id),
    settlements: d.settlements.filter((s) => s.projectId === p.id),
    transactions: d.transactions.filter((t) => t.projectId === p.id),
    messages: d.messages.filter((m) => m.projectId === p.id && (m.audience === 'all' || m.audience === party || m.from === u.id)),
    scopeChanges: d.scopeChanges.filter((s) => s.projectId === p.id),
    audit: d.audit.filter((a) => a.projectId === p.id),
    users: userMap,
    money: moneySummary(p),
    pending: pendingActions(p, party),
  };
}

/** Single source of truth for "what is waiting on this party" — used by the dashboard,
 *  the notification bell and the workspace Overview so they can never disagree. */
export function pendingActions(p: Project, party: Party): { action: string; tab: string }[] {
  const d = db();
  const out: { action: string; tab: string }[] = [];
  const draft = draftAgreement(p);
  const ag = activeAgreement(p);
  const other = party === 'client' ? 'freelancer' : 'client';

  if (!p[other === 'client' ? 'clientId' : 'freelancerId'] && p.invite?.status !== 'PENDING') out.push({ action: `Invite the ${other}`, tab: 'overview' });
  if (draft) {
    if (party === 'client' && !draft.fundingPlan) out.push({ action: 'Choose a funding plan', tab: 'funding' });
    const unclear = draft.requirements.filter((r) => r.ambiguity && !r.clarification);
    if (unclear.length && party === 'client') out.push({ action: `Clarify ${unclear.map((r) => r.id).join(', ')} wording`, tab: 'agreement' });
    if (!draft.approvals[party] && p.clientId && p.freelancerId && draft.fundingPlan) out.push({ action: `Review & approve agreement v${draft.version}`, tab: 'agreement' });
  }
  if (!ag) return out;

  if (party === 'client' && ag.advanceAmount > 0 && ['FUNDING_REQUIRED', 'FUNDING_PENDING', 'PAYMENT_FAILED'].includes(p.advance.status))
    out.push({ action: `Fund the agreed advance ($${ag.advanceAmount})`, tab: 'funding' });

  // The next unfunded milestone blocks the freelancer from starting it, so funding it is a real
  // client action even under a partial plan where it was not committed up front.
  const nextUnfunded = ag.milestones.find((m) => {
    const s = p.milestoneStates.find((x) => x.milestoneId === m.id);
    return s && s.workStatus === 'NOT_STARTED' && s.authorized + s.captured < m.amount;
  });
  const priorDone = (mid: string) => {
    const i = ag.milestones.findIndex((m) => m.id === mid);
    return ag.milestones.slice(0, i).every((m) => {
      const s = p.milestoneStates.find((x) => x.milestoneId === m.id);
      return !s || ['ACCEPTED', 'CLOSED', 'IN_PROGRESS', 'SUBMITTED', 'QA_COMPLETE', 'IN_EXPERT_REVIEW', 'REVISION_REQUESTED'].includes(s.workStatus);
    });
  };

  for (const ms of ag.milestones) {
    const st = p.milestoneStates.find((s) => s.milestoneId === ms.id);
    if (!st || st.workStatus === 'CLOSED') continue;
    const committed = ag.fundingPlan?.option === 'FULL' || ag.fundingPlan?.committedMilestones.includes(ms.id);
    const funded = st.authorized + st.captured;
    const isNext = nextUnfunded?.id === ms.id && priorDone(ms.id);
    if (party === 'client' && funded < ms.amount && st.workStatus === 'NOT_STARTED' && (committed || isNext))
      out.push({ action: `Fund ${ms.id} ($${ms.amount - funded})${committed ? '' : ' — next milestone, not yet funded'}`, tab: 'funding' });
    if (party === 'freelancer' && st.workStatus === 'NOT_STARTED' && funded > 0) out.push({ action: `Start funded milestone ${ms.id}`, tab: 'delivery' });
    const lastSub = d.submissions.filter((s) => s.projectId === p.id && s.milestoneId === ms.id).at(-1);
    const held = withFreelancer(lastSub);
    if (party === 'freelancer' && held) out.push({ action: `${ms.id} came back from the pre-check — finish ${lastSub!.precheck!.unfinished.join(', ')} and resubmit`, tab: 'delivery' });
    else if (party === 'freelancer' && ['IN_PROGRESS', 'REVISION_REQUESTED'].includes(st.workStatus)) out.push({ action: `Submit deliverables for ${ms.id}`, tab: 'delivery' });
    const lastFb = d.feedback.filter((f) => f.projectId === p.id && f.milestoneId === ms.id).at(-1);
    if (party === 'client' && lastSub && !held && ['QA_COMPLETE', 'SUBMITTED'].includes(st.workStatus) && (!lastFb || lastFb.createdAt < lastSub.createdAt))
      out.push({ action: `Give satisfaction feedback on ${ms.id}`, tab: 'feedback' });

    const rv = d.expertReviews.filter((r) => r.projectId === p.id && r.milestoneId === ms.id).at(-1);
    if (rv?.status === 'AWAITING_FEE_ACK') {
      if (!rv.feeAcks[party]) out.push({ action: `Acknowledge expert review fee (${ms.id})`, tab: 'experts' });
      else if (rv.feeFunding.some((f) => f.party === party && f.status === 'REQUIRED')) out.push({ action: `Pay your share of the expert fee (${ms.id})`, tab: 'experts' });
    }
    const qa = d.qaRuns.filter((q) => q.projectId === p.id && q.milestoneId === ms.id && q.status === 'COMPLETE').at(-1);
    const alloc = d.allocations.filter((a) => a.projectId === p.id && a.milestoneId === ms.id).at(-1);
    const live = alloc && ['PROPOSED', 'APPROVED', 'CHALLENGED'].includes(alloc.status);
    if (live && !alloc!.approvals[party]) out.push({ action: `${party === 'client' ? 'Approve' : 'Acknowledge'} ${ms.id} payment recommendation ($${alloc!.eligibleAmount})`, tab: 'payments' });
    else if (live && alloc!.status === 'APPROVED' && party === 'client' && alloc!.eligibleAmount > 0) out.push({ action: `Release $${alloc!.eligibleAmount} for ${ms.id}`, tab: 'payments' });
    else if (!alloc && qa && st.captured < ms.amount && !['NOT_STARTED', 'IN_PROGRESS'].includes(st.workStatus))
      out.push({ action: `Generate the ${ms.id} payment recommendation`, tab: 'payments' });

    for (const s of d.settlements.filter((s) => s.projectId === p.id && s.milestoneId === ms.id && s.status === 'PROPOSED'))
      if (!s.approvals[party]) out.push({ action: `Decide on the proposed partial settlement ($${s.amount})`, tab: 'payments' });
  }
  for (const s of d.scopeChanges.filter((s) => s.projectId === p.id)) {
    if (s.status === 'AWAITING_FREELANCER' && party === 'freelancer') out.push({ action: 'Quote or decline a scope-change request', tab: 'scope' });
    if (s.status === 'AWAITING_CLIENT' && party === 'client') out.push({ action: 'Approve or decline a scope-change quote', tab: 'scope' });
  }
  if (party === 'freelancer') {
    const fu = d.users.find((x) => x.id === p.freelancerId);
    const owed = d.transactions.some((t) => t.projectId === p.id && t.status === 'AWAITING_DISBURSEMENT');
    if (fu && !fu.payoutOnboarded && owed) out.push({ action: 'Complete payout onboarding to receive funds', tab: 'payments' });
  }
  return out;
}
