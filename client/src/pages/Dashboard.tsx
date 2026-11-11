import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AgCharts } from 'ag-charts-react';
import { api, money, d } from '../api';
import { useApp } from '../App';
import Grid, { badgeCell, moneyCell, dateCell } from '../components/Grid';
import { Badge, Empty, Section, SimTag, Spinner, Stat, ErrorNote, useAction } from '../components/ui';

import { SERIES } from '../palette';

// Categorical slots 1–3 of the validated palette (all-pairs safe in light mode).
const C = { committed: SERIES.s1, review: SERIES.s2, paid: SERIES.s3 };

export default function Dashboard() {
  const { user } = useApp();
  const [data, setData] = useState<any>(null);
  const [code, setCode] = useState('');
  const nav = useNavigate();
  const a = useAction();
  useEffect(() => { a.run(async () => setData(await api.get('/dashboard'))); }, []);

  const totals = useMemo(() => {
    const p = data?.projects || [];
    const s = (k: string) => p.reduce((x: number, r: any) => x + (r[k] || 0), 0);
    return { committed: s('committed'), paid: s('paid'), eligible: s('eligible'), underReview: s('underReview'), authorized: s('authorized') };
  }, [data]);
  if (!data) return <div className="p-8">{a.error ? <ErrorNote error={a.error} /> : <Spinner label="Loading dashboard…" />}</div>;

  const pending = data.projects.flatMap((p: any) => p.pending.map((x: any) => ({ project: p.title, id: p.id, action: x.action, tab: x.tab })));
  const chartData = data.projects.map((p: any) => ({ project: p.title.split('—')[0].trim(), paid: p.paid, review: p.underReview, committed: Math.max(0, p.committed - p.paid - p.underReview) }));
  const fundingCounts = Object.entries(data.milestones.reduce((acc: any, m: any) => { acc[m.fundingStatus || 'FUNDING_REQUIRED'] = (acc[m.fundingStatus || 'FUNDING_REQUIRED'] || 0) + 1; return acc; }, {})).map(([status, count]) => ({ status: status.replace(/_/g, ' '), count }));
  const isClient = user.role === 'client';

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isClient ? 'Client dashboard' : 'Freelancer dashboard'}</h1>
          <p className="muted">{isClient ? 'Projects you fund, approvals waiting on you, and where your money is.' : 'Projects you deliver, what is funded, and what you have earned.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/board" className="btn-secondary">Delivery board</Link>
          <Link to="/analytics" className="btn-secondary">Analytics</Link>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) nav(`/join/${code.trim().toUpperCase()}`); }}>
            <input className="input w-40" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn-secondary" disabled={!code.trim()}>Join</button>
          </form>
          <Link to="/new" className="btn-primary">+ New project</Link>
        </div>
      </div>

      <div className="card grid grid-cols-2 gap-4 p-4 md:grid-cols-5">
        <Stat label="Active projects" value={data.projects.filter((p: any) => p.status !== 'COMPLETED').length} sub={`${data.projects.length} total`} />
        <Stat label={isClient ? 'Committed' : 'Committed to you'} value={money(totals.committed)} sub="per approved funding plans" />
        <Stat label="Authorized (unreleased)" value={money(totals.authorized)} sub="PayPal authorizations" />
        <Stat label="Eligible for release" value={money(totals.eligible)} tone="text-emerald-700" sub="awaiting approvals" />
        <Stat label={isClient ? 'Paid out' : 'Earned (paid)'} value={money(totals.paid)} sub={`${money(totals.underReview)} under review`} />
      </div>

      {data.projects.length === 0 ? (
        <Empty title="No projects yet">Create a project and upload a SOW, or join one with an invite code.</Empty>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <Section title="Pending approvals & actions" className="lg:col-span-1">
              {pending.length === 0 ? <p className="muted">Nothing is waiting on you.</p> : (
                <ul className="divide-y divide-slate-100">
                  {pending.map((p: any, i: number) => (
                    <li key={i} className="py-1">
                      <Link to={`/projects/${p.id}/${p.tab}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition hover:bg-indigo-50">
                        <span className="min-w-0"><span className="block text-sm font-medium text-slate-800">{p.action}</span><span className="block truncate text-xs text-slate-500">{p.project}</span></span>
                        <span className="btn-secondary shrink-0" aria-hidden="true">Open</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Money by project" className="lg:col-span-2">
              <div style={{ height: 240 }}>
                <AgCharts options={{
                  data: chartData, background: { visible: false },
                  series: [
                    { type: 'bar', direction: 'horizontal', xKey: 'project', yKey: 'paid', yName: 'Paid', stacked: true, fill: C.paid, cornerRadius: 4 },
                    { type: 'bar', direction: 'horizontal', xKey: 'project', yKey: 'review', yName: 'Under review / held', stacked: true, fill: C.review },
                    { type: 'bar', direction: 'horizontal', xKey: 'project', yKey: 'committed', yName: 'Committed, not yet released', stacked: true, fill: C.committed },
                  ] as any,
                  axes: { x: { type: 'number', position: 'bottom', label: { formatter: (p: any) => money(p.value) } }, y: { type: 'category', position: 'left' } } as any,
                  legend: { position: 'bottom' },
                }} />
              </div>
            </Section>
          </div>

          <Section title="Projects">
            <Grid rows={data.projects} height={260} onRowClicked={(r: any) => nav(`/projects/${r.id}`)} cols={[
              { field: 'title', headerName: 'Project', minWidth: 240, cellRenderer: (p: any) => <span className="font-medium">{p.value} {p.data.isDemo && <SimTag label="DEMO" />}</span> },
              { field: 'status', cellRenderer: badgeCell, maxWidth: 130 },
              { field: 'counterpart', headerName: isClient ? 'Freelancer' : 'Client' },
              { field: 'currentMilestone', headerName: 'Current milestone' },
              { field: 'currentWork', headerName: 'Work', cellRenderer: badgeCell },
              { field: 'currentFunding', headerName: 'Funding', cellRenderer: badgeCell },
              { field: 'nextDeadline', headerName: 'Next deadline', valueFormatter: (p: any) => d(p.value), maxWidth: 140 },
              { headerName: 'Done', valueGetter: (p: any) => `${p.data.milestonesDone}/${p.data.milestonesTotal}`, maxWidth: 90 },
              { field: 'expertReview', headerName: 'Expert review', cellRenderer: badgeCell },
              { field: 'paid', headerName: 'Paid', cellRenderer: moneyCell, maxWidth: 120 },
            ]} />
          </Section>

          <div className="grid gap-5 lg:grid-cols-3">
            <Section title="Milestones & deadlines" className="lg:col-span-2">
              <Grid rows={data.milestones} height={300} onRowClicked={(r: any) => nav(`/projects/${r.projectId}`)} cols={[
                { field: 'project', minWidth: 200 }, { field: 'id', headerName: 'MS', maxWidth: 80 }, { field: 'title', minWidth: 160 },
                { field: 'dueDate', headerName: 'Due', valueFormatter: (p: any) => d(p.value), maxWidth: 130, sort: 'asc' },
                { field: 'amount', cellRenderer: moneyCell, maxWidth: 110 }, { field: 'workStatus', headerName: 'Work', cellRenderer: badgeCell },
                { field: 'fundingStatus', headerName: 'Funding', cellRenderer: badgeCell }, { field: 'paid', cellRenderer: moneyCell, maxWidth: 110 },
              ]} />
            </Section>
            <Section title="Milestones by funding status">
              <div style={{ height: 300 }}>
                <AgCharts options={{
                  data: fundingCounts, background: { visible: false },
                  series: [{ type: 'bar', direction: 'horizontal', xKey: 'status', yKey: 'count', yName: 'Milestones', fill: C.committed, cornerRadius: 4, label: { enabled: true, placement: 'outside-end' } }] as any,
                  axes: { x: { type: 'number', position: 'bottom', interval: { step: 1 } }, y: { type: 'category', position: 'left' } } as any,
                  legend: { enabled: false },
                }} />
              </div>
            </Section>
          </div>

          <Section title={isClient ? 'Payment history' : 'Earnings & payment history'} actions={data.transactions.some((t: any) => t.mode === 'SIMULATED') && <SimTag label="contains SIMULATED transactions" />}>
            <Grid rows={[...data.transactions].reverse()} height={320} pagination cols={[
              { field: 'createdAt', headerName: 'When', cellRenderer: dateCell, minWidth: 170 }, { field: 'project', minWidth: 200 }, { field: 'type', cellRenderer: badgeCell, minWidth: 190 },
              { field: 'milestoneId', headerName: 'MS', maxWidth: 80 }, { field: 'amount', cellRenderer: moneyCell, maxWidth: 120 }, { field: 'status', cellRenderer: badgeCell },
              { field: 'mode', cellRenderer: (p: any) => (p.value === 'SIMULATED' ? <SimTag /> : <Badge tone="green">{p.value}</Badge>) },
            ]} />
          </Section>
        </>
      )}
    </main>
  );
}
