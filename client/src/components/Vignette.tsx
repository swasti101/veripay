/* Small drawn scenes for the service-domain tiles. Each one depicts the thing the
   analysers actually inspect for that kind of work — a page being clicked through, a
   colour system, a document being read — rather than generic stock imagery. */

const INK = '#1a1f2e';
const PAPER = '#ffffff';
const RULE = '#dfe3ea';

function Frame({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <svg viewBox="0 0 240 132" className="h-full w-full" role="img" aria-hidden="true" style={{ background: bg }}>
      {children}
    </svg>
  );
}

export default function Vignette({ kind }: { kind: string }) {
  switch (kind) {
    case 'web':
      return (
        <Frame bg="#f8eef0">
          <rect x="34" y="18" width="172" height="104" rx="4" fill={PAPER} stroke={RULE} />
          <rect x="34" y="18" width="172" height="14" rx="4" fill={INK} />
          <circle cx="43" cy="25" r="2" fill="#e34948" /><circle cx="50" cy="25" r="2" fill="#eda100" /><circle cx="57" cy="25" r="2" fill="#1baf7a" />
          <rect x="44" y="40" width="70" height="8" rx="2" fill="#8c2f39" />
          <rect x="44" y="54" width="110" height="4" rx="2" fill={RULE} />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={44 + i * 38} y="66" width="32" height="26" rx="2" fill="#f6f7f9" stroke={RULE} />)}
          <rect x="44" y="100" width="44" height="10" rx="2" fill="#8c2f39" />
          {/* the agent's cursor, mid-click */}
          <path d="M150 92 l0 18 l5 -5 l4 9 l4 -2 l-4 -9 l7 0 z" fill={INK} stroke={PAPER} strokeWidth="1.2" />
          <circle cx="150" cy="92" r="9" fill="none" stroke="#8c2f39" strokeWidth="1.5" opacity=".5" />
        </Frame>
      );
    case 'design':
      return (
        <Frame bg="#efecf8">
          <rect x="30" y="20" width="96" height="92" rx="4" fill={PAPER} stroke={RULE} />
          <circle cx="78" cy="58" r="22" fill="#4c3a8c" />
          <rect x="56" y="88" width="44" height="6" rx="3" fill={RULE} />
          {['#8c2f39', '#0f766e', '#b45309', '#4c3a8c', INK].map((c, i) => <rect key={c} x={140} y={22 + i * 18} width="68" height="13" rx="2" fill={c} />)}
          {/* eye — the vision analyser */}
          <path d="M150 112 q12 -10 24 0 q-12 10 -24 0z" fill={PAPER} stroke={INK} strokeWidth="1.4" />
          <circle cx="162" cy="112" r="3.2" fill={INK} />
        </Frame>
      );
    case 'content':
      return (
        <Frame bg="#e6f2f1">
          <rect x="62" y="14" width="116" height="106" rx="3" fill={PAPER} stroke={RULE} />
          <rect x="76" y="28" width="60" height="7" rx="2" fill="#0f766e" />
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x="76" y={44 + i * 10} width={i % 3 === 2 ? 58 : 88} height="4" rx="2" fill={i === 3 ? '#fcf1e3' : RULE} />)}
          {/* the clause being matched */}
          <rect x="72" y="72" width="96" height="10" rx="2" fill="none" stroke="#b45309" strokeWidth="1.4" />
          <path d="M168 77 l18 0" stroke="#b45309" strokeWidth="1.4" />
          <rect x="186" y="70" width="26" height="14" rx="2" fill="#b45309" />
        </Frame>
      );
    case 'api':
      return (
        <Frame bg="#eef0f4">
          <rect x="26" y="26" width="84" height="80" rx="4" fill={INK} />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x="36" y={38 + i * 13} width={[52, 38, 60, 30, 46][i]} height="5" rx="2" fill={['#86b6ef', '#1baf7a', '#eda100', '#86b6ef', '#e87ba4'][i]} />)}
          <path d="M116 66 h20" stroke={INK} strokeWidth="1.6" strokeDasharray="3 3" />
          <rect x="138" y="40" width="76" height="52" rx="4" fill={PAPER} stroke={RULE} />
          <text x="148" y="58" fontSize="10" fontFamily="IBM Plex Mono, monospace" fill="#0f766e">200 OK</text>
          <rect x="148" y="66" width="54" height="4" rx="2" fill={RULE} />
          <rect x="148" y="75" width="40" height="4" rx="2" fill={RULE} />
        </Frame>
      );
    case 'frontend':
      return (
        <Frame bg="#fcf1e3">
          {/* desktop + phone: the responsive check */}
          <rect x="24" y="22" width="132" height="84" rx="4" fill={PAPER} stroke={RULE} />
          <rect x="34" y="32" width="50" height="7" rx="2" fill="#b45309" />
          {[0, 1, 2].map((i) => <rect key={i} x={34 + i * 40} y="48" width="34" height="46" rx="2" fill="#f6f7f9" stroke={RULE} />)}
          <rect x="170" y="30" width="46" height="84" rx="6" fill={PAPER} stroke={INK} strokeWidth="1.4" />
          <rect x="178" y="40" width="30" height="6" rx="2" fill="#b45309" />
          {[0, 1].map((i) => <rect key={i} x="178" y={52 + i * 28} width="30" height="22" rx="2" fill="#f6f7f9" stroke={RULE} />)}
          <path d="M158 64 l10 0 m-4 -4 l4 4 l-4 4" stroke={INK} strokeWidth="1.4" fill="none" />
        </Frame>
      );
    case 'qa':
    default:
      return (
        <Frame bg="#f6f0f1">
          <rect x="56" y="16" width="128" height="104" rx="3" fill={PAPER} stroke={RULE} />
          {[['#0f766e', '✓'], ['#0f766e', '✓'], ['#b3261e', '✕'], ['#4c3a8c', '?'], ['#0f766e', '✓']].map(([c, g], i) => (
            <g key={i}>
              <rect x="68" y={26 + i * 18} width="12" height="12" rx="2" fill={c} />
              <text x="74" y={35 + i * 18} fontSize="9" textAnchor="middle" fill={PAPER} fontWeight="700">{g}</text>
              <rect x="88" y={30 + i * 18} width={[70, 54, 64, 48, 60][i]} height="4" rx="2" fill={RULE} />
            </g>
          ))}
        </Frame>
      );
  }
}
