import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Badge, ErrorNote, SimTag, useAction } from '../components/ui';

type Tab = 'login' | 'signup' | 'forgot' | 'demo';

export default function Login() {
  const { refreshUser } = useApp();
  const [tab, setTab] = useState<Tab>('login');
  const [demo, setDemo] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'client' | 'freelancer'>('client');
  const [notice, setNotice] = useState<string | null>(null);
  const [devInbox, setDevInbox] = useState<any[]>([]);
  const a = useAction();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    api.get('/auth/demo-users').then(setDemo).catch(() => {});
    api.get('/auth/dev-mailbox').then((m) => setDevInbox(m.messages || [])).catch(() => {});
  }, [notice]);
  const after = async () => { await refreshUser(); nav(loc.pathname.startsWith('/join/') ? loc.pathname : '/'); };

  const tabBtn = (k: Tab, label: string) => (
    <button type="button" onClick={() => { setTab(k); a.setError(null); }}
      className={`-mb-px whitespace-nowrap border-b-2 px-2.5 py-2 text-[13px] transition-colors ${tab === k ? 'border-seal font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-[1180px] items-center gap-2 px-6 py-3">
          <span className="grid h-6 w-6 place-items-center rounded-[2px] bg-seal text-[13px] font-semibold text-white" style={{ fontFamily: 'var(--font-display)' }}>V</span>
          <span className="text-[16px] font-semibold tracking-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>VeriPay</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 py-12">
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_370px]">
          {/* Hero: the most characteristic object in this product's world is a payment
              decision with its reasoning attached, so that is what opens the page —
              not a headline sitting above a stat tile. */}
          <div>
            <h1 className="max-w-2xl text-[34px] leading-[1.15] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              Freelance payments decided by the contract, the evidence, and an independent
              panel — not by whoever argues hardest.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">
              Agree a Statement of Work, fund milestones through PayPal, submit the work with evidence.
              VeriPay checks delivery against each acceptance criterion, escalates genuinely ambiguous
              items to vetted domain experts who vote independently, and releases money only once the
              agreed conditions are met and both sides approve.
            </p>

            <figure className="mt-10 max-w-xl">
              <div className="sheet overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-rule bg-paper px-4 py-2">
                  <span className="text-[12px] text-ink-2">Milestone 2 · Search &amp; Checkout · $3,000 agreed</span>
                  <SimTag label="Example" />
                </div>
                <dl className="divide-y divide-rule text-[13px]">
                  <Row term="REQ-04 Search and filtering"
                    detail={'The SOW says "fast" and "relevant" with no measurable threshold, so automated QA refused to pass it.'}
                    badge={<Badge>NEEDS_CLARIFICATION</Badge>} />
                  <Row term="Expert panel"
                    detail="Three vetted reviewers voted independently: 2–1 compliant. The dissenting opinion stays on the record."
                    badge={<Badge>COMPLIANT</Badge>} />
                  <Row term="Client feedback"
                    detail="The client wanted typo-tolerant search. The SOW excludes it, so it became a priced change request rather than a deduction."
                    badge={<Badge>OUT_OF_SCOPE_REQUEST</Badge>} />
                </dl>
                <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink/80 bg-paper px-4 py-3">
                  <div>
                    <div className="text-[13px] font-medium text-ink">Released to the freelancer</div>
                    <div className="text-[12px] text-ink-3">Client approved · freelancer acknowledged · captured through PayPal</div>
                  </div>
                  <div className="text-[22px] font-semibold tabular-nums text-released" style={{ fontFamily: 'var(--font-display)' }}>$3,000</div>
                </div>
              </div>
              <figcaption className="mt-2 text-[12px] text-ink-3">
                Every amount traces to a clause, a piece of evidence and a recorded approval. Nothing moves on a confidence score.
              </figcaption>
            </figure>
          </div>

          <div className="lg:sticky lg:top-8">
            {loc.pathname.startsWith('/join/') && (
              <div className="mb-3 rounded-[3px] border-l-2 border-seal bg-seal-wash px-3 py-2 text-[13px] text-seal">
                You have been invited to a project. Sign in or create an account to accept it.
              </div>
            )}
            {notice && <div className="mb-3 rounded-[3px] border-l-2 border-released bg-released-wash px-3 py-2 text-[13px] text-released">{notice}</div>}

            <div className="sheet">
              <div className="flex gap-0.5 border-b border-rule px-2">
                {tabBtn('login', 'Sign in')}
                {tabBtn('signup', 'Create account')}
                {tabBtn('forgot', 'Reset')}
                {demo.length > 0 && tabBtn('demo', 'Demo')}
              </div>

              <div className="p-4">
                {tab === 'login' && (
                  <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await api.post('/auth/login', { email: email.trim().toLowerCase(), password }); await after(); }); }}>
                    <div><label className="field-label" htmlFor="li-email">Email</label><input id="li-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    <div><label className="field-label" htmlFor="li-pw">Password</label><input id="li-pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                    <ErrorNote error={a.error} />
                    <button className="btn-primary w-full" disabled={a.busy}>Sign in to VeriPay</button>
                  </form>
                )}

                {tab === 'signup' && (
                  <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await api.post('/auth/signup', { name, email: email.trim().toLowerCase(), password, role }); setNotice(`Verification link sent to ${email}. Open it to activate your account.`); setTab('login'); }); }}>
                    <div><label className="field-label" htmlFor="su-name">Full name</label><input id="su-name" className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
                    <div><label className="field-label" htmlFor="su-email">Work email</label><input id="su-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    <div><label className="field-label" htmlFor="su-pw">Password (at least 10 characters)</label><input id="su-pw" className="input" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                    <div>
                      <span className="field-label">Are you hiring, or delivering?</span>
                      <div className="grid grid-cols-2 gap-2">
                        {([['client', 'Hiring someone'], ['freelancer', 'Delivering work']] as const).map(([r, l]) => (
                          <button type="button" key={r} onClick={() => setRole(r)}
                            className={`rounded-[3px] border px-3 py-2 text-[13px] transition-colors ${role === r ? 'border-seal bg-seal-wash font-medium text-seal' : 'border-rule-strong text-ink-2 hover:bg-paper'}`}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <ErrorNote error={a.error} />
                    <button className="btn-primary w-full" disabled={a.busy}>Create my account</button>
                    <p className="text-[12px] text-ink-3">You will get a verification link. Creating or joining a project needs a verified email.</p>
                  </form>
                )}

                {tab === 'forgot' && (
                  <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() }); setNotice('If an account exists for that address, a reset link is on its way.'); setTab('login'); }); }}>
                    <div><label className="field-label" htmlFor="fp-email">Email</label><input id="fp-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    <ErrorNote error={a.error} />
                    <button className="btn-primary w-full" disabled={a.busy}>Send reset link</button>
                  </form>
                )}

                {tab === 'demo' && (
                  <div className="space-y-3">
                    <p className="text-[12px] text-ink-2">Fictional accounts for the walkthrough. Switch between them to see both sides of the same project. Expert profiles are simulated, not real people.</p>
                    {(['client', 'freelancer', 'expert'] as const).map((r) => {
                      const users = demo.filter((u) => u.role === r);
                      if (!users.length) return null;
                      return (
                        <div key={r}>
                          <div className="mb-1 text-[12px] text-ink-3">{r === 'client' ? 'Hiring' : r === 'freelancer' ? 'Delivering' : 'Independent reviewers'}</div>
                          <div className="sheet ledger">
                            {users.map((u) => (
                              <button key={u.id} disabled={a.busy} className="ledger-row w-full text-left"
                                onClick={() => a.run(async () => { await api.post('/auth/demo-login', { userId: u.id }); await after(); })}>
                                <span className="flex-1 text-[13px] text-ink">{u.name.replace(/ \((DEMO|SIMULATED)[^)]*\)/, '')}</span>
                                <span className="text-[11px] text-ink-3">Sign in</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <ErrorNote error={a.error} />
                  </div>
                )}
              </div>
            </div>

            {devInbox.length > 0 && (
              <div className="sheet mt-3 p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <SimTag label="Local mail" />
                  <span className="text-[12px] text-ink-2">No SMTP configured, so links land here.</span>
                </div>
                <ul className="divide-y divide-rule text-[12px]">
                  {devInbox.slice(0, 3).map((m, i) => {
                    const link = m.text.match(/https?:\/\/\S+/)?.[0];
                    return (
                      <li key={i} className="py-1.5">
                        <div className="text-ink">{m.subject} <span className="text-ink-3">→ {m.to}</span></div>
                        {link && <a className="mono text-seal underline" href={new URL(link).pathname + new URL(link).search}>Open link</a>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Row({ term, detail, badge }: { term: string; detail: string; badge: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <dt className="font-medium text-ink">{term}</dt>
        <dd className="mt-0.5 text-[12px] leading-relaxed text-ink-2">{detail}</dd>
      </div>
      <div className="shrink-0 pt-0.5">{badge}</div>
    </div>
  );
}
