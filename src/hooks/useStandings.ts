import { useCallback, useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import type { LeaderboardEntry, StandingsPeriod, UserStats } from '../domain/leaderboardTypes';
import {
  fetchSeasonalLeaderboard,
  fetchUserStats,
  fetchWeeklyLeaderboard,
  subscribeLeaderboardUpdated,
} from '../aws/leaderboardClient';

export function useStandings(userId: DemoUserId) {
  const [period, setPeriod] = useState<StandingsPeriod>('weekly');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setCountdownTick] = useState(0);

  const refresh = useCallback(async () => {
    const stats = await fetchUserStats(userId);
    setUserStats(stats);
    const list =
      period === 'weekly'
        ? await fetchWeeklyLeaderboard(50)
        : await fetchSeasonalLeaderboard(stats.seasonNumber, 50);
    setEntries(list);
    setLoading(false);
  }, [userId, period]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => subscribeLeaderboardUpdated(() => void refresh()), [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setCountdownTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return { period, setPeriod, entries, userStats, loading };
}
