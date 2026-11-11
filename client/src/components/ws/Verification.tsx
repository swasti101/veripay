import { useState } from 'react';
import { dt } from '../../api';
import { Badge, ErrorNote, Modal, SimTag, Spinner } from '../ui';
import { ChallengeButton } from './Delivery';

/* The verification report is the moment the product exists for, so it is laid out the
   way a person would want to read it:
     1. the verdict, in one line
     2. each requirement, with what was expected, what was found, and by which analyser
     3. the three analysers' own records, so anyone can check the working  */

const AGENT_MODE: Record<string, { label: string; tone: string; note: string }> = {
  KERNEL_LIVE: { label: 'Kernel cloud browser', tone: 'released', note: 'Ran in a Kernel cloud browser.' },
  LOCAL_BROWSER: { label: 'Local browser', tone: 'seal', note: 'A real browser on this server, running the same script Kernel runs. Not a Kernel execution.' },
  DEMO_ADAPTER_HTTP_FETCH: { label: 'Static fetch only', tone: 'hold', note: 'No browser ran. Pages were fetched over HTTP, so nothing a user does on the page could be checked.' },
  SKIPPED: { label: 'Not run', tone: 'quiet', note: 'The freelancer did not authorize automated inspection.' },
};

const KIND_ICON: Record<string, string> = { open: '↗', resize: '⇔', navigate: '→', type: '⌨', select: '☰', click: '⊙', inspect: '◎' };

function sourceOf(e: string): 'agent' | 'text' | 'claim' {
  if (/^(Computer agent|Demo adapter|Kernel)/i.test(e)) return 'agent';
  if (/^Freelancer claim/i.test(e)) return 'claim';
  return 'text';
}

function VerdictHeader({ qa }: { qa: any }) {
  const counts: Record<string, number> = {};
  for (const r of qa.results) counts[r.status] = (counts[r.status] || 0) + 1;
  const sentence: Record<string, string> = {
    COMPLIANT: 'Every requirement in this milestone is met.',
    PARTIALLY_COMPLIANT: 'Some requirements are met; others are partly done.',
    INCOMPLETE: 'At least one requirement is not met.',
    DISPUTED: 'One or more requirements cannot be decided from the agreed wording.',
    UNVERIFIABLE: 'There is not enough evidence to decide.',
  };
  return (
    <div className="sheet p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[20px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              {qa.overall.replace(/_/g, ' ').toLowerCase().replace(/^./, (c: string) => c.toUpperCase())}
            </span>
            {qa.isSeed && <SimTag label="seeded example" />}
          </div>
          <p className="mt-1 text-[14px] text-ink-2">{sentence[qa.overall] || qa.mediatorSummary}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(counts).map(([s, n]) => (
            <span key={s} className="inline-flex items-center gap-1"><Badge>{s}</Badge><span className="text-[12px] tabular-nums text-ink-3">×{n}</span></span>
          ))}
        </div>
      </div>
      {/* Plain-language meaning of each verdict that appears in this report. */}
      <dl className="mt-4 space-y-1 border-t border-rule pt-3 text-[13px]">
        {Object.keys(counts).map((s) => (
          <div key={s} className="flex gap-2">
            <dt className="w-[150px] shrink-0"><Badge>{s}</Badge></dt>
            <dd className="text-ink-2">{STATUS_MEANING[s]}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-rule pt-3 text-[12px] text-ink-3">
        <span>Checked {dt(qa.createdAt)}</span>
        <span>Computer agent: <span className="text-ink-2">{AGENT_MODE[qa.kernel.mode]?.label || qa.kernel.mode}</span></span>
        <span>Vision: <span className="text-ink-2">{qa.vision.source.startsWith('heuristic') ? 'not run (no AI key)' : qa.vision.source}</span></span>
        <span>Text and mediator: <span className="text-ink-2">{qa.aiSource.startsWith('heuristic') ? 'rule-based (no AI key)' : qa.aiSource}</span></span>
      </div>
    </div>
  );
}

const STATUS_MEANING: Record<string, string> = {
  PASS: 'Every acceptance criterion has evidence that it is met.',
  PARTIAL: 'Some criteria are met and some are not yet.',
  FAIL: 'There is evidence that a criterion is not met — something was checked and it did not work.',
  UNVERIFIED: 'The analysers found no evidence either way. This is not a failure: it means "show us", not "you got it wrong".',
  NEEDS_CLARIFICATION: 'The agreed wording cannot be measured (for example "fast"). The client needs to say what they meant; it never counts against the freelancer.',
  OUT_OF_SCOPE: 'Not part of the agreement, so it does not affect this milestone.',
};

function RequirementRow({ r, req, qa, projectId, reload }: { r: any; req: any; qa: any; projectId: string; reload: () => void }) {
  const [open, setOpen] = useState(r.status !== 'PASS');
  const vision = qa.vision.findings.filter((f: any) => f.requirementId === r.requirementId);
  // Models sometimes echo the vision observation into the text findings; show it once.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const seenVision = new Set(vision.map((f: any) => norm(f.observation)));
  const text = qa.text.findings.filter((f: any) => f.requirementId === r.requirementId && !seenVision.has(norm(f.observation)));
  const groups = { agent: [] as string[], text: [] as string[], claim: [] as string[] };
  for (const e of r.evidence) groups[sourceOf(e)].push(e.replace(/^(Computer agent \([^)]*\)|Demo adapter \(static HTML\)):\s*/i, ''));
  return (
    <div className="border-b border-rule last:border-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-paper" aria-expanded={open}>
        <span className="mt-0.5 w-14 shrink-0 text-[12px] font-medium tabular-nums text-ink-3">{r.requirementId}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">{req?.title}</span>
          <span className="mt-0.5 block text-[13px] text-ink-2">{r.explanation}</span>
        </span>
        <span className="shrink-0"><Badge>{r.status}</Badge></span>
        <span className={`mt-0.5 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="grid gap-5 px-5 pb-5 pl-[88px] md:grid-cols-2">
          <div>
            <div className="field-label">What the agreement asks for</div>
            <ul className="space-y-1 text-[13px] text-ink-2">
              {(req?.acceptanceCriteria || [r.expected]).map((c: string, i: number) => <li key={i} className="flex gap-2"><span className="text-ink-3">–</span>{c}</li>)}
            </ul>
            {req?.clarification && <p className="mt-2 text-[12px] text-ink-3">Agreed clarification: {req.clarification}</p>}
          </div>
          <div className="space-y-3">
            <Evidence title="Computer agent" items={groups.agent} />
            <Evidence title="Vision analyser" items={vision.map((f: any) => f.observation)} />
            <Evidence title="Text analyser" items={[...groups.text, ...text.map((f: any) => f.observation)]} />
            {groups.claim.length > 0 && <Evidence title="Freelancer's own claim" items={groups.claim} muted />}
          </div>
          {(r.guardrail || r.nextAction) && (
            <div className="md:col-span-2">
              {r.guardrail && (
                <div className="mb-2 rounded-[3px] border-l-2 border-panel bg-panel-wash px-3 py-2 text-[12px] text-panel">
                  <b className="font-medium">Fairness rule applied.</b> {r.guardrail}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-ink-2"><span className="text-ink-3">Next:</span> {r.nextAction}</p>
                {!qa.isSeed && <ChallengeButton projectId={projectId} targetType="qa" targetId={qa.id} requirementId={r.requirementId} label="Dispute this finding" onDone={reload} />}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Evidence({ title, items, muted }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div>
      <div className="field-label">{title}</div>
      {items.length === 0 ? <p className="text-[12px] text-ink-3">Nothing on this requirement.</p> : (
        <ul className={`space-y-1 text-[13px] ${muted ? 'text-ink-3 italic' : 'text-ink-2'}`}>
          {items.slice(0, 5).map((e, i) => <li key={i} className="flex gap-2"><span className="text-ink-3">·</span>{e}</li>)}
        </ul>
      )}
    </div>
  );
}

function AgentJourney({ k, onZoom }: { k: any; onZoom: (src: string, label: string) => void }) {
  const mode = AGENT_MODE[k.mode] || AGENT_MODE.SKIPPED;
  const steps = k.steps || [];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-[13px] text-ink-2">{mode.note}{k.sessionId && <> Session <span className="mono">{k.sessionId}</span>.</>}</p>
        <Badge tone={mode.tone}>{mode.label}</Badge>
      </div>
      {k.error && <ErrorNote error={k.error} />}
      {steps.length === 0 ? <p className="text-[13px] text-ink-3">No steps were recorded.</p> : (
        <ol className="space-y-0">
          {steps.map((s: any, i: number) => (
            <li key={s.n} className="relative flex gap-4 pb-5 last:pb-0">
              {/* the thread that ties the journey together */}
              {i < steps.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-rule" />}
              <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[12px] ${s.ok ? 'border-released/40 bg-released-wash text-released' : 'border-refuse/40 bg-refuse-wash text-refuse'}`}>
                {KIND_ICON[s.kind] || '·'}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="text-[13px] font-medium text-ink">{s.what}</div>
                <div className={`mt-0.5 text-[13px] ${s.ok ? 'text-ink-2' : 'text-refuse'}`}>{s.found}</div>
                <div className="mt-0.5 truncate text-[11px] text-ink-3">{s.url}</div>
              </div>
              {s.shot && (
                <button className="shrink-0 overflow-hidden rounded-[3px] border border-rule transition-colors hover:border-seal" onClick={() => onZoom(s.shot, `Step ${s.n} — ${s.what}`)} aria-label={`Enlarge screenshot for step ${s.n}`}>
                  <img src={s.shot} alt={`Screenshot after: ${s.what}`} className="h-[68px] w-[110px] object-cover object-top" loading="lazy" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {k.consoleErrors?.length > 0 && (
        <div className="mt-4 rounded-[3px] border-l-2 border-hold bg-hold-wash px-3 py-2 text-[12px] text-hold">
          The page logged {k.consoleErrors.length} JavaScript error(s): {k.consoleErrors.slice(0, 2).join(' · ')}
        </div>
      )}
    </div>
  );
}

export default function VerificationReport({ qa, ag, projectId, reload }: { qa: any; ag: any; projectId: string; reload: () => void }) {
  const [panel, setPanel] = useState<'agent' | 'vision' | 'text'>('agent');
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);

  if (qa.status === 'RUNNING') {
    return (
      <div className="sheet p-6">
        <Spinner label="The analysers are working…" />
        <ul className="mt-4 space-y-1.5 text-[13px] text-ink-2">
          <li>The computer agent is opening the site and using it.</li>
          <li>The vision analyser will read the screenshots it captures.</li>
          <li>The text analyser is reading the notes, documents and claims.</li>
        </ul>
      </div>
    );
  }
  if (qa.status === 'ERROR') return <ErrorNote error={`Verification failed: ${qa.error}`} />;

  const k = qa.kernel;
  const shots = [...(k.screenshots || [])];
  const tabs: [typeof panel, string, string][] = [
    ['agent', 'Computer agent', `${(k.steps || []).length} steps`],
    ['vision', 'Vision analyser', `${shots.length} images`],
    ['text', 'Text analyser', `${qa.text.findings.length} findings`],
  ];

  return (
    <div className="space-y-6">
      <VerdictHeader qa={qa} />

      <div className="sheet">
        <div className="border-b border-rule px-5 py-3">
          <h3 className="h2">Requirement by requirement</h3>
          <p className="text-[12px] text-ink-3">Open any row to see what was expected and which analyser found what.</p>
        </div>
        {qa.results.map((r: any) => (
          <RequirementRow key={r.requirementId} r={r} req={ag.requirements.find((x: any) => x.id === r.requirementId)} qa={qa} projectId={projectId} reload={reload} />
        ))}
      </div>

      <div className="sheet">
        <div className="flex flex-wrap gap-1 border-b border-rule px-3">
          {tabs.map(([key, label, sub]) => (
            <button key={key} onClick={() => setPanel(key)}
              className={`-mb-px border-b-2 px-3 py-3 text-left transition-colors ${panel === key ? 'border-seal' : 'border-transparent hover:bg-paper'}`}>
              <span className={`block text-[13px] ${panel === key ? 'font-medium text-ink' : 'text-ink-2'}`}>{label}</span>
              <span className="block text-[11px] text-ink-3">{sub}</span>
            </button>
          ))}
        </div>
        <div className="p-5">
          {panel === 'agent' && <AgentJourney k={k} onZoom={(src, label) => setZoom({ src, label })} />}

          {panel === 'vision' && (
            <div>
              <p className="mb-4 max-w-xl text-[13px] text-ink-2">
                {qa.vision.note} The vision analyser reports only what is visible — it is never allowed to pass
                a requirement that needs proof of behaviour.
              </p>
              {qa.vision.findings.length > 0 && (
                <ul className="mb-5 space-y-1.5 text-[13px]">
                  {qa.vision.findings.map((f: any, i: number) => <li key={i}><b className="font-medium text-ink">{f.requirementId}</b> <span className="text-ink-2">{f.observation}</span></li>)}
                </ul>
              )}
              {shots.length === 0 ? <p className="text-[13px] text-ink-3">No images were captured or submitted.</p> : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {shots.map((s: any) => (
                    <button key={s.id} onClick={() => setZoom({ src: s.path, label: s.label })} className="group overflow-hidden rounded-[3px] border border-rule text-left hover:border-seal">
                      <img src={s.path} alt={s.label} className="aspect-[16/10] w-full object-cover object-top" loading="lazy" />
                      <span className="block truncate border-t border-rule px-2 py-1.5 text-[11px] text-ink-3">{s.label.replace(/^Step \d+ — /, '')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {panel === 'text' && (
            <div>
              <p className="mb-4 max-w-xl text-[13px] text-ink-2">
                {qa.text.note} Completion claims are treated as claims, not as evidence.
              </p>
              {qa.text.findings.length === 0 ? <p className="text-[13px] text-ink-3">Nothing written was submitted for this milestone.</p> : (
                <ul className="divide-y divide-rule">
                  {qa.text.findings.map((f: any, i: number) => (
                    <li key={i} className="flex gap-4 py-2.5 text-[13px]">
                      <span className="w-14 shrink-0 font-medium tabular-nums text-ink-3">{f.requirementId}</span>
                      <span className="text-ink-2">{f.observation}</span>
                    </li>
                  ))}
                </ul>
              )}
              {qa.domainAgents?.length > 0 && (
                <details className="mt-5">
                  <summary className="cursor-pointer text-[13px] text-ink-2 hover:text-ink">Specialist reviewers' notes</summary>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {qa.domainAgents.map((g: any, i: number) => (
                      <div key={i}>
                        <div className="field-label">{g.agent}</div>
                        <ul className="space-y-1 text-[12px] text-ink-2">{g.findings.map((f: string, j: number) => <li key={j}>{f}</li>)}</ul>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal open={!!zoom} onClose={() => setZoom(null)} title={zoom?.label || ''} wide>
        {zoom && <img src={zoom.src} alt={zoom.label} className="w-full rounded-[3px] border border-rule" />}
      </Modal>
    </div>
  );
}
