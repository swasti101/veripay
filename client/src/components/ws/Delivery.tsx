import { useEffect, useState } from 'react';
import { api, dt } from '../../api';
import { useApp } from '../../App';
import { Badge, Empty, ErrorNote, Modal, Section, SimTag, Spinner, useAction } from '../ui';
import type { WsProps } from '../../pages/Workspace';

export function ChallengeButton({ projectId, targetType, targetId, requirementId, label = 'Challenge', onDone }: { projectId: string; targetType: string; targetId: string; requirementId?: string; label?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const a = useAction();
  return (
    <>
      <button className="btn-ghost text-xs" onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Challenge ${targetType}${requirementId ? ` · ${requirementId}` : ''}`}>
        <p className="muted mb-2">Explain why this finding is wrong. The challenge is recorded in the audit trail and shared with the other party. Add new evidence with a resubmission.</p>
        <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <ErrorNote error={a.error} />
        <div className="mt-3 flex justify-end"><button className="btn-primary" disabled={a.busy || !text.trim()} onClick={() => a.run(async () => { await api.post(`/projects/${projectId}/challenges`, { targetType, targetId, requirementId, text }); setOpen(false); setText(''); onDone(); })}>Submit challenge</button></div>
      </Modal>
    </>
  );
}

export function QAReport({ qa, ag, projectId, reload }: { qa: any; ag: any; projectId: string; reload: () => void }) {
  if (qa.status === 'RUNNING') return <div className="card p-4"><Spinner label="Kernel inspection and QA agents are running…" /></div>;
  if (qa.status === 'ERROR') return <ErrorNote error={`QA failed: ${qa.error}`} />;
  const k = qa.kernel;
  return (
    <div className="space-y-4">
      <Section title={<span className="flex items-center gap-2">AI QA report <Badge>{qa.overall}</Badge>{qa.isSeed && <SimTag label="DEMO SEED" />}</span>} actions={<span className="text-xs text-slate-500">{dt(qa.createdAt)} · {qa.aiSource}</span>}>
        <p className="mb-3 text-sm text-slate-700"><b>QA Mediator:</b> {qa.mediatorSummary}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Requirement</th><th>Expected</th><th>Detected</th><th>Evidence</th><th>Confidence</th><th>Next action</th><th>Status</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {qa.results.map((r: any) => {
                const req = ag.requirements.find((x: any) => x.id === r.requirementId);
                return (
                  <tr key={r.requirementId}>
                    <td className="py-2 pr-2"><b>{r.requirementId}</b><div className="text-xs text-slate-500">{req?.title}</div></td>
                    <td className="max-w-56 pr-2 text-xs">{r.expected}</td>
                    <td className="max-w-56 pr-2 text-xs">{r.actual}<div className="mt-1 text-slate-500">{r.explanation}</div>{r.guardrail && <div className="mt-1 rounded bg-violet-50 p-1 text-violet-800">Guardrail: {r.guardrail}</div>}</td>
                    <td className="max-w-64 pr-2 text-xs"><ul className="list-disc pl-4">{r.evidence.slice(0, 5).map((e: string, i: number) => <li key={i}>{e}</li>)}</ul></td>
                    <td><Badge tone={r.confidence === 'HIGH' ? 'green' : r.confidence === 'MEDIUM' ? 'amber' : 'slate'}>{r.confidence}</Badge></td>
                    <td className="max-w-48 pr-2 text-xs">{r.nextAction}</td>
                    <td><Badge>{r.status}</Badge></td>
                    <td>{!qa.isSeed && <ChallengeButton projectId={projectId} targetType="qa" targetId={qa.id} requirementId={r.requirementId} onDone={reload} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={<span className="flex items-center gap-2">Kernel computer agent {k.mode === 'KERNEL_LIVE' ? <Badge tone="green">KERNEL LIVE</Badge> : k.mode === 'SKIPPED' ? <Badge>SKIPPED</Badge> : <SimTag label="DEMO ADAPTER — not Kernel" />}</span>}>
          <p className="mb-2 text-xs text-slate-600">{k.note}{k.sessionId && <> Session <code>{k.sessionId}</code>.</>} {k.error && <span className="text-rose-700">Error: {k.error}</span>}</p>
          {k.pages.length > 0 && (
            <table className="mb-2 w-full text-xs">
              <thead className="text-left text-slate-500"><tr><th>Page</th><th>Viewport</th><th>Signals</th></tr></thead>
              <tbody className="divide-y divide-slate-100 align-top">{k.pages.map((pg: any, i: number) => (
                <tr key={i}><td className="py-1 pr-2"><div className="font-medium">{pg.title}</div><div className="break-all text-slate-500">{pg.url}</div></td><td className="pr-2">{pg.viewport}</td>
                  <td className="text-slate-600">{Object.entries(pg.signals).filter(([kk]) => kk !== 'note').map(([kk, vv]) => `${kk}: ${vv}`).join(' · ')}</td></tr>
              ))}</tbody>
            </table>
          )}
          <details><summary className="cursor-pointer text-xs font-medium text-slate-600">Actions performed ({k.actions.length})</summary>
            <ol className="mt-1 space-y-0.5 text-xs">{k.actions.map((x: any, i: number) => <li key={i} className={x.ok ? 'text-slate-600' : 'text-rose-700'}><code>{x.action}</code> {x.detail}</li>)}</ol>
          </details>
          {k.screenshots.length > 0 && <div className="mt-2 grid grid-cols-2 gap-2">{k.screenshots.map((s: any) => <a key={s.id} href={s.path} target="_blank" rel="noreferrer"><img src={s.path} alt={s.label} className="rounded border" /><div className="text-[10px] text-slate-500">{s.label}</div></a>)}</div>}
        </Section>
        <div className="space-y-4">
          <Section title="Vision & text verification">
            <div className="space-y-2 text-xs">
              <div><b>Vision</b> ({qa.vision.source}): {qa.vision.note}<ul className="list-disc pl-4">{qa.vision.findings.map((f: any, i: number) => <li key={i}><b>{f.requirementId}</b> {f.observation}</li>)}</ul></div>
              <div><b>Text</b> ({qa.text.source}): {qa.text.note}<ul className="list-disc pl-4">{qa.text.findings.map((f: any, i: number) => <li key={i}><b>{f.requirementId}</b> {f.observation}</li>)}</ul></div>
            </div>
          </Section>
          <Section title="Domain expert AI agents">
            <p className="mb-2 text-[11px] text-slate-500">AI agents — not human experts. Kept separate from human expert votes.</p>
            {qa.domainAgents.map((g: any, i: number) => <div key={i} className="mb-2 text-xs"><b>{g.agent}</b><ul className="list-disc pl-4">{g.findings.map((f: string, j: number) => <li key={j}>{f}</li>)}</ul></div>)}
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function Delivery({ v, reload, mid }: WsProps) {
  const { config } = useApp();
  const p = v.project, party = v.party;
  const ag = v.activeAgreement;
  const st = p.milestoneStates.find((s: any) => s.milestoneId === mid);
  const reqs = ag?.requirements.filter((r: any) => r.milestoneId === mid) || [];
  const subs = v.submissions.filter((s: any) => s.milestoneId === mid);
  const qas = v.qaRuns.filter((q: any) => q.milestoneId === mid);
  const [qaId, setQaId] = useState<string | null>(null);
  const qa = qas.find((q: any) => q.id === qaId) || qas.at(-1);
  const defaultUrl = `${config?.publicBaseUrl || location.origin}/demo-store/index.html`;
  const [f, setF] = useState({ url: '', notes: '', authorize: true, demo: p.isDemo });
  const [claims, setClaims] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<FileList | null>(null);
  const a = useAction();
  useEffect(() => { setF((x) => ({ ...x, url: x.url || (p.isDemo ? defaultUrl : '') })); }, [defaultUrl]);
  if (!ag) return <Empty title="Delivery opens once the agreement is approved by both parties" />;
  if (!st) return <Empty title="Select a milestone" />;
  const canSubmit = party === 'freelancer' && ['IN_PROGRESS', 'REVISION_REQUESTED', 'QA_COMPLETE', 'SUBMITTED', 'IN_EXPERT_REVIEW'].includes(st.workStatus);

  const submit = () => a.run(async () => {
    const fd = new FormData();
    fd.append('url', f.url); fd.append('notes', f.notes); fd.append('authorizeInspection', String(f.authorize)); fd.append('demoEvidence', String(f.demo));
    fd.append('claims', JSON.stringify(Object.entries(claims).filter(([, n]) => n.trim()).map(([requirementId, note]) => ({ requirementId, note }))));
    if (files) for (const file of Array.from(files)) fd.append('files', file);
    await api.post(`/projects/${p.id}/milestones/${mid}/submissions`, fd);
    setQaId(null); setClaims({}); setFiles(null);
    await reload();
  });

  return (
    <div className="space-y-4">
      <Section title={`${mid} — delivery`} actions={<><Badge>{st.workStatus}</Badge><Badge>{st.fundingStatus}</Badge></>}>
        {st.workStatus === 'NOT_STARTED' && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {st.authorized + st.captured > 0 ? <span>This milestone is funded.</span> : <span className="text-amber-700">Not funded yet — the client must fund it before work can begin.</span>}
            {party === 'freelancer' && <button className="btn-primary" disabled={a.busy || st.authorized + st.captured <= 0} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/milestones/${mid}/start`); await reload(); })}>Start milestone</button>}
          </div>
        )}
        {canSubmit && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><label className="label">Deliverable URL</label><input className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://staging.example.com" />
                {p.isDemo && <p className="mt-1 text-xs text-slate-500">Demo storefront: <code>{defaultUrl}</code>{config?.kernel.configured && /127\.0\.0\.1|localhost/.test(defaultUrl) && <span className="text-amber-700"> — Kernel's cloud browser cannot reach localhost; set PUBLIC_BASE_URL or deploy to Render.</span>}</p>}</div>
              <div><label className="label">Files (screenshots, test reports .txt/.md)</label><input type="file" multiple onChange={(e) => setFiles(e.target.files)} className="text-sm" /></div>
            </div>
            <div><label className="label">Notes / explanation</label><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <div><label className="label">Completion claims (optional — claims are not proof)</label>
              <div className="grid gap-2 md:grid-cols-2">{reqs.map((r: any) => <input key={r.id} className="input" placeholder={`${r.id} ${r.title}: what did you deliver?`} value={claims[r.id] || ''} onChange={(e) => setClaims({ ...claims, [r.id]: e.target.value })} />)}</div>
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.authorize} onChange={(e) => setF({ ...f, authorize: e.target.checked })} />
              <span>I authorize automated <b>{config?.kernel.configured ? 'Kernel browser' : 'demo-adapter HTTP'}</b> inspection of this URL: read-only navigation and reversible input probes only — no purchases, payments, account changes or deletions.</span></label>
            {p.isDemo && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.demo} onChange={(e) => setF({ ...f, demo: e.target.checked })} /> Attach the sample test report <SimTag label="DEMO evidence" /></label>}
            <ErrorNote error={a.error} />
            <button className="btn-primary" disabled={a.busy || (!f.url && !files?.length && !f.notes)} onClick={submit}>{a.busy ? 'Submitting…' : subs.length ? 'Submit revision / more evidence' : 'Submit deliverable'}</button>
          </div>
        )}
        {!canSubmit && st.workStatus !== 'NOT_STARTED' && <p className="muted">{party === 'client' ? 'Submissions and QA results appear below as the freelancer delivers.' : `Milestone is ${st.workStatus.replace(/_/g, ' ').toLowerCase()}.`}</p>}
      </Section>

      {subs.length > 0 && (
        <Section title="Submissions">
          <ul className="divide-y divide-slate-100 text-sm">{[...subs].reverse().map((s: any) => {
            const q = qas.find((x: any) => x.submissionId === s.id);
            return (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="font-medium">Revision {s.revision} · {dt(s.createdAt)} {s.url && <a className="text-indigo-600 underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a>}</div>
                  {s.notes && <div className="text-slate-600">{s.notes}</div>}
                  <div className="text-xs text-slate-500">{s.evidence.map((e: any) => e.path ? <a key={e.id} className="mr-2 underline" href={e.path} target="_blank" rel="noreferrer">{e.label}</a> : <span key={e.id} className="mr-2">{e.label}</span>)} {s.claims.length > 0 && `· ${s.claims.length} claim(s)`} · inspection {s.authorization?.granted ? 'authorized' : 'not authorized'}</div>
                </div>
                <div className="flex gap-2">
                  {q && <button className="btn-secondary" onClick={() => setQaId(q.id)}>View QA</button>}
                  <button className="btn-ghost" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/submissions/${s.id}/rerun-qa`); await reload(); })}>Re-run QA</button>
                </div>
              </li>
            );
          })}</ul>
        </Section>
      )}
      {qa ? <QAReport qa={qa} ag={ag} projectId={p.id} reload={reload} /> : <Empty title="No QA yet">QA runs automatically when the freelancer submits.</Empty>}
    </div>
  );
}
