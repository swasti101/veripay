import { useState } from 'react';
import { api, money, dt } from '../../api';
import { useApp } from '../../App';
import { Badge, Empty, ErrorNote, Section, SimTag, Stat, useAction } from '../ui';
import Grid, { badgeCell, moneyCell, dateCell } from '../Grid';
import { ChallengeButton } from './Delivery';
import type { WsProps } from '../../pages/Workspace';

const TYPE_TEXT: Record<string, string> = {
  FULL_PAYMENT: 'Full agreed milestone payment', PARTIAL_PAYMENT: 'Partial payment from pre-agreed amounts or mutual agreement',
  UNDER_REVIEW: 'Amount stays under review', REVISION_REQUIRED: 'Revision required before release',
};

export default function Payments({ v, reload, mid }: WsProps) {
  const { user, refreshUser } = useApp();
  const p = v.project, party = v.party;
  const ag = v.activeAgreement;
  const allocs = v.allocations.filter((x: any) => x.milestoneId === mid);
  const cur = allocs.filter((x: any) => ['PROPOSED', 'APPROVED', 'CHALLENGED'].includes(x.status)).at(-1) || allocs.at(-1);
  const st = p.milestoneStates.find((s: any) => s.milestoneId === mid);
  const ms = ag?.milestones.find((m: any) => m.id === mid);
  const settlements = v.settlements.filter((s: any) => s.milestoneId === mid);
  const [stl, setStl] = useState({ amount: '', reason: '' });
  const [pemail, setPemail] = useState(user.paypalEmail || '');
  const a = useAction();
  if (!ag || !st) return <Empty title="Payments open once the agreement is approved" />;

  return (
    <div className="space-y-4">
      {party === 'freelancer' && !user.payoutOnboarded && (
        <Section title="Payout onboarding">
          <p className="mb-2 text-sm text-slate-600">Add the PayPal account that receives your payouts. Released amounts wait in AWAITING DISBURSEMENT until this is set.</p>
          <div className="flex gap-2"><input className="input max-w-sm" type="email" placeholder="you@paypal-sandbox.example" value={pemail} onChange={(e) => setPemail(e.target.value)} />
            <button className="btn-primary" disabled={a.busy} onClick={() => a.run(async () => { await api.patch('/me/payout', { paypalEmail: pemail }); await refreshUser(); })}>Save</button></div>
        </Section>
      )}

      <Section title={`Payment Allocation Engine — ${mid} ${ms?.title}`} actions={
        <button className="btn-primary" disabled={a.busy || st.workStatus === 'NOT_STARTED' || st.captured >= (ms?.amount || 0)} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/milestones/${mid}/allocation`); await reload(); })}>{cur ? 'Recalculate recommendation' : 'Generate recommendation'}</button>}>
        <div className="mb-3 grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Milestone amount (agreed)" value={money(ms?.amount)} />
          <Stat label="Authorized (unreleased)" value={money(st.authorized)} />
          <Stat label="Released (captured)" value={money(st.captured)} />
          <Stat label="Paid out" value={money(st.paid)} />
          <Stat label="Funding status" value={<Badge>{st.fundingStatus}</Badge>} />
        </div>
        <ErrorNote error={a.error} />
        {!cur ? <p className="muted">Generate a recommendation after QA (and feedback / expert review if applicable). It uses only the amounts in the approved agreement.</p> : (
          <div className="space-y-3">
            <div className={`rounded-xl border p-4 ${cur.releaseType === 'FULL_PAYMENT' ? 'border-emerald-200 bg-emerald-50' : cur.releaseType === 'PARTIAL_PAYMENT' ? 'border-amber-200 bg-amber-50' : 'border-violet-200 bg-violet-50'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Badge>{cur.releaseType}</Badge><Badge>{cur.status}</Badge>
                <span className="text-sm text-slate-700">{TYPE_TEXT[cur.releaseType]}</span>
                <span className="ml-auto text-xs text-slate-500">{dt(cur.createdAt)} · agreement v{cur.inputs.agreementVersion}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
                <Stat label="Eligible for release" value={money(cur.eligibleAmount)} tone="text-emerald-700" />
                <Stat label="Held / under review" value={money(cur.disputedAmount)} tone="text-violet-700" />
                <Stat label="Decision rule" value={<span className="whitespace-normal text-sm font-normal">{cur.rule}</span>} />
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Requirement</th><th>Effective status</th><th>Basis</th><th>Agreed amount</th><th>Treatment</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{cur.lines.map((l: any) => (
                <tr key={l.requirementId}><td className="py-1.5"><b>{l.requirementId}</b> {l.title}</td><td><Badge>{l.status}</Badge></td><td className="text-xs text-slate-600">{l.basis}</td><td>{money(l.amount)}</td><td><Badge tone={l.treatment === 'RELEASE' ? 'green' : 'violet'}>{l.treatment}</Badge></td></tr>
              ))}</tbody>
            </table>
            <div className="rounded-lg bg-slate-50 p-3"><div className="label">How this was calculated</div><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{cur.explanation.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul></div>
            {cur.challenges.length > 0 && <div className="text-sm text-rose-700">Challenged: {cur.challenges.map((c: any) => `${v.users[c.by]?.name}: ${c.text}`).join(' · ')}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Client approval: {cur.approvals.client ? <Badge tone="green">approved</Badge> : <Badge>pending</Badge>} · Freelancer acknowledgement: {cur.approvals.freelancer ? <Badge tone="green">acknowledged</Badge> : <Badge>pending</Badge>}</span>
              {['PROPOSED', 'APPROVED'].includes(cur.status) && !cur.approvals[party] && <button className="btn-success" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/allocations/${cur.id}/approve`); await reload(); })}>{party === 'client' ? `Approve release of ${money(cur.eligibleAmount)}` : 'Acknowledge recommendation'}</button>}
              {cur.status === 'APPROVED' && party === 'client' && cur.eligibleAmount > 0 && <button className="btn-primary" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/allocations/${cur.id}/execute`); await reload(); })}>Release {money(cur.eligibleAmount)} via PayPal</button>}
              {['PROPOSED', 'APPROVED'].includes(cur.status) && <ChallengeButton projectId={p.id} targetType="allocation" targetId={cur.id} label="Challenge recommendation" onDone={reload} />}
            </div>
            <p className="text-xs text-slate-500">Money moves only after the client approves and the freelancer acknowledges. Release = PayPal capture of the authorized amount (partial capture keeps the rest authorized) followed by a PayPal Payout to the freelancer.</p>
          </div>
        )}
      </Section>

      <Section title="Mutually agreed partial settlement">
        <p className="mb-2 text-sm text-slate-600">If the agreement has no measurable payment units for the accepted part, a partial amount can only be released when <b>both</b> parties agree to it.</p>
        {settlements.map((s: any) => (
          <div key={s.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm">
            <b>{money(s.amount)}</b> — {s.reason} <Badge>{s.status}</Badge> <span className="text-xs text-slate-500">proposed by {v.users[s.proposedBy]?.name}</span>
            {s.status === 'PROPOSED' && !s.approvals[party] && <><button className="btn-success" onClick={() => a.run(async () => { await api.post(`/settlements/${s.id}/decide`, { approve: true }); await reload(); })}>Agree</button><button className="btn-secondary" onClick={() => a.run(async () => { await api.post(`/settlements/${s.id}/decide`, { approve: false }); await reload(); })}>Decline</button></>}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <input className="input w-32" type="number" placeholder="Amount" value={stl.amount} onChange={(e) => setStl({ ...stl, amount: e.target.value })} />
          <input className="input flex-1" placeholder="Reason (what is being accepted)" value={stl.reason} onChange={(e) => setStl({ ...stl, reason: e.target.value })} />
          <button className="btn-secondary" disabled={a.busy || !stl.amount || !stl.reason} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/milestones/${mid}/settlements`, { amount: Number(stl.amount), reason: stl.reason }); setStl({ amount: '', reason: '' }); await reload(); })}>Propose</button>
        </div>
      </Section>

      {allocs.length > 1 && (
        <Section title="Recommendation history (permanent record)">
          <ul className="divide-y divide-slate-100 text-sm">{[...allocs].reverse().map((x: any) => <li key={x.id} className="flex flex-wrap gap-2 py-1.5"><span className="text-xs text-slate-500">{dt(x.createdAt)}</span><Badge>{x.releaseType}</Badge><Badge>{x.status}</Badge> eligible {money(x.eligibleAmount)} · held {money(x.disputedAmount)}</li>)}</ul>
        </Section>
      )}

      <Section title="PayPal transactions" actions={v.transactions.some((t: any) => t.mode === 'SIMULATED') && <SimTag label="SIMULATED entries — no money moved" />}>
        <Grid rows={[...v.transactions].reverse()} height={360} pagination cols={[
          { field: 'createdAt', headerName: 'When', cellRenderer: dateCell, minWidth: 170 }, { field: 'type', cellRenderer: badgeCell, minWidth: 200 }, { field: 'milestoneId', headerName: 'MS', maxWidth: 80 },
          { field: 'amount', cellRenderer: moneyCell, maxWidth: 110 }, { field: 'status', cellRenderer: badgeCell, minWidth: 170 },
          { field: 'mode', cellRenderer: (q: any) => (q.value === 'SIMULATED' ? <SimTag /> : <Badge tone="green">{q.value}</Badge>), maxWidth: 150 },
          { headerName: 'PayPal IDs', valueGetter: (q: any) => Object.entries(q.data.paypal).map(([k, val]) => `${k}: ${val}`).join(' · '), minWidth: 260 },
          { field: 'note', minWidth: 260 },
          { headerName: '', maxWidth: 110, sortable: false, filter: false, cellRenderer: (q: any) => (['FREELANCER_PAYOUT', 'EXPERT_FEE_PAYOUT'].includes(q.data.type) && (/PENDING|FAILED|AWAITING/.test(q.data.status)) ? <button className="btn-ghost text-xs" onClick={() => a.run(async () => { await api.post(`/transactions/${q.data.id}/refresh`); await reload(); })}>{/PENDING/.test(q.data.status) ? 'Refresh' : 'Retry'}</button> : null) },
        ]} />
      </Section>
    </div>
  );
}
