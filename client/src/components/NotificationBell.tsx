import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Badge, Spinner } from './ui';

interface Item { project: string; projectId: string; action: string; tab: string }

export default function NotificationBell() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const box = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const d = await api.get('/dashboard');
      setItems(d.projects.flatMap((p: any) => p.pending.map((x: any) => ({ project: p.title, projectId: p.id, action: x.action, tab: x.tab }))));
    } catch { setItems([]); }
  };
  useEffect(() => { load(); }, [loc.pathname]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const click = (e: MouseEvent) => { if (open && box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', click);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', click); window.removeEventListener('keydown', esc); };
  }, [open]);

  const go = (it: Item) => { setOpen(false); nav(`/projects/${it.projectId}/${it.tab}`); };
  const n = items?.length ?? 0;

  return (
    <div className="relative" ref={box}>
      <button
        className="relative rounded-[3px] p-1.5 text-ink-2 transition hover:bg-paper"
        aria-label={n ? `${n} action${n === 1 ? '' : 's'} waiting on you` : 'No actions waiting'}
        title={n ? `${n} action${n === 1 ? '' : 's'} waiting on you — click to open` : 'Nothing is waiting on you'}
        onClick={() => { if (n === 1 && items) go(items[0]); else setOpen(!open); }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {n > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[17px] place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-[17px] text-white ring-2 ring-white">{n > 9 ? '9+' : n}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-[4px] border border-rule bg-white p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold text-ink">Waiting on you</span>
            {n > 0 && <Badge tone="red">{String(n)}</Badge>}
          </div>
          {items === null ? <div className="p-3"><Spinner /></div>
            : n === 0 ? <p className="px-2 py-3 text-sm text-ink-3">Nothing is waiting on you right now.</p>
              : (
                <ul className="max-h-80 overflow-y-auto">
                  {items.map((it, i) => (
                    <li key={i}>
                      <button className="w-full rounded-[3px] px-2 py-2 text-left hover:bg-paper" onClick={() => go(it)}>
                        <div className="text-sm font-medium text-ink">{it.action}</div>
                        <div className="truncate text-xs text-ink-3">{it.project}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      )}
    </div>
  );
}
