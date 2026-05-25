/** Lifetime accuracy may be stored as 0–1 (ratio) or 0–100 (percent) depending on source. */
export function normalizeLifetimeAccuracy(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (value > 1) return Math.min(1, value / 100);
  return Math.max(0, value);
}

export function formatLifetimeAccuracy(value: number | null | undefined): string {
  const ratio = normalizeLifetimeAccuracy(value);
  if (ratio === null) return '—';
  return `${Math.round(ratio * 100)}%`;
}
