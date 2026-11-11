import { useEffect, useState, type ReactNode } from 'react';

/* Status colour carries meaning in this product, so it is derived from the domain
   vocabulary rather than picked per-component:
     seal     = authority / in flight
     released = money settled, requirement met
     hold     = partial, under review, awaiting
     refuse   = failed, non-compliant, rejected
     panel    = expert review, needs clarification
     quiet    = not started, unverified, superseded  */
const TONES: Record<string, string> = {
  released: 'bg-released-wash text-released border-released/25',
  hold: 'bg-hold-wash text-hold border-hold/25',
  refuse: 'bg-refuse-wash text-refuse border-refuse/25',
  panel: 'bg-panel-wash text-panel border-panel/25',
  seal: 'bg-seal-wash text-seal border-seal/25',
  quiet: 'bg-paper text-ink-3 border-rule-strong',
  // legacy aliases so existing call sites keep working
  green: 'bg-released-wash text-released border-released/25',
  red: 'bg-refuse-wash text-refuse border-refuse/25',
  amber: 'bg-hold-wash text-hold border-hold/25',
  blue: 'bg-seal-wash text-seal border-seal/25',
  violet: 'bg-panel-wash text-panel border-panel/25',
  slate: 'bg-paper text-ink-3 border-rule-strong',
};

const STATUS_TONE: Record<string, string> = {
  PASS: 'released', COMPLIANT: 'released', FULL_PAYMENT: 'released', PAID: 'released', SUCCESS: 'released',
  COMPLETED: 'released', ACCEPTED: 'released', APPROVED: 'released', EXECUTED: 'released', CLOSED: 'released',
  FULLY_SATISFIED: 'released',
  AUTHORIZED: 'seal', CAPTURED: 'seal', ACTIVE: 'seal', RETAINED: 'seal', IN_PROGRESS: 'seal',
  SUBMITTED: 'seal', QA_COMPLETE: 'seal', OUT_OF_SCOPE: 'seal', OUT_OF_SCOPE_REQUEST: 'seal',
  PARTIAL: 'hold', PARTIALLY_COMPLIANT: 'hold', PARTIAL_PAYMENT: 'hold', PARTIALLY_PAID: 'hold',
  PARTIALLY_SATISFIED: 'hold', AWAITING_DISBURSEMENT: 'hold', FUNDING_PENDING: 'hold', DRAFT: 'hold',
  NEGOTIATING: 'hold', PROPOSED: 'hold', QUALITY_CONCERN: 'hold',
  FAIL: 'refuse', NOT_COMPLIANT: 'refuse', PAYMENT_FAILED: 'refuse', NOT_SATISFIED: 'refuse',
  REVISION_REQUIRED: 'refuse', REVISION_REQUESTED: 'refuse', DISPUTED: 'refuse', CHALLENGED: 'refuse',
  SOW_DISSATISFACTION: 'refuse', INCOMPLETE: 'refuse', REFUNDED: 'refuse',
  NEEDS_CLARIFICATION: 'panel', UNDER_REVIEW: 'panel', INCONCLUSIVE: 'panel', INSUFFICIENT_EVIDENCE: 'panel',
  IN_EXPERT_REVIEW: 'panel', VOTING: 'panel', AWAITING_FEE_ACK: 'panel',
  UNVERIFIED: 'quiet', FUNDING_REQUIRED: 'quiet', NOT_STARTED: 'quiet', SUPERSEDED: 'quiet',
  UNVERIFIABLE: 'quiet', SKIPPED: 'quiet', SUBJECTIVE_PREFERENCE: 'quiet', UNCLEAR: 'quiet',
};

/** Status chip. Sentence case — tracked-out all-caps everywhere is a template tell. */
export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const key = typeof children === 'string' ? children.replace(/^PENDING.*/, 'FUNDING_PENDING') : '';
  const t = tone || STATUS_TONE[key] || 'quiet';
  const text = typeof children === 'string'
    ? children.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())
    : children;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-[2px] border px-1.5 py-px text-[11px] font-medium ${TONES[t] || TONES.quiet}`}>
      {text}
    </span>
  );
}

/** Marks anything not backed by a real transaction, person or execution. */
export function SimTag({ label = 'Simulated' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[2px] border border-hold/30 bg-hold-wash px-1.5 py-px text-[10px] font-medium text-hold">
      <span className="inline-block h-1 w-1 rounded-full bg-hold" />{label}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className={`truncate text-[19px] font-semibold tabular-nums ${tone || 'text-ink'}`} style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
      {sub && <div className="truncate text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

/** One line of the money rail: label left, amount right, aligned down the column. */
export function Figure({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: string; sub?: ReactNode }) {
  return (
    <div className="rail-figure">
      <div className="min-w-0">
        <div className="text-[12px] text-ink-2">{label}</div>
        {sub && <div className="text-[11px] text-ink-3">{sub}</div>}
      </div>
      <div className={`shrink-0 text-[15px] font-semibold tabular-nums ${tone || 'text-ink'}`} style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
    </div>
  );
}

/** Empty states are an invitation to act, not an apology. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="sheet px-6 py-10 text-center">
      <div className="text-[16px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-[13px] text-ink-2">{children}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-ink-2">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-seal border-t-transparent" />{label}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/35 p-4 pt-[10vh]" onMouseDown={onClose}>
      {/* Dialogs genuinely float, so this is where elevation is spent. */}
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-[3px] border border-rule bg-surface shadow-[0_16px_48px_-12px_rgba(26,31,46,0.35)]`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <h3 className="h2">{title}</h3>
          <button className="btn-ghost -mr-1" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e: any) { setError(e.message || String(e)); } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

/** Errors state what happened and what to do; they never apologise or go vague. */
export function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <div className="rounded-[3px] border-l-2 border-refuse bg-refuse-wash px-3 py-2 text-[13px] text-refuse">{error}</div>
  ) : null;
}

/** A titled document panel. The rule under the title separates heading from record. */
export function Section({ title, actions, children, className = '' }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`sheet ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
        <h2 className="h2">{title}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
