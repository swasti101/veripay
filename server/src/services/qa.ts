// Vision + text verification, domain-expert AI agents and the neutral QA Mediator.
// Deterministic guardrails are applied after any model output so fairness rules hold
// regardless of what an LLM says.
import { aiJSON, aiLabel, aiProvider } from './ai.js';
import { readEvidenceFile } from '../db.js';
import type { KernelRun, QARun, QAResult, Requirement, Submission, VerificationStatus, Feedback } from '../types.js';

const DOMAIN_AGENTS: Record<string, string> = {
  frontend: 'Frontend & UI Review Agent',
  backend: 'Backend & API Review Agent',
  design: 'Design & Visual Quality Agent',
  content: 'Content & Documentation Review Agent',
  qa: 'Functional Testing Agent',
};

interface Ctx { requirements: Requirement[]; submission: Submission; kernel: KernelRun; docTexts: { label: string; text: string }[]; priorFeedback?: Feedback | null }

/** Parses lines like "REQ-04 PASS: …" from a submitted test report. */
function testReportLines(docTexts: Ctx['docTexts']) {
  const out: { reqId: string; status: string; text: string; source: string }[] = [];
  for (const d of docTexts) for (const line of d.text.split(/\r?\n/)) {
    const m = line.match(/(REQ-\d+)\W+(PASS|PARTIAL|FAIL)\b[:\s-]*(.*)/i);
    if (m) out.push({ reqId: m[1].toUpperCase(), status: m[2].toUpperCase(), text: m[3].trim(), source: d.label });
  }
  return out;
}

function hasFunctionalEvidence(ctx: Ctx, reqId: string) {
  if (ctx.kernel.mode === 'KERNEL_LIVE' && ctx.kernel.pages.length) return true;
  return testReportLines(ctx.docTexts).some((l) => l.reqId === reqId);
}

function kernelSignalsFor(req: Requirement, k: KernelRun) {
  const t = (req.title + ' ' + req.description).toLowerCase();
  const pos: string[] = [];
  const neg: string[] = [];
  const pagesMatching = (re: RegExp) => k.pages.filter((p) => re.test(p.url) || p.headings.some((h) => re.test(h)) || re.test(p.title));
  const any = (key: string) => k.pages.some((p) => !!p.signals[key] && p.signals[key] !== 0);
  const live = k.mode === 'KERNEL_LIVE';
  const src = live ? 'Kernel' : 'Demo adapter (static HTML)';
  if (/responsive|mobile|homepage|home page/.test(t)) {
    const mobile = k.pages.find((p) => p.viewport.startsWith('mobile'));
    if (mobile) (mobile.signals.horizontalOverflow ? neg : pos).push(`${src}: mobile 375px ${mobile.signals.horizontalOverflow ? 'shows horizontal overflow' : 'renders without horizontal overflow'}`);
    if (any('viewportMeta')) pos.push(`${src}: viewport meta tag present`);
  }
  if (/listing|catalog|grid of products|product list/.test(t)) {
    const n = Math.max(0, ...k.pages.map((p) => Number(p.signals.productCards) || 0));
    (n > 0 ? pos : neg).push(`${src}: ${n} product cards detected`);
  }
  if (/detail/.test(t)) {
    const d = pagesMatching(/product\/|detail|item/i);
    (d.length ? pos : neg).push(d.length ? `${src}: product detail page reached (${d[0].url})` : `${src}: no product detail page was reached`);
  }
  if (/search/.test(t)) {
    if (any('searchInput')) pos.push(`${src}: search input present`); else neg.push(`${src}: no search input found`);
    const probe = k.pages.map((p) => p.signals.searchProbe).find(Boolean);
    if (probe) pos.push(`Kernel search probe: ${probe}`);
  }
  if (/filter/.test(t)) (any('filterControls') ? pos : neg).push(`${src}: ${any('filterControls') ? 'filter controls present' : 'no filter controls detected'}`);
  if (/cart|checkout/.test(t)) {
    const c = pagesMatching(/cart|checkout/i);
    (c.length || any('cartLink') ? pos : neg).push(`${src}: ${c.length ? 'cart/checkout page reached' : any('cartLink') ? 'cart control present' : 'no cart or checkout found'}`);
  }
  if (/admin|dashboard/.test(t)) {
    const a = pagesMatching(/admin|dashboard/i);
    (a.length ? pos : neg).push(`${src}: ${a.length ? `admin page reached (${a[0].url}, HTTP ${a[0].signals.httpStatus})` : 'no admin page reachable'}`);
  }
  const broken = k.pages.filter((p) => Number(p.signals.httpStatus) >= 400).map((b) => `${src}: ${b.url} returned HTTP ${b.signals.httpStatus}`);
  // Static HTML cannot see client-rendered content, so an absent element is NOT evidence of non-compliance.
  if (!live) return { pos, neg: broken, notes: neg.map((n) => `${n} (not conclusive — static inspection)`) };
  return { pos, neg: [...neg, ...broken], notes: [] as string[] };
}

function heuristicQA(ctx: Ctx): { results: QAResult[]; domainAgents: QARun['domainAgents']; vision: QARun['vision']; text: QARun['text'] } {
  const tests = testReportLines(ctx.docTexts);
  const shots = ctx.submission.evidence.filter((e) => e.kind === 'screenshot').length + ctx.kernel.screenshots.length;
  const results: QAResult[] = ctx.requirements.map((r) => {
    const { pos, neg, notes } = kernelSignalsFor(r, ctx.kernel);
    const t = tests.filter((x) => x.reqId === r.id);
    const claim = ctx.submission.claims.find((c) => c.requirementId === r.id);
    const evidence = [...pos, ...neg, ...notes, ...t.map((x) => `${x.source}: ${x.reqId} ${x.status} — ${x.text}`), ...(claim ? [`Freelancer claim: ${claim.note}`] : [])];
    let status: VerificationStatus = 'UNVERIFIED';
    let explanation = '';
    let confidence: QAResult['confidence'] = 'LOW';
    if (r.ambiguity && !r.clarification) {
      status = 'NEEDS_CLARIFICATION';
      explanation = `Acceptance cannot be measured: ${r.ambiguity}`;
    } else if (t.some((x) => x.status === 'FAIL') || (neg.length && !pos.length)) {
      status = 'FAIL'; confidence = t.length && neg.length ? 'HIGH' : 'MEDIUM';
      explanation = 'Evidence shows at least one acceptance criterion is not met.';
    } else if (t.some((x) => x.status === 'PARTIAL') || (pos.length && neg.length)) {
      status = 'PARTIAL'; confidence = 'MEDIUM';
      explanation = 'Some acceptance criteria are evidenced, others are missing or failing.';
    } else if (pos.length || t.length) {
      status = 'PASS'; confidence = t.length && pos.length ? 'HIGH' : 'MEDIUM';
      explanation = 'Available evidence matches the acceptance criteria.';
    } else {
      explanation = 'No evidence covers this requirement yet.';
    }
    return {
      requirementId: r.id, expected: r.acceptanceCriteria.join('; ') || r.expectedOutcome,
      actual: evidence.length ? evidence.slice(0, 3).join(' | ') : 'Nothing detected', evidence, explanation, confidence,
      nextAction: '', status,
    };
  });
  const byCat = new Map<string, string[]>();
  for (const r of ctx.requirements) {
    const res = results.find((x) => x.requirementId === r.id)!;
    const key = DOMAIN_AGENTS[r.category] ? r.category : 'frontend';
    byCat.set(key, [...(byCat.get(key) || []), `${r.id} ${r.title}: ${res.status} — ${res.explanation}`]);
  }
  byCat.set('qa', [`Functional evidence source: ${ctx.kernel.mode === 'KERNEL_LIVE' ? 'Kernel live browser run' : tests.length ? 'freelancer-submitted test report (claims, not independently executed)' : 'none'}`, ...tests.map((x) => `${x.reqId} ${x.status} per ${x.source}`)]);
  return {
    results,
    domainAgents: [...byCat.entries()].map(([k, f]) => ({ agent: DOMAIN_AGENTS[k], findings: f })),
    vision: { source: 'heuristic', note: shots ? `${shots} screenshot(s) available but no vision model is configured — images were not interpreted.` : 'No screenshots available for visual inspection.', findings: [] },
    text: { source: 'heuristic', note: `${ctx.docTexts.length} document(s) and ${ctx.submission.claims.length} completion claim(s) parsed with rules.`, findings: tests.map((x) => ({ requirementId: x.reqId, observation: `${x.status}: ${x.text}` })) },
  };
}

/** Deterministic fairness guardrails (spec §6). */
function applyGuardrails(results: QAResult[], ctx: Ctx) {
  for (const res of results) {
    const r = ctx.requirements.find((x) => x.id === res.requirementId);
    if (!r) continue;
    if (r.ambiguity && !r.clarification && res.status === 'PASS') {
      res.status = 'NEEDS_CLARIFICATION';
      res.guardrail = 'Requirement wording is flagged as unmeasurable and has no approved clarification — cannot be PASS.';
    }
    if (res.status === 'PASS' && r.evidenceRequired.includes('functional') && !hasFunctionalEvidence(ctx, r.id)) {
      res.status = 'UNVERIFIED';
      res.guardrail = 'Functional evidence is required; only visual/static evidence exists. A correct-looking screenshot is not proof of behaviour.';
    }
    if (res.status === 'FAIL' && res.evidence.length === 0) {
      res.status = 'UNVERIFIED';
      res.guardrail = 'FAIL requires evidence of non-compliance; missing evidence is UNVERIFIED.';
    }
    if (!res.nextAction) res.nextAction = ({
      PASS: 'No action — eligible for acceptance under the agreed terms.',
      PARTIAL: 'Freelancer to complete the missing criteria, or parties agree a partial amount.',
      FAIL: 'Request correction from the freelancer.',
      UNVERIFIED: 'Freelancer Delivery Agent requests the missing evidence.',
      NEEDS_CLARIFICATION: 'Client to clarify the acceptance threshold; escalate to expert review if disputed.',
      OUT_OF_SCOPE: 'Handle via scope-change request; does not affect this milestone.',
    } as Record<VerificationStatus, string>)[res.status];
  }
  return results;
}

function overallOf(results: QAResult[]): QARun['overall'] {
  const s = results.map((r) => r.status).filter((x) => x !== 'OUT_OF_SCOPE');
  if (!s.length) return 'UNVERIFIABLE';
  if (s.every((x) => x === 'PASS')) return 'COMPLIANT';
  if (s.some((x) => x === 'NEEDS_CLARIFICATION')) return 'DISPUTED';
  if (s.every((x) => x === 'UNVERIFIED')) return 'UNVERIFIABLE';
  if (s.some((x) => x === 'FAIL')) return 'INCOMPLETE';
  return 'PARTIALLY_COMPLIANT';
}

export async function runQA(ctx: Ctx): Promise<Omit<QARun, 'id' | 'projectId' | 'milestoneId' | 'submissionId' | 'createdAt' | 'kernel' | 'status'>> {
  const base = heuristicQA(ctx);
  const p = aiProvider();
  let vision = base.vision;
  let text = base.text;
  let results = base.results;
  let domainAgents = base.domainAgents;
  let summary = '';
  let aiSource = 'heuristic (no AI provider configured)';

  if (p) {
    const allShots = [...ctx.kernel.screenshots, ...ctx.submission.evidence.filter((e) => e.kind === 'screenshot')];
    const images = allShots.map((e) => ({ e, buf: e.path ? readEvidenceFile(e.path) : null })).filter((x) => x.buf).slice(0, 6)
      .map((x) => ({ mime: x.e.mime || 'image/jpeg', base64: x.buf!.toString('base64'), label: x.e.label }));
    const reqBrief = ctx.requirements.map((r) => ({ id: r.id, title: r.title, criteria: r.acceptanceCriteria, evidenceRequired: r.evidenceRequired, ambiguity: r.ambiguity, clarification: r.clarification }));
    if (images.length) {
      const v = await aiJSON<any>('You are a Vision Verification Agent. Describe only what is visible in the screenshots. Do not infer behaviour that a static image cannot show.',
        `Screenshots (in order): ${images.map((i, n) => `[${n + 1}] ${i.label}`).join('; ')}\nRequirements: ${JSON.stringify(reqBrief)}\nReturn {"findings":[{"requirementId":string,"observation":string}],"note":string}`, images);
      if (v) vision = { source: v.source, findings: v.data.findings || [], note: v.data.note || `${images.length} screenshot(s) analysed` };
    }
    const m = await aiJSON<any>(
      `You are the neutral QA Mediator coordinating domain review agents (${Object.values(DOMAIN_AGENTS).join(', ')}). Compare delivery evidence with the approved SOW requirements only.
Rules: Use PASS only with sufficient evidence for every acceptance criterion; if functional evidence is required, a screenshot alone is insufficient. Use UNVERIFIED when evidence is missing (never FAIL for missing evidence). Use NEEDS_CLARIFICATION when the requirement itself is unmeasurable and lacks an approved clarification. Use OUT_OF_SCOPE only for items not in the SOW. Freelancer claims are claims, not proof.`,
      `REQUIREMENTS: ${JSON.stringify(reqBrief)}
KERNEL RUN (${ctx.kernel.mode}; ${ctx.kernel.note}): ${JSON.stringify({ pages: ctx.kernel.pages, actions: ctx.kernel.actions.slice(0, 30), consoleErrors: ctx.kernel.consoleErrors.slice(0, 10) })}
VISION FINDINGS: ${JSON.stringify(vision.findings)}
SUBMISSION NOTES: ${ctx.submission.notes}
FREELANCER CLAIMS: ${JSON.stringify(ctx.submission.claims)}
DOCUMENTS: ${JSON.stringify(ctx.docTexts.map((d) => ({ label: d.label, text: d.text.slice(0, 6000) })))}
${ctx.priorFeedback ? `CLIENT FEEDBACK: ${JSON.stringify(ctx.priorFeedback.classification)}` : ''}
Return {"results":[{"requirementId":string,"actual":string,"evidence":string[],"explanation":string,"confidence":"HIGH"|"MEDIUM"|"LOW","nextAction":string,"status":"PASS"|"PARTIAL"|"FAIL"|"UNVERIFIED"|"NEEDS_CLARIFICATION"|"OUT_OF_SCOPE"}],
"textFindings":[{"requirementId":string,"observation":string}],"domainAgents":[{"agent":string,"findings":string[]}],"summary":string}`, [], 6000);
    if (m && Array.isArray(m.data.results)) {
      aiSource = m.source;
      results = ctx.requirements.map((r) => {
        const x = m.data.results.find((y: any) => y.requirementId === r.id);
        const h = base.results.find((y) => y.requirementId === r.id)!;
        if (!x) return h;
        return { ...h, actual: String(x.actual || h.actual), evidence: [...new Set([...(x.evidence || []), ...h.evidence])], explanation: String(x.explanation || ''), confidence: x.confidence || 'MEDIUM', nextAction: String(x.nextAction || ''), status: x.status || h.status };
      });
      text = { source: m.source, findings: m.data.textFindings || [], note: 'SOW, notes, claims and documents analysed by text model' };
      if (Array.isArray(m.data.domainAgents) && m.data.domainAgents.length) domainAgents = m.data.domainAgents;
      summary = String(m.data.summary || '');
    }
  }
  applyGuardrails(results, ctx);
  const overall = overallOf(results);
  if (!summary) {
    const c = (s: string) => results.filter((r) => r.status === s).length;
    summary = `QA Mediator: ${c('PASS')} PASS, ${c('PARTIAL')} PARTIAL, ${c('FAIL')} FAIL, ${c('UNVERIFIED')} UNVERIFIED, ${c('NEEDS_CLARIFICATION')} NEEDS_CLARIFICATION. Evidence source: ${ctx.kernel.mode}.`;
  }
  return { vision, text, domainAgents, results, mediatorSummary: summary, overall, aiSource: p ? aiSource : aiLabel() };
}

/** Client Expectation Agent — classify satisfaction feedback against the SOW. */
export async function classifyFeedback(items: { text: string; requirementId: string | null }[], additional: string, requirements: Requirement[], exclusions: string[]) {
  const all = [...items, ...(additional.trim() ? [{ text: additional.trim(), requirementId: null }] : [])].filter((i) => i.text.trim());
  const ai = await aiJSON<any>(
    'You are the Client Expectation Agent. Classify each piece of client feedback strictly against the approved SOW. Client satisfaction matters, but it never overrides the SOW: a new wish is OUT_OF_SCOPE_REQUEST; a taste preference with no SOW basis is SUBJECTIVE_PREFERENCE.',
    `REQUIREMENTS: ${JSON.stringify(requirements.map((r) => ({ id: r.id, title: r.title, criteria: r.acceptanceCriteria, clarification: r.clarification })))}
EXCLUSIONS: ${JSON.stringify(exclusions)}
FEEDBACK: ${JSON.stringify(all)}
Return {"classification":[{"text":string,"requirementId":string|null,"category":"SOW_DISSATISFACTION"|"QUALITY_CONCERN"|"SUBJECTIVE_PREFERENCE"|"OUT_OF_SCOPE_REQUEST"|"UNCLEAR","rationale":string}]}`);
  if (ai?.data?.classification) return { classification: ai.data.classification, source: ai.source };
  return {
    source: 'heuristic (keyword classifier)',
    classification: all.map((i) => {
      const t = i.text.toLowerCase();
      const excluded = exclusions.find((e) => e.toLowerCase().split(/\W+/).filter((w) => w.length >= 7).some((w) => t.includes(w)));
      const req = i.requirementId ? requirements.find((r) => r.id === i.requirementId) : null;
      if (t.split(/\s+/).length < 4) return { ...i, category: 'UNCLEAR', rationale: 'Too short to link to an acceptance criterion; please describe what is wrong.' };
      if (excluded || /(also add|could you add|new feature|additionally|would like .* (also|new)|like (amazon|elasticsearch)|integrate with|extra)/.test(t))
        return { ...i, category: 'OUT_OF_SCOPE_REQUEST', rationale: excluded ? `Matches SOW exclusion: "${excluded}".` : 'Requests functionality not described in the approved requirements.' };
      if (/(prefer|i like|i don't like|colou?r|font|feel|taste|vibe|look nicer)/.test(t) && !req?.acceptanceCriteria.some((c) => t.includes(c.toLowerCase().split(' ')[0])))
        return { ...i, category: 'SUBJECTIVE_PREFERENCE', rationale: 'Expresses a preference that no acceptance criterion specifies.' };
      if (req && /(doesn'?t|does not|not working|broken|missing|fails?|error|can'?t|cannot)/.test(t))
        return { ...i, category: 'SOW_DISSATISFACTION', rationale: `Asserts an agreed criterion of ${req.id} is not met.` };
      if (/(slow|ugly|buggy|inconsistent|clunky|poor|quality)/.test(t)) return { ...i, category: 'QUALITY_CONCERN', rationale: 'Quality issue that may or may not breach a criterion — needs review.' };
      if (req) return { ...i, category: 'SOW_DISSATISFACTION', rationale: `Linked by the client to ${req.id}.` };
      return { ...i, category: 'UNCLEAR', rationale: 'Not linked to a requirement; clarification needed.' };
    }),
  };
}

export { DOMAIN_AGENTS };
