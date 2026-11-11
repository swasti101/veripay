// Validated categorical palette (slots 1–5, light mode, surface #fcfcfb).
// Checked with the data-viz validator: lightness band PASS, chroma floor PASS,
// CVD separation PASS (worst adjacent ΔE 9.1), normal-vision floor PASS (19.6).
// Contrast WARN on slots 3/4/5 → every chart using them ships direct labels or a table view.
export const SERIES = {
  s1: '#2a78d6', // blue
  s2: '#eb6834', // orange
  s3: '#1baf7a', // aqua
  s4: '#eda100', // yellow
  s5: '#e87ba4', // magenta
} as const;

// Sequential single-hue blue ramp (100→700) for continuous magnitude (heatmap cells).
export const SEQ_BLUE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

// Status colours are reserved and never reused as a series colour.
export const STATUS = { good: '#1baf7a', warning: '#eda100', serious: '#eb6834', critical: '#e34948', neutral: '#94a3b8' } as const;

// Verification / vote statuses mapped onto reserved status colours.
export const QA_COLOR: Record<string, string> = {
  PASS: STATUS.good, PARTIAL: STATUS.warning, FAIL: STATUS.critical,
  UNVERIFIED: STATUS.neutral, NEEDS_CLARIFICATION: '#6250d6', OUT_OF_SCOPE: SERIES.s1,
};
export const VOTE_COLOR: Record<string, string> = {
  COMPLIANT: STATUS.good, PARTIALLY_COMPLIANT: STATUS.warning,
  NOT_COMPLIANT: STATUS.critical, INSUFFICIENT_EVIDENCE: '#6250d6', NO_VOTE: '#e2e8f0',
};
export const RELEASE_COLOR: Record<string, string> = {
  FULL_PAYMENT: STATUS.good, PARTIAL_PAYMENT: STATUS.warning,
  UNDER_REVIEW: '#6250d6', REVISION_REQUIRED: STATUS.critical,
};
export const TEXT = { primary: '#0f172a', secondary: '#475569', muted: '#64748b' } as const;
