// Seeds DEMO data. Every seeded person, vote and transaction is labelled DEMO / SIMULATED.
import { db, resetDB, flushNow, id, now } from './db.js';
import { heuristicExtract } from './services/sow.js';
import { computeAllocation, aggregateVotes } from './services/allocation.js';
import type { AgreementVersion, Project, User, ExpertProfile, QARun, Transaction, FundingOption } from './types.js';

export const SAMPLE_SOW = `STATEMENT OF WORK — Northwind Outfitters E-Commerce Website
Client: Northwind Outfitters. Freelancer: independent web developer.
1. Scope
Design and build a responsive e-commerce storefront with a product catalogue, search and filtering, cart and checkout, and an admin dashboard for managing products and orders.
2. Requirements
2.1 Responsive homepage — Homepage with hero banner, featured products and main navigation. Acceptance: renders without horizontal scrolling at 375px, 768px and 1440px widths; hero, featured products and navigation visible on all three; all images have alt text. [$1,000]
2.2 Product listing — Catalogue page showing products in a grid. Acceptance: shows at least 12 products with image, name and price; each card links to its product detail page. [$800]
2.3 Product details — A detail page for each product. Acceptance: shows image, description, price, size options and stock status; Add to cart button adds the selected size to the cart. [$700]
2.4 Search and filtering — Search must be fast and return relevant results, with filters. Acceptance: search input on the listing page updates results as the user types; category filter and price filter can be combined; an empty-state message is shown when nothing matches. [$1,200]
2.5 Cart and checkout — Cart and guest checkout. Acceptance: add, remove and update quantities; totals recalculate; checkout form validates required fields; order confirmation page shown after sandbox payment. [$1,800]
2.6 Admin dashboard — Admin area for products and orders. Acceptance: admin can create, edit and delete products; view the orders list with status; admin area requires login. [$2,000]
3. Milestones & Payment
Advance: $1,000 payable when the agreement is signed, credited against the total.
Milestone 1 — Storefront Core (2.1, 2.2, 2.3) — start 2026-10-20 — due 2026-11-06 — $2,500
Milestone 2 — Search & Checkout (2.4, 2.5) — start 2026-11-07 — due 2026-11-24 — $3,000
Milestone 3 — Admin Dashboard (2.6) — start 2026-11-25 — due 2026-12-12 — $2,000
Total project budget: $8,500
Payment of each milestone is due after its acceptance criteria are verified and approved.
4. Exclusions
- Elasticsearch or other third-party search engines; typo-tolerant or fuzzy search
- Native mobile apps
- Copywriting and product photography
5. Assumptions
- Client will provide product data (CSV) and brand assets before Milestone 1 starts
- Hosting on the client's existing account
`;

const DENTAL_SOW = `STATEMENT OF WORK — Harbor Dental Clinic Website
1. Scope
A five-page marketing website for a dental clinic with online appointment requests.
2. Requirements
2.1 Responsive layout — All pages responsive. Acceptance: no horizontal scrolling at 375px and 1440px; navigation collapses to a menu on mobile. [$700]
2.2 Services pages — Pages for each of the 6 services. Acceptance: 6 service pages with title, description and price range; linked from the main menu. [$700]
2.3 Appointment request form — Online form. Acceptance: name, phone, preferred date and service fields are required; submission sends an email to the clinic; success message shown. [$1,000]
3. Milestones & Payment
Advance: $600 payable on signing.
Milestone 1 — Complete website (2.1, 2.2, 2.3) — start 2026-10-01 — due 2026-10-28 — $2,400
Total project budget: $3,000
4. Exclusions
- Online payments
`;

const BILLING_SOW = `STATEMENT OF WORK — Lumen Analytics Billing Portal
1. Scope
A customer billing portal for a SaaS analytics product: plan management, invoices and usage.
2. Requirements
2.1 Plan management — Customers can view and change plans. Acceptance: current plan shown; upgrade and downgrade update the subscription via API; confirmation shown. [$1,500]
2.2 Invoice history and PDF export — Invoice list with downloadable PDFs. Acceptance: list shows date, amount and status for every invoice; each invoice downloads as a PDF containing line items and tax. [$1,500]
2.3 Usage dashboard — Usage chart. Acceptance: daily usage chart for the current billing period; values match the usage API. [$1,000]
3. Milestones & Payment
Milestone 1 — Billing portal (2.1, 2.2, 2.3) — start 2026-10-05 — due 2026-11-01 — $4,000
Total project budget: $4,000
4. Exclusions
- Tax calculation engine (tax values come from the existing API)
`;

const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();

function agreementFrom(sow: string, createdBy: string, version: number, plan: { option: FundingOption; committed: string[] }, at: string, clarify: Record<string, string> = {}): AgreementVersion {
  const r = heuristicExtract(sow);
  for (const q of r.requirements) if (clarify[q.id]) q.clarification = clarify[q.id];
  return {
    id: id('agv'), version, status: 'APPROVED', sowText: sow, extraction: { ...r.extraction, source: 'heuristic (rule-based clause parser) — DEMO SEED' },
    requirements: r.requirements, milestones: r.milestones, budget: r.extraction.budget || 0, advanceAmount: r.extraction.advanceAmount || 0, currency: 'USD',
    fundingPlan: { option: plan.option, committedMilestones: plan.committed, chosenBy: createdBy, chosenAt: at },
    partialPaymentRule: 'PER_REQUIREMENT_AMOUNTS', expertReview: { mode: 'ADVISORY', panelSize: 3, quorum: 2, feePerReview: 25, feePayer: 'client' }, platformFeePercent: 5,
    approvals: { client: at, freelancer: at }, createdBy, createdAt: at, changeSummary: 'Initial agreement (DEMO SEED)',
  };
}

function simTx(t: Partial<Transaction> & Pick<Transaction, 'projectId' | 'type' | 'amount' | 'status'>, at: string): Transaction {
  return { id: id('tx'), milestoneId: null, currency: 'USD', mode: 'SIMULATED', paypal: {}, initiatedBy: 'seed', note: 'DEMO SEED — simulated, no money moved', createdAt: at, updatedAt: at, ...t } as Transaction;
}
const simId = (p: string) => `SIM-${p}-${Math.random().toString(16).slice(2, 12).toUpperCase()}`;

export async function seed(force = false) {
  if (!force && db().meta.seededAt) return;
  resetDB();
  const d = db();
  const T = now();
  const user = (name: string, email: string, role: User['role'], extra: Partial<User> = {}): User => {
    const u: User = { id: id('usr'), name, email, role, isDemo: true, createdAt: T, ...extra };
    d.users.push(u);
    return u;
  };
  const client = user('Alex Rivera (DEMO client)', 'alex.client@demo.veripay.invalid', 'client');
  const free = user('Sam Okafor (DEMO freelancer)', 'sam.freelancer@demo.veripay.invalid', 'freelancer', { paypalEmail: 'sam-sandbox@demo.veripay.invalid', payoutOnboarded: true });
  user('Jamie Chen (DEMO client, no projects)', 'jamie.client@demo.veripay.invalid', 'client');
  const expert = (name: string, tags: string[], headline: string, experience: string, rating: number, reviews: number, conflicts: string[] = []) => {
    const u = user(name, `${name.split(' ')[0].toLowerCase()}.expert@demo.veripay.invalid`, 'expert', { paypalEmail: `${name.split(' ')[0].toLowerCase()}-sandbox@demo.veripay.invalid`, payoutOnboarded: true });
    const prof: ExpertProfile = { userId: u.id, expertise: tags, headline, experience, credentialStatus: 'SIMULATED_DEMO_PROFILE', credentialNote: 'Fictional demo profile. Identity and credentials have NOT been verified.', reviewsCompleted: reviews, rating, conflicts, isSimulated: true };
    d.experts.push(prof);
    return u;
  };
  const e1 = expert('Mira Kovac (SIMULATED expert)', ['frontend', 'qa'], 'Senior frontend engineer', '11 yrs React/TypeScript, e-commerce storefronts, accessibility audits', 4.8, 37);
  const e2 = expert('Daniel Osei (SIMULATED expert)', ['backend', 'qa', 'frontend'], 'QA lead & API engineer', '9 yrs test automation, search & checkout systems', 4.7, 22);
  const e3 = expert('Priya Natarajan (SIMULATED expert)', ['design', 'frontend'], 'UI/UX design systems specialist', '8 yrs product design, design QA for retail sites', 4.9, 18);
  expert('Jordan Blake (SIMULATED expert)', ['frontend', 'backend'], 'Full-stack consultant', '12 yrs agency work', 4.6, 30, [free.id]); // declared relationship → excluded

  const mkProject = (title: string, description: string, ag: AgreementVersion, extra: Partial<Project>): Project => {
    const p: Project = {
      id: id('prj'), title, description, category: 'website', createdBy: client.id, initiatorRole: 'client', clientId: client.id, freelancerId: free.id,
      invite: { code: Math.random().toString(16).slice(2, 12).toUpperCase(), role: 'freelancer', email: free.email, status: 'ACCEPTED' },
      status: 'ACTIVE', agreementVersions: [ag], activeAgreementId: ag.id, draftAgreementId: null,
      milestoneStates: ag.milestones.map((m) => ({ milestoneId: m.id, fundingStatus: 'FUNDING_REQUIRED', workStatus: 'NOT_STARTED', authorized: 0, captured: 0, paid: 0, platformFee: 0, underReview: 0 })),
      advance: { status: 'PAID', amount: ag.advanceAmount, paid: ag.advanceAmount, platformFee: 0 }, isDemo: true, createdAt: ag.createdAt, updatedAt: T, ...extra,
    };
    d.projects.push(p);
    return p;
  };
  const A = (projectId: string, actor: string, actorType: any, action: string, details: string, at: string) => d.audit.push({ id: id('aud'), projectId, actor, actorType, action, details: `[DEMO SEED] ${details}`, refs: [], at });
  const M = (projectId: string, text: string, at: string, agent = 'AI Project Manager', audience: any = 'all') => d.messages.push({ id: id('msg'), projectId, from: 'ai-coordinator', fromType: 'agent', agent, audience, kind: 'notice', text, createdAt: at });

  // ── Scenario 1: main story (Northwind). M1 paid in full; M2 funded and in progress — continue the story live.
  const ag1 = agreementFrom(SAMPLE_SOW, client.id, 1, { option: 'PARTIAL', committed: ['M1', 'M2'] }, ago(22));
  const p1 = mkProject('Northwind Outfitters — E-Commerce Storefront', 'Main demo: storefront, search, checkout and admin. Continue at Milestone 2 (submit → QA → feedback → expert panel → allocation → release).', ag1, { demoLabel: 'MAIN DEMO' });
  const advTx = simTx({ projectId: p1.id, type: 'ADVANCE_PAYMENT', amount: 1000, status: 'COMPLETED', paypal: { orderId: simId('ORDER'), captureId: simId('CAPTURE') } }, ago(21));
  d.transactions.push(advTx, simTx({ projectId: p1.id, type: 'FREELANCER_PAYOUT', amount: 1000, status: 'SUCCESS', payee: free.id, paypal: { payoutBatchId: simId('PAYOUT') } }, ago(21)));
  const s1 = p1.milestoneStates[0], s2 = p1.milestoneStates[1];
  d.transactions.push(simTx({ projectId: p1.id, milestoneId: 'M1', type: 'MILESTONE_AUTHORIZATION', amount: 2500, status: 'AUTHORIZED', paypal: { orderId: simId('ORDER'), authorizationId: simId('AUTH') } }, ago(21)));
  const sub1 = { id: id('sub'), projectId: p1.id, milestoneId: 'M1', submittedBy: free.id, url: 'https://northwind-staging.demo.invalid/', notes: 'Storefront core complete. Lighthouse report and responsive screenshots attached.', claims: [], evidence: [{ id: id('ev'), kind: 'file' as const, label: 'DEMO responsive & functional test report', text: 'REQ-01 PASS: no overflow at 375/768/1440\nREQ-02 PASS: 24 products, all cards link to details\nREQ-03 PASS: add to cart adds chosen size', source: 'seed' as const }], authorization: { granted: true, scope: 'read-only', credentialsProvided: false }, revision: 1, createdAt: ago(5) };
  d.submissions.push(sub1);
  const qa1: QARun = {
    id: id('qa'), projectId: p1.id, milestoneId: 'M1', submissionId: sub1.id, createdAt: ago(5), status: 'COMPLETE', isSeed: true,
    kernel: { mode: 'SKIPPED', note: 'DEMO SEED — no browser was executed for this historical record.', actions: [], pages: [], consoleErrors: [], screenshots: [] },
    vision: { source: 'DEMO SEED', note: 'Seeded finding', findings: [{ requirementId: 'REQ-01', observation: 'Hero, featured grid and nav visible at all widths (seeded)' }] },
    text: { source: 'DEMO SEED', note: 'Seeded test report parsed', findings: [] },
    domainAgents: [{ agent: 'Frontend & UI Review Agent', findings: ['REQ-01..03 meet acceptance criteria (seeded)'] }],
    results: ag1.requirements.filter((r) => r.milestoneId === 'M1').map((r) => ({ requirementId: r.id, expected: r.acceptanceCriteria.join('; '), actual: 'Criteria met per test report and inspection (DEMO SEED)', evidence: ['DEMO test report'], explanation: 'All acceptance criteria evidenced.', confidence: 'HIGH' as const, nextAction: 'No action', status: 'PASS' as const })),
    mediatorSummary: 'DEMO SEED: 3 PASS — clear SOW compliance.', overall: 'COMPLIANT', aiSource: 'DEMO SEED',
  };
  d.qaRuns.push(qa1);
  for (const r of ag1.requirements.filter((r) => r.milestoneId === 'M1')) r.status = 'PASS';
  const fb1 = { id: id('fb'), projectId: p1.id, milestoneId: 'M1', submissionId: sub1.id, rating: 'FULLY_SATISFIED' as const, items: [], additional: '', classification: [], aiSource: 'n/a', createdAt: ago(4) };
  d.feedback.push(fb1);
  s1.authorized = 2500; s1.workStatus = 'SUBMITTED';
  const al1 = computeAllocation({ agreement: ag1, milestoneId: 'M1', state: s1, qa: qa1, feedback: fb1, review: null, settlement: null });
  d.allocations.push({ id: id('alc'), projectId: p1.id, ...al1, approvals: { client: ago(4), freelancer: ago(4) }, challenges: [], status: 'EXECUTED', createdAt: ago(4) });
  d.transactions.push(simTx({ projectId: p1.id, milestoneId: 'M1', type: 'MILESTONE_CAPTURE', amount: 2500, status: 'COMPLETED', paypal: { captureId: simId('CAPTURE') } }, ago(4)), simTx({ projectId: p1.id, milestoneId: 'M1', type: 'FREELANCER_PAYOUT', amount: 2500, status: 'SUCCESS', payee: free.id, paypal: { payoutBatchId: simId('PAYOUT') } }, ago(4)));
  Object.assign(s1, { authorized: 0, captured: 2500, paid: 2500, fundingStatus: 'PAID', workStatus: 'ACCEPTED' });
  const auth2 = simId('AUTH');
  d.transactions.push(simTx({ projectId: p1.id, milestoneId: 'M2', type: 'MILESTONE_AUTHORIZATION', amount: 3000, status: 'AUTHORIZED', paypal: { orderId: simId('ORDER'), authorizationId: auth2 }, note: 'DEMO SEED — simulated authorization (a real PayPal authorization is valid ≤29 days, honor period 3 days)' }, ago(3)));
  Object.assign(s2, { authorized: 3000, fundingStatus: 'AUTHORIZED', workStatus: 'IN_PROGRESS', authorizationId: auth2, authorizationExpires: new Date(Date.now() + 26 * 864e5).toISOString(), honorPeriodEnds: ago(0) });
  for (const [a, t, at] of [
    ['PROJECT_CREATED', 'Client created project and uploaded SOW', 23], ['SOW_UPLOADED', 'Heuristic extraction: 6 requirements, 3 milestones; REQ-04 flagged ("fast"/"relevant" not measurable)', 23],
    ['INVITE_ACCEPTED', 'Sam Okafor joined as freelancer', 22], ['FUNDING_PLAN_CHOSEN', 'PARTIAL funding — M1 and M2 committed; M3 funded when due', 22],
    ['AGREEMENT_APPROVED', 'Agreement v1 approved by both parties (REQ-04 left unclarified — warning shown)', 22], ['TX_ADVANCE_PAYMENT', '[SIMULATED] Advance $1,000 captured and paid out', 21],
    ['TX_MILESTONE_AUTHORIZATION', '[SIMULATED] M1 $2,500 authorized', 21], ['DELIVERABLE_SUBMITTED', 'M1 submitted with test report', 5], ['QA_COMPLETED', 'M1 COMPLIANT (3 PASS)', 5],
    ['CLIENT_FEEDBACK', 'M1 FULLY_SATISFIED', 4], ['ALLOCATION_RECOMMENDED', 'M1 FULL_PAYMENT $2,500', 4], ['TX_FREELANCER_PAYOUT', '[SIMULATED] M1 $2,500 captured and paid out', 4],
    ['TX_MILESTONE_AUTHORIZATION', '[SIMULATED] M2 $3,000 authorized', 3], ['MILESTONE_STARTED', 'M2 started', 3],
  ] as const) A(p1.id, a.startsWith('TX') ? 'payment-simulator' : 'demo', a.startsWith('TX') ? 'paypal' : 'user', a, t, ago(at));
  M(p1.id, 'DEMO: Milestone 1 was verified COMPLIANT and paid in full. Milestone 2 (Search & Checkout) is funded and in progress. Sign in as the freelancer to submit the demo store URL.', ago(3));
  M(p1.id, 'REQ-04 "Search and filtering" (§2.4): "fast" and "relevant" are not measurable. The agreement was approved without a clarification, so this requirement may need clarification or expert review at assessment.', ago(22), 'Client Expectation Agent');

  // ── Scenario 2: clear compliance → full payment.
  const ag2 = agreementFrom(DENTAL_SOW, client.id, 1, { option: 'FULL', committed: ['M1'] }, ago(45));
  const p2 = mkProject('Harbor Dental — Clinic Website', 'Example: work clearly meets the SOW → QA PASS, client satisfied → full milestone payment.', ag2, { demoLabel: 'EXAMPLE: COMPLIANT', status: 'COMPLETED' });
  const sub2 = { id: id('sub'), projectId: p2.id, milestoneId: 'M1', submittedBy: free.id, url: 'https://harbor-dental.demo.invalid/', notes: 'All pages done; form tested end-to-end.', claims: [], evidence: [], authorization: { granted: true, scope: 'read-only', credentialsProvided: false }, revision: 1, createdAt: ago(14) };
  d.submissions.push(sub2);
  const qa2: QARun = { ...qa1, id: id('qa'), projectId: p2.id, submissionId: sub2.id, createdAt: ago(14), results: ag2.requirements.map((r) => ({ requirementId: r.id, expected: r.acceptanceCriteria.join('; '), actual: 'Criteria met (DEMO SEED)', evidence: ['Seeded inspection record'], explanation: 'All acceptance criteria evidenced.', confidence: 'HIGH' as const, nextAction: 'No action', status: 'PASS' as const })), mediatorSummary: 'DEMO SEED: 3 PASS.', domainAgents: [{ agent: 'Functional Testing Agent', findings: ['Form validation and email confirmed (seeded)'] }] };
  d.qaRuns.push(qa2);
  for (const r of ag2.requirements) r.status = 'PASS';
  const fb2 = { id: id('fb'), projectId: p2.id, milestoneId: 'M1', submissionId: sub2.id, rating: 'FULLY_SATISFIED' as const, items: [], additional: 'Looks great.', classification: [{ text: 'Looks great.', requirementId: null, category: 'UNCLEAR' as const, rationale: 'Positive comment, no issue raised.' }], aiSource: 'DEMO SEED', createdAt: ago(13) };
  d.feedback.push(fb2);
  const st2 = p2.milestoneStates[0];
  st2.authorized = 2400;
  const al2 = computeAllocation({ agreement: ag2, milestoneId: 'M1', state: st2, qa: qa2, feedback: fb2, review: null, settlement: null });
  d.allocations.push({ id: id('alc'), projectId: p2.id, ...al2, approvals: { client: ago(13), freelancer: ago(13) }, challenges: [], status: 'EXECUTED', createdAt: ago(13) });
  Object.assign(st2, { authorized: 0, captured: 2400, paid: 2400, fundingStatus: 'PAID', workStatus: 'ACCEPTED' });
  d.transactions.push(
    simTx({ projectId: p2.id, type: 'ADVANCE_PAYMENT', amount: 600, status: 'COMPLETED', paypal: { captureId: simId('CAPTURE') } }, ago(44)),
    simTx({ projectId: p2.id, type: 'FREELANCER_PAYOUT', amount: 600, status: 'SUCCESS', payee: free.id, paypal: { payoutBatchId: simId('PAYOUT') } }, ago(44)),
    simTx({ projectId: p2.id, milestoneId: 'M1', type: 'MILESTONE_AUTHORIZATION', amount: 2400, status: 'AUTHORIZED', paypal: { authorizationId: simId('AUTH') } }, ago(20)),
    simTx({ projectId: p2.id, milestoneId: 'M1', type: 'MILESTONE_CAPTURE', amount: 2400, status: 'COMPLETED', paypal: { captureId: simId('CAPTURE') } }, ago(13)),
    simTx({ projectId: p2.id, milestoneId: 'M1', type: 'FREELANCER_PAYOUT', amount: 2400, status: 'SUCCESS', payee: free.id, paypal: { payoutBatchId: simId('PAYOUT') } }, ago(13)),
  );
  A(p2.id, 'allocation-engine', 'system', 'ALLOCATION_RECOMMENDED', `FULL_PAYMENT $2,400 — ${al2.rule}`, ago(13));
  A(p2.id, 'payment-simulator', 'paypal', 'TX_FREELANCER_PAYOUT', '[SIMULATED] $2,400 paid', ago(13));

  // ── Scenario 3: material non-compliance → experts NOT COMPLIANT → partial release, failed part held.
  const ag3 = agreementFrom(BILLING_SOW, client.id, 1, { option: 'FULL', committed: ['M1'] }, ago(40));
  const p3 = mkProject('Lumen Analytics — Billing Portal', 'Example: invoice PDF export fails → experts vote NOT COMPLIANT → only the accepted requirements are paid; the failed amount stays held pending revision.', ag3, { demoLabel: 'EXAMPLE: NON-COMPLIANT' });
  const sub3 = { id: id('sub'), projectId: p3.id, milestoneId: 'M1', submittedBy: free.id, url: 'https://lumen-billing.demo.invalid/', notes: 'Portal complete. PDF export uses server-side rendering.', claims: [{ requirementId: 'REQ-02', note: 'PDF export implemented' }], evidence: [], authorization: { granted: true, scope: 'read-only', credentialsProvided: false }, revision: 1, createdAt: ago(9) };
  d.submissions.push(sub3);
  const qa3: QARun = { ...qa1, id: id('qa'), projectId: p3.id, submissionId: sub3.id, createdAt: ago(9), overall: 'INCOMPLETE', mediatorSummary: 'DEMO SEED: 2 PASS, 1 FAIL (REQ-02 PDF export returns HTTP 500 for invoices with tax lines).',
    results: [
      { requirementId: 'REQ-01', expected: ag3.requirements[0].acceptanceCriteria.join('; '), actual: 'Plan change round-trips via API (seeded)', evidence: ['Seeded API trace'], explanation: 'Met.', confidence: 'HIGH', nextAction: 'No action', status: 'PASS' },
      { requirementId: 'REQ-02', expected: ag3.requirements[1].acceptanceCriteria.join('; '), actual: 'Invoice list correct; PDF download returns HTTP 500 for 7 of 12 invoices (those with tax lines)', evidence: ['Seeded inspection: GET /invoices/INV-1043.pdf → 500'], explanation: 'Each invoice must download as a PDF with line items and tax — failing for most invoices.', confidence: 'HIGH', nextAction: 'Request correction', status: 'FAIL' },
      { requirementId: 'REQ-03', expected: ag3.requirements[2].acceptanceCriteria.join('; '), actual: 'Chart values match usage API sample (seeded)', evidence: ['Seeded comparison'], explanation: 'Met.', confidence: 'MEDIUM', nextAction: 'No action', status: 'PASS' },
    ] };
  d.qaRuns.push(qa3);
  ag3.requirements[0].status = 'PASS'; ag3.requirements[1].status = 'FAIL'; ag3.requirements[2].status = 'PASS';
  const fb3 = { id: id('fb'), projectId: p3.id, milestoneId: 'M1', submissionId: sub3.id, rating: 'NOT_SATISFIED' as const, items: [{ text: 'Invoice PDFs fail to download for most of our invoices', requirementId: 'REQ-02' }], additional: '', classification: [{ text: 'Invoice PDFs fail to download for most of our invoices', requirementId: 'REQ-02', category: 'SOW_DISSATISFACTION' as const, rationale: 'Asserts an agreed criterion of REQ-02 is not met.' }], aiSource: 'DEMO SEED', createdAt: ago(8) };
  d.feedback.push(fb3);
  d.messages.push({ id: id('msg'), projectId: p3.id, from: free.id, fromType: 'user', audience: 'all', kind: 'response', text: 'The PDF failures only occur with tax lines; the tax API returns a format that was not in the spec. I consider REQ-02 substantially delivered.', createdAt: ago(8) });
  const rv: any = {
    id: id('rev'), projectId: p3.id, milestoneId: 'M1', requirementIds: ['REQ-02'], triggers: ['REQ-02: client and freelancer disagree whether the requirement was met'], requestedBy: free.id, status: 'CLOSED',
    panelSize: 3, quorum: 2, fee: 25, feePayer: 'client', feeAcks: { client: ago(8), freelancer: ago(8) }, feeFunding: [{ party: 'client', amount: 75, txId: null, status: 'PAID' }], closesAt: ago(5),
    assignments: [e1, e2, e3].map((e) => ({ expertId: e.id, status: 'SUBMITTED', conflictDeclaration: '[SIMULATED] No relationship with either party.', feeDisclosedAt: ago(8), acceptedAt: ago(7) })),
    excludedExperts: [{ expertId: d.users.find((u) => u.name.startsWith('Jordan'))!.id, reason: 'Declared relationship with a project party (conflict of interest)' }],
    votes: [
      { expertId: e2.id, requirementId: 'REQ-02', vote: 'NOT_COMPLIANT', reasoning: 'The SOW requires every invoice to download as a PDF with tax. 7 of 12 fail. Tax data format is the existing API\'s — it was available to the freelancer.', evidence: 'HTTP 500 trace for INV-1043; invoice sample set', recommendation: 'Fix tax-line rendering; release REQ-02 amount after re-test.', submittedAt: ago(6), simulated: true, generated: false },
      { expertId: e1.id, requirementId: 'REQ-02', vote: 'NOT_COMPLIANT', reasoning: 'List view meets the criterion but the PDF export, the core of REQ-02, fails for the majority of real invoices.', evidence: 'QA run results; client feedback', recommendation: 'Revision required.', submittedAt: ago(6), simulated: true, generated: false },
      { expertId: e3.id, requirementId: 'REQ-02', vote: 'PARTIALLY_COMPLIANT', reasoning: 'Invoice history is complete and PDFs work for invoices without tax lines; the SOW did not document the tax API format.', evidence: 'Freelancer response; 5 of 12 PDFs render', recommendation: 'Consider a partial settlement if the fix is delayed.', submittedAt: ago(5), simulated: true, generated: false },
    ],
    packet: { requirements: [ag3.requirements[1]], qaResults: [qa3.results[1]], feedback: { rating: fb3.rating, classification: fb3.classification }, freelancerResponses: ['PDF failures only occur with tax lines…'], kernel: qa3.kernel, submission: { url: sub3.url, notes: sub3.notes, claims: sub3.claims, evidence: [] }, clarifications: [], scopeChanges: [], agreementVersion: 1, qaRunId: qa3.id },
    result: null, createdAt: ago(8), closedAt: ago(5),
  };
  rv.result = aggregateVotes(rv);
  d.expertReviews.push(rv);
  const st3 = p3.milestoneStates[0];
  st3.authorized = 4000;
  const al3 = computeAllocation({ agreement: ag3, milestoneId: 'M1', state: st3, qa: qa3, feedback: fb3, review: rv, settlement: null });
  d.allocations.push({ id: id('alc'), projectId: p3.id, ...al3, approvals: { client: ago(4), freelancer: ago(4) }, challenges: [], status: 'EXECUTED', createdAt: ago(4) });
  Object.assign(st3, { authorized: 1500, captured: 2500, paid: 2500, underReview: 1500, fundingStatus: 'PARTIALLY_PAID', workStatus: 'REVISION_REQUESTED' });
  d.transactions.push(
    simTx({ projectId: p3.id, milestoneId: 'M1', type: 'MILESTONE_AUTHORIZATION', amount: 4000, status: 'AUTHORIZED', paypal: { authorizationId: simId('AUTH') } }, ago(25)),
    simTx({ projectId: p3.id, milestoneId: 'M1', type: 'EXPERT_FEE_COLLECTION', amount: 75, status: 'COMPLETED', paypal: { captureId: simId('CAPTURE') }, note: 'DEMO SEED — expert fee paid by client (separate expense)' }, ago(8)),
    ...[e1, e2, e3].map((e) => simTx({ projectId: p3.id, milestoneId: 'M1', type: 'EXPERT_FEE_PAYOUT', amount: 25, status: 'SUCCESS', payee: e.id, paypal: { payoutBatchId: simId('PAYOUT') }, note: 'DEMO SEED — fixed review fee, independent of vote' }, ago(5))),
    simTx({ projectId: p3.id, milestoneId: 'M1', type: 'MILESTONE_CAPTURE', amount: 2500, status: 'COMPLETED', paypal: { captureId: simId('CAPTURE') }, note: 'DEMO SEED — partial capture; $1,500 remains authorized under review' }, ago(4)),
    simTx({ projectId: p3.id, milestoneId: 'M1', type: 'FREELANCER_PAYOUT', amount: 2500, status: 'SUCCESS', payee: free.id, paypal: { payoutBatchId: simId('PAYOUT') } }, ago(4)),
  );
  A(p3.id, 'system', 'system', 'EXPERT_REVIEW_CLOSED', `CLOSED. ${rv.result.summary}`, ago(5));
  A(p3.id, 'allocation-engine', 'system', 'ALLOCATION_RECOMMENDED', `${al3.releaseType}: eligible $${al3.eligibleAmount}, held $${al3.disputedAmount}. ${al3.rule}`, ago(4));
  A(p3.id, 'demo', 'user', 'REVISION_REQUESTED', 'REQ-02 PDF export to be fixed', ago(4));

  d.meta.seededAt = T;
  flushNow();
  console.log('[seed] demo data created');
}
