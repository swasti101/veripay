// Payment Allocation Engine — deterministic, rules-based (spec §9.D).
// It never invents amounts: it only uses the milestone amount and per-requirement
// amounts written into the approved agreement, or a partial amount both parties agreed.
import type { AgreementVersion, Allocation, AllocationLine, ExpertReview, Feedback, MilestoneState, PartialSettlement, QARun } from '../types.js';

const OUTCOME_MAP: Record<string, string> = { COMPLIANT: 'PASS', PARTIALLY_COMPLIANT: 'PARTIAL', NOT_COMPLIANT: 'FAIL', INSUFFICIENT_EVIDENCE: 'UNDER_REVIEW', INCONCLUSIVE: 'UNDER_REVIEW' };
const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function computeAllocation(input: {
  agreement: AgreementVersion;
  milestoneId: string;
  state: MilestoneState;
  qa: QARun | null;
  feedback: Feedback | null;
  review: ExpertReview | null;
  settlement: PartialSettlement | null;
}): Omit<Allocation, 'id' | 'projectId' | 'approvals' | 'challenges' | 'status' | 'createdAt'> {
  const { agreement, milestoneId, state, qa, feedback, review, settlement } = input;
  const ms = agreement.milestones.find((m) => m.id === milestoneId)!;
  const reqs = agreement.requirements.filter((r) => r.milestoneId === milestoneId);
  const A = ms.amount;
  const explanation: string[] = [];
  const lines: AllocationLine[] = [];
  const notes: string[] = [];

  for (const r of reqs) {
    const q = qa?.results.find((x) => x.requirementId === r.id);
    let status = q?.status || 'UNVERIFIED';
    let basis = q ? `AI QA (${qa!.kernel.mode}): ${q.status}` : 'No QA run yet';
    const outcome = review?.result?.perRequirement.find((p) => p.requirementId === r.id);
    if (review && review.requirementIds.includes(r.id)) {
      if (outcome && (review.status === 'CLOSED' || review.status === 'INCONCLUSIVE')) {
        status = OUTCOME_MAP[outcome.outcome] as any;
        const t = outcome.tally;
        basis = `Human expert panel: ${outcome.outcome} (${t.COMPLIANT} compliant / ${t.PARTIALLY_COMPLIANT} partial / ${t.NOT_COMPLIANT} not / ${t.INSUFFICIENT_EVIDENCE} insufficient)`;
      } else {
        status = 'UNDER_REVIEW' as any;
        basis = 'Expert review in progress';
      }
    }
    const fb = feedback?.classification.filter((c) => c.requirementId === r.id) || [];
    const sowFb = fb.filter((c) => c.category === 'SOW_DISSATISFACTION' || c.category === 'QUALITY_CONCERN');
    if (sowFb.length && status === 'PASS' && !outcome) {
      status = 'DISPUTED' as any;
      basis += ` · client reports ${sowFb.map((c) => c.category).join(', ')} against this criterion`;
    }
    for (const c of fb.filter((c) => c.category === 'SUBJECTIVE_PREFERENCE' || c.category === 'OUT_OF_SCOPE_REQUEST'))
      notes.push(`${r.id}: client feedback "${c.text.slice(0, 80)}" classified ${c.category} — does not reduce the agreed payment (fairness rule).`);
    lines.push({ requirementId: r.id, title: r.title, status, basis, amount: r.amount ?? null, treatment: status === 'PASS' ? 'RELEASE' : status === 'OUT_OF_SCOPE' ? 'EXCLUDED_OUT_OF_SCOPE' : status === 'PARTIAL' ? 'NEEDS_AGREEMENT' : 'HOLD' });
  }

  const pass = lines.filter((l) => l.status === 'PASS' || l.status === 'OUT_OF_SCOPE');
  const held = lines.filter((l) => l.treatment === 'HOLD' || l.treatment === 'NEEDS_AGREEMENT');
  const hasUnits = agreement.partialPaymentRule === 'PER_REQUIREMENT_AMOUNTS' && reqs.length > 0 && reqs.every((r) => typeof r.amount === 'number') && reqs.reduce((a, r) => a + (r.amount || 0), 0) === A;
  const pendingReview = lines.some((l) => l.status === 'UNDER_REVIEW');
  const anyFail = lines.some((l) => l.status === 'FAIL');
  const anyDispute = lines.some((l) => (l.status as string) === 'DISPUTED');
  const anyClar = lines.some((l) => l.status === 'NEEDS_CLARIFICATION');

  let releaseType: Allocation['releaseType'];
  let eligible = 0;
  let rule = '';

  if (!qa) {
    releaseType = 'UNDER_REVIEW'; rule = 'No assessment yet — nothing is eligible for release.';
  } else if (!held.length) {
    eligible = A; releaseType = 'FULL_PAYMENT';
    rule = review?.result ? 'Human experts find work compliant → recommend the agreed milestone payment.' : 'Clear SOW compliance, QA PASS → full agreed milestone payment.';
    if (feedback && feedback.rating !== 'FULLY_SATISFIED') explanation.push('Client is not fully satisfied, but none of the dissatisfaction relates to an unmet agreed acceptance criterion.');
  } else if (settlement && settlement.status === 'AGREED') {
    eligible = Math.min(settlement.amount, A); releaseType = eligible >= A ? 'FULL_PAYMENT' : 'PARTIAL_PAYMENT';
    rule = `Mutually agreed partial settlement (${fmt(settlement.amount)}) proposed ${settlement.createdAt.slice(0, 10)} and approved by both parties.`;
  } else if (hasUnits) {
    eligible = pass.reduce((a, l) => a + (l.amount || 0), 0);
    releaseType = eligible > 0 ? 'PARTIAL_PAYMENT' : anyFail && !pendingReview ? 'REVISION_REQUIRED' : 'UNDER_REVIEW';
    rule = 'Requirements partly fulfilled and partial acceptance is measurable → partial payment from the pre-agreed per-requirement amounts.';
  } else {
    eligible = 0;
    releaseType = anyFail && !pendingReview && !anyClar && !anyDispute ? 'REVISION_REQUIRED' : 'UNDER_REVIEW';
    rule = 'The agreement has no measurable payment units for this milestone → no partial amount is calculated. Both parties must agree a partial amount, or the freelancer completes the work.';
  }
  if (releaseType !== 'FULL_PAYMENT') {
    if (pendingReview) rule += ' Expert review pending → disputed amount stays UNDER REVIEW.';
    else if (anyClar) rule += ' AI assessment is ambiguous → refer to human expert review.';
    else if (anyDispute) rule += ' Client disputes an agreed criterion → request correction or escalate to expert review.';
    else if (anyFail) rule += review?.result ? ' Experts find non-compliance → revision required for the failed items.' : ' Failed criteria → request correction.';
    if (review?.status === 'INCONCLUSIVE') rule += ' Expert panel inconclusive → amount remains under review; more evidence requested.';
  }

  // "released" = amount already captured for this milestone in earlier releases (paid or awaiting disbursement)
  const released = state.captured;
  const remaining = Math.max(0, A - released);
  const beforePaid = eligible;
  eligible = Math.max(0, Math.min(eligible - released, remaining));
  const disputed = Math.max(0, remaining - eligible);

  explanation.unshift(
    `Agreement v${agreement.version}: milestone ${ms.id} "${ms.title}" is worth ${fmt(A)}${hasUnits ? ` split across requirements (${reqs.map((r) => `${r.id} ${fmt(r.amount || 0)}`).join(', ')})` : ' with no per-requirement payment units'}.`,
    `Delivered & accepted: ${pass.map((l) => l.requirementId).join(', ') || 'none'}. Not yet accepted: ${held.map((l) => `${l.requirementId} (${l.status})`).join(', ') || 'none'}.`,
  );
  if (feedback) explanation.push(`Client satisfaction: ${feedback.rating.replace(/_/g, ' ').toLowerCase()}; ${feedback.classification.map((c) => `${c.category}${c.requirementId ? ` on ${c.requirementId}` : ''}`).join(', ') || 'no itemised issues'}.`);
  if (review?.result) explanation.push(`Expert panel: ${review.result.summary}`);
  explanation.push(...notes);
  explanation.push(`Calculation: ${hasUnits && releaseType === 'PARTIAL_PAYMENT' && !(settlement?.status === 'AGREED') ? pass.map((l) => fmt(l.amount || 0)).join(' + ') + ` = ${fmt(beforePaid)}` : `${fmt(beforePaid)}`}${released ? ` − already released ${fmt(released)}` : ''} → eligible ${fmt(eligible)}; remaining under review/held ${fmt(disputed)}.`);
  const fundedAvail = state.authorized; // remaining PayPal authorization for this milestone
  if (eligible > fundedAvail) explanation.push(`Funding check: only ${fmt(Math.max(0, fundedAvail))} is authorized/captured for this milestone — the client must fund the difference before release.`);
  explanation.push('This is a recommendation. Money moves only after the client approves and the freelancer acknowledges it.');

  return {
    milestoneId, milestoneAmount: A, releaseType, eligibleAmount: eligible, disputedAmount: disputed, rule, explanation, lines,
    inputs: { qaRunId: qa?.id || null, feedbackId: feedback?.id || null, expertReviewId: review?.id || null, agreementVersion: agreement.version },
  };
}

/** Expert vote aggregation: quorum + strict majority; ties, missing quorum or a plurality of INSUFFICIENT_EVIDENCE → INCONCLUSIVE. */
export function aggregateVotes(review: ExpertReview): NonNullable<ExpertReview['result']> {
  const per = review.requirementIds.map((reqId) => {
    const votes = review.votes.filter((v) => v.requirementId === reqId);
    const tally = { COMPLIANT: 0, PARTIALLY_COMPLIANT: 0, NOT_COMPLIANT: 0, INSUFFICIENT_EVIDENCE: 0 } as Record<string, number>;
    for (const v of votes) tally[v.vote]++;
    let outcome: any = 'INCONCLUSIVE';
    if (votes.length >= review.quorum) {
      const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      if (sorted[0][1] > votes.length / 2 && sorted[0][0] !== 'INSUFFICIENT_EVIDENCE') outcome = sorted[0][0];
    }
    const minority = votes.filter((v) => v.vote !== outcome).map((v) => ({ expertId: v.expertId, vote: v.vote, reasoning: v.reasoning }));
    return { requirementId: reqId, tally: tally as any, outcome, minority };
  });
  const summary = per.map((p) => `${p.requirementId}: ${p.outcome} (${p.tally.COMPLIANT}/${p.tally.PARTIALLY_COMPLIANT}/${p.tally.NOT_COMPLIANT}/${p.tally.INSUFFICIENT_EVIDENCE} C/P/N/I)${p.minority.length ? `, ${p.minority.length} minority opinion(s) preserved` : ''}`).join('; ');
  return { perRequirement: per, summary };
}
