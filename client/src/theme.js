// Design tokens needed in JavaScript (charts). Keep in sync with :root in styles.css.
export const COLORS = {
  primary: '#2563EB',
  text: '#111827',
  muted: '#64748B',
  border: '#E2E8F0',
  grid: '#EEF2F7',
  surface: '#FFFFFF',
  // Chart series (categorical, validated for colour-blind separation). Teal is also drawn dashed.
  series: ['#2563EB', '#0D9488'],
  // Status colours: reserved for states, never reused for series.
  status: {
    COMPLETED: '#15803D',
    VERIFIED: '#15803D',
    UNDER_REVIEW: '#2563EB',
    PENDING: '#D97706',
    REJECTED: '#DC2626',
    MISSING: '#94A3B8',
  },
};

const dayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

/** "2026-10-26" -> "26 Oct" (dates arrive as calendar days, so no timezone shift). */
export function formatDay(isoDay) {
  const [y, m, d] = isoDay.split('-').map(Number);
  return dayFormat.format(new Date(y, m - 1, d));
}

export const formatNumber = (n) => new Intl.NumberFormat('en-IN').format(n);
