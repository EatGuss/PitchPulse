/**
 * StandingsTab — weekly + seasonal leaderboards (Gate F).
 */

import { StandingsLeaderboardList } from '../../components/standings/StandingsLeaderboardList';
import type { DemoUserId } from '../../data/personas';
import { formatDaysUntil, formatDurationShort, msUntil } from '../../domain/periodCountdown';
import { useStandings } from '../../hooks/useStandings';
import '../../components/standings/StandingsLeaderboardList.css';
import './TabShell.css';

export interface StandingsTabProps {
  userId: DemoUserId;
}

function periodBannerCopy(
  period: 'weekly' | 'seasonal',
  userStats: ReturnType<typeof useStandings>['userStats'],
): string | null {
  if (!userStats) return null;
  if (period === 'weekly') {
    const ms = msUntil(userStats.weeklyPointsResetAt);
    if (ms === null) return 'Weekly board · resets soon';
    return `Resets in ${formatDurationShort(ms)}`;
  }
  const days = formatDaysUntil(userStats.seasonEndsAt);
  if (!days) return `Season ${userStats.seasonNumber}`;
  return `Season ${userStats.seasonNumber} — ends in ${days}`;
}

export function StandingsTab({ userId }: StandingsTabProps) {
  const { period, setPeriod, entries, userStats, loading } = useStandings(userId);
  const banner = periodBannerCopy(period, userStats);

  return (
    <div className="tab-shell tab-shell--standings" role="main" aria-label="Standings">
      <div className="tab-shell__hero">
        <span className="tab-shell__brand-dot" aria-hidden="true" />
        <h1 className="tab-shell__title">Standings</h1>
        <p className="tab-shell__sub">Weekly and seasonal ranked leaderboards.</p>
      </div>

      <div className="standings-toggle" role="tablist" aria-label="Standings period">
        <button
          type="button"
          role="tab"
          aria-selected={period === 'weekly'}
          className={`standings-toggle__btn${period === 'weekly' ? ' standings-toggle__btn--active' : ''}`}
          onClick={() => setPeriod('weekly')}
        >
          Weekly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={period === 'seasonal'}
          className={`standings-toggle__btn${period === 'seasonal' ? ' standings-toggle__btn--active' : ''}`}
          onClick={() => setPeriod('seasonal')}
        >
          Seasonal
        </button>
      </div>

      {banner ? (
        <p className="standings-period-banner" aria-live="polite">
          <strong>{period === 'weekly' ? 'Weekly board' : 'Season board'}</strong>
          {' · '}
          {banner}
        </p>
      ) : null}

      {loading ? (
        <p className="standings-loading">Loading standings…</p>
      ) : (
        <StandingsLeaderboardList
          userId={userId}
          period={period}
          entries={entries}
          userStats={userStats}
        />
      )}
    </div>
  );
}
