import { useCallback, useState } from 'react';
import { HomeHeroCard } from '../home/HomeHeroCard';
import { HomeUpcomingMatches } from '../home/HomeUpcomingMatches';
import { LockInConfirm } from '../home/LockInConfirm';
import { SelectMatchModal } from '../home/SelectMatchModal';
import type { DemoUserId } from '../../data/personas';
import { commitLockInRanked } from '../../aws/rankedMatchdayClient';
import { getFixtureById, isMatchdayOngoing, resolveFixtureTitle, type MatchdayScheduleContext } from '../../domain/matchday';
import { useHomeMatchday } from '../../hooks/useHomeMatchday';
import { canChangeRankedFixture } from '../../sim/matchdayStore';

export interface CompeteRankedPanelProps {
  userId: DemoUserId;
  schedule: MatchdayScheduleContext;
  onPlayRanked: (fixtureId: string) => void;
}

export function CompeteRankedPanel({ userId, schedule, onPlayRanked }: CompeteRankedPanelProps) {
  const { heroState, rankedStatus } = useHomeMatchday(userId);
  const matchdayOngoing = isMatchdayOngoing(
    schedule.clockPhase,
    schedule.isRunning,
    schedule.simKickoffWallMs,
  );
  const showUpcoming = rankedStatus.played || heroState !== 'post_matchday';
  const [selectOpen, setSelectOpen] = useState(false);
  const [lockInFlash, setLockInFlash] = useState<{ fixtureId: string; label: string } | null>(null);

  const handleLockIn = useCallback(
    async (fixtureId: string) => {
      const fixture = getFixtureById(fixtureId);
      if (!fixture) return;
      const label = resolveFixtureTitle(fixture);
      try {
        const ok = await commitLockInRanked(userId, fixtureId, label, schedule);
        if (!ok) return;
        setSelectOpen(false);
        setLockInFlash({ fixtureId, label });
      } catch (err) {
        console.warn('[compete] lock-in failed', err);
      }
    },
    [userId, schedule],
  );

  return (
    <div className="compete-panel" aria-label="Ranked matchday">
      <HomeHeroCard
        state={heroState}
        rankedStatus={rankedStatus}
        canChangePick={canChangeRankedFixture(userId, schedule)}
        matchdayOngoing={matchdayOngoing}
        onPlayRanked={onPlayRanked}
        onSelectMatchday={() => setSelectOpen(true)}
      />
      {showUpcoming && (
        <HomeUpcomingMatches
          schedule={schedule}
          playedFixtureId={rankedStatus.played ? rankedStatus.lockedFixtureId : null}
          playedMatchPoints={rankedStatus.played ? rankedStatus.matchPoints : null}
        />
      )}
      <SelectMatchModal
        open={selectOpen}
        mode="ranked"
        userId={userId}
        rankedStatus={rankedStatus}
        schedule={schedule}
        onClose={() => setSelectOpen(false)}
        onPick={(fixtureId) => {
          void handleLockIn(fixtureId);
        }}
      />
      {lockInFlash && (
        <LockInConfirm
          fixtureId={lockInFlash.fixtureId}
          fixtureLabel={lockInFlash.label}
          onDone={() => setLockInFlash(null)}
        />
      )}
    </div>
  );
}
