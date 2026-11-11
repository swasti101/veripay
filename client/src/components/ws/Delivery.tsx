import { useEffect, useState } from 'react';
import { api, dt } from '../../api';
import { useApp } from '../../App';
import { Badge, Empty, ErrorNote, Modal, SimTag, useAction } from '../ui';
import VerificationReport from './Verification';
import type { WsProps } from '../../pages/Workspace';

export function ChallengeButton({ projectId, targetType, targetId, requirementId, label = 'Dispute', onDone }: { projectId: string; targetType: string; targetId: string; requirementId?: string; label?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const a = useAction();
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Dispute${requirementId ? ` ${requirementId}` : ''}`}>
        <p className="mb-3 text-[13px] text-ink-2">Say why this finding is wrong. It goes on the audit trail and to the other party. To add new evidence, resubmit the deliverable.</p>
        <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <ErrorNote error={a.error} />
        <div className="mt-3 flex justify-end">
          <button className="btn-primary" disabled={a.busy || !text.trim()} onClick={() => a.run(async () => { await api.post(`/projects/${projectId}/challenges`, { targetType, targetId, requirementId, text }); setOpen(false); setText(''); onDone(); })}>Send dispute</button>
        </div>
      </Modal>
    </>
  );
}

const MODE_COPY: Record<string, string> = {
  KERNEL_LIVE: 'a Kernel cloud browser',
  LOCAL_BROWSER: 'a real browser on this server (not Kernel)',
  DEMO_ADAPTER_HTTP_FETCH: 'a static fetch (no browser)',
};

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
  const [f, setF] = useState({ url: '', notes: '', authorize: true, demo: false });
  const [claims, setClaims] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<FileList | null>(null);
  const [showForm, setShowForm] = useState(false);
  const a = useAction();
  useEffect(() => { setF((x) => ({ ...x, url: x.url || (p.isDemo ? defaultUrl : '') })); }, [defaultUrl]);

  if (!ag) return <Empty title="Delivery opens once both sides approve the agreement">Agree the scope first, so there is something to check the work against.</Empty>;
  if (!st) return <Empty title="Choose a milestone above" />;

  const canSubmit = party === 'freelancer' && ['IN_PROGRESS', 'REVISION_REQUESTED', 'QA_COMPLETE', 'SUBMITTED', 'IN_EXPERT_REVIEW'].includes(st.workStatus);
  const agentMode = config?.kernel.configured ? 'KERNEL_LIVE' : 'LOCAL_BROWSER';
  const formOpen = canSubmit && (showForm || subs.length === 0);

  const submit = () => a.run(async () => {
    const fd = new FormData();
    fd.append('url', f.url); fd.append('notes', f.notes); fd.append('authorizeInspection', String(f.authorize)); fd.append('demoEvidence', String(f.demo));
    fd.append('claims', JSON.stringify(Object.entries(claims).filter(([, n]) => n.trim()).map(([requirementId, note]) => ({ requirementId, note }))));
    if (files) for (const file of Array.from(files)) fd.append('files', file);
    await api.post(`/projects/${p.id}/milestones/${mid}/submissions`, fd);
    setQaId(null); setClaims({}); setFiles(null); setShowForm(false);
    await reload();
  });

  return (
    <div className="space-y-8">
      {/* ── Not started ── */}
      {st.workStatus === 'NOT_STARTED' && (
        <div className="sheet flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h3 className="h2">{st.authorized + st.captured > 0 ? 'This milestone is funded' : 'Waiting for funding'}</h3>
            <p className="mt-1 text-[13px] text-ink-2">
              {st.authorized + st.captured > 0
                ? 'The money is held by PayPal. Start when you are ready to work on it.'
                : 'The client has to fund this milestone before work can begin.'}
            </p>
          </div>
          {party === 'freelancer' && (
            <button className="btn-primary" disabled={a.busy || st.authorized + st.captured <= 0}
              onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/milestones/${mid}/start`); await reload(); })}>Start this milestone</button>
          )}
        </div>
      )}

      {/* ── Submit ── */}
      {formOpen && (
        <div className="sheet">
          <div className="border-b border-rule px-5 py-3.5">
            <h3 className="h2">{subs.length ? 'Submit a revision' : 'Submit your work'}</h3>
            <p className="mt-0.5 text-[13px] text-ink-2">
              Three analysers will check it against the {reqs.length} requirement{reqs.length === 1 ? '' : 's'} in this milestone. You will get specific feedback on anything that does not pass.
            </p>
          </div>
          <div className="space-y-5 p-5">
            <div>
              <label className="field-label" htmlFor="sub-url">Where can it be seen?</label>
              <input id="sub-url" className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://staging.yoursite.com" />
              {p.isDemo && <p className="mt-1.5 text-[12px] text-ink-3">The demo storefront is pre-filled: <span className="mono">{defaultUrl}</span></p>}
              {config?.kernel.configured && /127\.0\.0\.1|localhost/.test(f.url) && (
                <p className="mt-1.5 text-[12px] text-hold">Kernel runs in the cloud and cannot reach localhost. Deploy first, or set PUBLIC_BASE_URL.</p>
              )}
            </div>

            <label className="flex items-start gap-3 rounded-[3px] border border-rule bg-paper p-3 text-[13px]">
              <input type="checkbox" className="mt-0.5 accent-[var(--color-seal)]" checked={f.authorize} onChange={(e) => setF({ ...f, authorize: e.target.checked })} />
              <span>
                <span className="font-medium text-ink">Let the computer agent use this site</span>
                <span className="mt-0.5 block text-ink-2">
                  It will open it in {MODE_COPY[agentMode]}, follow its links, type into search, change filters and click "add to cart" — capturing a screenshot at each step.
                  It never pays, buys, deletes or submits a form.
                </span>
              </span>
            </label>

            <div>
              <label className="field-label" htmlFor="sub-notes">What did you deliver?</label>
              <textarea id="sub-notes" className="input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="A short summary for the client, and anything the checks should know about." />
            </div>

            {reqs.length > 0 && (
              <div>
                <span className="field-label">Notes per requirement <span className="text-ink-3">(optional — these are your claims; the analysers check them)</span></span>
                <div className="space-y-2">
                  {reqs.map((r: any) => (
                    <div key={r.id} className="flex items-start gap-3">
                      <span className="w-14 shrink-0 pt-2 text-[12px] font-medium tabular-nums text-ink-3">{r.id}</span>
                      <input className="input" placeholder={r.title} value={claims[r.id] || ''} onChange={(e) => setClaims({ ...claims, [r.id]: e.target.value })} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="field-label" htmlFor="sub-files">Files</label>
              <input id="sub-files" type="file" multiple onChange={(e) => setFiles(e.target.files)} className="text-[13px] text-ink-2" />
              <p className="mt-1 text-[12px] text-ink-3">Screenshots and mockups go to the vision analyser; documents and test reports (.txt, .md) to the text analyser.</p>
            </div>

            {p.isDemo && (
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" className="accent-[var(--color-seal)]" checked={f.demo} onChange={(e) => setF({ ...f, demo: e.target.checked })} />
                Also attach the sample test report <SimTag label="for the demo" />
              </label>
            )}

            <ErrorNote error={a.error} />
            <div className="flex items-center gap-3">
              <button className="btn-primary px-4 py-2" disabled={a.busy || (!f.url && !files?.length && !f.notes)} onClick={submit}>
                {a.busy ? 'Submitting…' : subs.length ? 'Submit revision' : 'Submit for verification'}
              </button>
              {subs.length > 0 && <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>}
            </div>
          </div>
        </div>
      )}

      {/* ── Submission history ── */}
      {subs.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="h2">Submissions</h3>
            {canSubmit && !formOpen && <button className="btn-secondary" onClick={() => setShowForm(true)}>Submit a revision</button>}
          </div>
          <div className="sheet ledger">
            {[...subs].reverse().map((s: any) => {
              const q = qas.find((x: any) => x.submissionId === s.id);
              const active = q && qa && q.id === qa.id;
              return (
                <div key={s.id} className={`flex flex-wrap items-center gap-4 px-5 py-3 ${active ? 'bg-seal-wash/50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink">Revision {s.revision} <span className="font-normal text-ink-3">· {dt(s.createdAt)}</span></div>
                    {s.url && <a className="mono block truncate text-seal underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a>}
                    {s.notes && <div className="mt-0.5 text-[12px] text-ink-2">{s.notes}</div>}
                  </div>
                  {q && <Badge>{q.status === 'RUNNING' ? 'UNDER_REVIEW' : q.overall}</Badge>}
                  <div className="flex gap-1">
                    {q && !active && <button className="btn-secondary" onClick={() => setQaId(q.id)}>View report</button>}
                    <button className="btn-ghost" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/submissions/${s.id}/rerun-qa`); await reload(); })}>Check again</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── The report ── */}
      {qa ? (
        <div>
          <h3 className="h2 mb-3">Verification report</h3>
          <VerificationReport qa={qa} ag={ag} projectId={p.id} reload={reload} />
        </div>
      ) : !formOpen && (
        <Empty title="Nothing submitted yet">
          {party === 'freelancer' ? 'Start the milestone, then submit your work here.' : 'The freelancer has not submitted anything for this milestone yet. You will be notified when they do.'}
        </Empty>
      )}
    </div>
  );
}
