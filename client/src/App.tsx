import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { api } from './api';
import { Spinner, SimTag } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateProject from './pages/CreateProject';
import JoinInvite from './pages/JoinInvite';
import Workspace from './pages/Workspace';
import ExpertPortal from './pages/ExpertPortal';
import Integrations from './pages/Integrations';
import Analytics from './pages/Analytics';
import NotificationBell from './components/NotificationBell';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';

export interface Config {
  ai: { configured: boolean; label: string };
  kernel: { configured: boolean; mode: string };
  paypal: { mode: 'PAYPAL_SANDBOX' | 'PAYPAL_LIVE' | 'SIMULATED'; clientId: string | null; webhookVerification: boolean };
  apimatic: { sdk: string; openapi: string; sdkGeneration: boolean };
  publicBaseUrl: string | null;
}
interface Ctx { user: any; config: Config | null; refreshUser: () => Promise<void>; logout: () => Promise<void> }
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export default function App() {
  const [user, setUser] = useState<any>(undefined);
  const [config, setConfig] = useState<Config | null>(null);
  const nav = useNavigate();
  const refreshUser = useCallback(async () => setUser((await api.get('/auth/me')).user), []);
  useEffect(() => { refreshUser(); api.get('/config').then(setConfig); }, [refreshUser]);
  const logout = async () => { await api.post('/auth/logout'); setUser(null); nav('/'); };

  if (user === undefined) return <div className="p-10"><Spinner label="Loading…" /></div>;
  return (
    <AppCtx.Provider value={{ user, config, refreshUser, logout }}>
      {!user ? (
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/join/:code" element={<Login />} />
          <Route path="*" element={<Login />} />
        </Routes>
      ) : (
        <div className="min-h-screen">
          <TopBar />
          <VerifyBanner />
          <Routes>
            <Route path="/" element={user.role === 'expert' ? <ExpertPortal /> : <Dashboard />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/new" element={<CreateProject />} />
            <Route path="/join/:code" element={<JoinInvite />} />
            <Route path="/projects/:id/*" element={<Workspace />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      )}
    </AppCtx.Provider>
  );
}

function TopBar() {
  const { user, config, logout } = useApp();
  const roleTone = user.role === 'client' ? 'bg-sky-600' : user.role === 'freelancer' ? 'bg-emerald-600' : 'bg-violet-600';
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 font-bold text-slate-900">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-sm text-white">V</span> VeriPay
        </Link>
        <span className="hidden text-xs text-slate-500 md:inline">SOW-based delivery verification & milestone payments</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {config && (
            <Link to="/integrations" className="hidden items-center gap-1 text-[11px] sm:flex" title="Integration status">
              <Pill ok={config.paypal.mode !== 'SIMULATED'} label={config.paypal.mode === 'SIMULATED' ? 'PayPal: SIMULATED' : `PayPal: ${config.paypal.mode.replace('PAYPAL_', '')}`} />
              <Pill ok={config.kernel.configured} label={config.kernel.configured ? 'Kernel: live' : 'Kernel: demo adapter'} />
              <Pill ok={config.ai.configured} label={config.ai.configured ? 'AI: ' + config.ai.label.split(':')[0] : 'AI: heuristic'} />
            </Link>
          )}
          {user.role !== 'expert' && <Link to="/analytics" className="btn-ghost hidden sm:inline-flex">Analytics</Link>}
          {user.role !== 'expert' && <NotificationBell />}
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${roleTone}`}>{user.role}</span>
          <span className="text-sm text-slate-700">{user.name}</span>
          {user.isDemo && <SimTag label="DEMO" />}
          <button className="btn-ghost" onClick={logout}>Switch user</button>
        </div>
      </div>
    </header>
  );
}

/** Unverified real accounts can browse but not create or join projects. */
function VerifyBanner() {
  const { user } = useApp();
  const [sent, setSent] = useState<string | null>(null);
  if (user.isDemo || user.emailVerifiedAt) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
        <b>Verify your email</b> to create or join projects. We sent a link to {user.email}.
        <button className="btn-secondary ml-auto" onClick={async () => { await api.post('/auth/resend-verification', { email: user.email }); setSent('Sent — check your inbox (or the dev mailbox on the sign-in page).'); }}>Resend link</button>
        {sent && <span className="text-emerald-800">{sent}</span>}
      </div>
    </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 font-medium ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{label}</span>;
}
