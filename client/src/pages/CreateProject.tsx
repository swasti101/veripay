import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { ErrorNote, Spinner, useAction, SimTag } from '../components/ui';

export default function CreateProject() {
  const { user, config } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ title: '', description: '', category: 'website', sowText: '' });
  const [file, setFile] = useState<File | null>(null);
  const a = useAction();
  const submit = () => a.run(async () => {
    const { project } = await api.post('/projects', { title: f.title, description: f.description, category: f.category });
    const fd = new FormData();
    if (file) fd.append('file', file); else fd.append('sowText', f.sowText);
    await api.post(`/projects/${project.id}/sow`, fd);
    nav(`/projects/${project.id}/agreement`);
  });

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New project</h1>
        <p className="muted">As the {user.role}, you create the project and upload the SOW. AI extracts requirements, milestones and payment terms for you to review. You then invite the {user.role === 'client' ? 'freelancer' : 'client'}; nothing is binding until both of you approve.</p>
      </div>
      <div className="card space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2"><label className="label">Project title</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Northwind storefront rebuild" /></div>
          <div><label className="label">Category</label>
            <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="website">Website / web app</option><option value="backend">Backend / API</option><option value="design">Design</option><option value="content">Content / documentation</option>
            </select>
          </div>
        </div>
        <div><label className="label">Short description</label><textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <label className="label !mb-0">Statement of Work</label>
            <button type="button" className="btn-ghost text-xs" onClick={async () => { const s = await api.get('/demo/sample-sow'); setF({ ...f, sowText: s.text, title: f.title || 'Northwind Outfitters — E-Commerce Storefront' }); setFile(null); }}>
              Load sample e-commerce SOW <SimTag label="DEMO" />
            </button>
          </div>
          <textarea className="input font-mono text-xs" rows={14} value={f.sowText} disabled={!!file} onChange={(e) => setF({ ...f, sowText: e.target.value })} placeholder="Paste the SOW text, or upload a .txt / .md file below." />
          <div className="mt-2 flex items-center gap-3 text-sm">
            <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file && <button className="btn-ghost" onClick={() => setFile(null)}>Clear file</button>}
          </div>
          <p className="mt-2 text-xs text-slate-500">Extraction engine: <b>{config?.ai.label}</b>. It only extracts what the SOW states and flags anything vague or missing for clarification — it never invents requirements or amounts.</p>
        </div>
        <ErrorNote error={a.error} />
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => nav('/')}>Cancel</button>
          <button className="btn-primary" disabled={a.busy || !f.title.trim() || (!file && f.sowText.trim().length < 40)} onClick={submit}>{a.busy ? <Spinner label="Analysing SOW…" /> : 'Create & analyse SOW'}</button>
        </div>
      </div>
    </main>
  );
}
