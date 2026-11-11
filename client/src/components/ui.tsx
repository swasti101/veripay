import { useEffect, useState, type ReactNode } from 'react';

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

const STATUS_TONE: Record<string, string> = {
  PASS: 'green', COMPLIANT: 'green', FULL_PAYMENT: 'green', PAID: 'green', SUCCESS: 'green', COMPLETED: 'green', ACCEPTED: 'green', APPROVED: 'green', EXECUTED: 'green', CLOSED: 'green', AUTHORIZED: 'blue', CAPTURED: 'blue', ACTIVE: 'blue',
  PARTIAL: 'amber', PARTIALLY_COMPLIANT: 'amber', PARTIAL_PAYMENT: 'amber', PARTIALLY_PAID: 'amber', PARTIALLY_SATISFIED: 'amber', AWAITING_DISBURSEMENT: 'amber', FUNDING_PENDING: 'amber', DRAFT: 'amber', NEGOTIATING: 'amber', PROPOSED: 'amber',
  FAIL: 'red', NOT_COMPLIANT: 'red', PAYMENT_FAILED: 'red', NOT_SATISFIED: 'red', REVISION_REQUIRED: 'red', REVISION_REQUESTED: 'red', DISPUTED: 'red', CHALLENGED: 'red', SOW_DISSATISFACTION: 'red', INCOMPLETE: 'red',
  UNVERIFIED: 'slate', FUNDING_REQUIRED: 'slate', NOT_STARTED: 'slate', SUPERSEDED: 'slate', UNVERIFIABLE: 'slate', SKIPPED: 'slate',
  NEEDS_CLARIFICATION: 'violet', UNDER_REVIEW: 'violet', INCONCLUSIVE: 'violet', INSUFFICIENT_EVIDENCE: 'violet', IN_EXPERT_REVIEW: 'violet', VOTING: 'violet', AWAITING_FEE_ACK: 'violet', QUALITY_CONCERN: 'amber',
  OUT_OF_SCOPE: 'blue', OUT_OF_SCOPE_REQUEST: 'blue', SUBJECTIVE_PREFERENCE: 'slate', UNCLEAR: 'slate', FULLY_SATISFIED: 'green', IN_PROGRESS: 'blue', SUBMITTED: 'blue', QA_COMPLETE: 'blue',
};

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const key = typeof children === 'string' ? children.replace(/^PENDING.*/, 'FUNDING_PENDING') : '';
  const t = tone || STATUS_TONE[key] || 'slate';
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONES[t]}`}>{typeof children === 'string' ? children.replace(/_/g, ' ') : children}</span>;
}

export function SimTag({ label = 'SIMULATED' }: { label?: string }) {
  return <span className="inline-flex rounded bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">{label}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`truncate text-base font-semibold ${tone || 'text-slate-900'}`}>{value}</div>
      {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/50 p-8 text-center">
      <div className="font-medium text-slate-700">{title}</div>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center gap-2 text-sm text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />{label}</div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-5`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h3 className="h2">{title}</h3><button className="btn-ghost" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** Runs an async action with loading + error state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e: any) { setError(e.message || String(e)); } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null;
}

export function Section({ title, actions, children, className = '' }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="h2">{title}</h2>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>
      {children}
    </section>
  );
}
