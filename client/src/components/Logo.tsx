/** Wordmark. The mark is a seal — a notarised stamp with a check cut into it —
 *  because the product's job is attesting that delivery matched the agreement.
 *  Drawn rather than imported so it scales crisply and carries no third-party asset. */
export function Mark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      {/* Notched seal: a circle with the scalloped edge of a stamp, flattened to 12 facets */}
      <path
        d="M16 1.5 19.1 3l3.2-1.1 2.1 2.6 3.4.3.8 3.3 2.9 1.8-.7 3.3 2 2.8-2 2.8.7 3.3-2.9 1.8-.8 3.3-3.4.3-2.1 2.6-3.2-1.1L16 30.5 12.9 29l-3.2 1.1-2.1-2.6-3.4-.3-.8-3.3L.5 22.1l.7-3.3-2-2.8 2-2.8-.7-3.3 2.9-1.8.8-3.3 3.4-.3 2.1-2.6L12.9 3 16 1.5Z"
        fill="currentColor"
      />
      {/* The check, drawn as a V so the mark reads as both the initial and the verdict */}
      <path d="M10 15.2l4.3 4.6L22.4 11" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default function Logo({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const mark = size === 'lg' ? 32 : size === 'sm' ? 22 : 26;
  const text = size === 'lg' ? 'text-[22px]' : size === 'sm' ? 'text-[15px]' : 'text-[17px]';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark size={mark} className="text-seal" />
      <span className={`${text} font-semibold tracking-[-0.02em] text-ink`} style={{ fontFamily: 'var(--font-display)' }}>
        VeriPay
      </span>
    </span>
  );
}
