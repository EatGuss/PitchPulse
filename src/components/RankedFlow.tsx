import { useCallback, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import type { RankedOpponent } from '../domain/rankedTypes';
import { MatchPage } from '../pages/MatchPage';
import { RankedMatchmaking } from './RankedMatchmaking';

export interface RankedFlowProps {
  userId: DemoUserId;
  hideSimControls?: boolean;
  onBack: () => void;
}

export function RankedFlow({ userId, hideSimControls = false, onBack }: RankedFlowProps) {
  const [opponent, setOpponent] = useState<RankedOpponent | null>(null);

  const handleMatchStart = useCallback((found: RankedOpponent) => {
    setOpponent(found);
  }, []);

  const handleLeaveMatch = useCallback(() => {
    setOpponent(null);
    onBack();
  }, [onBack]);

  if (opponent) {
    return (
      <MatchPage
        userId={userId}
        hideSimControls={hideSimControls}
        rankedOpponent={opponent}
        onLeaveRanked={handleLeaveMatch}
      />
    );
  }

  return (
    <RankedMatchmaking
      userId={userId}
      onBack={onBack}
      onMatchStart={handleMatchStart}
    />
  );
}
