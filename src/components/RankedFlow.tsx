import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import { getFixtureById, resolveFixtureTitle, type MatchdayScheduleContext } from '../domain/matchday';
import { DEMO_USERS } from '../data/personas';
import {
  buildMatchSummaryData,
  type PreMatchSnapshot,
} from '../domain/rankedMatchSummary';
import {
  resolveUserRankedOutcome,
  type RankedMatchResult,
  type RankedOpponent,
} from '../domain/rankedTypes';
import type { Tier } from '../domain/tiers';
import { useMatchPoints } from '../hooks/useMatchPoints';
import { useMatchSimState } from '../hooks/useMatchSimState';
import { MatchPage } from '../pages/MatchPage';
import { MATCH_ID } from '../aws/config';
import { initRankedHotTakes } from '../aws/hotTakeClient';
import { recordRankedMatchForProfile } from '../aws/profileClient';
import { commitCompleteRankedMatch } from '../aws/rankedMatchClient';
import { buildRankedMatchTitleInput } from '../domain/rankedMatchStats';
import {
  canPlayRankedFixture,
  getUserRankedMatchdayStatus,
  recordRankedMatchdayPlay,
} from '../sim/matchdayStore';
import { getPromptEngine } from '../sim/promptEngine';
import { localGetTierProgress } from '../sim/localProfileStore';
import { localGetUserStats } from '../sim/localLeaderboardStore';
import { MatchSummary } from './MatchSummary';
import { OutcomeScreen } from './outcome/OutcomeScreen';
import { RankedMatchmaking } from './RankedMatchmaking';
import { RankedPromotionOverlay } from './RankedPromotionOverlay';

type PostMatchPhase = 'outcome' | 'promotion' | 'summary';

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
  const [matchResult, setMatchResult] = useState<RankedMatchResult | null>(null);
  const [postMatchPhase, setPostMatchPhase] = useState<PostMatchPhase | null>(null);
  const [pendingPromoTier, setPendingPromoTier] = useState<Tier | null>(null);
  const [preMatchSnapshot, setPreMatchSnapshot] = useState<PreMatchSnapshot | null>(null);
  const [tierState, setTierState] = useState(() => localGetTierProgress(userId));
  const settledRef = useRef(false);

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
    setTierState(localGetTierProgress(userId));
  }, [fixtureLabel, matchPoints, opponent, userId]);

  useEffect(() => {
    if (!opponent || !atFullTime || settledRef.current) return;
    settledRef.current = true;

    const oppPoints = getPromptEngine().getUser(opponent.opponentId)?.matchPoints ?? 0;

    const finish = async () => {
      const isDraw = matchPoints === oppPoints;
      const winnerId = isDraw
        ? userId
        : matchPoints > oppPoints
          ? userId
          : opponent.opponentId;
      const loserId = isDraw
        ? opponent.opponentId
        : matchPoints > oppPoints
          ? opponent.opponentId
          : userId;
      const winnerPts = isDraw ? matchPoints : Math.max(matchPoints, oppPoints);
      const loserPts = isDraw ? oppPoints : Math.min(matchPoints, oppPoints);

      const titleInput = isDraw
        ? buildRankedMatchTitleInput(userId, opponent.opponentId as DemoUserId)
        : buildRankedMatchTitleInput(winnerId as DemoUserId, loserId as DemoUserId);

      const result = await commitCompleteRankedMatch(
        MATCH_ID,
        winnerId as DemoUserId,
        loserId as DemoUserId,
        winnerPts,
        loserPts,
        titleInput,
      );

      setMatchResult(result);
      setTierState(localGetTierProgress(userId));
      recordPlay();

      if (!isDraw && result.promoted && result.newTier && winnerId === userId) {
        setPendingPromoTier(result.newTier);
      }
    };

    void finish();
  }, [atFullTime, matchPoints, opponent, recordPlay, userId]);

  useEffect(() => {
    if (opponent && atFullTime && postMatchPhase === null) {
      setPostMatchPhase('outcome');
    }
  }, [atFullTime, opponent, postMatchPhase]);

  const handleMatchStart = useCallback(
    (found: RankedOpponent) => {
      const stats = localGetUserStats(userId);
      const tierProgress = localGetTierProgress(userId);
      setPreMatchSnapshot({
        weeklyPoints: stats.weeklyPoints,
        seasonalPoints: stats.seasonalPoints,
        tier: tierProgress.tier,
        tierWinsTowardNext: tierProgress.winsTowardNext,
      });
      void initRankedHotTakes(MATCH_ID, [userId, found.opponentId]);
      setOpponent(found);
      onLiveMatchChange?.(true);
    },
    [onLiveMatchChange, userId],
  );

  const handleOutcomeDismiss = useCallback(() => {
    onLiveMatchChange?.(false);
    if (pendingPromoTier) {
      setPostMatchPhase('promotion');
    } else {
      setPostMatchPhase('summary');
    }
  }, [onLiveMatchChange, pendingPromoTier]);

  const handlePromotionDismiss = useCallback(() => {
    setPendingPromoTier(null);
    setTierState(localGetTierProgress(userId));
    setPostMatchPhase('summary');
  }, [userId]);

  const handleExitToHome = useCallback(() => {
    onLiveMatchChange?.(false);
    if (onComplete) {
      onComplete();
    } else {
      onBack();
    }
  }, [onBack, onComplete, onLiveMatchChange]);

  const inRankedPostMatch = Boolean(opponent && atFullTime);

  const summaryData = useMemo(() => {
    if (!opponent || !preMatchSnapshot) return null;
    const engine = getPromptEngine();
    const viewer = engine.getUser(userId);
    const opp = engine.getUser(opponent.opponentId);
    const oppPoints = opp?.matchPoints ?? 0;
    const outcome = resolveUserRankedOutcome(userId, matchResult, matchPoints, oppPoints);

    return buildMatchSummaryData({
      viewerId: userId,
      viewerName: DEMO_USERS[userId]?.displayName ?? userId,
      opponentId: opponent.opponentId,
      opponentName: opponent.opponentName,
      matchPoints,
      viewerHistory: viewer?.history ?? [],
      opponentHistory: opp?.history ?? [],
      preMatch: preMatchSnapshot,
      afterTier: tierState.tier,
      afterWins: tierState.winsTowardNext,
      outcome,
      matchResult,
    });
  }, [matchPoints, matchResult, opponent, preMatchSnapshot, tierState, userId]);

  if ((!canPlay || !activeFixtureId) && !inRankedPostMatch) {
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

  if (opponent && atFullTime && postMatchPhase) {
    const oppPoints = getPromptEngine().getUser(opponent.opponentId)?.matchPoints ?? 0;
    const userDisplayName = DEMO_USERS[userId]?.displayName ?? userId;
    const userOutcome = resolveUserRankedOutcome(
      userId,
      matchResult,
      matchPoints,
      oppPoints,
    );

    if (postMatchPhase === 'outcome') {
      return (
        <div className="ranked-outcome-shell">
          <OutcomeScreen
            outcome={userOutcome}
            userDisplayName={userDisplayName}
            opponentName={opponent.opponentName}
            userPoints={matchPoints}
            opponentPoints={oppPoints}
            onDismiss={handleOutcomeDismiss}
          />
        </div>
      );
    }

    if (postMatchPhase === 'promotion' && pendingPromoTier) {
      return (
        <div className="ranked-postmatch-shell">
          <RankedPromotionOverlay
            newTier={pendingPromoTier}
            onDismiss={handlePromotionDismiss}
          />
        </div>
      );
    }

    if (postMatchPhase === 'summary' && summaryData) {
      return (
        <MatchSummary
          data={summaryData}
          onClose={handleExitToHome}
          onBackToHome={handleExitToHome}
        />
      );
    }
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
