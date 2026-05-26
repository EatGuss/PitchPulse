import { useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import type { Tier } from '../domain/tiers';
import { localGetTierProgress, subscribeLocalProfileChanged } from '../sim/localProfileStore';
import { subscribeMatchdayStore } from '../sim/matchdayStore';

export interface TierProgress {
  tier: Tier;
  winsTowardNext: number;
  winsNeeded: number | null;
  nextTier: Tier | null;
}

export function useHomeTierProgress(userId: DemoUserId): TierProgress {
  const [progress, setProgress] = useState<TierProgress>(() => localGetTierProgress(userId));

  useEffect(() => {
    const refresh = () => setProgress(localGetTierProgress(userId));
    refresh();
    const offMatchday = subscribeMatchdayStore(refresh);
    const offProfile = subscribeLocalProfileChanged(refresh);
    return () => {
      offMatchday();
      offProfile();
    };
  }, [userId]);

  return progress;
}

export function tierProgressCopy(p: TierProgress): string {
  if (p.winsNeeded === null || !p.nextTier) return 'Champion tier — keep winning';
  return `${p.winsTowardNext}/${p.winsNeeded} wins to ${p.nextTier.charAt(0)}${p.nextTier.slice(1).toLowerCase()}`;
}

export function tierProgressSubtext(p: TierProgress): string {
  if (p.winsNeeded === null || !p.nextTier) return 'Top tier reached';
  const remaining = Math.max(0, p.winsNeeded - p.winsTowardNext);
  if (remaining === 1) return 'Win 1 more ranked match';
  return `Win ${remaining} more ranked matches`;
}
