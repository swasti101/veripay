import { aiJSON, aiLabel } from './ai.js';
import type { Extraction, Milestone, Requirement, EvidenceKind, Party } from '../types.js';

const VAGUE = ['fast', 'quick', 'modern', 'intuitive', 'relevant', 'user-friendly', 'user friendly', 'appropriate', 'real time', 'real-time', 'etc', 'as needed', 'high quality', 'seamless', 'clean', 'robust', 'industry standard', 'best practice', 'similar to'];

export interface SOWResult { extraction: Extraction; requirements: Requirement[]; milestones: Milestone[] }

const money = (s: string) => Number(s.replace(/[,$\s]/g, ''));

function evidenceFor(text: string): EvidenceKind[] {
  const t = text.toLowerCase();
  const ev = new Set<EvidenceKind>();
  if (/(responsive|layout|display|design|visual|look|brand|mobile|screen|hero|banner|image)/.test(t)) ev.add('visual');
  if (/(add|remove|filter|search|checkout|submit|login|update|sort|create|edit|delete|cart|order|api|crud|calculate|navigate|link)/.test(t)) ev.add('functional');
  if (/(document|readme|guide|report|copy|content|handover)/.test(t)) ev.add('document');
  if (!ev.size) ev.add('functional');
  return [...ev];
}
function categoryFor(text: string) {
  const t = text.toLowerCase();
  if (/(admin|api|backend|database|server|inventory|order management)/.test(t)) return 'backend';
  if (/(design|brand|visual|figma|mockup)/.test(t)) return 'design';
  if (/(documentation|content|copy|guide)/.test(t)) return 'content';
  return 'frontend';
}
function vagueTerm(text: string) {
  const t = text.toLowerCase();
  return VAGUE.find((v) => new RegExp(`\\b${v.replace(/[-\s]/g, '[-\\s]')}\\b`).test(t)) || null;
}

/** Deterministic parser — works on structured SOWs (numbered clauses, "Milestone N — … — due YYYY-MM-DD — $X"). */
export function heuristicExtract(text: string): SOWResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const reqs: Requirement[] = [];
  const milestones: Milestone[] = [];
  const exclusions: string[] = [];
  const assumptions: string[] = [];
  let section = '';
  for (const line of lines) {
    const head = line.toLowerCase();
    if (/^\d+\.\s*(exclusion|out of scope)/.test(head)) { section = 'excl'; continue; }
    if (/^\d+\.\s*assumption/.test(head)) { section = 'assm'; continue; }
    if (/^\d+\.\s/.test(line) && !/^\d+\.\d/.test(line)) { section = head; }
    if (section === 'excl' && /^[-•*]/.test(line)) { exclusions.push(line.replace(/^[-•*]\s*/, '')); continue; }
    if (section === 'assm' && /^[-•*]/.test(line)) { assumptions.push(line.replace(/^[-•*]\s*/, '')); continue; }

    const m = line.match(/^milestone\s+(\d+)\s*[—:–-]\s*(.+?)\s*\(([^)]*)\)\s*[—–-]\s*(?:start\s+(\d{4}-\d{2}-\d{2})\s*[—–-]\s*)?due\s+(\d{4}-\d{2}-\d{2})\s*[—–-]\s*\$([\d,]+(?:\.\d+)?)/i);
    if (m) {
      milestones.push({
        id: `M${m[1]}`, title: m[2].trim(), description: `Covers SOW clauses ${m[3]}`, startDate: m[4] || '', dueDate: m[5],
        amount: money(m[6]), dependsOn: [], owner: 'freelancer',
      });
      (milestones[milestones.length - 1] as any)._clauses = m[3].split(/[,;\s]+/).filter(Boolean);
      continue;
    }
    const r = line.match(/^(\d+\.\d+)\s+(.+?)\s+[—–-]\s+(.+)$/);
    if (r && !/^milestone/i.test(r[2])) {
      const body = r[3];
      const [desc, acc] = body.split(/acceptance:/i);
      const criteria = (acc || desc).replace(/\[\s*\$[\d,]+\s*\]/g, '').split(/;|\.\s+/).map((s) => s.trim().replace(/\.$/, '')).filter((s) => s.length > 3);
      const amt = body.match(/\[\s*\$([\d,]+)\s*\]/);
      const vague = vagueTerm(body);
      reqs.push({
        id: `REQ-${String(reqs.length + 1).padStart(2, '0')}`, sowRef: `§${r[1]}`, title: r[2].trim(),
        description: desc.trim().replace(/\[\s*\$[\d,]+\s*\]/, '').trim(), expectedOutcome: desc.trim().split('.')[0],
        acceptanceCriteria: criteria, deliverable: r[2].trim(), milestoneId: '', evidenceRequired: evidenceFor(body),
        category: categoryFor(r[2] + ' ' + body), amount: amt ? money(amt[1]) : null,
        ambiguity: vague ? `The term "${vague}" is not measurable. What specific, testable threshold should apply?` : null,
        clarification: null, status: 'UNVERIFIED',
      });
    }
  }
  // map reqs to milestones by clause ref
  for (const ms of milestones) {
    const clauses: string[] = (ms as any)._clauses || [];
    delete (ms as any)._clauses;
    for (const rq of reqs) if (clauses.includes(rq.sowRef.slice(1))) rq.milestoneId = ms.id;
  }
  const budgetM = text.match(/^\s*(?:total|budget)[^$\n]*\$([\d,]+(?:\.\d+)?)/im);
  const advM = text.match(/^\s*(?:advance|initial advance|upfront)[^$\n]*\$([\d,]+(?:\.\d+)?)/im);
  const advanceAmount = advM ? money(advM[1]) : null;
  const msTotal = milestones.reduce((a, m) => a + m.amount, 0);
  let budget = budgetM ? money(budgetM[1]) : null;
  const ambiguities: Extraction['ambiguities'] = reqs.filter((r) => r.ambiguity).map((r) => ({ requirementId: r.id, text: `${r.id} (${r.sowRef}): ${r.ambiguity}`, askParty: 'client' as Party }));

  if (!milestones.length) {
    milestones.push({ id: 'M1', title: 'Full delivery', description: 'No milestone breakdown was found in the SOW.', startDate: '', dueDate: '', amount: Math.max(0, (budget || 0) - (advanceAmount || 0)), dependsOn: [], owner: 'freelancer' });
    ambiguities.push({ text: 'The SOW does not define milestones or a payment schedule. Both parties must agree on milestones before funding.', askParty: 'client' });
  }
  for (const r of reqs) if (!r.milestoneId) {
    r.milestoneId = milestones[milestones.length - 1].id;
    ambiguities.push({ requirementId: r.id, text: `${r.id} is not assigned to a milestone in the SOW. Proposed: ${r.milestoneId}.`, askParty: 'client' });
  }
  for (let i = 1; i < milestones.length; i++) milestones[i].dependsOn = [milestones[i - 1].id];
  if (budget === null) {
    budget = msTotal + (advanceAmount || 0);
    if (budget) ambiguities.push({ text: `No total budget stated; computed ${budget} from milestone amounts + advance.`, askParty: 'client' });
  } else if (msTotal + (advanceAmount || 0) !== budget) {
    ambiguities.push({ text: `Milestones (${msTotal}) + advance (${advanceAmount || 0}) do not equal the stated budget (${budget}).`, askParty: 'client' });
  }
  const scopeIdx = lines.findIndex((l) => /^1\.?\s*scope/i.test(l));
  const scopeLine = scopeIdx >= 0 && lines[scopeIdx + 1] ? lines[scopeIdx + 1] : lines.find((l) => /scope/i.test(l)) || lines[0] || '';
  return {
    extraction: {
      scope: scopeLine, deliverables: reqs.map((r) => r.deliverable),
      responsibilities: { client: lines.filter((l) => /client (shall|will) (provide|supply)/i.test(l)), freelancer: lines.filter((l) => /freelancer (shall|will)/i.test(l)) },
      dependencies: lines.filter((l) => /depend/i.test(l)), exclusions, assumptions, budget, advanceAmount,
      paymentTerms: lines.filter((l) => /^(advance|payment|milestone\s+\d|total)/i.test(l)).join(' '),
      ambiguities, source: 'heuristic (rule-based clause parser)',
    },
    requirements: reqs,
    milestones,
  };
}

const SYSTEM = `You are the SOW Intelligence service of a delivery-verification platform. You extract ONLY what is written in a Statement of Work.
Never invent requirements, amounts, dates or obligations that are not in the text. If something is missing or vague, add it to "ambiguities" instead of guessing.
Convert each requirement into measurable acceptance criteria using only the SOW's wording; if it can't be made measurable, flag it.`;

export async function extractSOW(text: string): Promise<SOWResult> {
  const base = heuristicExtract(text);
  const ai = await aiJSON<any>(SYSTEM, `SOW TEXT:\n"""\n${text.slice(0, 30000)}\n"""\n
Return JSON:
{"scope":string,"deliverables":string[],"responsibilities":{"client":string[],"freelancer":string[]},"dependencies":string[],"exclusions":string[],"assumptions":string[],
"budget":number|null,"advanceAmount":number|null,"paymentTerms":string,
"milestones":[{"id":"M1","title":string,"description":string,"startDate":"YYYY-MM-DD"|"","dueDate":"YYYY-MM-DD"|"","amount":number}],
"requirements":[{"sowRef":"§x.y","title":string,"description":string,"expectedOutcome":string,"acceptanceCriteria":string[],"deliverable":string,"milestoneId":"M1","evidenceRequired":["visual"|"functional"|"document"],"category":"frontend"|"backend"|"design"|"content"|"qa","amount":number|null,"ambiguity":string|null}],
"ambiguities":[{"requirementRef":"§x.y"|null,"text":string,"askParty":"client"|"freelancer"}]}
"amount" on a requirement is ONLY set when the SOW explicitly assigns money to that requirement.`);
  if (!ai) return base;
  try {
    const d = ai.data;
    const milestones: Milestone[] = (d.milestones || []).map((m: any, i: number) => ({
      id: m.id || `M${i + 1}`, title: String(m.title || `Milestone ${i + 1}`), description: String(m.description || ''),
      startDate: m.startDate || '', dueDate: m.dueDate || '', amount: Number(m.amount) || 0, dependsOn: i ? [d.milestones[i - 1].id || `M${i}`] : [], owner: 'freelancer' as Party,
    }));
    if (!milestones.length) return base;
    const requirements: Requirement[] = (d.requirements || []).map((r: any, i: number) => ({
      id: `REQ-${String(i + 1).padStart(2, '0')}`, sowRef: r.sowRef || '—', title: String(r.title), description: String(r.description || ''),
      expectedOutcome: String(r.expectedOutcome || ''), acceptanceCriteria: (r.acceptanceCriteria || []).map(String), deliverable: String(r.deliverable || r.title),
      milestoneId: milestones.some((m) => m.id === r.milestoneId) ? r.milestoneId : milestones[milestones.length - 1].id,
      evidenceRequired: (r.evidenceRequired?.length ? r.evidenceRequired : evidenceFor(r.description || '')) as EvidenceKind[],
      category: r.category || categoryFor(r.title), amount: typeof r.amount === 'number' ? r.amount : null,
      ambiguity: r.ambiguity || null, clarification: null, status: 'UNVERIFIED',
    }));
    const refToId = new Map(requirements.map((r) => [r.sowRef, r.id]));
    return {
      milestones, requirements,
      extraction: {
        scope: d.scope || base.extraction.scope, deliverables: d.deliverables || [], responsibilities: d.responsibilities || { client: [], freelancer: [] },
        dependencies: d.dependencies || [], exclusions: d.exclusions || [], assumptions: d.assumptions || [],
        budget: d.budget ?? null, advanceAmount: d.advanceAmount ?? null, paymentTerms: d.paymentTerms || '',
        ambiguities: (d.ambiguities || []).map((a: any) => ({ requirementId: a.requirementRef ? refToId.get(a.requirementRef) : undefined, text: String(a.text), askParty: a.askParty === 'freelancer' ? 'freelancer' : 'client' })),
        source: ai.source,
      },
    };
  } catch {
    return base;
  }
}

/** Funding-plan advisory (recommendation only — the client chooses). */
export function recommendFunding(reqs: Requirement[], milestones: Milestone[], ambiguities: number): { option: 'ADVANCE' | 'PARTIAL' | 'FULL'; rationale: string } {
  const unclear = reqs.filter((r) => r.ambiguity && !r.clarification).length + ambiguities;
  const spanDays = (() => {
    const ds = milestones.map((m) => Date.parse(m.dueDate)).filter((x) => !isNaN(x));
    return ds.length ? (Math.max(...ds) - Date.now()) / 86400000 : 0;
  })();
  if (unclear >= 2 || milestones.length >= 4) return { option: 'PARTIAL', rationale: `${unclear} open ambiguities and ${milestones.length} milestones: committing the first milestone(s) limits risk for both sides while scope is confirmed.` };
  if (spanDays > 29) return { option: 'ADVANCE', rationale: `The project spans ~${Math.round(spanDays)} days. A PayPal authorization is valid for at most 29 days (3-day honor period), so milestones should be funded as they become due rather than reserved up front.` };
  return { option: 'FULL', rationale: 'Clear requirements and a short timeline: full funding gives the freelancer the most certainty. Each milestone is still released only after assessment and approval.' };
}

export { aiLabel };
