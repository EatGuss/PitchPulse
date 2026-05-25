/**
 * HomeTab — matchday hero, stats, live snapshot, watch rooms (Gate D).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { SelectMatchModal } from '../../components/home/SelectMatchModal';
import { HomeUpcomingMatches } from '../../components/home/HomeUpcomingMatches';
import { HomeHeroCard } from '../../components/home/HomeHeroCard';
import { HomeStatsCard } from '../../components/home/HomeStatsCard';
import { HomeWhatsLive } from '../../components/home/HomeWhatsLive';
import { HomeWatchRooms } from '../../components/home/HomeWatchRooms';
import { LiveFeedSheet } from '../../components/home/LiveFeedSheet';
import { LockInConfirm } from '../../components/home/LockInConfirm';
import type { DemoUserId } from '../../data/personas';
import { getFixtureById, isMatchdayOngoing, resolveFixtureTitle } from '../../domain/matchday';
import type { WatchRoomSession } from '../../domain/watchRoomTypes';
import { useHomeMatchday } from '../../hooks/useHomeMatchday';
import { useHomeTierProgress } from '../../hooks/useHomeTierProgress';
import { useMatchData } from '../../hooks/useMatchData';
import { useMatchSimState } from '../../hooks/useMatchSimState';
import { useActiveWatchRoom } from '../../hooks/useUserWatchRooms';
import { commitLockInRanked } from '../../aws/rankedMatchdayClient';
import { useRankedMatchdaySync } from '../../hooks/useRankedMatchdaySync';
import { canChangeRankedFixture } from '../../sim/matchdayStore';
import './HomeTab.css';
import './TabShell.css';

export type HomeOverlay = 'none' | 'liveFeed' | 'selectMatch';

export interface HomeTabProps {
  userId: DemoUserId;
  overlay: HomeOverlay;
  onOverlayChange: (overlay: HomeOverlay) => void;
  onPlayRanked: (fixtureId: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onOpenRoom: (session: WatchRoomSession) => void;
  onLeaveRoom: () => void | Promise<void>;
}

export function HomeTab({
  userId,
  overlay,
  onOverlayChange,
  onPlayRanked,
  onCreateRoom,
  onJoinRoom,
  onOpenRoom,
  onLeaveRoom,
}: HomeTabProps) {
  const { heroState, rankedStatus, matchSimLive, schedule } = useHomeMatchday(userId);
  useRankedMatchdaySync(userId);
  const tierProgress = useHomeTierProgress(userId);
  const watchRoom = useActiveWatchRoom(userId);
  const { info, ready } = useMatchData();
  const { events } = useMatchSimState();

  const matchPointsThisMatch = rankedStatus.played ? rankedStatus.matchPoints : null;
  const matchdayOngoing = isMatchdayOngoing(
    schedule.clockPhase,
    schedule.isRunning,
    schedule.simKickoffWallMs,
  );
  const showUpcoming = rankedStatus.played || heroState !== 'post_matchday';

  const shellRef = useRef<HTMLDivElement>(null);
  const [lockInFlash, setLockInFlash] = useState<{ fixtureId: string; label: string } | null>(null);

  const liveFeedOpen = overlay === 'liveFeed';
  const selectMatchOpen = overlay === 'selectMatch';
  const sheetOpen = liveFeedOpen || selectMatchOpen || lockInFlash !== null;

  useEffect(() => {
    if (liveFeedOpen && !matchSimLive) onOverlayChange('none');
  }, [liveFeedOpen, matchSimLive, onOverlayChange]);

  useEffect(() => {
    if (!liveFeedOpen) return;
    shellRef.current?.scrollTo(0, 0);
  }, [liveFeedOpen]);

  const handleLockIn = useCallback(
    (fixtureId: string) => {
      const fixture = getFixtureById(fixtureId);
      if (!fixture) return;
      const label = resolveFixtureTitle(fixture);
      void commitLockInRanked(userId, fixtureId, label, schedule).then((ok) => {
        if (!ok) return;
        onOverlayChange('none');
        setLockInFlash({ fixtureId, label });
      });
    },
    [userId, schedule, onOverlayChange],
  );

  const clearLockInFlash = useCallback(() => setLockInFlash(null), []);

  return (
    <div
      ref={shellRef}
      className={`tab-shell tab-shell--home tab-shell--home-stack${sheetOpen ? ' tab-shell--modal-open' : ''}${liveFeedOpen ? ' tab-shell--live-feed-open' : ''}`}
      role="main"
      aria-label="Home"
    >
      <div className="home-tab">
        <HomeHeroCard
          state={heroState}
          rankedStatus={rankedStatus}
          canChangePick={canChangeRankedFixture(userId, schedule)}
          matchdayOngoing={matchdayOngoing}
          onPlayRanked={onPlayRanked}
          onSelectMatchday={() => onOverlayChange('selectMatch')}
        />
        <div className="home-tab__sections">
          <HomeStatsCard tierProgress={tierProgress} matchPointsThisMatch={matchPointsThisMatch} />
          {showUpcoming && (
            <HomeUpcomingMatches
              schedule={schedule}
              playedFixtureId={rankedStatus.played ? rankedStatus.lockedFixtureId : null}
              playedMatchPoints={rankedStatus.played ? rankedStatus.matchPoints : null}
            />
          )}
          {!sheetOpen && (
            <HomeWatchRooms
              room={watchRoom}
              onCreateRoom={onCreateRoom}
              onJoinRoom={onJoinRoom}
              onOpenRoom={onOpenRoom}
              onLeaveRoom={onLeaveRoom}
            />
          )}
          {matchSimLive && ready && info && !liveFeedOpen && (
            <HomeWhatsLive
              events={events}
              info={info}
              onOpenFeed={() => onOverlayChange('liveFeed')}
            />
          )}
        </div>
      </div>
      <SelectMatchModal
        open={selectMatchOpen}
        mode="ranked"
        userId={userId}
        rankedStatus={rankedStatus}
        schedule={schedule}
        onClose={() => onOverlayChange('none')}
        onPick={handleLockIn}
      />
      {lockInFlash && (
        <LockInConfirm
          fixtureId={lockInFlash.fixtureId}
          fixtureLabel={lockInFlash.label}
          onDone={clearLockInFlash}
        />
      )}
      {ready && info && (
        <LiveFeedSheet
          open={liveFeedOpen}
          userId={userId}
          info={info}
          events={events}
          onClose={() => onOverlayChange('none')}
        />
      )}
    </div>
  );
}
