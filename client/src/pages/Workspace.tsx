import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Route, Routes, useParams, Navigate, useLocation, Link } from 'react-router-dom';
import { api, money } from '../api';
import { Badge, ErrorNote, Figure, SimTag, Spinner } from '../components/ui';
import { PROJECT_NAV } from '../components/Shell';
import Overview from '../components/ws/Overview';
import Agreement from '../components/ws/Agreement';
import Funding from '../components/ws/Funding';
const Timeline = lazy(() => import('../components/ws/Timeline'));
import Delivery from '../components/ws/Delivery';
import Feedback from '../components/ws/Feedback';
import Experts from '../components/ws/Experts';
import Payments from '../components/ws/Payments';
import Conversation from '../components/ws/Conversation';
import Scope from '../components/ws/Scope';
import Audit from '../components/ws/Audit';

export interface WsProps { v: any; reload: () => Promise<void>; mid: string; setMid: (m: string) => void }

/* The life of one milestone. This IS a sequence, so a stepped track is the honest
   form — each stage links to the section where it happens. */
const STAGES: { key: string; label: string; tab: string }[] = [
  { key: 'funded', label: 'Funded', tab: 'funding' },
  { key: 'submitted', label: 'Submitted', tab: 'delivery' },
  { key: 'verified', label: 'Verified', tab: 'delivery' },
  { key: 'reviewed', label: 'Client review', tab: 'feedback' },
  { key: 'decided', label: 'Decision', tab: 'payments' },
  { key: 'paid', label: 'Paid', tab: 'payments' },
];

function stageState(v: any, mid: string): Record<string, 'done' | 'now' | 'todo' | 'skip'> {
  const st = v.project.milestoneStates.find((s: any) => s.milestoneId === mid);
  const sub = v.submissions.filter((s: any) => s.milestoneId === mid).at(-1);
  const qa = v.qaRuns.filter((q: any) => q.milestoneId === mid && q.status === 'COMPLETE').at(-1);
  const fb = v.feedback.filter((f: any) => f.milestoneId === mid).at(-1);
  const al = v.allocations.filter((a: any) => a.milestoneId === mid).at(-1);
  const done = {
    funded: !!st && st.authorized + st.captured > 0,
    submitted: !!sub,
    verified: !!qa,
    reviewed: !!fb,
    decided: !!al,
    paid: !!st && st.fundingStatus === 'PAID',
  } as Record<string, boolean>;
  const out: Record<string, 'done' | 'now' | 'todo'> = {};
  let nowSet = false;
  for (const s of STAGES) {
    if (done[s.key]) out[s.key] = 'done';
    else if (!nowSet) { out[s.key] = 'now'; nowSet = true; }
    else out[s.key] = 'todo';
  }
  return out;
}

export default function Workspace() {
  const { id } = useParams();
  const loc = useLocation();
  const [v, setV] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mid, setMid] = useState('');
  const reload = useCallback(async () => {
    try { const r = await api.get(`/projects/${id}`); setV(r); setErr(null); } catch (e: any) { setErr(e.message); }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);
  // Light polling keeps both parties in sync — analysis runs asynchronously and the other side may act.
  useEffect(() => {
    const running = v?.qaRuns?.some((q: any) => q.status === 'RUNNING');
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, running ? 2000 : 8000);
    return () => clearInterval(t);
  }, [reload, v?.qaRuns]);

  const ag = v?.activeAgreement || v?.draftAgreement;
  useEffect(() => {
    if (!ag || mid) return;
    const st = v.project.milestoneStates.find((s: any) => !['ACCEPTED', 'CLOSED', 'NOT_STARTED'].includes(s.workStatus))
      || v.project.milestoneStates.find((s: any) => s.workStatus === 'NOT_STARTED');
    setMid(st?.milestoneId || ag.milestones[0]?.id || '');
  }, [ag, mid, v]);

  if (err && !v) return <div className="mx-auto max-w-3xl p-8"><ErrorNote error={err} /></div>;
  if (!v) return <div className="p-8"><Spinner label="Loading project…" /></div>;

  const p = v.project;
  const m = v.money;
  const section = loc.pathname.split('/')[3] || 'overview';
  const [, sectionLabel, sectionHint] = PROJECT_NAV.find(([s]) => s === section) || PROJECT_NAV[0];
  const ms = ag?.milestones.find((x: any) => x.id === mid);
  const st = p.milestoneStates.find((s: any) => s.milestoneId === mid);
  const stages = mid ? stageState(v, mid) : {};
  const props: WsProps = { v, reload, mid, setMid };
  const other = v.party === 'client' ? v.users[p.freelancerId]?.name : v.users[p.clientId]?.name;
  const clean = (n?: string) => (n || '').replace(/ \((DEMO|SIMULATED)[^)]*\)/, '');

  return (
    <main className="px-6 pb-16 pt-6 lg:px-10">
      {/* ── Project header ── */}
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <Link to="/" className="hover:text-ink">Projects</Link><span>/</span><span className="text-ink-2">{p.title}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{p.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              <Badge>{p.status}</Badge>
              <span>You are the {v.party}{other ? `, working with ${clean(other)}` : ', waiting for the other party to join'}</span>
              {p.isDemo && <SimTag label={p.demoLabel ? p.demoLabel.toLowerCase() : 'demo'} />}
            </div>
          </div>
        </div>

        {/* Milestone selector: a row of milestones, because you pick one by what it is, not by ID. */}
        {ag && ag.milestones.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {ag.milestones.map((x: any) => {
              const s = p.milestoneStates.find((y: any) => y.milestoneId === x.id);
              const active = x.id === mid;
              return (
                <button key={x.id} onClick={() => setMid(x.id)}
                  className={`rounded-[4px] border px-3 py-2 text-left transition-colors ${active ? 'border-seal bg-surface shadow-[0_0_0_1px_var(--color-seal)]' : 'border-rule bg-surface hover:border-rule-strong'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] ${active ? 'font-medium text-ink' : 'text-ink-2'}`}>{x.id} · {x.title}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-3">
                    <span className="tabular-nums">{money(x.amount)}</span>
                    {s && <Badge>{s.workStatus}</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Stage track for the selected milestone */}
        {ms && (
          <ol className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[4px] border border-rule bg-rule sm:grid-cols-6">
            {STAGES.map((s, i) => {
              const state = stages[s.key];
              return (
                <li key={s.key}>
                  <Link to={`/projects/${id}/${s.tab}`}
                    className={`flex h-full items-center gap-2 px-3 py-2 text-[12px] transition-colors hover:brightness-[0.98] ${
                      state === 'done' ? 'bg-released-wash text-released' : state === 'now' ? 'bg-seal-wash text-seal' : 'bg-surface text-ink-3'}`}>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold tabular-nums ${
                      state === 'done' ? 'bg-released text-white' : state === 'now' ? 'bg-seal text-white' : 'border border-rule-strong'}`}>
                      {state === 'done' ? '✓' : i + 1}
                    </span>
                    <span className={state === 'now' ? 'font-medium' : ''}>{s.label}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          <div className="mb-5">
            <h2 className="text-[20px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{sectionLabel}</h2>
            <p className="mt-0.5 text-[13px] text-ink-3">{sectionHint}{ms && !['overview', 'agreement', 'audit', 'conversation', 'timeline', 'scope'].includes(section) ? ` · ${ms.id} ${ms.title}` : ''}</p>
          </div>
          <Routes>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<Overview {...props} />} />
            <Route path="agreement" element={<Agreement {...props} />} />
            <Route path="funding" element={<Funding {...props} />} />
            <Route path="timeline" element={<Suspense fallback={<Spinner label="Loading Bryntum Gantt…" />}><Timeline {...props} /></Suspense>} />
            <Route path="delivery" element={<Delivery {...props} />} />
            <Route path="feedback" element={<Feedback {...props} />} />
            <Route path="experts" element={<Experts {...props} />} />
            <Route path="payments" element={<Payments {...props} />} />
            <Route path="conversation" element={<Conversation {...props} />} />
            <Route path="scope" element={<Scope {...props} />} />
            <Route path="audit" element={<Audit {...props} />} />
          </Routes>
        </section>

        {/* ── Money rail: the point of the product, always visible ── */}
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="sheet">
            <div className="border-b border-rule px-4 py-2.5"><h3 className="h2">Project money</h3></div>
            <div className="px-4 py-1">
              <Figure label="Budget" value={money(m.budget)} sub={m.advance ? `incl. ${money(m.advance)} advance` : undefined} />
              <Figure label="Committed" value={money(m.committed)} />
              <Figure label="Authorized, not released" value={money(m.authorized)} />
              <Figure label="Eligible for release" value={money(m.eligible)} tone="text-released" />
              <Figure label="Held under review" value={money(m.underReview)} tone="text-hold" />
              <Figure label="Paid" value={money(m.paid)} sub={m.platformFees ? `${money(m.platformFees)} platform fee retained` : undefined} />
            </div>
            {m.simulated && <div className="border-t border-rule px-4 py-2"><SimTag label="includes simulated payments" /></div>}
          </div>

          {ms && st && (
            <div className="sheet">
              <div className="border-b border-rule px-4 py-2.5">
                <h3 className="h2">{ms.id}</h3>
                <div className="text-[12px] text-ink-3">{ms.title}</div>
              </div>
              <div className="px-4 py-1">
                <Figure label="Agreed amount" value={money(ms.amount)} />
                <Figure label="Funding" value={<Badge>{st.fundingStatus}</Badge>} />
                <Figure label="Work" value={<Badge>{st.workStatus}</Badge>} />
                <Figure label="Due" value={<span className="text-[13px] font-normal" style={{ fontFamily: 'var(--font-sans)' }}>{ms.dueDate || '—'}</span>} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
