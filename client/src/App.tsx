import { createContext, lazy, Suspense, useContext, useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, Link, NavLink, useNavigate } from 'react-router-dom';
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
const Board = lazy(() => import('./pages/Board'));
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
            <Route path="/board" element={<Suspense fallback={<div className="p-8"><Spinner label="Loading board…" /></div>}><Board /></Suspense>} />
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
  const nav = [
    ...(user.role !== 'expert' ? [['/', 'Projects'], ['/board', 'Delivery board'], ['/analytics', 'Analytics']] : [['/', 'My reviews']]),
  ] as [string, string][];
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-[1400px] items-center gap-5 px-5 py-2.5">
        {/* Wordmark: the seal mark carries the "verdict" idea the product is built on. */}
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-[2px] bg-seal text-[13px] font-semibold text-white" style={{ fontFamily: 'var(--font-display)' }}>V</span>
          <span className="text-[16px] font-semibold tracking-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>VeriPay</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => `rounded-[3px] px-2.5 py-1.5 text-[13px] transition-colors ${isActive ? 'bg-paper font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {config && <IntegrationStrip config={config} />}
          {user.role !== 'expert' && <NotificationBell />}
          <div className="flex items-center gap-2 border-l border-rule pl-3">
            <span className="hidden text-right text-[13px] leading-tight sm:block">
              <span className="block font-medium text-ink">{user.name.replace(/ \((DEMO|SIMULATED)[^)]*\)/, '')}</span>
              <span className="block text-[11px] text-ink-3">{user.role}{user.isDemo ? ' · demo account' : ''}</span>
            </span>
            <button className="btn-secondary" onClick={logout}>Switch</button>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Integration truthfulness, always visible: a dot per provider, filled only when real. */
function IntegrationStrip({ config }: { config: Config }) {
  const items = [
    { live: config.paypal.mode !== 'SIMULATED', label: 'PayPal', detail: config.paypal.mode === 'SIMULATED' ? 'simulated' : config.paypal.mode.replace('PAYPAL_', '').toLowerCase() },
    { live: config.kernel.configured, label: 'Kernel', detail: config.kernel.configured ? 'live' : 'demo adapter' },
    { live: config.ai.configured, label: 'AI', detail: config.ai.configured ? config.ai.label.split(':')[0] : 'heuristic' },
  ];
  return (
    <Link to="/integrations" className="hidden items-center gap-3 rounded-[3px] px-2 py-1 hover:bg-paper lg:flex" title="Integration status — nothing is claimed as live unless it is">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${i.live ? 'bg-released' : 'border border-hold bg-hold-wash'}`} />
          {i.label} <span className="text-ink-3/70">{i.detail}</span>
        </span>
      ))}
    </Link>
  );
}

/** Unverified real accounts can browse but not create or join projects. */
function VerifyBanner() {
  const { user } = useApp();
  const [sent, setSent] = useState<string | null>(null);
  if (user.isDemo || user.emailVerifiedAt) return null;
  return (
    <div className="border-b border-hold/30 bg-hold-wash px-4 py-2 text-[13px] text-hold">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2">
        <b>Verify your email</b> to create or join projects. We sent a link to {user.email}.
        <button className="btn-secondary ml-auto" onClick={async () => { await api.post('/auth/resend-verification', { email: user.email }); setSent('Sent — check your inbox (or the dev mailbox on the sign-in page).'); }}>Resend link</button>
        {sent && <span className="text-released">{sent}</span>}
      </div>
    </div>
  );
}

