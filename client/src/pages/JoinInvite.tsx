import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, money } from '../api';
import { useApp } from '../App';
import { ErrorNote, Spinner, useAction } from '../components/ui';

export default function JoinInvite() {
  const { code } = useParams();
  const { user } = useApp();
  const nav = useNavigate();
  const [inv, setInv] = useState<any>(null);
  const a = useAction();
  useEffect(() => { a.run(async () => setInv(await api.get(`/invites/${code}`))); }, [code]);
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="card space-y-4 p-6">
        <h1 className="text-xl font-bold">Project invitation</h1>
        {!inv && !a.error && <Spinner label="Loading invite…" />}
        <ErrorNote error={a.error} />
        {inv && (
          <>
            <p className="text-ink"><b>{inv.invitedBy}</b> invited you to join <b>{inv.title}</b> as the <b>{inv.role}</b>.</p>
            {inv.description && <p className="muted">{inv.description}</p>}
            {inv.draft && <div className="rounded-[3px] bg-paper p-3 text-sm">Draft agreement v{inv.draft.version}: {inv.draft.requirements.length} requirements, {inv.draft.milestones.length} milestones, budget {money(inv.draft.budget)}. You review and approve it after joining — joining does not approve anything.</div>}
            {user.role !== inv.role && <ErrorNote error={`You are signed in as a ${user.role}. Switch to a ${inv.role} account to accept.`} />}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => nav('/')}>Not now</button>
              <button className="btn-primary" disabled={a.busy || user.role !== inv.role} onClick={() => a.run(async () => { const r = await api.post(`/invites/${code}/accept`); nav(`/projects/${r.projectId}/agreement`); })}>Join project</button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
