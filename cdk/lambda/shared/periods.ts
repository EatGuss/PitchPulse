/**
 * Weekly / seasonal period keys — Europe/Berlin (CET/CEST) boundaries.
 * SEASON_WEEKS is injected via CDK (default 8).
 */

const BERLIN = 'Europe/Berlin';

export function seasonWeeks(): number {
  const raw = Number(process.env.SEASON_WEEKS ?? 8);
  return Number.isFinite(raw) && raw > 0 ? raw : 8;
}

/** ISO week string e.g. 2025-W21 (Berlin calendar date). */
export function getIsoWeekKey(date = new Date()): string {
  const berlinDate = berlinParts(date);
  const d = new Date(Date.UTC(berlinDate.year, berlinDate.month - 1, berlinDate.day));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function weeklyLeaderboardPk(isoWeek: string): string {
  return `LEADERBOARD#WEEKLY#${isoWeek}`;
}

export function seasonalLeaderboardPk(seasonNumber: number): string {
  return `LEADERBOARD#SEASONAL#${seasonNumber}`;
}

/** Next Monday 00:00 Europe/Berlin as ISO-8601 string. */
export function nextMondayMidnightBerlinIso(from = new Date()): string {
  const p = berlinParts(from);
  const dayOfWeek = berlinWeekday(from); // 1=Mon … 7=Sun
  const daysUntilMonday = dayOfWeek === 1 ? 7 : 8 - dayOfWeek;
  const targetDay = p.day + daysUntilMonday;
  return berlinLocalToIso(p.year, p.month, targetDay, 0, 0, 0);
}

/** Season end = seasonStartedAt + SEASON_WEEKS × 7 days (Berlin midnight). */
export function seasonEndsAtIso(seasonStartedAt: string | undefined, from = new Date()): string {
  const start = seasonStartedAt ? new Date(seasonStartedAt) : from;
  const end = new Date(start.getTime() + seasonWeeks() * 7 * 86400000);
  const p = berlinParts(end);
  return berlinLocalToIso(p.year, p.month, p.day, 23, 59, 59);
}

function berlinParts(date: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = fmt.format(date).split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

function berlinWeekday(date: Date): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: BERLIN, weekday: 'short' }).format(date);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
}

function berlinLocalToIso(year: number, month: number, day: number, h: number, m: number, s: number): string {
  // Approximate Berlin offset: iterate UTC candidates (handles CET/CEST for demo).
  for (const offsetHours of [1, 2]) {
    const utc = new Date(Date.UTC(year, month - 1, day, h - offsetHours, m, s));
    const p = berlinParts(utc);
    if (p.year === year && p.month === month && p.day === day) {
      return utc.toISOString();
    }
  }
  return new Date(Date.UTC(year, month - 1, day, h - 1, m, s)).toISOString();
}
