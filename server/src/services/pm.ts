// AI Project Manager Coordinator: detects unresolved issues and contacts the right party —
// only when something actionable changed (messages are de-duplicated by ref key).
import { db, postMessage, audit } from '../db.js';
import { aiJSON } from './ai.js';
import type { Project, Message } from '../types.js';

export const AGENTS = {
  coordinator: 'AI Project Manager',
  client: 'Client Expectation Agent',
  freelancer: 'Freelancer Delivery Agent',
  mediator: 'QA Mediator Agent',
} as const;

function once(project: Project, key: string, m: Omit<Message, 'id' | 'createdAt' | 'projectId' | 'from' | 'fromType' | 'ref'>) {
  const d = db();
  if (d.messages.some((x) => x.projectId === project.id && x.ref?.type === 'pm' && x.ref.id === key)) return;
  postMessage({ projectId: project.id, from: 'ai-coordinator', fromType: 'agent', ref: { type: 'pm', id: key }, ...m });
}

export function activeAgreement(p: Project) {
  return p.agreementVersions.find((v) => v.id === p.activeAgreementId) || null;
}
export function draftAgreement(p: Project) {
  return p.agreementVersions.find((v) => v.id === p.draftAgreementId) || null;
}

export function coordinate(project: Project) {
  const d = db();
  const draft = draftAgreement(project);
  const ag = activeAgreement(project);
  if (draft) {
    for (const r of draft.requirements.filter((r) => r.ambiguity && !r.clarification))
      once(project, `clarify-${draft.id}-${r.id}`, { agent: AGENTS.client, audience: 'client', kind: 'clarification', text: `${r.id} "${r.title}" (${r.sowRef}): ${r.ambiguity} Please add a clarification in the Agreement tab before approving — it becomes part of the payment baseline.` });
    if (!draft.fundingPlan) once(project, `fundplan-${draft.id}`, { agent: AGENTS.coordinator, audience: 'client', kind: 'notice', text: 'Choose a funding plan (advance, partial or full) on the Funding tab. The freelancer must accept it as part of the agreement.' });
    const pending = (['client', 'freelancer'] as const).filter((pt) => !draft.approvals[pt]);
    if (pending.length === 1 && project.clientId && project.freelancerId)
      once(project, `approve-${draft.id}-${pending[0]}-${draft.approvals.client || ''}${draft.approvals.freelancer || ''}`, { agent: AGENTS.coordinator, audience: pending[0], kind: 'notice', text: `Agreement v${draft.version} is approved by the other party and awaits your approval.` });
  }
  if (!ag) return;
  const nowMs = Date.now();
  for (const ms of ag.milestones) {
    const st = project.milestoneStates.find((s) => s.milestoneId === ms.id);
    if (!st) continue;
    const due = Date.parse(ms.dueDate);
    if (!isNaN(due) && due - nowMs < 3 * 864e5 && due > nowMs && ['NOT_STARTED', 'IN_PROGRESS', 'REVISION_REQUESTED'].includes(st.workStatus))
      once(project, `deadline-${ms.id}-${ms.dueDate}`, { agent: AGENTS.coordinator, audience: 'all', kind: 'notice', text: `Deadline approaching: ${ms.id} "${ms.title}" is due ${ms.dueDate}.` });
    if (st.workStatus === 'NOT_STARTED' && st.fundingStatus === 'FUNDING_REQUIRED')
      once(project, `fund-${ms.id}`, { agent: AGENTS.coordinator, audience: 'client', kind: 'notice', text: `${ms.id} must be funded before the freelancer can start it.` });
    if (st.authorizationExpires && Date.parse(st.authorizationExpires) - nowMs < 5 * 864e5 && st.fundingStatus === 'AUTHORIZED')
      once(project, `authexp-${ms.id}-${st.authorizationExpires}`, { agent: AGENTS.coordinator, audience: 'client', kind: 'notice', text: `The PayPal authorization for ${ms.id} expires ${st.authorizationExpires.slice(0, 10)}. Authorizations cannot be held indefinitely; re-fund the milestone if assessment will take longer.` });
    // A hold that lapses before the work is even due can never be captured — flag it early,
    // while there is still time to re-fund rather than discovering it at release.
    if (st.authorizationExpires && !isNaN(due) && Date.parse(st.authorizationExpires) < due && st.fundingStatus === 'AUTHORIZED')
      once(project, `authbeforedue-${ms.id}-${st.authorizationExpires}`, { agent: AGENTS.coordinator, audience: 'all', kind: 'notice', text: `Schedule conflict on ${ms.id}: the PayPal authorization lapses ${st.authorizationExpires.slice(0, 10)} but the milestone is not due until ${ms.dueDate}. It cannot be captured after it lapses, so this milestone will need re-funding — or both parties can agree a new agreement version with an earlier due date. I cannot change the agreed dates myself.` });
    // Funding is a predecessor of the work in this product, so an unfunded milestone with a
    // near due date is a schedule problem, not just a payment one.
    const gap = ms.amount - st.authorized - st.captured;
    if (gap > 0 && st.workStatus === 'NOT_STARTED' && !isNaN(due) && due - nowMs < 7 * 864e5)
      once(project, `blocked-${ms.id}-${ms.dueDate}`, { agent: AGENTS.coordinator, audience: 'all', kind: 'notice', text: `${ms.id} is due ${ms.dueDate} but ${gap} of its ${ms.amount} is still unfunded, so the freelancer cannot start it. Funding it now protects the date; otherwise the date needs to move, which requires a new agreement version both parties approve.` });
    const qa = d.qaRuns.filter((q) => q.projectId === project.id && q.milestoneId === ms.id && q.status === 'COMPLETE').at(-1);
    if (!qa) continue;
    const unverified = qa.results.filter((r) => r.status === 'UNVERIFIED');
    if (unverified.length) once(project, `evidence-${qa.id}`, { agent: AGENTS.freelancer, audience: 'freelancer', kind: 'evidence_request', text: `QA could not verify ${unverified.map((r) => r.requirementId).join(', ')}. Please resubmit with functional evidence (test report, recording, or an authorized URL Kernel can inspect).` });
    const clar = qa.results.filter((r) => r.status === 'NEEDS_CLARIFICATION');
    if (clar.length) once(project, `clar-${qa.id}`, { agent: AGENTS.mediator, audience: 'all', kind: 'clarification', text: `${clar.map((r) => r.requirementId).join(', ')} cannot be assessed because the agreed wording is not measurable. The client can clarify the intended threshold; if the parties disagree, I recommend independent expert review.` });
    const fb = d.feedback.filter((f) => f.projectId === project.id && f.milestoneId === ms.id).at(-1);
    if (fb) {
      const conflicts = fb.classification.filter((c) => (c.category === 'SOW_DISSATISFACTION' || c.category === 'QUALITY_CONCERN') && qa.results.find((r) => r.requirementId === c.requirementId && r.status === 'PASS'));
      if (conflicts.length) once(project, `conflict-${fb.id}`, { agent: AGENTS.mediator, audience: 'all', kind: 'escalation', text: `Client feedback conflicts with AI QA (PASS) on ${conflicts.map((c) => c.requirementId).join(', ')}. The freelancer can respond with evidence; either party can request independent expert review.` });
      const oos = fb.classification.filter((c) => c.category === 'OUT_OF_SCOPE_REQUEST');
      if (oos.length) once(project, `oos-${fb.id}`, { agent: AGENTS.client, audience: 'all', kind: 'notice', text: `"${oos[0].text.slice(0, 120)}" is outside the approved SOW. It will not reduce payment for this milestone. A scope-change request can be raised for the freelancer to price.` });
      if (fb.classification.some((c) => c.category !== 'OUT_OF_SCOPE_REQUEST' && c.category !== 'UNCLEAR'))
        once(project, `share-${fb.id}`, { agent: AGENTS.freelancer, audience: 'freelancer', kind: 'notice', text: `Client feedback on ${ms.id}: ${fb.classification.map((c) => `[${c.category}] ${c.text}`).join(' · ').slice(0, 500)}` });
      for (const c of fb.classification.filter((c) => c.category === 'UNCLEAR'))
        once(project, `unclear-${fb.id}-${c.text.slice(0, 20)}`, { agent: AGENTS.client, audience: 'client', kind: 'clarification', text: `Could you say which requirement "${c.text.slice(0, 80)}" relates to and what specifically is wrong?` });
    }
    const alloc = d.allocations.filter((a) => a.projectId === project.id && a.milestoneId === ms.id && a.status === 'PROPOSED').at(-1);
    if (alloc && alloc.eligibleAmount > 0) once(project, `alloc-${alloc.id}`, { agent: AGENTS.coordinator, audience: 'all', kind: 'notice', text: `Payment conditions for ${ms.id} are satisfied for $${alloc.eligibleAmount}. Client approval and freelancer acknowledgement are required before release.` });
  }
}

/** Free-form question to the AI PM with full project context. */
export async function askPM(project: Project, question: string, askerRole: string) {
  const d = db();
  const ag = activeAgreement(project) || draftAgreement(project);
  const ctx = {
    title: project.title, status: project.status,
    requirements: ag?.requirements.map((r) => ({ id: r.id, title: r.title, milestone: r.milestoneId, status: r.status, criteria: r.acceptanceCriteria, clarification: r.clarification })),
    exclusions: ag?.extraction.exclusions, milestones: ag?.milestones, states: project.milestoneStates,
    recentMessages: d.messages.filter((m) => m.projectId === project.id).slice(-10).map((m) => m.text),
  };
  const ai = await aiJSON<{ answer: string; outOfScope: boolean }>(
    'You are the AI Project Manager of a client–freelancer project. Be concise and neutral. Base answers only on the approved agreement and project state. You recommend and coordinate; you never make or change contractual decisions. If the question requests new work not in the SOW, say it is out of scope and suggest a scope-change request.',
    `Asker role: ${askerRole}\nPROJECT: ${JSON.stringify(ctx).slice(0, 20000)}\nQUESTION: ${question}\nReturn {"answer":string,"outOfScope":boolean}`);
  if (ai) return { text: ai.data.answer, source: ai.source, outOfScope: !!ai.data.outOfScope };
  // Heuristic: answer status questions from state; detect out-of-scope by keyword vs requirements.
  const q = question.toLowerCase();
  const words = q.split(/\W+/).filter((w) => w.length > 4);
  const covered = ag?.requirements.filter((r) => words.some((w) => (r.title + ' ' + r.description).toLowerCase().includes(w))) || [];
  const asksNew = /(add|also|new|extra|could you|can you build|integrate)/.test(q);
  if (asksNew && !covered.length) return { source: 'heuristic', outOfScope: true, text: 'That does not match any approved requirement, so it is outside the current agreement. You can raise a scope-change request (Scope & Disputes tab); the freelancer may price it and both parties approve it as a new agreement version.' };
  if (covered.length) return { source: 'heuristic', outOfScope: false, text: covered.map((r) => `${r.id} "${r.title}" (${r.milestoneId}) — status ${r.status}. Acceptance: ${r.acceptanceCriteria.join('; ')}${r.clarification ? `. Approved clarification: ${r.clarification}` : ''}`).join('\n') };
  const st = project.milestoneStates.map((s) => `${s.milestoneId}: work ${s.workStatus}, funding ${s.fundingStatus}, paid $${s.paid}`).join('; ');
  return { source: 'heuristic', outOfScope: false, text: `Project status: ${project.status}. ${st || 'No milestones are active yet.'} (No AI provider configured — answers are rule-based.)` };
}

export { audit };
