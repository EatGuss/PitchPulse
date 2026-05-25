import { useEffect } from 'react';
import type { DemoUserId } from '../data/personas';
import { syncRankedMatchdayFromServer } from '../aws/rankedMatchdayClient';

/** Hydrate local ranked matchday state from DynamoDB when in AWS mode. */
export function useRankedMatchdaySync(userId: DemoUserId): void {
  useEffect(() => {
    void syncRankedMatchdayFromServer(userId).catch((err) => {
      console.warn('[ranked-matchday] sync failed', err);
    });
  }, [userId]);
}
