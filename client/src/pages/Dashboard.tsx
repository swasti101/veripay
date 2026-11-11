import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AgCharts } from 'ag-charts-react';
import { api, money, d } from '../api';
import { useApp } from '../App';
import Grid, { badgeCell, moneyCell, dateCell } from '../components/Grid';
import { Badge, Empty, ErrorNote, Figure, Section, SimTag, Spinner, useAction } from '../components/ui';
import { SERIES, TEXT } from '../palette';

const C = { committed: SERIES.s1, review: SERIES.s2, paid: SERIES.s3 };

export default function Dashboard() {
  const { user } = useApp();
  const [data, setData] = useState<any>(null);
  const [code, setCode] = useState('');
  const [filter, setFilter] = useState<'all' | 'needs-me' | 'active' | 'done'>('all');
  const nav = useNavigate();
  const a = useAction();
  useEffect(() => { a.run(async () => setData(await api.get('/dashboard'))); }, []);

  const totals = useMemo(() => {
    const p = data?.projects || [];
    const s = (k: string) => p.reduce((x: number, r: any) => x + (r[k] || 0), 0);
    return { committed: s('committed'), paid: s('paid'), eligible: s('eligible'), underReview: s('underReview'), authorized: s('authorized') };
  }, [data]);

  if (!data) return <main className="mx-auto max-w-[1400px] px-5 py-8">{a.error ? <ErrorNote error={a.error} /> : <Spinner label="Loading your projects…" />}</main>;

  const isClient = user.role === 'client';
  const pending = data.projects.flatMap((p: any) => p.pending.map((x: any) => ({ project: p.title, id: p.id, action: x.action, tab: x.tab })));
  const shown = data.projects.filter((p: any) =>
    filter === 'all' ? true
      : filter === 'needs-me' ? p.pending.length > 0
        : filter === 'active' ? p.status !== 'COMPLETED' : p.status === 'COMPLETED');
  const chartData = data.projects.map((p: any) => ({
    project: p.title.split('—')[0].trim(), paid: p.paid, review: p.underReview,
    committed: Math.max(0, p.committed - p.paid - p.underReview),
  }));

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">{isClient ? 'Projects you are funding' : 'Projects you are delivering'}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {isClient
              ? 'What you have committed, what is waiting on your approval, and where the money stands.'
              : 'What is funded, what you owe next, and what you have earned.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (code.trim()) nav(`/join/${code.trim().toUpperCase()}`); }}>
            <input className="input w-36" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn-secondary" disabled={!code.trim()}>Join</button>
          </form>
          <Link to="/new" className="btn-primary">Start a project</Link>
        </div>
      </div>

      {data.projects.length === 0 ? (
        <Empty title="No projects yet">
          Start one and upload the Statement of Work, or join a project you were invited to with its code.
        </Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          {/* ── Main column: the project record ── */}
          <div className="min-w-0 space-y-5">
            <div className="sheet">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
                <h2 className="h2">Projects</h2>
                <div className="flex gap-0.5">
                  {([['all', 'All'], ['needs-me', `Needs you${pending.length ? ` (${pending.length})` : ''}`], ['active', 'Active'], ['done', 'Completed']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setFilter(k)}
                      className={`rounded-[3px] px-2 py-1 text-[12px] transition-colors ${filter === k ? 'bg-paper font-medium text-ink' : 'text-ink-3 hover:text-ink'}`}>{l}</button>
                  ))}
                </div>
              </div>

              {shown.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-ink-3">Nothing matches that filter.</p>
              ) : (
                <div className="ledger">
                  {shown.map((p: any) => {
                    const pctPaid = p.committed > 0 ? Math.min(100, (p.paid / p.committed) * 100) : 0;
                    const pctReview = p.committed > 0 ? Math.min(100 - pctPaid, (p.underReview / p.committed) * 100) : 0;
                    return (
                      <Link key={p.id} to={`/projects/${p.id}`} className="block px-4 py-3 transition-colors hover:bg-paper">
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-[14px] font-medium text-ink">{p.title}</span>
                              <Badge>{p.status}</Badge>
                              {p.isDemo && <SimTag label={p.demoLabel ? p.demoLabel.toLowerCase() : 'demo'} />}
                            </div>
                            <div className="mt-0.5 text-[12px] text-ink-3">
                              {isClient ? 'Freelancer' : 'Client'} {p.counterpart} · {p.currentMilestone}
                              {p.nextDeadline ? ` · next deadline ${d(p.nextDeadline)}` : ''}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[15px] font-semibold tabular-nums text-ink" style={{ fontFamily: 'var(--font-display)' }}>{money(p.paid)}</div>
                            <div className="text-[11px] text-ink-3">of {money(p.committed)} committed</div>
                          </div>
                        </div>

                        {/* The bar is the record, not decoration: paid / held / committed-not-released. */}
                        <div className="mt-2 flex h-1 w-full overflow-hidden rounded-[1px] bg-rule">
                          <span style={{ width: `${pctPaid}%`, background: C.paid }} />
                          <span style={{ width: `${pctReview}%`, background: C.review }} />
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
                          <span>{p.milestonesDone}/{p.milestonesTotal} milestones accepted</span>
                          <span>Work <Badge>{String(p.currentWork)}</Badge></span>
                          <span>Funding <Badge>{String(p.currentFunding)}</Badge></span>
                          {p.expertReview !== 'NONE' && <span>Panel <Badge>{String(p.expertReview)}</Badge></span>}
                          {p.underReview > 0 && <span className="text-hold">{money(p.underReview)} held under review</span>}
                          {p.pending.length > 0 && <span className="font-medium text-seal">{p.pending.length} waiting on you</span>}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <Section title="Milestones and deadlines">
              <Grid rows={data.milestones} height={300} onRowClicked={(r: any) => nav(`/projects/${r.projectId}`)} cols={[
                { field: 'project', minWidth: 190 }, { field: 'id', headerName: 'MS', maxWidth: 70 }, { field: 'title', minWidth: 150 },
                { field: 'dueDate', headerName: 'Due', valueFormatter: (p: any) => d(p.value), maxWidth: 120, sort: 'asc' },
                { field: 'amount', cellRenderer: moneyCell, maxWidth: 100 },
                { field: 'workStatus', headerName: 'Work', cellRenderer: badgeCell },
                { field: 'fundingStatus', headerName: 'Funding', cellRenderer: badgeCell },
                { field: 'paid', cellRenderer: moneyCell, maxWidth: 100 },
              ]} />
            </Section>

            <Section title={isClient ? 'Payment history' : 'Earnings and payment history'}
              actions={data.transactions.some((t: any) => t.mode === 'SIMULATED') && <SimTag label="contains simulated entries" />}>
              <Grid rows={[...data.transactions].reverse()} height={320} pagination cols={[
                { field: 'createdAt', headerName: 'When', cellRenderer: dateCell, minWidth: 160 },
                { field: 'project', minWidth: 180 }, { field: 'type', cellRenderer: badgeCell, minWidth: 180 },
                { field: 'milestoneId', headerName: 'MS', maxWidth: 70 },
                { field: 'amount', cellRenderer: moneyCell, maxWidth: 110 },
                { field: 'status', cellRenderer: badgeCell },
                { field: 'mode', cellRenderer: (q: any) => (q.value === 'SIMULATED' ? <SimTag /> : <Badge tone="released">{q.value}</Badge>) },
              ]} />
            </Section>
          </div>

          {/* ── Money rail: always on screen, because that is the product's point ── */}
          <aside className="space-y-5">
            <div className="sheet">
              <div className="border-b border-rule px-4 py-2.5"><h2 className="h2">Where the money stands</h2></div>
              <div className="px-4 py-1">
                <Figure label={isClient ? 'Committed' : 'Committed to you'} value={money(totals.committed)} sub="under approved funding plans" />
                <Figure label="Authorized, not released" value={money(totals.authorized)} sub="held by PayPal authorization" />
                <Figure label="Eligible for release" value={money(totals.eligible)} tone="text-released" sub="awaiting approvals" />
                <Figure label="Held under review" value={money(totals.underReview)} tone="text-hold" sub="disputed or pending a panel" />
                <Figure label={isClient ? 'Paid out' : 'Earned'} value={money(totals.paid)} tone="text-ink" />
              </div>
            </div>

            <div className="sheet">
              <div className="border-b border-rule px-4 py-2.5">
                <h2 className="h2">Waiting on you{pending.length > 0 && <span className="ml-1.5 text-[13px] font-normal text-seal">{pending.length}</span>}</h2>
              </div>
              {pending.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-ink-3">Nothing needs your decision right now.</p>
              ) : (
                <div className="ledger">
                  {pending.map((p: any, i: number) => (
                    <Link key={i} to={`/projects/${p.id}/${p.tab}`} className="block px-4 py-2.5 transition-colors hover:bg-paper">
                      <div className="text-[13px] font-medium text-ink">{p.action}</div>
                      <div className="truncate text-[11px] text-ink-3">{p.project}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Section title="Money by project">
              <div style={{ height: 200 }}>
                <AgCharts options={{
                  data: chartData, background: { visible: false },
                  series: [
                    { type: 'bar', direction: 'horizontal', xKey: 'project', yKey: 'paid', yName: 'Paid', stacked: true, fill: C.paid, cornerRadius: 2, stroke: '#fff', strokeWidth: 2 },
                    { type: 'bar', direction: 'horizontal', xKey: 'project', yKey: 'review', yName: 'Held', stacked: true, fill: C.review, stroke: '#fff', strokeWidth: 2 },
                    { type: 'bar', direction: 'horizontal', xKey: 'project', yKey: 'committed', yName: 'Not yet released', stacked: true, fill: C.committed, stroke: '#fff', strokeWidth: 2 },
                  ] as any,
                  axes: [
                    { type: 'category', position: 'left', label: { color: TEXT.muted, fontSize: 11 } },
                    { type: 'number', position: 'bottom', label: { color: TEXT.muted, fontSize: 11, formatter: (p: any) => money(p.value) } },
                  ] as any,
                  legend: { position: 'bottom', item: { label: { color: TEXT.secondary, fontSize: 11 } } },
                }} />
              </div>
            </Section>
          </aside>
        </div>
      )}
    </main>
  );
}
