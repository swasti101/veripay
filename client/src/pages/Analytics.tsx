import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AgCharts } from 'ag-charts-react';
import { api, money, d as fmtDate } from '../api';
import { useApp } from '../App';
import Grid, { badgeCell, moneyCell } from '../components/Grid';
import { Badge, Empty, ErrorNote, Section, SimTag, Spinner, Stat, useAction } from '../components/ui';
import { SERIES, SEQ_BLUE, QA_COLOR, VOTE_COLOR, RELEASE_COLOR, TEXT } from '../palette';

const QA_STATUSES = ['PASS', 'PARTIAL', 'FAIL', 'UNVERIFIED', 'NEEDS_CLARIFICATION', 'OUT_OF_SCOPE'];
const VOTES = ['COMPLIANT', 'PARTIALLY_COMPLIANT', 'NOT_COMPLIANT', 'INSUFFICIENT_EVIDENCE'];
const label = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
const common = { background: { visible: false }, legend: { position: 'bottom' as const, item: { label: { color: TEXT.secondary } } } };

export default function Analytics() {
  const { user } = useApp();
  const [a, setA] = useState<any>(null);
  const [showTables, setShowTables] = useState(false);
  const act = useAction();
  const nav = useNavigate();
  useEffect(() => { act.run(async () => setA(await api.get('/analytics'))); }, []);

  const heat = useMemo(() => {
    if (!a?.expertRows?.length) return null;
    const experts = [...new Set(a.expertRows.map((r: any) => r.expert))] as string[];
    const cols = [...new Set(a.expertRows.map((r: any) => `${r.projectId}|${r.milestoneId}|${r.requirementId}`))] as string[];
    const cell = (e: string, c: string) => a.expertRows.find((r: any) => r.expert === e && `${r.projectId}|${r.milestoneId}|${r.requirementId}` === c);
    return { experts, cols, cell };
  }, [a]);

  if (!a) return <main className="mx-auto max-w-7xl p-8">{act.error ? <ErrorNote error={act.error} /> : <Spinner label="Crunching analytics…" />}</main>;
  const h = a.headline;
  const nothing = !a.overTime.length && !a.qaOutcomes.length && !a.expertRows.length;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="muted">Across every project you are a party to{user.role === 'client' ? ' as client' : user.role === 'freelancer' ? ' as freelancer' : ''}. {h.simulated && <SimTag label="includes SIMULATED transactions" />}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowTables(!showTables)}>{showTables ? 'Hide' : 'Show'} data tables</button>
          <Link to="/" className="btn-ghost">Back to dashboard</Link>
        </div>
      </div>

      {nothing ? <Empty title="Not enough data yet">Submit a deliverable and run QA to populate analytics.</Empty> : (
        <>
          <div className="card grid grid-cols-2 gap-4 p-4 md:grid-cols-5">
            <Stat label="Platform fees" value={money(h.platformFees)} sub="SaaS revenue retained" />
            <Stat label="First-pass QA rate" value={h.firstPassRate === null ? '—' : `${h.firstPassRate}%`} sub="requirements PASS on latest run" tone={h.firstPassRate >= 70 ? 'text-emerald-700' : undefined} />
            <Stat label="Escalation rate" value={h.escalationRate === null ? '—' : `${h.escalationRate}%`} sub="submissions sent to experts" />
            <Stat label="Expert reviews closed" value={h.reviewsClosed} sub="with a quorum result" />
            <Stat label="Released to date" value={money(a.overTime.at(-1)?.released ?? 0)} sub={`of ${money(a.overTime.at(-1)?.funded ?? 0)} funded`} tone="text-emerald-700" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* 1 · Money over time — line, cumulative */}
            <Section title="Funding & earnings over time" actions={<span className="text-xs text-slate-500">cumulative, PayPal-confirmed</span>}>
              <div style={{ height: 280 }}>
                <AgCharts options={{
                  ...common,
                  data: a.overTime,
                  series: [
                    { type: 'line', xKey: 'date', yKey: 'funded', yName: 'Committed / funded', stroke: SERIES.s1, strokeWidth: 2, marker: { enabled: true, size: 8, fill: SERIES.s1, stroke: '#fcfcfb', strokeWidth: 2 }, tooltip: { renderer: (p: any) => ({ content: money(p.datum.funded) }) } },
                    { type: 'line', xKey: 'date', yKey: 'released', yName: 'Released to freelancer', stroke: SERIES.s3, strokeWidth: 2, marker: { enabled: true, size: 8, fill: SERIES.s3, stroke: '#fcfcfb', strokeWidth: 2 }, tooltip: { renderer: (p: any) => ({ content: money(p.datum.released) }) } },
                    { type: 'line', xKey: 'date', yKey: 'fees', yName: 'Platform + expert fees', stroke: SERIES.s2, strokeWidth: 2, marker: { enabled: true, size: 8, fill: SERIES.s2, stroke: '#fcfcfb', strokeWidth: 2 }, tooltip: { renderer: (p: any) => ({ content: money(p.datum.fees) }) } },
                  ] as any,
                  axes: [
                    { type: 'category', position: 'bottom', label: { color: TEXT.muted, formatter: (p: any) => fmtDate(p.value) } },
                    { type: 'number', position: 'left', label: { color: TEXT.muted, formatter: (p: any) => money(p.value) } },
                  ] as any,
                }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Funded = advances captured + milestone authorizations. Released = payouts actually confirmed by PayPal.</p>
            </Section>

            {/* 2 · QA outcomes by category — stacked bar */}
            <Section title="QA outcomes by requirement category">
              <div style={{ height: 280 }}>
                <AgCharts options={{
                  ...common,
                  data: a.qaOutcomes,
                  series: QA_STATUSES.map((s) => ({
                    type: 'bar', direction: 'horizontal', xKey: 'category', yKey: s, yName: label(s), stacked: true,
                    fill: QA_COLOR[s], cornerRadius: 4, strokeWidth: 2, stroke: '#fcfcfb',
                    label: { enabled: true, color: '#ffffff', fontSize: 11, formatter: (p: any) => (p.value > 0 ? String(p.value) : '') },
                  })) as any,
                  axes: [
                    { type: 'category', position: 'left', label: { color: TEXT.muted, formatter: (p: any) => label(p.value) } },
                    { type: 'number', position: 'bottom', label: { color: TEXT.muted }, interval: { step: 1 } },
                  ] as any,
                }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Latest completed QA run per milestone. Counts are labelled on each segment, so colour is never the only cue.</p>
            </Section>
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            {/* 3 · Release-type distribution — donut */}
            <Section title="Release-type distribution" className="lg:col-span-2">
              <div style={{ height: 290 }}>
                <AgCharts options={{
                  ...common,
                  data: a.releaseTypes.map((r: any) => ({ ...r, name: label(r.type) })),
                  series: [{
                    type: 'donut', angleKey: 'amount', legendItemKey: 'name', innerRadiusRatio: 0.65,
                    fills: a.releaseTypes.map((r: any) => RELEASE_COLOR[r.type] || SERIES.s1),
                    strokes: a.releaseTypes.map(() => '#fcfcfb'), strokeWidth: 2,
                    calloutLabelKey: 'name', calloutLabel: { color: TEXT.secondary },
                    sectorLabelKey: 'amount', sectorLabel: { color: '#ffffff', fontSize: 11, formatter: (p: any) => money(p.datum.amount) },
                    tooltip: { renderer: (p: any) => ({ title: label(p.datum.type), content: `${p.datum.count} milestone(s) · ${money(p.datum.amount)} eligible` }) },
                    innerLabels: [{ text: money(a.releaseTypes.reduce((s: number, r: any) => s + r.amount, 0)), fontSize: 18, color: TEXT.primary }, { text: 'eligible', fontSize: 11, color: TEXT.muted }],
                  }] as any,
                }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">By latest recommendation per milestone — amounts come from the approved agreement, never from a confidence score.</p>
            </Section>

            {/* 4 · Expert panel heatmap — CSS grid (AG Charts community has no heatmap series) */}
            <Section title="Expert panel outcomes" className="lg:col-span-3"
              actions={<span className="text-xs text-slate-500">custom grid — AG Charts community has no heatmap series</span>}>
              {!heat ? <p className="muted">No revealed expert reviews yet. Votes stay sealed until a review closes.</p> : (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="text-sm">
                      <thead>
                        <tr>
                          <th className="sticky left-0 bg-white py-1 pr-3 text-left text-xs font-semibold uppercase text-slate-500">Reviewer</th>
                          {heat.cols.map((c) => { const r = a.expertRows.find((x: any) => `${x.projectId}|${x.milestoneId}|${x.requirementId}` === c)!; return (
                            <th key={c} className="px-1 pb-1 text-center text-[11px] font-semibold text-slate-600" title={r.project}>{r.milestoneId}<br /><span className="font-normal text-slate-500">{r.requirementId}</span></th>
                          ); })}
                          <th className="px-2 text-center text-[11px] font-semibold uppercase text-slate-500">Panel</th>
                        </tr>
                      </thead>
                      <tbody>
                        {heat.experts.map((e) => (
                          <tr key={e}>
                            <td className="sticky left-0 whitespace-nowrap bg-white py-1 pr-3 text-xs">{e.replace(' (SIMULATED expert)', '')} {a.expertRows.find((r: any) => r.expert === e)?.simulated && <SimTag label="SIM" />}</td>
                            {heat.cols.map((c) => {
                              const cell = heat.cell(e, c);
                              const v = cell?.vote || 'NO_VOTE';
                              const abbr = { COMPLIANT: 'C', PARTIALLY_COMPLIANT: 'P', NOT_COMPLIANT: 'N', INSUFFICIENT_EVIDENCE: 'I', NO_VOTE: '·' }[v as string];
                              return (
                                <td key={c} className="p-0.5">
                                  <div className="grid h-9 w-14 place-items-center rounded-md text-xs font-bold ring-2 ring-white"
                                    style={{ background: VOTE_COLOR[v], color: v === 'NO_VOTE' ? TEXT.muted : '#fff' }}
                                    title={`${e} · ${cell?.requirementId}: ${label(v)}${cell?.reasoning ? ` — ${cell.reasoning}` : ''}`}>{abbr}</div>
                                </td>
                              );
                            })}
                            <td />
                          </tr>
                        ))}
                        <tr>
                          <td className="sticky left-0 bg-white py-1 pr-3 text-xs font-semibold">Panel result</td>
                          {heat.cols.map((c) => {
                            const r = a.expertRows.find((x: any) => `${x.projectId}|${x.milestoneId}|${x.requirementId}` === c)!;
                            const code = { COMPLIANT: 'C', PARTIALLY_COMPLIANT: 'P', NOT_COMPLIANT: 'N', INSUFFICIENT_EVIDENCE: 'I', INCONCLUSIVE: '?' }[r.panelOutcome as string] || '?';
                            return <td key={c} className="p-0.5 text-center"><div className="grid h-9 w-14 place-items-center rounded-md border-2 text-sm font-bold" style={{ borderColor: VOTE_COLOR[r.panelOutcome] || '#cbd5e1', color: TEXT.primary }} title={`Panel result: ${label(r.panelOutcome || 'INCONCLUSIVE')}`}>{code}</div></td>;
                          })}
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {VOTES.map((v) => <span key={v} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: VOTE_COLOR[v] }} />{label(v)} ({v[0] === 'P' ? 'P' : v[0] === 'I' ? 'I' : v[0]})</span>)}
                    <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-slate-200" />No vote (·)</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-slate-500 bg-white" />Outlined cell = aggregated panel result (? = inconclusive)</span>
                  </div>
                  {/* Compact tally — a second chart of the same votes would just duplicate the grid above. */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Votes cast</span>
                    {a.voteTally.filter((v: any) => v.count > 0).map((v: any) => (
                      <span key={v.vote} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-xs">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: VOTE_COLOR[v.vote] }} />
                        <b className="text-slate-800">{v.count}</b> <span className="text-slate-600">{label(v.vote)}</span>
                      </span>
                    ))}
                    <span className="text-xs text-slate-500">across {new Set(a.expertRows.map((r: any) => r.reviewId)).size} revealed panel(s)</span>
                  </div>
                </div>
              )}
            </Section>
          </div>

          {showTables && (
            <div className="space-y-5">
              <Section title="Table view — money over time">
                <Grid rows={a.overTime} height={240} cols={[
                  { field: 'date', headerName: 'Date', valueFormatter: (p: any) => fmtDate(p.value) },
                  { field: 'funded', headerName: 'Funded (cumulative)', cellRenderer: moneyCell },
                  { field: 'released', headerName: 'Released (cumulative)', cellRenderer: moneyCell },
                  { field: 'fees', headerName: 'Fees (cumulative)', cellRenderer: moneyCell },
                ]} />
              </Section>
              <Section title="Table view — QA outcomes by category">
                <Grid<any> rows={a.qaOutcomes} height={220} cols={[{ field: 'category', valueFormatter: (p: any) => label(p.value) }, ...QA_STATUSES.map((s) => ({ field: s, headerName: label(s) }))]} />
              </Section>
              <Section title="Table view — every expert vote">
                <Grid rows={a.expertRows} height={300} pagination onRowClicked={(r: any) => nav(`/projects/${r.projectId}/experts`)} cols={[
                  { field: 'project', minWidth: 200 }, { field: 'milestoneId', headerName: 'MS', maxWidth: 80 }, { field: 'requirementId', headerName: 'Req', maxWidth: 110 },
                  { field: 'expert', minWidth: 190 }, { field: 'expertise', maxWidth: 120 },
                  { field: 'vote', cellRenderer: badgeCell, minWidth: 180 }, { field: 'panelOutcome', headerName: 'Panel result', cellRenderer: badgeCell, minWidth: 170 },
                  { field: 'reasoning', minWidth: 320, flex: 2 },
                ]} />
              </Section>
              <Section title="Table view — release types">
                <Grid rows={a.releaseTypes} height={200} cols={[
                  { field: 'type', valueFormatter: (p: any) => label(p.value), cellRenderer: badgeCell },
                  { field: 'count', headerName: 'Milestones' }, { field: 'amount', headerName: 'Eligible amount', cellRenderer: moneyCell },
                ]} />
              </Section>
            </div>
          )}
          <p className="text-xs text-slate-500">Sequential ramp available for future magnitude charts: {SEQ_BLUE.length}-step single-hue blue. Status colours (good / warning / serious / critical) are reserved and never reused as series colours.</p>
        </>
      )}
    </main>
  );
}
