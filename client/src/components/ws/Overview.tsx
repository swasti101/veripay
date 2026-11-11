import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, d, dt } from '../../api';
import { Badge, ErrorNote, Section, useAction } from '../ui';
import type { WsProps } from '../../pages/Workspace';

const STORY = [
  ['Client creates project & uploads SOW', (v: any) => v.project.agreementVersions.length > 0],
  ['AI extracts requirements & milestones', (v: any) => (v.activeAgreement || v.draftAgreement)?.requirements.length > 0],
  ['Client chooses funding plan', (v: any) => !!(v.activeAgreement || v.draftAgreement)?.fundingPlan],
  ['Freelancer joins', (v: any) => !!v.project.freelancerId && !!v.project.clientId],
  ['Both approve scope & payment terms', (v: any) => !!v.activeAgreement],
  ['Advance & milestone funded', (v: any) => v.transactions.some((t: any) => t.type === 'MILESTONE_AUTHORIZATION')],
  ['Freelancer submits URL & evidence', (v: any) => v.submissions.some((s: any) => s.milestoneId !== 'M1')],
  ['Kernel inspection + vision/text QA', (v: any) => v.qaRuns.some((q: any) => q.status === 'COMPLETE' && !q.isSeed)],
  ['Client satisfaction feedback', (v: any) => v.feedback.some((f: any) => f.milestoneId !== 'M1')],
  ['Ambiguous requirement escalated to expert panel', (v: any) => v.reviews.some((r: any) => r.triggers.some((t: string) => t.includes('NEEDS_CLARIFICATION')))],
  ['Experts vote independently; results revealed', (v: any) => v.reviews.some((r: any) => r.status === 'CLOSED' && r.votes.some((x: any) => x.generated))],
  ['Allocation recommended from agreed amounts', (v: any) => v.allocations.some((a: any) => a.milestoneId !== 'M1')],
  ['Both parties review; payment released', (v: any) => v.allocations.some((a: any) => a.milestoneId !== 'M1' && a.status === 'EXECUTED')],
] as const;

export default function Overview({ v, reload }: WsProps) {
  const p = v.project;
  const ag = v.activeAgreement || v.draftAgreement;
  const actions: { action: string; tab: string }[] = v.pending || [];
  const [email, setEmail] = useState('');
  const a = useAction();
  const other = v.party === 'client' ? 'freelancer' : 'client';
  const needsInvite = !p[other === 'client' ? 'clientId' : 'freelancerId'];
  const pm = v.messages.filter((m: any) => m.fromType === 'agent').slice(-4).reverse();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {needsInvite && (
          <Section title={`Invite the ${other}`}>
            {p.invite?.status === 'PENDING' ? (
              <div className="space-y-2 text-sm">
                <p>Share this invite code or link with the {other}{p.invite.email ? ` (${p.invite.email})` : ''}:</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-slate-100 px-2 py-1 text-base font-bold tracking-widest">{p.invite.code}</code>
                  <code className="rounded bg-slate-100 px-2 py-1 text-xs">{location.origin}/join/{p.invite.code}</code>
                  <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(`${location.origin}/join/${p.invite.code}`)}>Copy link</button>
                </div>
                <p className="muted">Demo tip: switch user to <b>{other === 'client' ? 'Jamie Chen (DEMO client)' : 'Sam Okafor (DEMO freelancer)'}</b> and join with the code.</p>
              </div>
            ) : (
              <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await api.post(`/projects/${p.id}/invite`, { email }); await reload(); }); }}>
                <input className="input max-w-xs" type="email" placeholder={`${other}@example.com`} value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="btn-primary" disabled={a.busy}>Create invitation</button>
              </form>
            )}
            <ErrorNote error={a.error} />
          </Section>
        )}

        <Section title="Your next actions">
          {actions.length === 0 ? <p className="muted">Nothing is waiting on you right now.</p> : (
            <ul className="space-y-1.5">
              {actions.map((x, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>{x.action}</span><Link to={`../${x.tab}`} relative="path" className="btn-secondary">Go</Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Milestones & payment checkpoints">
          {!ag ? <p className="muted">Upload a SOW to extract milestones.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Milestone</th><th>Due</th><th>Amount</th><th>Funding</th><th>Work</th><th className="text-right">Paid</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {ag.advanceAmount > 0 && <tr><td className="py-2 font-medium">Advance</td><td>on signing</td><td>{money(ag.advanceAmount)}</td><td><Badge>{p.advance.status}</Badge></td><td>—</td><td className="text-right">{money(p.advance.paid)}</td></tr>}
                  {ag.milestones.map((m: any) => {
                    const st = p.milestoneStates.find((s: any) => s.milestoneId === m.id);
                    return <tr key={m.id}><td className="py-2 font-medium">{m.id} {m.title}</td><td>{d(m.dueDate)}</td><td>{money(m.amount)}</td><td>{st ? <Badge>{st.fundingStatus}</Badge> : <Badge>DRAFT</Badge>}</td><td>{st ? <Badge>{st.workStatus}</Badge> : '—'}</td><td className="text-right">{money(st?.paid || 0)}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Scope summary">
          <p className="text-sm text-slate-700">{ag?.extraction?.scope || p.description || '—'}</p>
          {ag?.extraction?.exclusions?.length > 0 && <p className="mt-2 text-sm"><b>Exclusions:</b> {ag.extraction.exclusions.join('; ')}</p>}
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="AI Project Manager">
          {pm.length === 0 ? <p className="muted">No messages yet.</p> : (
            <ul className="space-y-2">
              {pm.map((m: any) => <li key={m.id} className="rounded-lg bg-indigo-50/60 p-2 text-sm"><div className="text-[11px] font-semibold text-indigo-700">{m.agent} · {dt(m.createdAt)}</div>{m.text}</li>)}
            </ul>
          )}
          <Link to="../conversation" relative="path" className="btn-secondary mt-3 w-full">Open conversation</Link>
        </Section>
        {p.isDemo && p.demoLabel === 'MAIN DEMO' && (
          <Section title="Demo story progress">
            <ol className="space-y-1 text-sm">
              {STORY.map(([label, done], i) => (
                <li key={i} className="flex gap-2"><span className={done(v) ? 'text-emerald-600' : 'text-slate-300'}>{done(v) ? '✔' : '○'}</span><span className={done(v) ? 'text-slate-700' : 'text-slate-500'}>{label}</span></li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-slate-500">Steps 1–6 are pre-seeded (M1 already paid). Continue from step 7 as the freelancer. To see steps 1–5 live, create a new project with the sample SOW.</p>
          </Section>
        )}
      </div>
    </div>
  );
}
