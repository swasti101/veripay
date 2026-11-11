import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { ErrorNote, SimTag, useAction } from '../components/ui';

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
  useEffect(() => { api.get('/auth/demo-users').then(setDemo); api.get('/auth/dev-mailbox').then((m) => setDevInbox(m.messages || [])).catch(() => {}); }, [notice]);
  const after = async () => { await refreshUser(); nav(loc.pathname.startsWith('/join/') ? loc.pathname : '/'); };

  const submitLogin = () => a.run(async () => { await api.post('/auth/login', { email: email.trim().toLowerCase(), password }); await after(); });
  const submitSignup = () => a.run(async () => {
    await api.post('/auth/signup', { name, email: email.trim().toLowerCase(), password, role });
    setNotice(`We sent a verification link to ${email}. Open it to activate your account.`);
    setTab('login');
  });
  const submitForgot = () => a.run(async () => {
    await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
    setNotice('If an account exists, a reset link has been sent.');
    setTab('login');
  });

  const tabBtn = (k: Tab, label: string) => (
    <button type="button" onClick={() => { setTab(k); a.setError(null); }} className={`px-3 py-1.5 text-sm font-medium border-b-2 ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-lg font-bold text-white">V</span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">VeriPay</h1>
            <p className="text-slate-600">Money allocated by what was agreed, what was delivered, and what the evidence shows.</p>
          </div>
        </div>
        {loc.pathname.startsWith('/join/') && <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-800">You were invited to a project. Sign in or create an account to accept.</div>}
        {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</div>}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <div className="mb-4 flex gap-1 border-b border-slate-200">{tabBtn('login', 'Sign in')}{tabBtn('signup', 'Create account')}{tabBtn('forgot', 'Forgot password')}{demo.length > 0 && tabBtn('demo', 'Demo accounts')}</div>
            {tab === 'login' && (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submitLogin(); }}>
                <div><label className="label" htmlFor="li-email">Email</label><input id="li-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><label className="label" htmlFor="li-pw">Password</label><input id="li-pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <ErrorNote error={a.error} />
                <button className="btn-primary w-full" disabled={a.busy}>Sign in to VeriPay</button>
              </form>
            )}
            {tab === 'signup' && (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submitSignup(); }}>
                <div><label className="label" htmlFor="su-name">Full name</label><input id="su-name" className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><label className="label" htmlFor="su-email">Work email</label><input id="su-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><label className="label" htmlFor="su-pw">Password (at least 10 characters)</label><input id="su-pw" className="input" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <div><label className="label">I am a</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['client', 'freelancer'] as const).map((r) => (
                      <button type="button" key={r} onClick={() => setRole(r)} className={`rounded-lg border px-3 py-2 text-sm capitalize ${role === r ? 'border-indigo-500 bg-indigo-50 font-semibold text-indigo-700' : 'border-slate-300'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <ErrorNote error={a.error} />
                <button className="btn-primary w-full" disabled={a.busy}>Create my account</button>
                <p className="text-[11px] text-slate-500">You'll receive a verification email. Projects require a verified email before you can invite or be invited.</p>
              </form>
            )}
            {tab === 'forgot' && (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submitForgot(); }}>
                <div><label className="label" htmlFor="li-email">Email</label><input id="li-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <ErrorNote error={a.error} />
                <button className="btn-primary w-full" disabled={a.busy}>Send reset link</button>
              </form>
            )}
            {tab === 'demo' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2"><SimTag label="DEMO" /><p className="text-xs text-slate-600">Click to sign in as a fictional party. Expert profiles are SIMULATED.</p></div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(['client', 'freelancer', 'expert'] as const).map((r) => (
                    <div key={r}>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{r}</div>
                      <div className="space-y-1">
                        {demo.filter((u) => u.role === r).map((u) => (
                          <button key={u.id} disabled={a.busy} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-sm hover:border-indigo-300"
                            onClick={() => a.run(async () => { await api.post('/auth/demo-login', { userId: u.id }); await after(); })}>{u.name}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <ErrorNote error={a.error} />
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div className="card p-5">
              <h2 className="h2 mb-2">What VeriPay does</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>Clients and freelancers agree a Statement of Work. AI extracts requirements, deliverables, deadlines, milestones and payment terms — never inventing anything.</li>
                <li>Clients fund via PayPal (advance, partial, or full). Only funded milestones can start.</li>
                <li>A Kernel browser agent, vision/text AI, and a neutral QA Mediator check delivery against each acceptance criterion with evidence.</li>
                <li>Ambiguous or disputed items go to an independent human expert panel that votes blind. Minority opinions are preserved.</li>
                <li>Payment is released only when the agreed conditions are met and both parties approve. A configurable platform fee funds the SaaS.</li>
              </ul>
            </div>
            {devInbox.length > 0 && (
              <div className="card p-4">
                <div className="mb-2 flex items-center gap-2"><SimTag label="DEV MAILBOX" /><p className="muted">SMTP not configured — recent verification/reset emails are shown here so you can finish the flow.</p></div>
                <ul className="divide-y divide-slate-100 text-xs">
                  {devInbox.slice(0, 3).map((m, i) => {
                    const link = m.text.match(/https?:\/\/\S+/)?.[0];
                    return <li key={i} className="py-2"><div><b>{m.subject}</b> → {m.to}</div>{link && <a className="text-indigo-600 underline" href={new URL(link).pathname + new URL(link).search}>{link}</a>}</li>;
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
