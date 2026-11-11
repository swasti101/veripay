import { useEffect, useState } from 'react';
import { api, money, dt } from '../api';
import { Badge, Empty, ErrorNote, Section, SimTag, Spinner, useAction } from '../components/ui';

const VOTES = [
  ['COMPLIANT', 'Compliant — the requirement has been met'],
  ['PARTIALLY_COMPLIANT', 'Partially compliant — some of it has been met'],
  ['NOT_COMPLIANT', 'Not compliant — the requirement has not been met'],
  ['INSUFFICIENT_EVIDENCE', 'Insufficient evidence — no reliable conclusion'],
];

function Review({ r, reload }: { r: any; reload: () => Promise<void> }) {
  const mine = r.myAssignment;
  const [decl, setDecl] = useState('');
  const [votes, setVotes] = useState<Record<string, any>>({});
  const a = useAction();
  const closed = r.status === 'CLOSED' || r.status === 'INCONCLUSIVE';
  const set = (req: string, k: string, val: string) => setVotes({ ...votes, [req]: { ...(votes[req] || {}), [k]: val } });
  return (
    <Section title={<span className="flex flex-wrap items-center gap-2">{r.project.title} · {r.milestoneId} · {r.requirementIds.join(', ')} <Badge>{r.status}</Badge> <Badge>{mine.status}</Badge></span>}>
      <div className="mb-3 rounded-[3px] bg-paper p-3 text-sm">
        <div>Parties: client <b>{r.parties.client}</b>, freelancer <b>{r.parties.freelancer}</b>.</div>
        <div><b>Fixed review fee: {money(r.fee)}</b> (disclosed {dt(mine.feeDisclosedAt)}) — paid for a valid completed review regardless of how you vote.</div>
        <div className="text-xs text-ink-3">Why review was triggered: {r.triggers.join('; ')}</div>
      </div>
      {mine.status === 'INVITED' && (
        <div className="space-y-2">
          <label className="label">Conflict-of-interest declaration (required)</label>
          <textarea className="input" rows={2} value={decl} onChange={(e) => setDecl(e.target.value)} placeholder="e.g. I have no personal, financial or professional relationship with either party." />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={a.busy || !decl.trim()} onClick={() => a.run(async () => { await api.post(`/reviews/${r.id}/respond`, { accept: true, conflictDeclaration: decl }); await reload(); })}>Accept assignment</button>
            <button className="btn-secondary" disabled={a.busy || !decl.trim()} onClick={() => a.run(async () => { await api.post(`/reviews/${r.id}/respond`, { accept: true, hasConflict: true, conflictDeclaration: decl }); await reload(); })}>I have a conflict — recuse</button>
            <button className="btn-ghost" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/reviews/${r.id}/respond`, { accept: false }); await reload(); })}>Decline</button>
          </div>
        </div>
      )}
      {r.packet && (
        <details className="mb-3" open={mine.status === 'ACCEPTED'}>
          <summary className="cursor-pointer text-sm font-semibold">Evidence packet (identical for all reviewers)</summary>
          <div className="mt-2 grid gap-3 text-sm md:grid-cols-2">
            <div><div className="label">Approved requirement(s)</div>{r.packet.requirements.map((q: any) => <div key={q.id} className="mb-2"><b>{q.id} {q.title}</b> ({q.sowRef})<ul className="list-disc pl-4 text-xs">{q.acceptanceCriteria.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>{q.ambiguity && <div className="text-xs text-panel">Flagged wording: {q.ambiguity}</div>}<div className="text-xs">Clarification: {q.clarification || 'none approved'}</div></div>)}</div>
            <div><div className="label">AI QA findings (AI, not human)</div>{r.packet.qaResults.map((q: any) => <div key={q.requirementId} className="mb-2 text-xs"><Badge>{q.status}</Badge> {q.actual}<ul className="list-disc pl-4">{q.evidence.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul></div>)}</div>
            <div><div className="label">Submission</div><div className="text-xs">{r.packet.submission.url} — {r.packet.submission.notes}</div>{r.packet.submission.evidence.map((e: any, i: number) => <div key={i} className="text-xs">{e.path ? <a className="underline" href={e.path} target="_blank" rel="noreferrer">{e.label}</a> : e.label}{e.text && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-paper p-1">{e.text}</pre>}</div>)}</div>
            <div><div className="label">Kernel ({r.packet.kernel?.mode})</div><div className="text-xs">{r.packet.kernel?.note}</div><div className="label mt-2">Client feedback</div><div className="text-xs">{r.packet.feedback ? `${r.packet.feedback.rating}: ${r.packet.feedback.classification.map((c: any) => `[${c.category}] ${c.text}`).join(' · ')}` : 'none'}</div>
              <div className="label mt-2">Freelancer response</div><div className="text-xs">{r.packet.freelancerResponses?.join(' · ') || 'none'}</div><div className="label mt-2">Approved scope changes</div><div className="text-xs">{r.packet.scopeChanges?.map((s: any) => `${s.description} (${s.status})`).join(' · ') || 'none'}</div></div>
          </div>
        </details>
      )}
      {mine.status === 'ACCEPTED' && r.status === 'VOTING' && (
        <div className="space-y-3">
          {r.requirementIds.map((req: string) => (
            <div key={req} className="rounded-[3px] border border-rule p-3">
              <div className="mb-2 font-semibold">Your vote on {req}</div>
              <div className="grid gap-1 sm:grid-cols-2">{VOTES.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name={`${r.id}-${req}`} checked={votes[req]?.vote === k} onChange={() => set(req, 'vote', k)} />{l}</label>)}</div>
              <textarea className="input mt-2" rows={2} placeholder="Short reasoning (required)" value={votes[req]?.reasoning || ''} onChange={(e) => set(req, 'reasoning', e.target.value)} />
              <input className="input mt-2" placeholder="Supporting evidence you relied on (required)" value={votes[req]?.evidence || ''} onChange={(e) => set(req, 'evidence', e.target.value)} />
              <input className="input mt-2" placeholder="Optional recommendation (correction / partial acceptance)" value={votes[req]?.recommendation || ''} onChange={(e) => set(req, 'recommendation', e.target.value)} />
            </div>
          ))}
          <button className="btn-primary" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/reviews/${r.id}/votes`, { votes: r.requirementIds.map((req: string) => ({ requirementId: req, ...votes[req] })) }); await reload(); })}>Submit sealed vote</button>
          <p className="text-xs text-ink-3">Other reviewers' votes are hidden until the review closes.</p>
        </div>
      )}
      {mine.status === 'SUBMITTED' && !closed && <p className="text-sm text-released">Your vote is sealed. Results are revealed when voting closes.</p>}
      {closed && r.result && <div className="mt-2 text-sm"><b>Panel result:</b> {r.result.summary}<ul className="mt-1 list-disc pl-5 text-xs">{r.votes.map((vt: any, i: number) => <li key={i}>{vt.requirementId}: {vt.vote} — {vt.reasoning}</li>)}</ul></div>}
      <ErrorNote error={a.error} />
    </Section>
  );
}

export default function ExpertPortal() {
  const [data, setData] = useState<any>(null);
  const a = useAction();
  const reload = async () => setData(await api.get('/expert/assignments'));
  useEffect(() => { a.run(reload); }, []);
  if (!data) return <div className="p-8">{a.error ? <ErrorNote error={a.error} /> : <Spinner label="Loading…" />}</div>;
  const pr = data.profile;
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold">{pr.name}</h1>{pr.isSimulated && <SimTag label="SIMULATED expert profile" />}</div>
        <p className="text-ink-2">{pr.headline} · {pr.experience}</p>
        <p className="text-xs text-ink-3">{pr.credentialNote} · {pr.reviewsCompleted} reviews · rating {pr.rating ?? '—'} · payouts to {pr.paypalEmail || 'not set'}</p>
      </div>
      {data.reviews.length === 0 ? <Empty title="No review assignments">You are contacted only when a project dispute matches your expertise and you have no conflict with the parties.</Empty> : data.reviews.map((r: any) => <Review key={r.id} r={r} reload={reload} />)}
    </main>
  );
}
