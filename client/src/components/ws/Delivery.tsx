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

/** Freelancer side of the pre-check: why this revision has not reached the client, and the
 *  two ways forward — fix and resubmit, or send it on with a reason. */
function PrecheckBanner({ sub, isLatest, projectId, reload, onRevise }: { sub: any; isLatest: boolean; projectId: string; reload: () => Promise<void>; onRevise: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const a = useAction();
  const pc = sub?.precheck;
  if (!pc) return null;
  if (pc.passed) {
    return (
      <div className="mb-4 rounded-[3px] border-l-2 border-released bg-released-wash px-4 py-3 text-[13px] text-released">
        <b className="font-medium">Passed the pre-check</b> — this revision is with the client for review.
      </div>
    );
  }
  if (pc.sentAnywayAt) {
    return (
      <div className="mb-4 rounded-[3px] border-l-2 border-seal bg-seal-wash px-4 py-3 text-[13px] text-seal">
        <b className="font-medium">You sent this to the client anyway.</b> They see the full report, including what the checks could not confirm, and your reason: "{pc.sentAnywayReason}"
      </div>
    );
  }
  const pct = Math.round(pc.threshold * 100);
  return (
    <div className="mb-4 rounded-[3px] border border-hold/40 bg-hold-wash p-4 text-[13px]">
      <div className="font-medium text-hold">Not sent to the client yet</div>
      <p className="mt-1 text-ink-2">
        {pc.unfinished.length} of {pc.considered} requirement{pc.considered === 1 ? '' : 's'} you can act on still need work
        ({pc.unfinished.join(', ')}). When more than {pct}% are unfinished, the revision comes back to you first, so the
        client only reviews work that is ready.
        {pc.awaitingClient.length > 0 && <> {pc.awaitingClient.join(', ')} {pc.awaitingClient.length === 1 ? 'needs' : 'need'} the client to clarify wording — that never counts against you.</>}
      </p>
      {isLatest && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={onRevise}>Fix and submit a revision</button>
          <button className="btn-secondary" onClick={() => setOpen(!open)}>Send to the client anyway</button>
        </div>
      )}
      {open && (
        <div className="mt-3 space-y-2">
          <label className="field-label" htmlFor="sendanyway">Why should the client review it as it is?</label>
          <textarea id="sendanyway" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The site is on a private staging server the agent cannot reach; the attached recording shows search and checkout working." />
          <p className="text-[12px] text-ink-3">The client sees your reason and the full report, including what was not confirmed.</p>
          <ErrorNote error={a.error} />
          <button className="btn-primary" disabled={a.busy || reason.trim().length < 10}
            onClick={() => a.run(async () => { await api.post(`/projects/${projectId}/submissions/${sub.id}/send-to-client`, { reason }); setOpen(false); await reload(); })}>Send to client</button>
        </div>
      )}
    </div>
  );
}

const MODE_COPY: Record<string, string> = {
  KERNEL_LIVE: 'a Kernel cloud browser',
  LOCAL_BROWSER: 'a real browser on this server (not Kernel)',
  DEMO_ADAPTER_HTTP_FETCH: 'a static fetch (no browser)',
};

// Mirrors server/src/seed.ts TOOLSHOP_DEMO, for projects created from the Toolshop sample SOW.
const TOOLSHOP_DEMO = {
  broken: 'https://with-bugs.practicesoftwaretesting.com/',
  fixed: 'https://practicesoftwaretesting.com/',
  source: 'Public practice store by Testsmith (practicesoftwaretesting.com) — standing in for the freelancer’s work. Shared sandbox: other testers can change its data.',
  bugs: 'price sort is reversed, an empty search shows no message, the cart line price stays $0.00, Remove does nothing, and product images have no alt text',
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
  // Demo storyline: the first submission is revision 1 (planted bugs the computer agent catches),
  // every later one is the fixed build. Toolshop uses two public builds, so nothing is deployed
  // and Kernel can reach them; Northwind uses the two copies this server hosts.
  const base = config?.publicBaseUrl || location.origin;
  const demo = p.demoUrls || (/Toolshop Online Hardware Store/.test(ag?.sowText || '') ? TOOLSHOP_DEMO : null);
  const brokenUrl = demo ? demo.broken : `${base}/demo-store-v1/index.html`;
  const fixedUrl = demo ? demo.fixed : `${base}/demo-store/index.html`;
  const bugs = demo ? demo.bugs : "filters don't combine and the cart total ignores the quantity";
  const showDemo = p.isDemo || !!demo;
  const defaultUrl = subs.length ? fixedUrl : brokenUrl;
  // The sample report claims everything passes — useful in the demo because the browser run
  // then contradicts it on revision 1, and covers the sandbox confirmation the agent never clicks.
  const [f, setF] = useState({ url: '', notes: '', authorize: true, demo: !!p.isDemo });
  const [claims, setClaims] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<FileList | null>(null);
  const [showForm, setShowForm] = useState(false);
  const a = useAction();
  useEffect(() => { setF((x) => ({ ...x, url: x.url || (showDemo ? defaultUrl : '') })); }, [defaultUrl]);

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
    setQaId(null); setClaims({}); setFiles(null); setShowForm(false); setF((x) => ({ ...x, url: '' }));
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
              {showDemo && (
                <p className="mt-1.5 text-[12px] text-ink-3">
                  Demo deliverable: <button type="button" className="underline decoration-rule-strong underline-offset-2 hover:text-ink" onClick={() => setF({ ...f, url: brokenUrl })}>revision 1</button> has planted bugs ({bugs});{' '}
                  <button type="button" className="underline decoration-rule-strong underline-offset-2 hover:text-ink" onClick={() => setF({ ...f, url: fixedUrl })}>revision 2</button> is the fixed build. {subs.length ? 'Revision 2' : 'Revision 1'} is pre-filled.
                  {demo && <span className="mt-0.5 block">{demo.source}</span>}
                </p>
              )}
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
                  {q && (q.heldForFreelancer || (s.precheck && !s.precheck.passed && !s.precheck.sentAnywayAt)
                    ? <Badge tone="hold">Back with freelancer</Badge>
                    : <Badge>{q.status === 'RUNNING' ? 'UNDER_REVIEW' : q.overall}</Badge>)}
                  {s.precheck?.sentAnywayAt && <Badge tone="seal">Sent on by freelancer</Badge>}
                  <div className="flex gap-1">
                    {q && !active && !q.heldForFreelancer && <button className="btn-secondary" onClick={() => setQaId(q.id)}>View report</button>}
                    {party === 'freelancer' && <button className="btn-ghost" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/submissions/${s.id}/rerun-qa`); await reload(); })}>Check again</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── The report ── */}
      {qa && qa.heldForFreelancer ? (
        // Client side: the revision exists and went back; its findings are the freelancer's working notes.
        <div className="sheet p-5">
          <h3 className="h2">Revision {subs.find((s: any) => s.id === qa.submissionId)?.revision} went back to the freelancer</h3>
          <p className="mt-1.5 max-w-2xl text-[13px] text-ink-2">
            The automated checks found too much still unfinished to ask for your review yet, so it was returned to the
            freelancer with what to fix. You will be asked to review once a revision passes — or if the freelancer
            sends this one to you with a reason. Nothing is decided and no money moves in the meantime.
          </p>
        </div>
      ) : qa ? (
        <div>
          <h3 className="h2 mb-3">Verification report</h3>
          {party === 'freelancer' && <PrecheckBanner sub={subs.find((s: any) => s.id === qa.submissionId)} isLatest={qa.submissionId === subs.at(-1)?.id} projectId={p.id} reload={reload} onRevise={() => setShowForm(true)} />}
          {party === 'client' && subs.find((s: any) => s.id === qa.submissionId)?.precheck?.sentAnywayReason && (
            <div className="mb-4 rounded-[3px] border-l-2 border-hold bg-hold-wash px-4 py-3 text-[13px] text-hold">
              <b className="font-medium">Sent to you despite unfinished checks.</b> The freelancer said: "{subs.find((s: any) => s.id === qa.submissionId)?.precheck?.sentAnywayReason}"
            </div>
          )}
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
