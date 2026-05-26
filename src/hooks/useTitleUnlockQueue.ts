import { useCallback, useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import { subscribeTitleUnlocked } from '../aws/titleUnlockClient';
import { getTitleUnlockBus, type TitleUnlock } from '../sim/titleUnlockEngine';

export function useTitleUnlockQueue(viewerId: DemoUserId) {
  const [queue, setQueue] = useState<TitleUnlock[]>([]);

  useEffect(() => {
    const bus = getTitleUnlockBus();
    const offLocal = bus.on('titleUnlocked', ({ unlock }) => {
      if (unlock.userId !== viewerId) return;
      setQueue((q) => [...q, unlock]);
    });
    const offReset = bus.on('reset', () => setQueue([]));
    const offAws = subscribeTitleUnlocked(viewerId, (unlock) => {
      setQueue((q) => [...q, unlock]);
    });

    return () => {
      offLocal();
      offReset();
      offAws();
    };
  }, [viewerId]);

  const dismiss = useCallback(() => {
    setQueue((q) => (q.length === 0 ? q : q.slice(1)));
  }, []);

  return { head: queue[0] ?? null, dismiss };
}
