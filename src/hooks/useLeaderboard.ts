/**
 * useLeaderboard — derived view over PromptEngine user state.
 *
 * Sorted by coinBalance descending. Re-renders on userBalanceChanged,
 * userStreakChanged, and reset events. No new engine needed — the leaderboard
 * is purely a projection (Gate 4 swaps the source for a DynamoDB GSI query).
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
  coinBalance: number;
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
      coinBalance: u.coinBalance,
      streak: u.streak,
      rank: 0,
    };
  });
  // Sort by balance desc; break ties on streak desc, then userId for stability.
  rows.sort((a, b) => {
    if (b.coinBalance !== a.coinBalance) return b.coinBalance - a.coinBalance;
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
      engine.bus.on('userBalanceChanged', refresh),
      engine.bus.on('userStreakChanged', refresh),
      engine.bus.on('reset', refresh),
    ];
    return () => offs.forEach((off) => off());
  }, [engine]);

  return rows;
}
