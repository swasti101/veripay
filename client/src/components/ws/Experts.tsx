import { useState } from 'react';
import { api, money, dt } from '../../api';
import { Badge, Empty, ErrorNote, Section, SimTag, useAction } from '../ui';
import PayPalCheckout from '../PayPalCheckout';
import { ChallengeButton } from './Delivery';
import type { WsProps } from '../../pages/Workspace';

export function ExpertCard({ e, status }: { e: any; status?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><b>{e.name}</b>{status && <Badge>{status}</Badge>}</div>
      <div className="text-slate-600">{e.headline}</div>
      <div className="text-xs text-slate-500">{e.experience}</div>
      <div className="mt-1 flex flex-wrap gap-1">{e.expertise.map((t: string) => <Badge key={t} tone="blue">{t}</Badge>)}</div>
      <div className="mt-1 text-xs">{e.credentialStatus === 'VERIFIED' ? <Badge tone="green">Verified</Badge> : <SimTag label="SIMULATED profile — not verified" />} · {e.reviewsCompleted} reviews · rating {e.rating ?? '—'}</div>
    </div>
  );
}

export default function Experts({ v, reload, mid }: WsProps) {
  const p = v.project, party = v.party;
  const ag = v.activeAgreement;
  const reviews = v.reviews.filter((r: any) => r.milestoneId === mid);
  const qa = v.qaRuns.filter((q: any) => q.milestoneId === mid && q.status === 'COMPLETE').at(-1);
  const [reason, setReason] = useState('');
  const a = useAction();
  if (!ag) return <Empty title="No approved agreement yet" />;
  const expertById = (id: string) => v.experts.find((e: any) => e.userId === id) || { name: v.users[id]?.name || id, expertise: [], credentialStatus: '' };
  const open = reviews.find((r: any) => r.status === 'AWAITING_FEE_ACK' || r.status === 'VOTING');
  const cfg = ag.expertReview;
  const triggers = qa?.results.filter((r: any) => r.status === 'NEEDS_CLARIFICATION' || (r.confidence === 'LOW' && r.status !== 'UNVERIFIED')).map((r: any) => r.requirementId) || [];

  return (
    <div className="space-y-4">
      {!open && !['ACCEPTED', 'CLOSED'].includes(p.milestoneStates.find((s: any) => s.milestoneId === mid)?.workStatus) && (
        <Section title="Independent human expert review">
          <p className="mb-2 text-sm text-slate-600">Used only when AI can't settle a material question: NEEDS_CLARIFICATION, low confidence, a client/freelancer disagreement, or feedback that conflicts with QA. Routine submissions don't need it. Fee: <b>{money(cfg.feePerReview)} per completed review</b> × panel of {cfg.panelSize} (quorum {cfg.quorum}), paid by <b>{cfg.feePayer}</b> — disclosed before anyone commits, independent of the vote, never deducted from milestone pay.</p>
          {!qa ? <p className="muted">Run QA first — experts receive the QA evidence packet.</p> : (
            <div className="space-y-2">
              {triggers.length > 0 ? <div className="rounded-lg bg-violet-50 p-2 text-sm text-violet-900">Escalation triggers detected for <b>{triggers.join(', ')}</b>.</div> : <p className="text-sm text-slate-600">No automatic trigger. Either party may still request a review under the agreed rules — give a reason.</p>}
              {triggers.length === 0 && <input className="input" placeholder="Reason for requesting expert review" value={reason} onChange={(e) => setReason(e.target.value)} />}
              <button className="btn-primary" disabled={a.busy || (triggers.length === 0 && !reason.trim())} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/milestones/${mid}/expert-review`, { reason }); setReason(''); await reload(); })}>Request expert review for {mid}</button>
            </div>
          )}
          <ErrorNote error={a.error} />
        </Section>
      )}

      {[...reviews].reverse().map((r: any) => {
        const total = r.fee * r.panelSize;
        const myShare = r.feeFunding.find((f: any) => f.party === party);
        const closed = r.status === 'CLOSED' || r.status === 'INCONCLUSIVE';
        return (
          <Section key={r.id} title={<span className="flex items-center gap-2">Expert panel · {r.requirementIds.join(', ')} <Badge>{r.status}</Badge></span>} actions={<span className="text-xs text-slate-500">opened {dt(r.createdAt)}{!closed && ` · voting closes ${dt(r.closesAt)}`}</span>}>
            <div className="mb-3 text-sm"><b>Why:</b> {r.triggers.join('; ')}</div>
            <div className="mb-3 grid gap-3 md:grid-cols-3">
              {r.assignments.map((x: any) => <ExpertCard key={x.expertId} e={expertById(x.expertId)} status={x.status === 'SUBMITTED' ? 'COMPLETED' : x.status === 'INVITED' ? 'PENDING' : x.status} />)}
            </div>
            {r.excludedExperts.length > 0 && <p className="mb-3 text-xs text-slate-500">Not assigned: {r.excludedExperts.map((x: any) => `${expertById(x.expertId).name} — ${x.reason}`).join('; ')}</p>}

            {r.status === 'AWAITING_FEE_ACK' && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <div><b>Fee disclosure:</b> {money(r.fee)} × {r.panelSize} reviewers = <b>{money(total)}</b>, paid by {r.feePayer}. Paid for a valid completed review, never contingent on the outcome. Recorded as a separate expense.</div>
                <div>Client: {r.feeAcks.client ? <Badge tone="green">acknowledged</Badge> : <Badge>pending</Badge>} · Freelancer: {r.feeAcks.freelancer ? <Badge tone="green">acknowledged</Badge> : <Badge>pending</Badge>} · Fee funding: {r.feeFunding.map((f: any) => `${f.party} ${money(f.amount)} ${f.status}`).join(', ')}</div>
                <div className="flex flex-wrap gap-2">
                  {!r.feeAcks[party] && <button className="btn-primary" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/reviews/${r.id}/ack-fee`); await reload(); })}>Acknowledge fee & review terms</button>}
                  {r.feeAcks[party] && myShare?.status === 'REQUIRED' && <PayPalCheckout projectId={p.id} target={`FEE:${r.id}`} amount={myShare.amount} intent="CAPTURE" label={`Pay expert fee ${money(myShare.amount)}`} onDone={reload} />}
                </div>
              </div>
            )}
            {r.status === 'VOTING' && (
              <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm">
                <div>Blind voting in progress: <b>{r.votesSubmitted}/{r.panelSize}</b> reviews submitted. Votes stay sealed — not visible to parties or other reviewers — until the review closes.</div>
                <div className="flex flex-wrap gap-2">
                  {p.isDemo && <button className="btn-secondary" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/reviews/${r.id}/simulate`); await reload(); })}>Generate votes for SIMULATED experts <SimTag label="DEMO" /></button>}
                  <button className="btn-ghost" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/reviews/${r.id}/close`); await reload(); })}>Close voting</button>
                </div>
                <p className="text-xs text-slate-600">Real reviewers vote from the expert portal (sign in as an expert account).</p>
              </div>
            )}
            {closed && r.result && (
              <div className="space-y-3">
                {r.result.perRequirement.map((x: any) => {
                  const req = ag.requirements.find((q: any) => q.id === x.requirementId);
                  return (
                    <div key={x.requirementId} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2"><b>{x.requirementId}</b> {req?.title} <span className="text-sm">Panel result:</span> <Badge>{x.outcome}</Badge>
                        <span className="text-xs text-slate-500">({x.tally.COMPLIANT} compliant · {x.tally.PARTIALLY_COMPLIANT} partial · {x.tally.NOT_COMPLIANT} not · {x.tally.INSUFFICIENT_EVIDENCE} insufficient; quorum {r.quorum})</span>
                        <span className="ml-auto"><ChallengeButton projectId={p.id} targetType="expert" targetId={r.id} requirementId={x.requirementId} label="Respond / challenge" onDone={reload} /></span></div>
                      <ul className="space-y-2">{r.votes.filter((vt: any) => vt.requirementId === x.requirementId).map((vt: any, i: number) => (
                        <li key={i} className={`rounded-md p-2 text-sm ${vt.vote === x.outcome ? 'bg-slate-50' : 'bg-amber-50'}`}>
                          <div className="flex flex-wrap items-center gap-2"><b>{expertById(vt.expertId).name}</b> <Badge>{vt.vote}</Badge>{vt.vote !== x.outcome && <Badge tone="amber">minority opinion</Badge>}{vt.simulated && <SimTag label={vt.generated ? 'SIMULATED vote (auto-generated)' : 'SIMULATED expert'} />}<span className="text-xs text-slate-500">{dt(vt.submittedAt)}</span></div>
                          <div className="mt-1">{vt.reasoning}</div>
                          <div className="text-xs text-slate-500">Evidence: {vt.evidence}{vt.recommendation && <> · Recommendation: {vt.recommendation}</>}</div>
                        </li>
                      ))}</ul>
                    </div>
                  );
                })}
                <p className="text-xs text-slate-500">Advisory mode: the panel result feeds the payment recommendation, which both parties review and acknowledge. Nothing transfers automatically.</p>
              </div>
            )}
            <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-slate-600">Evidence packet given identically to every reviewer</summary>
              <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify({ requirements: r.packet.requirements?.map((q: any) => ({ id: q.id, criteria: q.acceptanceCriteria, clarification: q.clarification })), qa: r.packet.qaResults, kernelMode: r.packet.kernel?.mode, feedback: r.packet.feedback, freelancerResponses: r.packet.freelancerResponses, submission: r.packet.submission }, null, 2)}</pre>
            </details>
          </Section>
        );
      })}

      <Section title="Vetted expert pool (controlled — not a marketplace)">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">{v.experts.map((e: any) => <ExpertCard key={e.userId} e={e} status={e.hasConflictWithParty ? 'CONFLICT DECLARED' : undefined} />)}</div>
      </Section>
    </div>
  );
}
