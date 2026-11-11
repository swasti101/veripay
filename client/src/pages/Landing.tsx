import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { Badge, SimTag } from '../components/ui';
import Vignette from '../components/Vignette';

/* Service domains. These are not decoration: each one names which of the three
   analysers actually does the checking for that kind of work, so the grid doubles
   as an explanation of how verification happens. */
const DOMAINS: { name: string; work: string; analysers: string[]; kind: string }[] = [
  { name: 'Website development', work: 'Pages, flows, responsive layout, checkout', analysers: ['Computer agent', 'Vision', 'Text'], kind: 'web' },
  { name: 'Design & graphics', work: 'Mockups, brand systems, visual assets', analysers: ['Vision', 'Text'], kind: 'design' },
  { name: 'Content & documentation', work: 'Copy, guides, technical writing', analysers: ['Text'], kind: 'content' },
  { name: 'Backend & APIs', work: 'Endpoints, integrations, data handling', analysers: ['Text', 'Computer agent'], kind: 'api' },
  { name: 'Frontend engineering', work: 'Components, state, responsive behaviour', analysers: ['Computer agent', 'Vision'], kind: 'frontend' },
  { name: 'QA & test evidence', work: 'Test reports, coverage, reproductions', analysers: ['Text', 'Computer agent'], kind: 'qa' },
];

const ANALYSERS = [
  {
    key: 'vision',
    name: 'Vision analyser',
    one: 'Looks at what was delivered',
    detail: 'Reads screenshots, mockups and browser captures against the acceptance criteria. It reports what is visible — and is never allowed to pass a requirement that needs functional proof.',
  },
  {
    key: 'text',
    name: 'Text analyser',
    one: 'Reads the written work',
    detail: 'Compares documents, copy, test reports and completion claims with the SOW clause they are meant to satisfy. A claim is treated as a claim, not as evidence.',
  },
  {
    key: 'computer',
    name: 'Computer agent',
    one: 'Actually uses the site',
    detail: 'Opens the submitted URL in a cloud browser, navigates, types, checks elements at desktop and mobile widths, captures screenshots and logs every action. It never buys, pays or deletes.',
  },
];

export default function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-surface">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-rule bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-6 px-6 py-3.5">
          <Logo />
          <nav className="ml-auto flex items-center gap-1">
            <a href="#how" className="btn-ghost hidden sm:inline-flex">How it works</a>
            <a href="#verify" className="btn-ghost hidden sm:inline-flex">Verification</a>
            <button className="btn-secondary" onClick={onSignIn}>Sign in</button>
            <button className="btn-primary" onClick={onSignIn}>Get started</button>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-[1180px] px-6 pb-20 pt-20">
        <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-[3px] border border-rule bg-paper px-2.5 py-1 text-[12px] text-ink-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-released" />
              Milestone payments, settled on evidence
            </p>
            <h1 className="text-[44px] leading-[1.08] font-semibold tracking-[-0.02em] text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              The work gets checked.<br />Then the money moves.
            </h1>
            <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-ink-2">
              Agree a Statement of Work. Fund milestones through PayPal. When the freelancer submits,
              three analysers examine the delivery against each acceptance criterion — and anything
              genuinely ambiguous goes to vetted domain experts who vote independently.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button className="btn-primary px-4 py-2.5 text-[14px]" onClick={onSignIn}>Start a project</button>
              <a href="#verify" className="btn-secondary px-4 py-2.5 text-[14px]">See how verification works</a>
            </div>
            <p className="mt-5 text-[12px] text-ink-3">
              No freelancer marketplace, no bidding. You bring the people; VeriPay settles the money fairly.
            </p>
          </div>

          {/* The specimen: one real decision, with its reasoning attached. */}
          <figure>
            <div className="sheet overflow-hidden shadow-[0_18px_50px_-24px_rgba(26,31,46,0.3)]">
              <div className="flex items-center justify-between gap-2 border-b border-rule bg-paper px-4 py-2.5">
                <span className="text-[12px] text-ink-2">Milestone 2 · Search &amp; Checkout</span>
                <SimTag label="Example" />
              </div>
              <dl className="divide-y divide-rule">
                <Spec term="Computer agent" badge={<Badge>PASS</Badge>}
                  detail="Typed “linen” into the catalogue search: 12 products narrowed to 2 in 280 ms. Filters combined correctly. No horizontal scroll at 375 px." />
                <Spec term="Vision analyser" badge={<Badge>PASS</Badge>}
                  detail="Cart page shows line items, quantity controls and a recalculated total in both captures." />
                <Spec term="Text analyser" badge={<Badge>NEEDS_CLARIFICATION</Badge>}
                  detail="REQ-04 says search must be “fast” and “relevant” with no measurable threshold, so it cannot be scored." />
                <Spec term="Expert panel" badge={<Badge>COMPLIANT</Badge>}
                  detail="Three reviewers voted blind: 2–1 compliant. The dissent stays on the record." />
              </dl>
              <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink/80 bg-paper px-4 py-3.5">
                <div>
                  <div className="text-[13px] font-medium text-ink">Released to the freelancer</div>
                  <div className="text-[11px] text-ink-3">Client approved · freelancer acknowledged · PayPal captured</div>
                </div>
                <div className="text-[24px] font-semibold tabular-nums text-released" style={{ fontFamily: 'var(--font-display)' }}>$3,000</div>
              </div>
            </div>
          </figure>
        </div>
      </section>

      {/* ── The three analysers ── */}
      <section id="verify" className="border-y border-rule bg-paper py-20">
        <div className="mx-auto max-w-[1180px] px-6">
          <h2 className="max-w-xl text-[30px] leading-tight font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
            Three analysers, each doing the part it can actually prove
          </h2>
          <p className="mt-3 max-w-xl text-[15px] text-ink-2">
            They disagree sometimes. That is the point — a screenshot cannot prove a button works, and a
            passing test cannot prove a layout looks right.
          </p>

          <div className="mt-12 grid gap-px overflow-hidden rounded-[3px] border border-rule bg-rule md:grid-cols-3">
            {ANALYSERS.map((a, i) => (
              <div key={a.key} className="bg-surface p-6">
                <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-[3px] bg-ink text-[13px] font-semibold text-white tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                  {i + 1}
                </div>
                <h3 className="text-[17px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{a.name}</h3>
                <p className="mt-0.5 text-[13px] text-seal">{a.one}</p>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{a.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 sheet p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Then a neutral mediator decides what the evidence supports</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                  Each requirement gets one of six verdicts. Missing evidence is <b className="font-medium">unverified</b>,
                  never failed. A requirement whose wording cannot be measured is sent back for clarification
                  rather than guessed at. Only genuinely contested items reach the expert panel.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['PASS', 'PARTIAL', 'FAIL', 'UNVERIFIED', 'NEEDS_CLARIFICATION', 'OUT_OF_SCOPE'].map((s) => <Badge key={s}>{s}</Badge>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Domains ── */}
      <section className="py-20">
        <div className="mx-auto max-w-[1180px] px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[30px] leading-tight font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>What VeriPay can verify</h2>
              <p className="mt-2 max-w-lg text-[15px] text-ink-2">The kind of work decides which analysers do the checking.</p>
            </div>
            <button className="btn-secondary" onClick={onSignIn}>Start a project</button>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DOMAINS.map((dm) => (
              <div key={dm.name} className="sheet group overflow-hidden transition-colors hover:border-rule-strong">
                <div className="aspect-[240/132] border-b border-rule"><Vignette kind={dm.kind} /></div>
                <div className="p-5">
                  <h3 className="text-[15px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{dm.name}</h3>
                  <p className="mt-1 text-[13px] text-ink-2">{dm.work}</p>
                  <div className="mt-4 border-t border-rule pt-3">
                    <div className="mb-1.5 text-[11px] text-ink-3">Checked by</div>
                    <div className="flex flex-wrap gap-1.5">
                      {dm.analysers.map((an) => (
                        <span key={an} className="rounded-[2px] border border-rule bg-paper px-1.5 py-px text-[11px] text-ink-2">{an}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="border-t border-rule bg-paper py-20">
        <div className="mx-auto max-w-[1180px] px-6">
          <h2 className="text-[30px] leading-tight font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>From agreement to payment</h2>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-[3px] border border-rule bg-rule md:grid-cols-2 lg:grid-cols-4">
            {[
              ['Agree the scope', 'Upload the SOW. Requirements, acceptance criteria, milestones and amounts are extracted for both sides to correct and sign. Neither party can change it alone afterwards.'],
              ['Fund a milestone', 'The client commits through PayPal — advance, partial or full. Work can only begin on a funded milestone.'],
              ['Submit and verify', 'The freelancer submits a URL, files and evidence. The three analysers examine it and the mediator records a verdict per requirement.'],
              ['Settle', 'The amount comes from the agreed figures, never a confidence score. Release needs the client’s approval and the freelancer’s acknowledgement.'],
            ].map(([t, d], i) => (
              <li key={t} className="bg-surface p-6">
                <div className="text-[12px] text-ink-3 tabular-nums">Step {i + 1}</div>
                <h3 className="mt-1.5 text-[15px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{d}</p>
              </li>
            ))}
          </ol>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-[3px] border border-rule bg-surface p-6">
            <div>
              <h3 className="text-[17px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Try it with a seeded project</h3>
              <p className="mt-1 max-w-xl text-[13px] text-ink-2">
                Three worked examples are loaded: one where the delivery clearly complies, one where it clearly
                does not, and one that hinges on an ambiguous clause and goes to the expert panel. Sign in as the
                client or the freelancer and walk either side.
              </p>
            </div>
            <button className="btn-primary px-4 py-2.5 text-[14px]" onClick={onSignIn}>Open the demo</button>
          </div>
        </div>
      </section>

      <footer className="border-t border-rule py-8">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 text-[12px] text-ink-3">
          <Logo size="sm" />
          <p>Payments through PayPal. Browser checks through Kernel. Nothing is shown as live unless it is.</p>
          <Link to="/integrations" className="underline hover:text-ink">Integration status</Link>
        </div>
      </footer>
    </div>
  );
}

function Spec({ term, detail, badge }: { term: string; detail: string; badge: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <dt className="text-[13px] font-medium text-ink">{term}</dt>
        <dd className="mt-0.5 text-[12px] leading-relaxed text-ink-2">{detail}</dd>
      </div>
      <div className="shrink-0 pt-0.5">{badge}</div>
    </div>
  );
}
