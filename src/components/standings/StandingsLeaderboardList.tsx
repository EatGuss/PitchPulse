import { DEMO_USERS } from '../../data/personas';
import type { LeaderboardEntry, StandingsPeriod, UserStats } from '../../domain/leaderboardTypes';
import { TierBadge } from '../TierBadge';
import './StandingsLeaderboardList.css';

const formatter = new Intl.NumberFormat('en-US');
const MEDALS = ['🥇', '🥈', '🥉'];

export interface StandingsLeaderboardListProps {
  userId: string;
  period: StandingsPeriod;
  entries: LeaderboardEntry[];
  userStats: UserStats | null;
}

function buildPinnedRow(
  userId: string,
  period: StandingsPeriod,
  entries: LeaderboardEntry[],
  userStats: UserStats | null,
): LeaderboardEntry | null {
  const inList = entries.find((e) => e.userId === userId);
  if (inList) return inList;
  if (!userStats) return null;

  const rank = period === 'weekly' ? userStats.weeklyRank : userStats.seasonalRank;
  const points = period === 'weekly' ? userStats.weeklyPoints : userStats.seasonalPoints;
  if (rank === null) return null;

  const persona = DEMO_USERS[userId];
  return {
    rank,
    userId,
    displayName: persona?.displayName ?? userId,
    equippedTitle: userStats.equippedTitle,
    tier: userStats.tier,
    points,
  };
}

function rankClass(rank: number): string {
  if (rank === 1) return 'standings-row--gold';
  if (rank === 2) return 'standings-row--silver';
  if (rank === 3) return 'standings-row--bronze';
  return '';
}

function StandingsRow({
  row,
  isPinned,
}: {
  row: LeaderboardEntry;
  isPinned?: boolean;
}) {
  const avatar = DEMO_USERS[row.userId]?.avatar ?? '👤';
  const medal = MEDALS[row.rank - 1];

  return (
    <li
      className={`standings-row ${rankClass(row.rank)}${isPinned ? ' standings-row--pinned' : ''}`}
      data-rank={row.rank}
    >
      <span className="standings-row__rank tabular" aria-label={`Rank ${row.rank}`}>
        {medal ?? `#${row.rank}`}
      </span>
      <span className="standings-row__avatar" aria-hidden="true">
        {avatar}
      </span>
      <div className="standings-row__meta">
        <span className="standings-row__name">{row.displayName}</span>
        <span className="standings-row__title-row">
          <TierBadge tier={row.tier} size="sm" />
          {row.equippedTitle ? (
            <span className="standings-row__title">{row.equippedTitle}</span>
          ) : null}
        </span>
      </div>
      <span className="standings-row__points tabular" aria-label={`${row.points} points`}>
        {formatter.format(row.points)}
        <span className="standings-row__pts-suffix">pts</span>
      </span>
    </li>
  );
}

export function StandingsLeaderboardList({
  userId,
  period,
  entries,
  userStats,
}: StandingsLeaderboardListProps) {
  const pinned = buildPinnedRow(userId, period, entries, userStats);
  const listEntries = pinned ? entries.filter((e) => e.userId !== userId) : entries;

  return (
    <section className="standings-lb" aria-label={`${period} leaderboard`}>
      {pinned ? (
        <div className="standings-lb__pinned-wrap">
          <p className="standings-lb__pinned-label">Your rank</p>
          <ol className="standings-lb__list standings-lb__list--pinned">
            <StandingsRow row={pinned} isPinned />
          </ol>
        </div>
      ) : null}

      <div className="standings-lb__board">
        <p className="standings-lb__board-label">Top fans</p>
        {listEntries.length === 0 ? (
          <p className="standings-lb__empty">No standings yet — play ranked to climb.</p>
        ) : (
          <ol className="standings-lb__list" aria-live="polite">
            {listEntries.map((row) => (
              <StandingsRow key={row.userId} row={row} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
