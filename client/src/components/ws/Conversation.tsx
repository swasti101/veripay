import { useEffect, useMemo, useRef, useState } from 'react';
import { api, dt } from '../../api';
import { ErrorNote, SimTag, useAction } from '../ui';
import type { WsProps } from '../../pages/Workspace';
import { useApp } from '../../App';

/* Each agent has one job, so each gets one identity. Showing who is speaking — and to
   whom — is what makes "an agent is mediating between the two of you" legible. */
const AGENTS: Record<string, { short: string; role: string; dot: string }> = {
  'AI Project Manager': { short: 'PM', role: 'Coordinates the project and flags what needs a person', dot: 'bg-ink' },
  'Client Expectation Agent': { short: 'CE', role: 'Weighs client requests against the agreed scope', dot: 'bg-seal' },
  'Freelancer Delivery Agent': { short: 'FD', role: 'Tells the freelancer what the checks found and what to fix', dot: 'bg-released' },
  'QA Mediator Agent': { short: 'QA', role: 'Neutral — combines the three analysers into a verdict', dot: 'bg-panel' },
};

const KIND_LABEL: Record<string, string> = {
  clarification: 'Needs clarification', escalation: 'Escalation', evidence_request: 'Feedback on your work',
  challenge: 'Dispute', response: 'Formal response', notice: '',
};

type Filter = 'all' | 'agents' | 'people';

export default function Conversation({ v, reload }: WsProps) {
  const { user } = useApp();
  const p = v.project, party = v.party;
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'pm' | 'all' | 'response'>('pm');
  const [filter, setFilter] = useState<Filter>('all');
  const a = useAction();
  const end = useRef<HTMLDivElement>(null);

  const msgs = useMemo(() => v.messages.filter((m: any) =>
    filter === 'all' ? true : filter === 'agents' ? m.fromType === 'agent' : m.fromType === 'user'), [v.messages, filter]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);

  const send = () => a.run(async () => {
    await api.post(`/projects/${p.id}/messages`, { text, audience: mode === 'pm' ? party : 'all', askPM: mode === 'pm', kind: mode === 'response' ? 'response' : 'chat' });
    setText(''); await reload();
  });
  const clean = (n?: string) => (n || '').replace(/ \((DEMO|SIMULATED)[^)]*\)/, '');
  const suggestions = party === 'client'
    ? ['Can you also add typo-tolerant search?', 'Does the agreement cover an admin login?', 'When is the next milestone due?']
    : ['What does the client mean by "fast" search?', 'What is still blocking payment on this milestone?', 'Is a dark mode in scope?'];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="sheet flex min-h-[560px] flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-5 py-3">
          <div className="flex gap-0.5">
            {([['all', 'Everything'], ['agents', 'Agents only'], ['people', 'People only']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`rounded-[3px] px-2.5 py-1 text-[12px] transition-colors ${filter === k ? 'bg-paper font-medium text-ink' : 'text-ink-3 hover:text-ink'}`}>{l}</button>
            ))}
          </div>
          <span className="text-[12px] text-ink-3">{msgs.length} message{msgs.length === 1 ? '' : 's'}</span>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5" style={{ maxHeight: 620 }}>
          {msgs.length === 0 && <p className="py-10 text-center text-[13px] text-ink-3">No messages yet. Agents post here when something needs a person.</p>}
          {msgs.map((m: any) => {
            const mine = m.from === user.id;
            const agent = m.fromType === 'agent' ? AGENTS[m.agent] || { short: 'AI', role: '', dot: 'bg-ink-3' } : null;
            const private_ = m.audience !== 'all';
            const kind = KIND_LABEL[m.kind];
            return (
              <div key={m.id} className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
                {/* Avatar: agents get a square monogram, people a round initial. */}
                <div className={`grid h-8 w-8 shrink-0 place-items-center text-[11px] font-semibold text-white ${agent ? `rounded-[4px] ${agent.dot}` : 'rounded-full bg-ink-3'}`}>
                  {agent ? agent.short : clean(v.users[m.from]?.name).charAt(0) || '?'}
                </div>
                <div className={`min-w-0 max-w-[78%] ${mine ? 'text-right' : ''}`}>
                  <div className={`mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] ${mine ? 'justify-end' : ''}`}>
                    <span className="font-medium text-ink">{agent ? m.agent : mine ? 'You' : clean(v.users[m.from]?.name)}</span>
                    {agent && <span className="text-ink-3">AI agent</span>}
                    {private_ && <span className="text-ink-3">· only to the {m.audience}</span>}
                    <span className="text-ink-3">· {dt(m.createdAt)}</span>
                  </div>
                  {kind && <div className={`mb-1 text-[11px] font-medium ${m.kind === 'escalation' || m.kind === 'challenge' ? 'text-refuse' : m.kind === 'clarification' ? 'text-panel' : 'text-seal'}`}>{kind}</div>}
                  <div className={`inline-block whitespace-pre-wrap rounded-[4px] px-3.5 py-2.5 text-left text-[13px] leading-relaxed ${
                    mine ? 'bg-ink text-white' : agent ? 'border border-rule bg-paper text-ink' : 'border border-rule bg-surface text-ink'}`}>
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={end} />
        </div>

        <div className="border-t border-rule p-4">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {([['pm', 'Ask the AI project manager', 'Private — only you see the answer'], ['all', `Message the ${party === 'client' ? 'freelancer' : 'client'}`, 'Both of you see it'], ['response', 'Formal response', 'Recorded as your position in a dispute']] as const).map(([k, l, h]) => (
              <button key={k} onClick={() => setMode(k)} title={h}
                className={`rounded-[3px] border px-2.5 py-1 text-[12px] transition-colors ${mode === k ? 'border-seal bg-seal-wash text-seal' : 'border-rule text-ink-2 hover:bg-paper'}`}>{l}</button>
            ))}
          </div>
          {mode === 'pm' && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setText(s)} className="rounded-[3px] bg-paper px-2 py-1 text-[11px] text-ink-2 hover:text-ink">{s}</button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={mode === 'pm' ? 'Ask whether something is in scope, what is blocking payment, when something is due…' : 'Write a message…'}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && text.trim()) { e.preventDefault(); send(); } }} />
            <button className="btn-primary self-end" disabled={a.busy || !text.trim()} onClick={send}>Send</button>
          </div>
          <ErrorNote error={a.error} />
        </div>
      </div>

      <aside className="space-y-3">
        <div className="sheet p-4">
          <h3 className="h2 mb-3">Who is in this conversation</h3>
          <ul className="space-y-3">
            {Object.entries(AGENTS).map(([name, x]) => (
              <li key={name} className="flex gap-2.5">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-[3px] text-[10px] font-semibold text-white ${x.dot}`}>{x.short}</span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-ink">{name}</span>
                  <span className="block text-[11px] leading-snug text-ink-3">{x.role}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-3">
            Agents recommend and coordinate. They never change the agreement or move money — those need both of you.
          </p>
        </div>
        {p.isDemo && (
          <div className="sheet p-4 text-[12px] text-ink-2">
            <SimTag label="demo tip" />
            <p className="mt-2">Ask the project manager "Can you also add typo-tolerant search?" — it checks the request against the agreed scope and tells you whether it is already covered or needs a priced change request.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
