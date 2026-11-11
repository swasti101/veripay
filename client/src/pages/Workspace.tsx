import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useParams, Navigate } from 'react-router-dom';
import { api, money } from '../api';
import { Badge, ErrorNote, SimTag, Spinner, Stat } from '../components/ui';
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

const TABS = [
  ['overview', 'Overview'], ['agreement', 'SOW & Agreement'], ['funding', 'Funding'], ['timeline', 'Timeline'], ['delivery', 'Delivery & QA'],
  ['feedback', 'Client feedback'], ['experts', 'Expert review'], ['payments', 'Payments'], ['conversation', 'Conversation'], ['scope', 'Scope & disputes'], ['audit', 'Audit trail'],
];

export default function Workspace() {
  const { id } = useParams();
  const [v, setV] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mid, setMid] = useState('');
  const reload = useCallback(async () => {
    try { const r = await api.get(`/projects/${id}`); setV(r); setErr(null); } catch (e: any) { setErr(e.message); }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);
  // Light polling keeps both parties' views in sync (QA runs asynchronously; other party may act).
  useEffect(() => {
    const running = v?.qaRuns?.some((q: any) => q.status === 'RUNNING');
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, running ? 2000 : 8000);
    return () => clearInterval(t);
  }, [reload, v?.qaRuns]);

  const ag = v?.activeAgreement || v?.draftAgreement;
  useEffect(() => {
    if (!ag || mid) return;
    const st = v.project.milestoneStates.find((s: any) => !['ACCEPTED', 'CLOSED', 'NOT_STARTED'].includes(s.workStatus)) || v.project.milestoneStates.find((s: any) => s.workStatus === 'NOT_STARTED');
    setMid(st?.milestoneId || ag.milestones[0]?.id || '');
  }, [ag, mid, v]);

  if (err && !v) return <div className="mx-auto max-w-3xl p-8"><ErrorNote error={err} /></div>;
  if (!v) return <div className="p-8"><Spinner label="Loading project…" /></div>;
  const p = v.project;
  const m = v.money;
  const ms = ag?.milestones.find((x: any) => x.id === mid);
  const st = p.milestoneStates.find((s: any) => s.milestoneId === mid);
  const lastSub = v.submissions.filter((s: any) => s.milestoneId === mid).at(-1);
  const lastQA = v.qaRuns.filter((q: any) => q.milestoneId === mid).at(-1);
  const lastFb = v.feedback.filter((f: any) => f.milestoneId === mid).at(-1);
  const lastRv = v.reviews.filter((r: any) => r.milestoneId === mid).at(-1);
  const props: WsProps = { v, reload, mid, setMid };

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{p.title}</h1>
            <Badge>{p.status}</Badge>
            {p.isDemo && <SimTag label={p.demoLabel ? `DEMO · ${p.demoLabel}` : 'DEMO'} />}
          </div>
          <p className="muted">You are the <b className="text-slate-700">{v.party}</b> · {v.users[p.clientId]?.name || 'client not joined'} ↔ {v.users[p.freelancerId]?.name || 'freelancer not joined'}</p>
        </div>
        {ag && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Milestone</span>
            <select className="input w-auto" value={mid} onChange={(e) => setMid(e.target.value)}>
              {ag.milestones.map((x: any) => <option key={x.id} value={x.id}>{x.id} · {x.title}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Always-visible key facts */}
      <div className="card grid grid-cols-2 gap-x-4 gap-y-3 p-3 sm:grid-cols-3 lg:grid-cols-9">
        <Stat label="Agreed scope" value={v.activeAgreement ? `v${v.activeAgreement.version} locked` : v.draftAgreement ? `v${v.draftAgreement.version} draft` : 'none'} sub={ag ? `${ag.requirements.length} reqs · ${ag.milestones.length} ms` : ''} />
        <Stat label="Current milestone" value={ms ? `${ms.id} ${money(ms.amount)}` : '—'} sub={st ? st.workStatus.replace(/_/g, ' ') : ''} />
        <Stat label="Work submitted" value={lastSub ? `rev ${lastSub.revision}` : 'none'} sub={lastSub ? new Date(lastSub.createdAt).toLocaleDateString() : ''} />
        <Stat label="QA status" value={lastQA ? (lastQA.status === 'RUNNING' ? 'running…' : lastQA.overall.replace(/_/g, ' ')) : '—'} />
        <Stat label="Client feedback" value={lastFb ? lastFb.rating.replace(/_/g, ' ').toLowerCase() : '—'} />
        <Stat label="Expert review" value={lastRv ? lastRv.status.replace(/_/g, ' ') : 'none'} />
        <Stat label="Money committed" value={money(m.committed)} sub={`${money(m.authorized)} authorized`} />
        <Stat label="Eligible for release" value={money(m.eligible)} tone="text-emerald-700" sub={`${money(m.underReview)} under review`} />
        <Stat label="Already paid" value={money(m.paid)} sub={m.simulated ? 'SIMULATED payments' : 'PayPal-confirmed'} />
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(([k, label]) => (
          <NavLink key={k} to={`/projects/${id}/${k}`} className={({ isActive }) => `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${isActive ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{label}</NavLink>
        ))}
      </nav>

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
    </main>
  );
}
