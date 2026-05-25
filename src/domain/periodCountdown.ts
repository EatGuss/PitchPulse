export function formatDurationParts(ms: number): { days: number; hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return { days, hours, minutes };
}

export function formatDurationShort(ms: number): string {
  const { days, hours, minutes } = formatDurationParts(ms);
  if (days > 0) return `${days}d ${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

export function msUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return t - Date.now();
}

export function formatDaysUntil(iso: string | null | undefined): string | null {
  const ms = msUntil(iso);
  if (ms === null) return null;
  const days = Math.max(0, Math.ceil(ms / 86_400_000));
  return days === 1 ? '1 day' : `${days} days`;
}
