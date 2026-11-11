import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, dt } from '../../api';
import { Badge, ErrorNote, Section, SimTag, Spinner, useAction } from '../ui';
import Grid, { badgeCell, moneyCell } from '../Grid';
import type { WsProps } from '../../pages/Workspace';

function issuesOf(v: any): string[] {
  const out: string[] = [];
  const total = v.milestones.reduce((a: number, m: any) => a + Number(m.amount || 0), 0) + Number(v.advanceAmount || 0);
  if (Math.abs(total - Number(v.budget)) > 0.01) out.push(`Milestones + advance (${money(total)}) must equal the budget (${money(Number(v.budget))}).`);
  if (v.partialPaymentRule === 'PER_REQUIREMENT_AMOUNTS') for (const m of v.milestones) {
    const rs = v.requirements.filter((r: any) => r.milestoneId === m.id);
    const sum = rs.reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
    if (rs.some((r: any) => r.amount === null || r.amount === '') || Math.abs(sum - Number(m.amount)) > 0.01) out.push(`${m.id}: requirement amounts (${money(sum)}) must sum to ${money(Number(m.amount))}.`);
  }
  for (const r of v.requirements) if (!v.milestones.some((m: any) => m.id === r.milestoneId)) out.push(`${r.id} is not linked to a milestone.`);
  if (!v.fundingPlan) out.push('The client must choose a funding plan (Funding tab).');
  return out;
}

/** What has to happen before this version can be signed — in order, with the next step
 *  doable right here, so "Pending / Pending" never leaves anyone guessing. */
function SigningChecklist({ v, draft, issues, reload }: { v: any; draft: any; issues: string[]; reload: () => Promise<void> }) {
  const p = v.project, party = v.party;
  const other: 'client' | 'freelancer' = party === 'client' ? 'freelancer' : 'client';
  const otherJoined = !!p[other === 'client' ? 'clientId' : 'freelancerId'];
  const clean = (n?: string) => (n || '').replace(/ \((DEMO|SIMULATED)[^)]*\)/, '');
  const name = (role: 'client' | 'freelancer') => clean(v.users[role === 'client' ? p.clientId : p.freelancerId]?.name);
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const a = useAction();
  const link = p.invite?.status === 'PENDING' ? `${location.origin}/join/${p.invite.code}` : '';
  const termIssues = issues.filter((i) => !/funding plan/i.test(i));

  type Step = { done: boolean; title: string; body: React.ReactNode };
  const steps: Step[] = [
    {
      done: otherJoined,
      title: otherJoined ? `${name(other)} has joined as the ${other}` : `Invite the ${other}`,
      body: otherJoined ? null : p.invite?.status === 'PENDING' ? (
        <div className="space-y-2">
          <p>Send this link or code to the {other}{p.invite.email ? ` (${p.invite.email})` : ''}. They sign in or create a {other} account, then join.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[3px] border border-rule bg-surface px-2.5 py-1 font-semibold tracking-[0.15em] text-ink tabular-nums">{p.invite.code}</span>
            <span className="mono max-w-full truncate text-ink-2">{link}</span>
            <button className="btn-secondary" onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
          {p.isDemo || v.users[p.createdBy]?.isDemo ? (
            <p className="text-ink-3">Demo: sign out, choose <b className="font-medium">Demo → {other === 'client' ? 'Jamie Chen' : 'Sam Okafor'}</b>, then paste the code into <b className="font-medium">Join</b> on the projects page.</p>
          ) : null}
        </div>
      ) : (
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await api.post(`/projects/${p.id}/invite`, { email }); await reload(); }); }}>
          <input className="input max-w-xs" type="email" placeholder={`${other}@company.com (optional)`} value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary">Create invite link</button>
        </form>
      ),
    },
    {
      done: !!draft.fundingPlan,
      title: draft.fundingPlan ? `Funding plan chosen: ${draft.fundingPlan.option.toLowerCase()}` : 'The client chooses how to fund it',
      body: draft.fundingPlan ? null : party === 'client'
        ? <p>Pick advance, partial or full funding on the <Link to="../funding" relative="path" className="text-seal underline">Funding</Link> page. The freelancer accepts it by approving.</p>
        : <p>Only the client can choose this{otherJoined ? '' : ', so it waits until they join'}. You will both see it here once they do.</p>,
    },
    {
      done: termIssues.length === 0,
      title: termIssues.length ? 'Fix the terms' : 'Amounts and milestones add up',
      body: termIssues.length ? <ul className="space-y-0.5">{termIssues.map((i) => <li key={i}>{i}</li>)}</ul> : null,
    },
    {
      done: !!draft.approvals.client && !!draft.approvals.freelancer,
      title: 'Both sides approve',
      body: (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {(['client', 'freelancer'] as const).map((r) => {
            const joined = !!p[r === 'client' ? 'clientId' : 'freelancerId'];
            const signed = draft.approvals[r];
            return (
              <span key={r} className="flex items-center gap-1.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${signed ? 'bg-released' : joined ? 'bg-hold' : 'bg-rule-strong'}`} />
                <span className="text-ink">{r === party ? 'You' : name(r) || `The ${r}`}</span>
                <span className="text-ink-3">{signed ? `approved ${dt(signed)}` : joined ? 'not approved yet' : 'has not joined'}</span>
              </span>
            );
          })}
        </div>
      ),
    },
  ];
  const firstOpen = steps.findIndex((s) => !s.done);

  return (
    <div className="rounded-[3px] border border-rule">
      <div className="border-b border-rule bg-paper px-4 py-2 text-[12px] text-ink-2">Before this version can be signed</div>
      <ol className="divide-y divide-rule">
        {steps.map((s, i) => (
          <li key={i} className={`flex gap-3 px-4 py-3 ${i === firstOpen ? 'bg-seal-wash/40' : ''}`}>
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold tabular-nums ${s.done ? 'bg-released text-white' : i === firstOpen ? 'bg-seal text-white' : 'border border-rule-strong text-ink-3'}`}>
              {s.done ? '✓' : i + 1}
            </span>
            <div className="min-w-0 flex-1 text-[13px]">
              <div className={`${s.done ? 'text-ink-2' : 'font-medium text-ink'}`}>{s.title}</div>
              {!s.done && s.body && <div className="mt-1.5 text-ink-2">{s.body}</div>}
              {s.done && i === 3 && s.body}
            </div>
          </li>
        ))}
      </ol>
      {a.error && <div className="px-4 pb-3"><ErrorNote error={a.error} /></div>}
    </div>
  );
}

export default function Agreement({ v, reload }: WsProps) {
  const p = v.project, party = v.party;
  const draft = v.draftAgreement, active = v.activeAgreement;
  const [edit, setEdit] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [showSow, setShowSow] = useState(false);
  const [summary, setSummary] = useState('');
  const a = useAction();
  useEffect(() => { if (draft && !dirty) setEdit(JSON.parse(JSON.stringify(draft))); if (!draft) setEdit(null); }, [draft?.id, draft?.approvals?.client, draft?.approvals?.freelancer, draft?.fundingPlan, dirty]);
  const issues = useMemo(() => (edit ? issuesOf(edit) : []), [edit]);
  const shown = edit || active;
  if (!shown) return <Section title="No SOW yet"><p className="muted">Upload a SOW from the project creation screen to start.</p></Section>;

  const upd = (fn: (x: any) => void) => { const c = JSON.parse(JSON.stringify(edit)); fn(c); setEdit(c); setDirty(true); };
  const save = () => a.run(async () => {
    await api.put(`/projects/${p.id}/agreement/draft`, { requirements: edit.requirements, milestones: edit.milestones, budget: Number(edit.budget), advanceAmount: Number(edit.advanceAmount), partialPaymentRule: edit.partialPaymentRule, expertReview: edit.expertReview, changeSummary: edit.changeSummary });
    setDirty(false); await reload();
  });
  const unclear = shown.requirements.filter((r: any) => r.ambiguity && !r.clarification);

  return (
    <div className="space-y-4">
      <Section title={<span className="flex items-center gap-2">Agreement v{shown.version} <Badge>{shown.status}</Badge></span>}
        actions={<>
          {draft && dirty && <button className="btn-secondary" disabled={a.busy} onClick={() => { setDirty(false); }}>Discard</button>}
          {draft && dirty && <button className="btn-primary" disabled={a.busy} onClick={save}>Save changes</button>}
          {draft && !dirty && !draft.approvals[party] && <button className="btn-success" disabled={a.busy || issues.length > 0 || !p.clientId || !p.freelancerId} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/agreement/approve`); await reload(); })}>Approve v{draft.version}</button>}
        </>}>
        <div className="space-y-2 text-sm">
          <p className="text-ink-2">{shown.changeSummary} · extracted by <b>{shown.extraction?.source}</b></p>
          {draft ? (
            <div className="rounded-[3px] border border-hold/40 bg-hold-wash p-3 text-hold">
              Draft under negotiation. Any edit by either party clears both approvals, so neither side can change terms the other already accepted. The version locks as the payment baseline only when <b>both</b> approve.
              {active && <> The approved v{active.version} stays in force until then.</>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-[3px] border border-released/40 bg-released-wash p-3 text-released">
              Locked baseline approved by both parties. Changes require a new version approved by both.
              <input className="input max-w-sm" placeholder="Describe the change you want to propose" value={summary} onChange={(e) => setSummary(e.target.value)} />
              <button className="btn-secondary" disabled={a.busy || !summary.trim()} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/agreement/propose-change`, { changeSummary: summary }); setSummary(''); await reload(); })}>Propose change (new version)</button>
            </div>
          )}
          {draft && <SigningChecklist v={v} draft={draft} issues={issues} reload={reload} />}
          {unclear.length > 0 && <div className="text-panel">• {unclear.map((r: any) => r.id).join(', ')} have unmeasurable wording without a clarification. They can be approved, but QA will mark them NEEDS_CLARIFICATION and may escalate to experts.</div>}
          <ErrorNote error={a.error} />
          {a.busy && <Spinner />}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Budget & payment terms" className="lg:col-span-1">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><label className="label">Total budget</label>{edit ? <input className="input" type="number" value={edit.budget} onChange={(e) => upd((x) => (x.budget = e.target.value))} /> : money(shown.budget)}</div>
            <div><label className="label">Initial advance</label>{edit ? <input className="input" type="number" value={edit.advanceAmount} onChange={(e) => upd((x) => (x.advanceAmount = e.target.value))} /> : money(shown.advanceAmount)}</div>
            <div className="col-span-2"><label className="label">Partial payment rule</label>
              {edit ? (
                <select className="input" value={edit.partialPaymentRule} onChange={(e) => upd((x) => (x.partialPaymentRule = e.target.value))}>
                  <option value="PER_REQUIREMENT_AMOUNTS">Per-requirement amounts (measurable partial acceptance)</option>
                  <option value="MUTUAL_AGREEMENT_ONLY">Partial amounts only by mutual agreement</option>
                </select>
              ) : <span>{shown.partialPaymentRule.replace(/_/g, ' ').toLowerCase()}</span>}
            </div>
            <div className="col-span-2"><label className="label">Funding plan</label>{shown.fundingPlan ? <Badge tone="blue">{shown.fundingPlan.option}</Badge> : <span className="text-hold">not chosen (client, Funding tab)</span>}</div>
            <div className="col-span-2"><label className="label">Payment terms in SOW</label><p className="text-ink-2">{shown.extraction?.paymentTerms || '—'}</p></div>
          </div>
        </Section>
        <Section title="Expert review terms" className="lg:col-span-1">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {(['panelSize', 'quorum', 'feePerReview'] as const).map((k) => (
              <div key={k}><label className="label">{k === 'feePerReview' ? 'Fee per review ($)' : k === 'panelSize' ? 'Panel size' : 'Quorum'}</label>
                {edit ? <input className="input" type="number" min={0} value={edit.expertReview[k]} onChange={(e) => upd((x) => (x.expertReview[k] = Number(e.target.value)))} /> : shown.expertReview[k]}</div>
            ))}
            <div><label className="label">Fee paid by</label>
              {edit ? <select className="input" value={edit.expertReview.feePayer} onChange={(e) => upd((x) => (x.expertReview.feePayer = e.target.value))}><option value="client">Client</option><option value="freelancer">Freelancer</option><option value="split">Split 50/50</option></select> : shown.expertReview.feePayer}
            </div>
            <p className="col-span-2 text-xs text-ink-3">Mode: <b>ADVISORY</b> — the panel produces a recommendation both parties review and acknowledge; no automatic payment consequence. Fixed fee is paid for a valid completed review regardless of the vote and is never deducted from the freelancer's pay.</p>
          </div>
        </Section>
        <Section title="Extraction details" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <div><dt className="label">Scope</dt><dd>{shown.extraction?.scope}</dd></div>
            <div><dt className="label">Exclusions</dt><dd>{shown.extraction?.exclusions?.join('; ') || '—'}</dd></div>
            <div><dt className="label">Assumptions</dt><dd>{shown.extraction?.assumptions?.join('; ') || '—'}</dd></div>
            <div><dt className="label">Flagged for clarification</dt><dd>{shown.extraction?.ambiguities?.length ? <ul className="list-disc pl-4">{shown.extraction.ambiguities.map((x: any, i: number) => <li key={i}>{x.text} <span className="text-xs text-ink-3">(ask {x.askParty})</span></li>)}</ul> : 'none'}</dd></div>
          </dl>
        </Section>
      </div>

      <Section title="Milestones" actions={edit && <button className="btn-secondary" onClick={() => upd((x) => x.milestones.push({ id: `M${x.milestones.length + 1}`, title: 'New milestone', description: '', startDate: '', dueDate: '', amount: 0, dependsOn: [] }))}>+ Milestone</button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-3"><tr><th>ID</th><th>Title</th><th>Start</th><th>Due</th><th>Amount</th><th>Requirements</th>{edit && <th />}</tr></thead>
            <tbody className="divide-y divide-rule">
              {shown.milestones.map((m: any, i: number) => (
                <tr key={i}>
                  <td className="py-1.5 font-semibold">{m.id}</td>
                  <td>{edit ? <input className="input" value={m.title} onChange={(e) => upd((x) => (x.milestones[i].title = e.target.value))} /> : m.title}</td>
                  <td>{edit ? <input className="input" type="date" value={m.startDate} onChange={(e) => upd((x) => (x.milestones[i].startDate = e.target.value))} /> : m.startDate}</td>
                  <td>{edit ? <input className="input" type="date" value={m.dueDate} onChange={(e) => upd((x) => (x.milestones[i].dueDate = e.target.value))} /> : m.dueDate}</td>
                  <td>{edit ? <input className="input w-28" type="number" value={m.amount} onChange={(e) => upd((x) => (x.milestones[i].amount = Number(e.target.value)))} /> : money(m.amount)}</td>
                  <td className="text-xs">{shown.requirements.filter((r: any) => r.milestoneId === m.id).map((r: any) => r.id).join(', ')}</td>
                  {edit && <td><button className="btn-ghost" onClick={() => upd((x) => x.milestones.splice(i, 1))}>Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Requirements baseline" actions={edit && <button className="btn-secondary" onClick={() => upd((x) => x.requirements.push({ id: `REQ-${String(x.requirements.length + 1).padStart(2, '0')}`, sowRef: 'added', title: 'New requirement', description: '', expectedOutcome: '', acceptanceCriteria: [], deliverable: '', milestoneId: x.milestones[0]?.id, evidenceRequired: ['functional'], category: 'frontend', amount: null, ambiguity: null, clarification: null, status: 'UNVERIFIED' }))}>+ Requirement</button>}>
        {!edit ? (
          <Grid rows={shown.requirements} height={300} cols={[
            { field: 'id', maxWidth: 90 }, { field: 'sowRef', headerName: 'SOW ref', maxWidth: 90 }, { field: 'title', minWidth: 180 }, { field: 'milestoneId', headerName: 'MS', maxWidth: 70 },
            { headerName: 'Acceptance criteria', valueGetter: (q: any) => q.data.acceptanceCriteria.join('; '), minWidth: 320, tooltipValueGetter: (q: any) => q.value },
            { headerName: 'Evidence', valueGetter: (q: any) => q.data.evidenceRequired.join(', '), maxWidth: 140 }, { field: 'amount', cellRenderer: moneyCell, maxWidth: 110 },
            { field: 'clarification', headerName: 'Approved clarification', valueFormatter: (q: any) => q.value || (q.data.ambiguity ? '⚠ unclarified' : '—') },
            { field: 'status', cellRenderer: badgeCell, minWidth: 160 },
          ]} />
        ) : (
          <div className="space-y-3">
            {edit.requirements.map((r: any, i: number) => (
              <div key={i} className={`rounded-[3px] border p-3 ${r.ambiguity && !r.clarification ? 'border-panel/40 bg-panel-wash/40' : 'border-rule'}`}>
                <div className="grid gap-2 md:grid-cols-12">
                  <div className="md:col-span-1"><label className="label">ID</label><div className="pt-1.5 text-sm font-semibold">{r.id}</div><div className="text-xs text-ink-3">{r.sowRef}</div></div>
                  <div className="md:col-span-4"><label className="label">Title</label><input className="input" value={r.title} onChange={(e) => upd((x) => (x.requirements[i].title = e.target.value))} /></div>
                  <div className="md:col-span-2"><label className="label">Milestone</label><select className="input" value={r.milestoneId} onChange={(e) => upd((x) => (x.requirements[i].milestoneId = e.target.value))}>{edit.milestones.map((m: any) => <option key={m.id}>{m.id}</option>)}</select></div>
                  <div className="md:col-span-2"><label className="label">Amount ($)</label><input className="input" type="number" value={r.amount ?? ''} onChange={(e) => upd((x) => (x.requirements[i].amount = e.target.value === '' ? null : Number(e.target.value)))} /></div>
                  <div className="md:col-span-2"><label className="label">Category</label><select className="input" value={r.category} onChange={(e) => upd((x) => (x.requirements[i].category = e.target.value))}>{['frontend', 'backend', 'design', 'content', 'qa'].map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div className="flex items-end md:col-span-1"><button className="btn-ghost" onClick={() => upd((x) => x.requirements.splice(i, 1))}>Remove</button></div>
                  <div className="md:col-span-7"><label className="label">Acceptance criteria (one per line)</label><textarea className="input" rows={3} value={r.acceptanceCriteria.join('\n')} onChange={(e) => upd((x) => (x.requirements[i].acceptanceCriteria = e.target.value.split('\n')))} /></div>
                  <div className="md:col-span-5"><label className="label">Evidence required</label>
                    <div className="flex gap-3 pt-1 text-sm">{['visual', 'functional', 'document'].map((k) => (
                      <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={r.evidenceRequired.includes(k)} onChange={(e) => upd((x) => { const s = new Set(x.requirements[i].evidenceRequired); e.target.checked ? s.add(k) : s.delete(k); x.requirements[i].evidenceRequired = [...s]; })} />{k}</label>
                    ))}</div>
                    {r.ambiguity && <p className="mt-2 text-xs text-panel">⚠ {r.ambiguity}</p>}
                  </div>
                  <div className="md:col-span-12"><label className="label">Approved clarification {r.ambiguity && !r.clarification && <span className="text-panel">(recommended)</span>}</label><input className="input" placeholder="e.g. Results update within 500 ms of typing; matching is case-insensitive substring on product name" value={r.clarification || ''} onChange={(e) => upd((x) => (x.requirements[i].clarification = e.target.value))} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Version history">
          <ul className="divide-y divide-rule text-sm">
            {[...p.agreementVersions].reverse().map((x: any) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b>v{x.version}</b> <Badge>{x.status}</Badge> {x.changeSummary}</span>
                <span className="text-xs text-ink-3">client {x.approvals.client ? dt(x.approvals.client) : '—'} · freelancer {x.approvals.freelancer ? dt(x.approvals.freelancer) : '—'} · {money(x.budget)}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Original SOW text" actions={<button className="btn-ghost" onClick={() => setShowSow(!showSow)}>{showSow ? 'Hide' : 'Show'}</button>}>
          {p.isDemo && <SimTag label="DEMO SOW" />}
          {showSow ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[3px] bg-paper p-3 text-xs">{shown.sowText}</pre> : <p className="muted">{shown.sowText?.length || 0} characters. The SOW is the primary reference for every assessment.</p>}
        </Section>
      </div>
    </div>
  );
}
