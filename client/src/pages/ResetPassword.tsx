import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, useAction } from '../components/ui';

export default function ResetPassword() {
  const [sp] = useSearchParams();
  const [pw, setPw] = useState('');
  const a = useAction();
  const nav = useNavigate();
  const [done, setDone] = useState(false);
  return (
    <div className="mx-auto max-w-md p-10">
      <div className="card p-6">
        <h1 className="text-xl font-bold">Set a new password</h1>
        {done ? <p className="mt-3 text-released">Password updated. <button className="btn-primary mt-3" onClick={() => nav('/')}>Sign in</button></p> : (
          <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await api.post('/auth/reset-password', { token: sp.get('token'), password: pw }); setDone(true); }); }}>
            <div><label className="label" htmlFor="rp-pw">New password (at least 10 characters)</label><input id="rp-pw" className="input" type="password" autoComplete="new-password" minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <ErrorNote error={a.error} />
            <button className="btn-primary w-full" disabled={a.busy}>Update password</button>
          </form>
        )}
      </div>
    </div>
  );
}
