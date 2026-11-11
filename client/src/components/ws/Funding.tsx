import { useEffect, useState } from 'react';
import { api, money, d } from '../../api';
import { Badge, ErrorNote, Section, Stat, useAction } from '../ui';
import PayPalCheckout from '../PayPalCheckout';
import type { WsProps } from '../../pages/Workspace';

const OPTIONS = [
  { k: 'ADVANCE', title: 'Option 1 — Advance funding', text: 'Commit the agreed advance now. Each milestone must be funded before it starts.' },
  { k: 'PARTIAL', title: 'Option 2 — Partial funding', text: 'Commit the advance plus selected milestones. Others are funded when due; only funded milestones can start.' },
  { k: 'FULL', title: 'Option 3 — Full project funding', text: 'Commit the whole budget, allocated per milestone. Release still requires assessment and approval.' },
];

export default function Funding({ v, reload }: WsProps) {
  const p = v.project, party = v.party;
  const draft = v.draftAgreement, active = v.activeAgreement;
  const ag = draft || active;
  const [opt, setOpt] = useState(ag?.fundingPlan?.option || '');
  const [sel, setSel] = useState<string[]>(ag?.fundingPlan?.committedMilestones || []);
  const [rec, setRec] = useState<any>(ag?.fundingPlan?.aiRecommendation || null);
  const a = useAction();
  useEffect(() => { setOpt(ag?.fundingPlan?.option || ''); setSel(ag?.fundingPlan?.committedMilestones || []); }, [ag?.id, ag?.fundingPlan?.chosenAt]);
  if (!ag) return <Section title="Funding"><p className="muted">No agreement yet.</p></Section>;
  const m = v.money;

  const funded = (mid: string) => { const s = p.milestoneStates.find((x: any) => x.milestoneId === mid); return s ? s.authorized + s.captured : 0; };
  return (
    <div className="space-y-4">
      <Section title="Funding commitment vs. payment release">
        <p className="mb-3 text-sm text-ink-2"><b>Funding</b> is what the client commits through PayPal. <b>Release</b> is what the freelancer receives after a milestone is assessed and approved. These are separate decisions and separate numbers.</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Total budget" value={money(m.budget)} />
          <Stat label="Initial advance" value={money(m.advance)} sub={<Badge>{p.advance.status}</Badge>} />
          <Stat label="Amount committed" value={money(m.committed)} sub="per funding plan" />
          <Stat label="Authorized / captured" value={`${money(m.authorized)} / ${money(m.captured)}`} sub="PayPal-confirmed" />
          <Stat label="Awaiting funding" value={money(m.awaitingFunding)} />
          <Stat label="Eligible for release" value={money(m.eligible)} tone="text-released" />
          <Stat label="Already paid" value={money(m.paid)} />
          <Stat label="Under review / dispute" value={money(m.underReview)} tone="text-panel" />
          <Stat label="Expert fees (separate)" value={money(m.expertFees)} />
        </div>
      </Section>

      <Section title="Funding plan" actions={ag.fundingPlan && <Badge tone="blue">{`Chosen: ${ag.fundingPlan.option}`}</Badge>}>
        {!draft ? <p className="mb-3 text-sm text-ink-2">The funding plan is part of the locked agreement v{active.version}. To change it, propose a new agreement version.</p>
          : party !== 'client' ? <p className="mb-3 text-sm text-ink-2">The client chooses the plan; you accept it by approving the agreement.</p> : null}
        <div className="grid gap-3 md:grid-cols-3">
          {OPTIONS.map((o) => (
            <button key={o.k} disabled={!draft || party !== 'client'} onClick={() => setOpt(o.k)} className={`rounded-[4px] border p-3 text-left transition ${opt === o.k ? 'border-seal bg-seal-wash ring-2 ring-seal' : 'border-rule bg-white'} disabled:cursor-default`}>
              <div className="font-semibold text-ink">{o.title}</div><p className="mt-1 text-xs text-ink-2">{o.text}</p>
              <div className="mt-2 text-sm font-medium">Commit now: {money(o.k === 'FULL' ? ag.budget : o.k === 'ADVANCE' ? ag.advanceAmount : ag.advanceAmount + ag.milestones.filter((x: any) => sel.includes(x.id)).reduce((s: number, x: any) => s + x.amount, 0))}</div>
            </button>
          ))}
        </div>
        {opt === 'PARTIAL' && draft && party === 'client' && (
          <div className="mt-3 flex flex-wrap gap-3 text-sm">{ag.milestones.map((x: any) => (
            <label key={x.id} className="flex items-center gap-1"><input type="checkbox" checked={sel.includes(x.id)} onChange={(e) => setSel(e.target.checked ? [...sel, x.id] : sel.filter((y) => y !== x.id))} />{x.id} ({money(x.amount)})</label>
          ))}</div>
        )}
        {draft && party === 'client' && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={!opt || a.busy} onClick={() => a.run(async () => { const r = await api.post(`/projects/${p.id}/agreement/funding-plan`, { option: opt, committedMilestones: sel }); setRec(r.draft.fundingPlan.aiRecommendation); await reload(); })}>Save funding plan</button>
            <span className="text-xs text-ink-3">Saving clears approvals on the draft — the freelancer must accept the plan.</span>
          </div>
        )}
        {(rec || ag.fundingPlan?.aiRecommendation) && <div className="mt-3 rounded-[3px] bg-seal-wash p-3 text-sm text-seal"><b>AI recommendation (advisory): {(rec || ag.fundingPlan.aiRecommendation).option}.</b> {(rec || ag.fundingPlan.aiRecommendation).rationale}</div>}
        <ErrorNote error={a.error} />
      </Section>

      <Section title="Milestone-wise funding & allocation">
        {!active ? <p className="muted">Funding opens after both parties approve the agreement (scope, milestones and payment terms).</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-3"><tr><th className="py-1">Item</th><th>Amount</th><th>Committed?</th><th>Funded</th><th>Status</th><th>Authorization</th><th>Released / paid</th><th /></tr></thead>
              <tbody className="divide-y divide-rule">
                {active.advanceAmount > 0 && (
                  <tr><td className="py-2 font-medium">Advance (paid to freelancer on funding)</td><td>{money(active.advanceAmount)}</td><td>yes</td><td>{['FUNDING_REQUIRED', 'FUNDING_PENDING', 'PAYMENT_FAILED'].includes(p.advance.status) ? money(0) : money(active.advanceAmount)}</td><td><Badge>{p.advance.status}</Badge></td><td>capture</td><td>{money(p.advance.paid)}</td>
                    <td className="text-right">{party === 'client' && ['FUNDING_REQUIRED', 'FUNDING_PENDING', 'PAYMENT_FAILED'].includes(p.advance.status) && <PayPalCheckout projectId={p.id} target="ADVANCE" amount={active.advanceAmount} intent="CAPTURE" label="Pay advance" onDone={reload} />}</td></tr>
                )}
                {active.milestones.map((x: any) => {
                  const s = p.milestoneStates.find((y: any) => y.milestoneId === x.id);
                  const committed = active.fundingPlan?.option === 'FULL' || active.fundingPlan?.committedMilestones.includes(x.id);
                  const need = x.amount - funded(x.id);
                  return (
                    <tr key={x.id}>
                      <td className="py-2 font-medium">{x.id} {x.title}<div className="text-xs text-ink-3">due {d(x.dueDate)}</div></td>
                      <td>{money(x.amount)}</td><td>{committed ? 'yes (up front)' : 'when due'}</td><td>{money(funded(x.id))}</td><td><Badge>{s?.fundingStatus}</Badge></td>
                      <td className="text-xs">{s?.authorizationExpires ? <>expires {d(s.authorizationExpires)}<br />honor period to {d(s.honorPeriodEnds)}</> : '—'}</td>
                      <td>{money(s?.captured || 0)} / {money(s?.paid || 0)}</td>
                      <td className="text-right">{party === 'client' && need > 0 && s?.workStatus !== 'ACCEPTED' && <PayPalCheckout projectId={p.id} target={x.id} amount={need} intent="AUTHORIZE" label={`Fund ${money(need)}`} onDone={reload} disabled={active.advanceAmount > 0 && ['FUNDING_REQUIRED', 'FUNDING_PENDING', 'PAYMENT_FAILED'].includes(p.advance.status)} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-3">Funding status changes only after the server verifies PayPal's response. A PayPal authorization cannot be held indefinitely (≤29 days, 3-day honor period), so long projects fund milestones as they become due. Funds held by authorization are not escrow and VeriPay does not operate a wallet.</p>
          </div>
        )}
      </Section>
    </div>
  );
}
