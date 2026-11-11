import { useEffect, useRef, useState } from 'react';
import { api, dt } from '../../api';
import { Badge, ErrorNote, Section, useAction } from '../ui';
import type { WsProps } from '../../pages/Workspace';
import { useApp } from '../../App';

export default function Conversation({ v, reload }: WsProps) {
  const { user } = useApp();
  const p = v.project, party = v.party;
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'pm' | 'all' | 'response'>('pm');
  const a = useAction();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [v.messages.length]);
  const send = () => a.run(async () => {
    await api.post(`/projects/${p.id}/messages`, { text, audience: mode === 'pm' ? party : 'all', askPM: mode === 'pm', kind: mode === 'response' ? 'response' : 'chat' });
    setText(''); await reload();
  });

  return (
    <Section title="Project conversation & AI Project Manager">
      <p className="mb-3 text-xs text-slate-500">AI agents (Project Manager, Client Expectation, Freelancer Delivery, QA Mediator) post here when something needs a person — clarifications, missing evidence, deadlines, escalations. They recommend and coordinate; they never make contractual decisions.</p>
      <div className="max-h-[520px] space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
        {v.messages.length === 0 && <p className="muted">No messages yet.</p>}
        {v.messages.map((m: any) => {
          const mine = m.from === user.id;
          const agent = m.fromType === 'agent';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm shadow-sm ${agent ? 'border border-indigo-100 bg-indigo-50' : mine ? 'bg-indigo-600 text-white' : 'bg-white'}`}>
                <div className={`mb-0.5 flex flex-wrap items-center gap-1 text-[11px] ${mine && !agent ? 'text-indigo-100' : 'text-slate-500'}`}>
                  <b>{agent ? m.agent : v.users[m.from]?.name}</b> · {dt(m.createdAt)} {m.audience !== 'all' && <Badge tone="slate">{`to ${m.audience}`}</Badge>} {m.kind !== 'chat' && <Badge>{m.kind.toUpperCase()}</Badge>}
                </div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2 text-sm">
          {([['pm', 'Ask the AI Project Manager (private)'], ['all', 'Message both parties'], ['response', 'Formal response / explanation']] as const).map(([k, l]) => (
            <button key={k} className={`rounded-full border px-3 py-1 ${mode === k ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300'}`} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'pm' ? 'e.g. Does the SOW cover typo-tolerant search?' : 'Write a message…'} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && text.trim()) { e.preventDefault(); send(); } }} />
          <button className="btn-primary" disabled={a.busy || !text.trim()} onClick={send}>Send</button>
        </div>
        <ErrorNote error={a.error} />
      </div>
    </Section>
  );
}
