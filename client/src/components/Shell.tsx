import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp, type Config } from '../App';
import Logo from './Logo';
import NotificationBell from './NotificationBell';
import { SimTag } from './ui';

/** Project sections, in the order the work actually happens. */
export const PROJECT_NAV: [string, string, string][] = [
  ['overview', 'Overview', 'Where the project stands'],
  ['agreement', 'Scope & agreement', 'The SOW baseline both sides signed'],
  ['funding', 'Funding', 'Commit money per milestone'],
  ['delivery', 'Submit & verify', 'Deliverables and what the agents found'],
  ['feedback', 'Client review', 'Satisfaction, classified against the SOW'],
  ['experts', 'Expert panel', 'Independent reviewers and their votes'],
  ['payments', 'Payment decision', 'How the amount was calculated'],
  ['scope', 'Scope changes', 'In scope, or a new priced request'],
  ['conversation', 'Messages', 'You, the other party, and the agents'],
  ['timeline', 'Timeline', 'Milestones and payment checkpoints'],
  ['audit', 'Audit trail', 'Every decision and its evidence'],
];

function NavItem({ to, label, hint, end, badge }: { to: string; label: string; hint?: string; end?: boolean; badge?: number }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => `group flex items-start gap-2 rounded-[4px] px-2.5 py-[7px] transition-colors ${
        isActive ? 'bg-seal-wash text-seal' : 'text-ink-2 hover:bg-paper hover:text-ink'}`}>
      {({ isActive }) => (
        <>
          <span className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${isActive ? 'bg-seal' : 'bg-rule-strong group-hover:bg-ink-3'}`} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[13px] ${isActive ? 'font-medium' : ''}`}>{label}</span>
            {hint && <span className="block truncate text-[11px] text-ink-3">{hint}</span>}
          </span>
          {badge ? <span className="mt-0.5 shrink-0 rounded-[2px] bg-seal px-1 text-[10px] font-semibold text-white">{badge}</span> : null}
        </>
      )}
    </NavLink>
  );
}

/** App frame: a quiet left rail for navigation, everything else is the work surface. */
export default function Shell({ children, projectId }: { children: ReactNode; projectId?: string }) {
  const { user, config, logout } = useApp();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    if (user.role === 'expert') return;
    const load = () => api.get('/dashboard').then((d) => {
      setProjects(d.projects);
      const c: Record<string, number> = {};
      for (const p of d.projects) for (const x of p.pending) if (p.id === projectId) c[x.tab] = (c[x.tab] || 0) + 1;
      setCounts(c);
    }).catch(() => {});
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    return () => clearInterval(t);
  }, [projectId, user.role]);

  const current = projects.find((p) => p.id === projectId);
  const isExpert = user.role === 'expert';

  return (
    <div className="min-h-screen bg-paper">
      {/* Mobile bar */}
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-rule bg-surface px-4 py-2.5 lg:hidden">
        <button className="btn-ghost -ml-2" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <Link to="/"><Logo size="sm" /></Link>
        <div className="ml-auto flex items-center gap-2">
          {!isExpert && <NotificationBell />}
          <button className="btn-secondary" onClick={logout}>Switch</button>
        </div>
      </div>

      <div className="lg:flex">
        {/* ── Left rail ── */}
        <aside className={`${open ? 'block' : 'hidden'} shrink-0 border-b border-rule bg-surface lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[248px] lg:overflow-y-auto lg:border-b-0 lg:border-r`}>
          <div className="hidden px-4 py-4 lg:block">
            <Link to="/" className="inline-block"><Logo /></Link>
          </div>

          <nav className="space-y-5 px-3 pb-4 pt-3 lg:pt-0" onClick={() => setOpen(false)}>
            <div className="space-y-0.5">
              {isExpert ? (
                <NavItem to="/" end label="My reviews" hint="Packets awaiting your vote" />
              ) : (
                <>
                  <NavItem to="/" end label="Projects" hint="Everything you are party to" />
                  <NavItem to="/board" label="Delivery board" hint="Timelines and funding blocks" />
                  <NavItem to="/analytics" label="Analytics" hint="Outcomes and earnings" />
                </>
              )}
            </div>

            {/* Project sections appear in the same rail, so there is one place to navigate. */}
            {current && (
              <div>
                <div className="px-2.5 pb-1.5">
                  <div className="truncate text-[12px] font-medium text-ink" title={current.title}>{current.title}</div>
                  <div className="text-[11px] text-ink-3">{current.role === 'client' ? 'You are the client' : 'You are the freelancer'}</div>
                </div>
                <div className="space-y-0.5 border-l border-rule pl-1">
                  {PROJECT_NAV.map(([slug, label, hint]) => (
                    <NavItem key={slug} to={`/projects/${projectId}/${slug}`} label={label} hint={hint} badge={counts[slug]} />
                  ))}
                </div>
              </div>
            )}

            {!isExpert && (
              <div className="space-y-0.5 border-t border-rule pt-3">
                <NavItem to="/new" label="Start a project" hint="Upload a Statement of Work" />
                <NavItem to="/integrations" label="Integrations" hint="What is live, what is simulated" />
              </div>
            )}
          </nav>

          {/* Who you are, and what is actually wired. */}
          <div className="border-t border-rule px-4 py-3 lg:sticky lg:bottom-0 lg:bg-surface">
            <SideSwitch projectId={projectId} />
            {config && <Providers config={config} />}
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-ink">{user.name.replace(/ \((DEMO|SIMULATED)[^)]*\)/, '')}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
                  {user.role}{user.isDemo && <SimTag label="demo" />}
                </div>
              </div>
              <button className="btn-secondary shrink-0" onClick={logout}>Switch</button>
            </div>
          </div>
        </aside>

        {/* ── Work surface ── */}
        <div className="min-w-0 flex-1">
          <div className="hidden justify-end gap-2 border-b border-rule bg-surface px-6 py-2 lg:flex">
            {!isExpert && <NotificationBell />}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Demo only: hop between the client, freelancer and expert without leaving the page,
 *  so a walkthrough can show both sides of the same moment. */
function SideSwitch({ projectId }: { projectId?: string }) {
  const { user, refreshUser } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [demo, setDemo] = useState<any[]>([]);
  const [parties, setParties] = useState<{ client?: string | null; freelancer?: string | null }>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/auth/demo-users').then(setDemo).catch(() => {}); }, []);
  // On a project page, "view as client" should become THIS project's client, not a default one
  // who may not be a party to it.
  useEffect(() => {
    if (!projectId) { setParties({}); return; }
    api.get(`/projects/${projectId}`).then((r) => setParties({ client: r.project.clientId, freelancer: r.project.freelancerId })).catch(() => setParties({}));
  }, [projectId, user.id]);
  if (!user.isDemo || demo.length === 0) return null;
  const pick = (role: string) => {
    const onProject = parties[role as 'client' | 'freelancer'];
    const match = onProject && demo.find((u) => u.id === onProject);
    return match || demo.find((u) => u.role === role && !/no projects/i.test(u.name));
  };
  const sides = [['client', 'Client'], ['freelancer', 'Freelancer'], ['expert', 'Expert']] as const;
  const go = async (role: string) => {
    const u = pick(role);
    if (!u || u.id === user.id) return;
    setBusy(true);
    try {
      await api.post('/auth/demo-login', { userId: u.id });
      await refreshUser();
      // Experts are not parties to projects, so they land on their review queue.
      if (role === 'expert' && loc.pathname.startsWith('/projects/')) nav('/');
    } finally { setBusy(false); }
  };
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-ink-3">View as <SimTag label="demo" /></div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[3px] border border-rule bg-rule">
        {sides.map(([role, label]) => {
          const active = user.role === role;
          return (
            <button key={role} disabled={busy || active || !pick(role)} onClick={() => go(role)}
              className={`py-1.5 text-[12px] transition-colors ${active ? 'bg-seal text-white' : 'bg-surface text-ink-2 hover:bg-paper hover:text-ink'} disabled:cursor-default`}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Providers({ config }: { config: Config }) {
  const items = [
    { live: config.paypal.mode !== 'SIMULATED', label: 'PayPal', detail: config.paypal.mode === 'SIMULATED' ? 'simulated' : config.paypal.mode.replace('PAYPAL_', '').toLowerCase() },
    { live: config.kernel.mode !== 'DEMO_ADAPTER_HTTP_FETCH', label: 'Browser agent', detail: config.kernel.mode === 'KERNEL_LIVE' ? 'Kernel' : config.kernel.mode === 'LOCAL_BROWSER' ? 'local, not Kernel' : 'static fetch only' },
    { live: config.ai.configured, label: 'AI', detail: config.ai.configured ? config.ai.label.split(':')[0] : 'rule-based' },
  ];
  return (
    <Link to="/integrations" className="block rounded-[3px] p-1 hover:bg-paper" title="Nothing is shown as live unless it is">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] leading-5 text-ink-3">
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${i.live ? 'bg-released' : 'border border-hold bg-hold-wash'}`} />
          <span className="text-ink-2">{i.label}</span> {i.detail}
        </span>
      ))}
    </Link>
  );
}
