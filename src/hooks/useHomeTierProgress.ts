import { useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import type { Tier } from '../domain/tiers';
import { subscribeMatchdayStore } from '../sim/matchdayStore';

export interface TierProgress {
  tier: Tier;
  winsTowardNext: number;
  winsNeeded: number | null;
  nextTier: Tier | null;
}

const LOCAL_TIER: Record<DemoUserId, TierProgress> = {
  alice: { tier: 'SILVER', winsTowardNext: 4, winsNeeded: 5, nextTier: 'GOLD' },
  bob: { tier: 'GOLD', winsTowardNext: 4, winsNeeded: 5, nextTier: 'DIAMOND' },
};

export function useHomeTierProgress(userId: DemoUserId): TierProgress {
  const [progress, setProgress] = useState<TierProgress>(() => LOCAL_TIER[userId]);

  useEffect(() => {
    const refresh = () => setProgress({ ...LOCAL_TIER[userId] });
    refresh();
    return subscribeMatchdayStore(refresh);
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
