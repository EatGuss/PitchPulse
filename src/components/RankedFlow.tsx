import { useCallback, useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import { getFixtureById, resolveFixtureTitle, type MatchdayScheduleContext } from '../domain/matchday';
import type { RankedOpponent } from '../domain/rankedTypes';
import { useMatchPoints } from '../hooks/useMatchPoints';
import { useMatchSimState } from '../hooks/useMatchSimState';
import { MatchPage } from '../pages/MatchPage';
import { MATCH_ID } from '../aws/config';
import { initRankedHotTakes } from '../aws/hotTakeClient';
import { recordRankedMatchForProfile } from '../aws/profileClient';
import {
  canPlayRankedFixture,
  getUserRankedMatchdayStatus,
  recordRankedMatchdayPlay,
} from '../sim/matchdayStore';
import { getPromptEngine } from '../sim/promptEngine';
import { RankedMatchComplete } from './RankedMatchComplete';
import { RankedMatchmaking } from './RankedMatchmaking';

export interface RankedFlowProps {
  userId: DemoUserId;
  fixtureId: string | null;
  schedule: MatchdayScheduleContext;
  hideSimControls?: boolean;
  onBack: () => void;
  onComplete?: () => void;
  onLiveMatchChange?: (inLiveMatch: boolean) => void;
}

export function RankedFlow({
  userId,
  fixtureId,
  schedule,
  hideSimControls = false,
  onBack,
  onComplete,
  onLiveMatchChange,
}: RankedFlowProps) {
  const { clock } = useMatchSimState();
  const { matchPoints } = useMatchPoints(userId);

  const status = getUserRankedMatchdayStatus(userId);
  const activeFixtureId = fixtureId ?? status.lockedFixtureId;
  const canPlay = canPlayRankedFixture(userId, schedule);
  const fixture = activeFixtureId ? getFixtureById(activeFixtureId) : undefined;
  const fixtureLabel = fixture ? resolveFixtureTitle(fixture) : status.lockedFixtureLabel ?? '';

  const [opponent, setOpponent] = useState<RankedOpponent | null>(null);

  const atFullTime = clock.phase === 'fullTime';

  const recordPlay = useCallback(() => {
    recordRankedMatchdayPlay(userId, matchPoints, fixtureLabel);
    if (opponent) {
      const oppPoints = getPromptEngine().getUser(opponent.opponentId)?.matchPoints ?? 0;
      recordRankedMatchForProfile(
        userId,
        fixtureLabel,
        opponent.opponentName,
        matchPoints,
        oppPoints,
      );
    }
  }, [fixtureLabel, matchPoints, opponent, userId]);

  useEffect(() => {
    if (!opponent || !atFullTime) return;
    recordPlay();
    onLiveMatchChange?.(false);
  }, [atFullTime, opponent, onLiveMatchChange, recordPlay]);

  const handleMatchStart = useCallback(
    (found: RankedOpponent) => {
      void initRankedHotTakes(MATCH_ID, [userId, found.opponentId]);
      setOpponent(found);
      onLiveMatchChange?.(true);
    },
    [onLiveMatchChange, userId],
  );

  const handleContinue = useCallback(() => {
    recordPlay();
    onLiveMatchChange?.(false);
    if (onComplete) {
      onComplete();
    } else {
      onBack();
    }
  }, [onBack, onComplete, onLiveMatchChange, recordPlay]);

  if (!canPlay || !activeFixtureId) {
    return (
      <div className="tab-shell" role="main" aria-label="Ranked unavailable">
        <div className="tab-shell__hero">
          <h1 className="tab-shell__title">Ranked not available</h1>
          <p className="tab-shell__sub">
            {status.lockedFixtureId
              ? 'Your locked-in match is not live yet. Play ranked after kickoff from Home.'
              : 'Lock in a match on Home before kickoff to play ranked.'}
          </p>
        </div>
        <div className="tab-shell__actions">
          <button type="button" className="tab-shell__btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (opponent && atFullTime) {
    return (
      <RankedMatchComplete
        opponent={opponent}
        fixtureLabel={fixtureLabel}
        lockedFixtureId={activeFixtureId}
        matchPoints={matchPoints}
        schedule={schedule}
        onContinue={handleContinue}
      />
    );
  }

  if (opponent) {
    return (
      <MatchPage
        userId={userId}
        hideSimControls={hideSimControls}
        rankedOpponent={opponent}
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
