import { useCallback, useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import type { MeProfile } from '../domain/profileTypes';
import { commitEquipTitle, fetchMeProfile } from '../aws/profileClient';
import { subscribeLocalProfileChanged } from '../sim/localProfileStore';
import { subscribeMatchdayStore } from '../sim/matchdayStore';
import { subscribeLocalLeaderboardChanged } from '../sim/localLeaderboardStore';

export function useMeProfile(userId: DemoUserId) {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [equipping, setEquipping] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchMeProfile(userId);
      setProfile(next);
    } catch (err) {
      console.error('[useMeProfile] refresh failed', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const offProfile = subscribeLocalProfileChanged(() => void refresh());
    const offMatchday = subscribeMatchdayStore(() => void refresh());
    const offLb = subscribeLocalLeaderboardChanged(() => void refresh());
    return () => {
      offProfile();
      offMatchday();
      offLb();
    };
  }, [refresh]);

  const equipTitle = useCallback(
    async (titleId: string) => {
      setEquipping(true);
      try {
        const ok = await commitEquipTitle(userId, titleId);
        if (ok) await refresh();
        return ok;
      } finally {
        setEquipping(false);
      }
    },
    [refresh, userId],
  );

  return { profile, loading, equipping, equipTitle, refresh };
}
