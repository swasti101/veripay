import { useState } from 'react';
import { api, money, dt } from '../../api';
import { Badge, ErrorNote, Section, useAction } from '../ui';
import type { WsProps } from '../../pages/Workspace';

function FreelancerQuote({ s, reload }: { s: any; reload: () => Promise<void> }) {
  const [q, setQ] = useState({ cost: '', days: '', note: '' });
  const a = useAction();
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <input className="input w-32" type="number" placeholder="Cost $" value={q.cost} onChange={(e) => setQ({ ...q, cost: e.target.value })} />
        <input className="input w-28" type="number" placeholder="Days" value={q.days} onChange={(e) => setQ({ ...q, days: e.target.value })} />
        <input className="input flex-1" placeholder="Note" value={q.note} onChange={(e) => setQ({ ...q, note: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={a.busy || !q.cost || !q.days} onClick={() => a.run(async () => { await api.post(`/scope-changes/${s.id}/freelancer`, { willing: true, cost: Number(q.cost), days: Number(q.days), note: q.note }); await reload(); })}>Offer to do it</button>
        <button className="btn-secondary" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/scope-changes/${s.id}/freelancer`, { willing: false, note: q.note }); await reload(); })}>Decline</button>
      </div>
      <ErrorNote error={a.error} />
    </div>
  );
}

export default function Scope({ v, reload }: WsProps) {
  const p = v.project, party = v.party;
  const [desc, setDesc] = useState('');
  const a = useAction();
  const challenges = v.messages.filter((m: any) => m.kind === 'challenge' || m.kind === 'response');
  return (
    <div className="space-y-4">
      <Section title="Scope-change requests">
        <p className="mb-3 text-sm text-slate-600">New requests are compared with the approved SOW. Out-of-scope work never counts against existing delivery: the freelancer may price it, the client approves or declines, and the agreement updates only after both approve (as a new version with its own milestone).</p>
        {v.activeAgreement && (
          <div className="mb-4 flex gap-2">
            <input className="input" placeholder="Describe the additional work or change" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <button className="btn-primary" disabled={a.busy || !desc.trim()} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/scope-changes`, { description: desc }); setDesc(''); await reload(); })}>Check against SOW</button>
          </div>
        )}
        <ErrorNote error={a.error} />
        {v.scopeChanges.length === 0 ? <p className="muted">No scope-change requests.</p> : [...v.scopeChanges].reverse().map((s: any) => (
          <div key={s.id} className="mb-3 rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><Badge>{s.status}</Badge><b>{s.description}</b><span className="ml-auto text-xs text-slate-500">{dt(s.createdAt)} · {v.users[s.requestedBy]?.name}{s.sourceFeedbackId && ' · from client feedback'}</span></div>
            <div className="mt-1 text-slate-600"><Badge tone={s.analysis.outOfScope ? 'blue' : 'green'}>{s.analysis.outOfScope ? 'OUT OF SCOPE' : 'ALREADY IN SCOPE'}</Badge> {s.analysis.reason} <span className="text-xs text-slate-400">({s.analysis.source})</span></div>
            {s.freelancerResponse && <div className="mt-1">Freelancer: {s.freelancerResponse.willing ? <>will do it for <b>{money(s.freelancerResponse.cost)}</b> in {s.freelancerResponse.days} days</> : 'declined'} {s.freelancerResponse.note && `— ${s.freelancerResponse.note}`}</div>}
            {s.clientDecision && <div className="mt-1">Client: {s.clientDecision.approved ? `approved → agreement v${s.resultingAgreementVersion}` : 'declined'}</div>}
            {s.status === 'AWAITING_FREELANCER' && party === 'freelancer' && <FreelancerQuote s={s} reload={reload} />}
            {s.status === 'AWAITING_CLIENT' && party === 'client' && (
              <div className="mt-2 flex gap-2">
                <button className="btn-success" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/scope-changes/${s.id}/client`, { approved: true }); await reload(); })}>Approve quote (new agreement version)</button>
                <button className="btn-secondary" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/scope-changes/${s.id}/client`, { approved: false }); await reload(); })}>Decline</button>
              </div>
            )}
          </div>
        ))}
      </Section>
      <Section title="Disputes, challenges & responses">
        <p className="mb-3 text-sm text-slate-600">Disputes about existing delivery follow the agreed process: both parties explain, the SOW and approved changes are checked, QA runs, missing evidence is requested, and expert review is triggered if ambiguity remains.</p>
        {challenges.length === 0 ? <p className="muted">No challenges raised.</p> : (
          <ul className="space-y-2">{challenges.map((m: any) => <li key={m.id} className="rounded-lg bg-slate-50 p-2 text-sm"><div className="text-xs text-slate-500"><b>{v.users[m.from]?.name}</b> · {dt(m.createdAt)} · <Badge>{m.kind.toUpperCase()}</Badge></div>{m.text}</li>)}</ul>
        )}
      </Section>
    </div>
  );
}
