import { aiJSON } from './ai.js';
import type { ExpertProfile, ExpertReview, ExpertVote, Project, Requirement, User } from '../types.js';

const CATEGORY_TAGS: Record<string, string[]> = {
  frontend: ['frontend', 'qa', 'design'],
  backend: ['backend', 'qa'],
  design: ['design', 'frontend'],
  content: ['content'],
  qa: ['qa', 'frontend', 'backend'],
};

/** Match reviewers to the disputed requirements; exclude anyone with a declared relationship to either party. */
export function selectPanel(experts: ExpertProfile[], project: Project, reqs: Requirement[], size: number) {
  const wanted = new Set(reqs.flatMap((r) => CATEGORY_TAGS[r.category] || ['qa']));
  const excluded: { expertId: string; reason: string }[] = [];
  const eligible = experts.filter((e) => {
    const conflict = e.conflicts.find((c) => c === project.clientId || c === project.freelancerId);
    if (conflict) { excluded.push({ expertId: e.userId, reason: 'Declared relationship with a project party (conflict of interest)' }); return false; }
    return true;
  });
  const score = (e: ExpertProfile) => e.expertise.filter((t) => wanted.has(t)).length * 10 + (e.rating || 0);
  const ranked = eligible.sort((a, b) => score(b) - score(a));
  for (const e of ranked.slice(size)) excluded.push({ expertId: e.userId, reason: score(e) < 10 ? 'Expertise does not match the disputed requirements' : 'Panel already full' });
  return { panel: ranked.slice(0, size), excluded };
}

/** DEMO vote simulator — produces a vote for a SIMULATED expert profile. Clearly flagged generated=true. */
export async function simulateVote(expert: ExpertProfile, user: User, review: ExpertReview, req: Requirement) {
  const pkt = review.packet;
  const qa = pkt.qaResults?.find((q: any) => q.requirementId === req.id);
  const fb = (pkt.feedback?.classification || []).filter((c: any) => c.requirementId === req.id || !c.requirementId);
  const ai = await aiJSON<any>(
    `You are role-playing a SIMULATED domain expert reviewer for a product demo (${user.name}, ${expert.headline}). Judge only whether the delivery meets the APPROVED SOW requirement as written plus approved clarifications. Client preferences outside the SOW are not requirements.`,
    `REQUIREMENT: ${JSON.stringify({ id: req.id, title: req.title, criteria: req.acceptanceCriteria, ambiguity: req.ambiguity, clarification: req.clarification })}
AI QA: ${JSON.stringify(qa)}
KERNEL: ${JSON.stringify(pkt.kernel?.pages?.slice(0, 5))}
CLIENT FEEDBACK: ${JSON.stringify(fb)}
FREELANCER RESPONSE: ${JSON.stringify(pkt.freelancerResponses || [])}
Return {"vote":"COMPLIANT"|"PARTIALLY_COMPLIANT"|"NOT_COMPLIANT"|"INSUFFICIENT_EVIDENCE","reasoning":string (<=60 words),"evidence":string,"recommendation":string}`);
  if (ai?.data?.vote) return { vote: ai.data.vote as ExpertVote, reasoning: String(ai.data.reasoning), evidence: String(ai.data.evidence || ''), recommendation: String(ai.data.recommendation || '') };

  // Deterministic fallback: a specialist matching the category reads the evidence; outcome depends on evidence, not on who pays.
  const s = qa?.status;
  const evid = (qa?.evidence || []).slice(0, 2).join('; ') || 'review packet';
  const outOfScopeFb = fb.some((c: any) => c.category === 'OUT_OF_SCOPE_REQUEST' || c.category === 'SUBJECTIVE_PREFERENCE');
  if (s === 'FAIL') return { vote: 'NOT_COMPLIANT' as ExpertVote, reasoning: `Evidence shows the acceptance criterion "${req.acceptanceCriteria[0] || req.title}" is not met.`, evidence: evid, recommendation: 'Request correction before release.' };
  if (s === 'UNVERIFIED' && !(qa?.evidence || []).length) return { vote: 'INSUFFICIENT_EVIDENCE' as ExpertVote, reasoning: 'The packet contains no evidence for this requirement.', evidence: 'none', recommendation: 'Freelancer to supply test evidence.' };
  if (s === 'NEEDS_CLARIFICATION' || s === 'PARTIAL' || s === 'UNVERIFIED') {
    if (expert.expertise[0] === 'design')
      return { vote: 'PARTIALLY_COMPLIANT' as ExpertVote, reasoning: `The written criteria are met at a basic level, but "${req.ambiguity?.match(/"([^"]+)"/)?.[1] || 'the quality term'}" could reasonably imply a higher bar than delivered.`, evidence: evid, recommendation: 'Accept; clarify the threshold for future milestones.' };
    return { vote: 'COMPLIANT' as ExpertVote, reasoning: `The SOW does not define a measurable threshold beyond the listed criteria, and every listed criterion is evidenced.${outOfScopeFb ? ' The client\'s additional request goes beyond the written SOW and should be a scope change.' : ''}`, evidence: evid, recommendation: outOfScopeFb ? 'Release; handle the new request as a scope change.' : 'Release.' };
  }
  return { vote: 'COMPLIANT' as ExpertVote, reasoning: 'All acceptance criteria are evidenced in the packet.', evidence: evid, recommendation: 'Release.' };
}
