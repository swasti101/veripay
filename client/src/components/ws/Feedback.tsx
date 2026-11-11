import { useState } from 'react';
import { api, dt } from '../../api';
import { Badge, Empty, ErrorNote, Section, SimTag, useAction } from '../ui';
import type { WsProps } from '../../pages/Workspace';

const CAT_HELP: Record<string, string> = {
  SOW_DISSATISFACTION: 'An agreed requirement may not have been met → enters QA / expert review.',
  QUALITY_CONCERN: 'May meet the requirement but has a quality issue that needs review.',
  SUBJECTIVE_PREFERENCE: 'A different preference with no SOW basis → does not withhold earned payment.',
  OUT_OF_SCOPE_REQUEST: 'Something additional → routed to a scope-change request.',
  UNCLEAR: 'More information needed.',
};

export default function Feedback({ v, reload, mid }: WsProps) {
  const p = v.project, party = v.party;
  const ag = v.activeAgreement;
  const reqs = ag?.requirements.filter((r: any) => r.milestoneId === mid) || [];
  const sub = v.submissions.filter((s: any) => s.milestoneId === mid).at(-1);
  const list = v.feedback.filter((f: any) => f.milestoneId === mid);
  const [rating, setRating] = useState('');
  const [items, setItems] = useState<{ text: string; requirementId: string }[]>([{ text: '', requirementId: '' }]);
  const [additional, setAdditional] = useState('');
  const a = useAction();
  if (!ag) return <Empty title="No approved agreement yet" />;

  return (
    <div className="space-y-4">
      {party === 'client' && sub && (
        <Section title={`How satisfied are you with ${mid}, revision ${sub.revision}?`}>
          <div className="mb-3 rounded-[3px] bg-paper p-3 text-xs text-ink-2">Your satisfaction is an important signal, but it does not override the agreed SOW. Please link each concern to a requirement where possible — the Client Expectation Agent distinguishes unmet requirements from new requests or preferences.</div>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            {[['FULLY_SATISFIED', 'Fully satisfied', 'border-released/40 bg-released-wash'], ['PARTIALLY_SATISFIED', 'Partially satisfied', 'border-hold/40 bg-hold-wash'], ['NOT_SATISFIED', 'Not satisfied', 'border-refuse/40 bg-refuse-wash']].map(([k, l, c]) => (
              <button key={k} onClick={() => setRating(k)} className={`rounded-[4px] border-2 p-3 font-medium ${rating === k ? c : 'border-rule bg-white'}`}>{l}</button>
            ))}
          </div>
          {rating && rating !== 'FULLY_SATISFIED' && (
            <div className="space-y-2">
              <label className="label">What are you dissatisfied with?</label>
              {items.map((it, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <select className="input w-56" value={it.requirementId} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, requirementId: e.target.value } : x)))}>
                    <option value="">Not tied to a requirement</option>{reqs.map((r: any) => <option key={r.id} value={r.id}>{r.id} {r.title}</option>)}
                  </select>
                  <input className="input flex-1" placeholder="Describe the issue" value={it.text} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                </div>
              ))}
              <button className="btn-ghost text-xs" onClick={() => setItems([...items, { text: '', requirementId: '' }])}>+ Another issue</button>
            </div>
          )}
          {rating && <div className="mt-2"><label className="label">Additional feedback</label><textarea className="input" rows={2} value={additional} onChange={(e) => setAdditional(e.target.value)} /></div>}
          {p.isDemo && rating && rating !== 'FULLY_SATISFIED' && (
            <button className="btn-ghost mt-2 text-xs" onClick={() => setItems([{ text: 'Search should tolerate typos like "lnen" and rank the best matches first, like Amazon does', requirementId: reqs.find((r: any) => /search/i.test(r.title))?.id || '' }, { text: 'I would prefer a darker colour scheme on the cart page', requirementId: reqs.find((r: any) => /cart/i.test(r.title))?.id || '' }])}>Fill sample client concerns <SimTag label="DEMO" /></button>
          )}
          <ErrorNote error={a.error} />
          <div className="mt-3"><button className="btn-primary" disabled={!rating || a.busy} onClick={() => a.run(async () => { await api.post(`/projects/${p.id}/milestones/${mid}/feedback`, { rating, items: items.filter((x) => x.text.trim()), additional }); setRating(''); setItems([{ text: '', requirementId: '' }]); setAdditional(''); await reload(); })}>Submit feedback</button></div>
        </Section>
      )}
      {party === 'client' && !sub && <Empty title="Nothing submitted for this milestone yet" />}
      <Section title="Feedback & classification">
        {list.length === 0 ? <p className="muted">No feedback yet.</p> : [...list].reverse().map((f: any) => (
          <div key={f.id} className="mb-3 rounded-[3px] border border-rule p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2"><Badge>{f.rating}</Badge><span className="text-xs text-ink-3">{dt(f.createdAt)} · classified by {f.aiSource}</span></div>
            {f.classification.length === 0 ? <p className="text-sm text-ink-2">No issues raised.</p> : (
              <ul className="space-y-2">{f.classification.map((c: any, i: number) => (
                <li key={i} className="text-sm"><div className="flex flex-wrap items-center gap-2"><Badge>{c.category}</Badge>{c.requirementId && <b>{c.requirementId}</b>}<span>"{c.text}"</span></div>
                  <div className="ml-1 text-xs text-ink-3">{c.rationale} {CAT_HELP[c.category]}</div></li>
              ))}</ul>
            )}
          </div>
        ))}
      </Section>
    </div>
  );
}
