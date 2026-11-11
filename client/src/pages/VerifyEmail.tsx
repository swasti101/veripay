import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { ErrorNote, Spinner } from '../components/ui';

// Module-scoped: verifying flips auth state, which remounts this route under the
// authenticated router. A component ref would reset, re-POST the single-use token and 400.
const attempted = new Map<string, 'ok' | 'error'>();

export default function VerifyEmail() {
  const [sp] = useSearchParams();
  const { refreshUser } = useApp();
  const nav = useNavigate();
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const token = sp.get('token');
    if (!token) { setState('error'); setErr('Missing token'); return; }
    const prior = attempted.get(token);
    if (prior === 'ok') { setState('ok'); nav('/', { replace: true }); return; }
    if (prior === 'error') { setState('error'); setErr('Verification link is invalid or has already been used.'); return; }
    attempted.set(token, 'ok'); // claim before awaiting so a remount cannot re-POST
    api.post('/auth/verify-email', { token })
      .then(async () => { await refreshUser(); setState('ok'); setTimeout(() => nav('/', { replace: true }), 1200); })
      .catch((e: any) => { attempted.set(token, 'error'); setState('error'); setErr(e.message); });
  }, [sp, nav, refreshUser]);
  return (
    <div className="mx-auto max-w-md p-10">
      <div className="card p-6">
        <h1 className="text-xl font-bold">Verifying your email…</h1>
        {state === 'pending' && <div className="mt-3"><Spinner /></div>}
        {state === 'ok' && <p className="mt-3 text-released">Verified. Redirecting…</p>}
        {state === 'error' && <ErrorNote error={err} />}
      </div>
    </div>
  );
}
