import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, d as fmtDate } from '../api';
import { Badge, Empty, ErrorNote, Section, SimTag, Spinner, Stat, useAction } from '../components/ui';

const DeliveryGantt = lazy(() => import('../components/boards/DeliveryGantt'));
const ReviewTriage = lazy(() => import('../components/boards/ReviewTriage'));

const SEV: Record<string, string> = { critical: 'border-refuse/40 bg-refuse-wash text-rose-900', warning: 'border-hold/40 bg-hold-wash text-hold', info: 'border-sky-300 bg-seal-wash text-seal' };

export default function Board() {
  const [b, setB] = useState<any>(null);
  const [tab, setTab] = useState<'delivery' | 'reviews'>('delivery');
  const a = useAction();
  const load = () => a.run(async () => setB(await api.get('/board')));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') api.get('/board').then(setB).catch(() => {}); }, 15000);
    return () => clearInterval(t);
  }, []);

  if (!b) return <main className="mx-auto max-w-7xl p-8">{a.error ? <ErrorNote error={a.error} /> : <Spinner label="Building board…" />}</main>;

  const blocked = b.projects.flatMap((p: any) => p.milestones.filter((m: any) => m.blockedByFunding));
  const atRisk = b.assignments.filter((x: any) => x.quorumAtRisk);
  const frozen = [...new Set(b.assignments.filter((x: any) => x.status === 'VOTING' || x.status === 'AWAITING_FEE_ACK').map((x: any) => x.reviewId))]
    .map((id) => b.assignments.find((x: any) => x.reviewId === id))
    .reduce((s: number, x: any) => s + (x?.disputedAmount || 0), 0);

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Delivery board</h1>
          <p className="muted">Every project you are a party to, on one timeline — with funding shown as what it actually is: a predecessor of the work.</p>
        </div>
        <Link to="/" className="btn-ghost">Back to dashboard</Link>
      </div>

      <div className="card grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        <Stat label="Projects on board" value={b.projects.length} sub={`${b.projects.reduce((n: number, p: any) => n + p.milestones.length, 0)} milestones`} />
        <Stat label="Blocked on funding" value={blocked.length} tone={blocked.length ? 'text-refuse' : undefined} sub={blocked.length ? `${money(blocked.reduce((s: number, m: any) => s + m.fundingGap, 0))} to unblock` : 'nothing waiting'} />
        <Stat label="Quorum at risk" value={atRisk.length} tone={atRisk.length ? 'text-refuse' : undefined} sub="reviews closing without enough votes" />
        <Stat label="Frozen in review" value={money(frozen)} tone="text-panel" sub="disputed, pending a panel result" />
      </div>

      {b.flags.length > 0 && (
        <Section title="What a payment event is doing to the schedule" actions={<span className="text-xs text-ink-3">flags only — the agreed baseline is never moved automatically</span>}>
          <ul className="space-y-2">
            {b.flags.slice(0, 8).map((f: any, i: number) => (
              <li key={i}>
                <Link to={`/projects/${f.projectId}/${f.tab}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-[3px] border px-3 py-2 text-sm transition hover:brightness-95 ${SEV[f.severity]}`}>
                  <span><b className="uppercase">{f.severity}</b> · {f.text}</span>
                  <span className="text-xs opacity-80">{f.project}{f.milestoneId ? ` · ${f.milestoneId}` : ''} →</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-3">
            Dates come from the agreement both parties approved. Neither party — and no agent — can shift them unilaterally;
            a change needs a new agreement version that both approve. So these are proposals for a human, not applied reschedules.
          </p>
        </Section>
      )}

      <div className="flex gap-1 border-b border-rule">
        {([['delivery', 'Delivery timeline (Gantt)'], ['reviews', 'Expert review triage']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-seal text-seal' : 'border-transparent text-ink-2 hover:text-ink'}`}>{label}</button>
        ))}
      </div>

      {tab === 'delivery' ? (
        b.projects.length === 0 ? <Empty title="No projects with an agreement yet" /> : (
          <Section title="Multi-project delivery timeline" actions={<span className="text-xs text-ink-3">Bryntum Gantt (trial)</span>}>
            <p className="mb-2 text-xs text-ink-3">
              Each project is a parent row. A <b>funding tranche</b> appears as its own task and is wired as a
              <b> predecessor</b> of the milestone it pays for, so an unpaid tranche visibly blocks the next phase.
              Blocked milestones are striped red; a lapsing authorization is marked on the bar.
            </p>
            <Suspense fallback={<Spinner label="Loading Bryntum Gantt…" />}><DeliveryGantt board={b} /></Suspense>
          </Section>
        )
      ) : (
        b.assignments.length === 0 ? <Empty title="No expert reviews assigned yet">Escalate an ambiguous requirement from a project's Expert review tab and reviewers appear here.</Empty> : (
          <Section title="Expert review triage" actions={<span className="text-xs text-ink-3">Bryntum Gantt (trial) — resource view</span>}>
            <p className="mb-2 text-xs text-ink-3">
              One row per reviewer, one bar per assigned review, spanning invitation to the close of voting.
              Bars are flagged when a review has a <b>deadline but no progress</b> — invited and never answered,
              accepted but never voted, or closing short of quorum, which leaves the disputed amount frozen.
              (A Bryntum Scheduler is the natural widget here, but combining Scheduler with Gantt needs Bryntum's
              licence-gated <i>thin</i> bundles, so this is the same resource-vs-time view built on the trial Gantt.)
            </p>
            <Suspense fallback={<Spinner label="Loading Bryntum Scheduler…" />}><ReviewTriage board={b} /></Suspense>
          </Section>
        )
      )}

      <Section title="Funding tranches vs. phases">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-3"><tr><th className="py-1">Project</th><th>Milestone</th><th>Due</th><th>Tranche</th><th>Funded</th><th>Work</th><th>Blocking?</th></tr></thead>
            <tbody className="divide-y divide-rule">
              {b.projects.flatMap((p: any) => p.milestones.map((m: any) => (
                <tr key={p.id + m.id} className={m.blockedByFunding ? 'bg-refuse-wash' : undefined}>
                  <td className="py-1.5">{p.title.split('—')[0].trim()} {p.isDemo && <SimTag label="DEMO" />}</td>
                  <td><Link className="text-seal underline" to={`/projects/${p.id}/timeline`}>{m.id} {m.title}</Link></td>
                  <td>{fmtDate(m.dueDate)}{m.overdue && <Badge tone="red">overdue</Badge>}</td>
                  <td>{money(m.amount)}</td>
                  <td>{money(m.funded)}{m.fundingGap > 0 && <span className="text-refuse"> (−{money(m.fundingGap)})</span>}</td>
                  <td><Badge>{m.workStatus}</Badge></td>
                  <td>{m.blockedByFunding ? <Badge tone="red">blocks next phase</Badge> : m.authExpiresBeforeDue ? <Badge tone="amber">auth lapses first</Badge> : <span className="text-ink-3">—</span>}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  );
}
