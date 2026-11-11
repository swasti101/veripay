import { createContext, lazy, Suspense, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useMatch } from 'react-router-dom';
import { api } from './api';
import { Spinner } from './components/ui';
import Shell from './components/Shell';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateProject from './pages/CreateProject';
import JoinInvite from './pages/JoinInvite';
import Workspace from './pages/Workspace';
import ExpertPortal from './pages/ExpertPortal';
import Integrations from './pages/Integrations';
import Analytics from './pages/Analytics';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';
const Board = lazy(() => import('./pages/Board'));

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
  const loc = useLocation();
  const refreshUser = useCallback(async () => setUser((await api.get('/auth/me')).user), []);
  useEffect(() => { refreshUser(); api.get('/config').then(setConfig); }, [refreshUser]);
  const logout = async () => { await api.post('/auth/logout'); setUser(null); nav('/'); };

  if (user === undefined) return <div className="p-10"><Spinner label="Loading…" /></div>;

  return (
    <AppCtx.Provider value={{ user, config, refreshUser, logout }}>
      {!user ? (
        <Routes>
          <Route path="/" element={<Landing onSignIn={() => nav('/signin')} />} />
          <Route path="/signin" element={<Login />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/join/:code" element={<Login />} />
          {/* Deep links into the app land on sign-in, then return to where they were going. */}
          <Route path="*" element={<Navigate to="/signin" replace state={{ from: loc.pathname }} />} />
        </Routes>
      ) : (
        <Framed>
          <Routes>
            <Route path="/" element={user.role === 'expert' ? <ExpertPortal /> : <Dashboard />} />
            <Route path="/signin" element={<Navigate to="/" replace />} />
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
        </Framed>
      )}
    </AppCtx.Provider>
  );
}

/** Every signed-in page sits in the side-nav shell. The project id is read here so the
 *  rail can show that project's sections without each page wiring it through. */
function Framed({ children }: { children: ReactNode }) {
  const m = useMatch('/projects/:id/*');
  return (
    <Shell projectId={m?.params.id}>
      <VerifyBanner />
      {children}
    </Shell>
  );
}

/** Unverified real accounts can browse but not create or join projects. */
function VerifyBanner() {
  const { user } = useApp();
  const [sent, setSent] = useState<string | null>(null);
  if (user.isDemo || user.emailVerifiedAt) return null;
  return (
    <div className="border-b border-hold/30 bg-hold-wash px-6 py-2.5 text-[13px] text-hold">
      <div className="flex flex-wrap items-center gap-2">
        <b className="font-medium">Verify your email</b> to create or join projects. We sent a link to {user.email}.
        <button className="btn-secondary ml-auto" onClick={async () => { await api.post('/auth/resend-verification', { email: user.email }); setSent('Sent. Check your inbox, or the local mailbox on the sign-in page.'); }}>Resend link</button>
        {sent && <span className="text-released">{sent}</span>}
      </div>
    </div>
  );
}
