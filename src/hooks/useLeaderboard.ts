/**
 * useLeaderboard — derived view over PromptEngine user state.
 *
 * Sorted by matchPoints descending. Re-renders on userMatchPointsChanged,
 * userStreakChanged, and reset events.
 */

import { useEffect, useState } from 'react';
import { getPromptEngine } from '../sim/promptEngine';
import { DEMO_USERS } from '../data/personas';
import { teamAlias, type TeamAlias } from '../data/teamAliases';

export interface LeaderboardRow {
  rank: number;
  userId: string;
  displayName: string;
  avatar: string;
  archetypeName: string;
  team: TeamAlias;
  matchPoints: number;
  streak: number;
}

function snapshot(): LeaderboardRow[] {
  const engine = getPromptEngine();
  const rows = engine.getAllUsers().map((u) => {
    const persona = DEMO_USERS[u.userId];
    return {
      userId: u.userId,
      displayName: persona?.displayName ?? u.userId,
      avatar: persona?.avatar ?? '👤',
      archetypeName: persona?.archetypeName ?? '',
      team: teamAlias(persona?.favoriteTeamId),
      matchPoints: u.matchPoints,
      streak: u.streak,
      rank: 0,
    };
  });
  rows.sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (b.streak !== a.streak) return b.streak - a.streak;
    return a.userId.localeCompare(b.userId);
  });
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export function useLeaderboard(): LeaderboardRow[] {
  const engine = getPromptEngine();
  const [rows, setRows] = useState<LeaderboardRow[]>(() => snapshot());

  useEffect(() => {
    const refresh = () => setRows(snapshot());
    const offs = [
      engine.bus.on('userMatchPointsChanged', refresh),
      engine.bus.on('userStreakChanged', refresh),
      engine.bus.on('reset', refresh),
    ];
    return () => offs.forEach((off) => off());
  }, [engine]);

  return rows;
}
