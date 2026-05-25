import { EventFeed } from '../EventFeed';
import { HomeWatchRooms } from '../home/HomeWatchRooms';
import type { DemoUserId } from '../../data/personas';
import { demoFixtureDisplayTitle, type MatchdayScheduleContext } from '../../domain/matchday';
import type { WatchRoomSession } from '../../domain/watchRoomTypes';
import { useActiveWatchRoom } from '../../hooks/useUserWatchRooms';
import { useMatchData } from '../../hooks/useMatchData';
import { useMatchSimState } from '../../hooks/useMatchSimState';
import { isPrimaryFixtureLive } from '../../sim/matchdayStore';

export interface CompeteLiveWatchPanelProps {
  userId: DemoUserId;
  schedule: MatchdayScheduleContext;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onOpenRoom: (session: WatchRoomSession) => void;
  onLeaveRoom: () => void | Promise<void>;
}

export function CompeteLiveWatchPanel({
  userId,
  schedule,
  onCreateRoom,
  onJoinRoom,
  onOpenRoom,
  onLeaveRoom,
}: CompeteLiveWatchPanelProps) {
  const watchRoom = useActiveWatchRoom(userId);
  const { info, ready } = useMatchData();
  const { events } = useMatchSimState();
  const live = isPrimaryFixtureLive(schedule.clockPhase, schedule.isRunning);

  return (
    <div className="compete-panel" aria-label="Live and watch rooms">
      <section className="compete-live__feed" aria-label="Live Now">
        <header className="compete-live__feed-head">
          <span className="compete-live__dot" aria-hidden="true" />
          <div>
            <h2 className="compete-live__title">Live Now</h2>
            <p className="compete-live__sub">Events only — no prompts or points</p>
          </div>
        </header>
        {live && ready && info ? (
          <>
            <p className="compete-live__match">{demoFixtureDisplayTitle()}</p>
            <div className="compete-live__body">
              <EventFeed events={events} info={info} viewerId={userId} />
            </div>
          </>
        ) : (
          <p className="compete-live__empty">No live match right now — check back on matchday.</p>
        )}
      </section>

      <HomeWatchRooms
        room={watchRoom}
        onCreateRoom={onCreateRoom}
        onJoinRoom={onJoinRoom}
        onOpenRoom={onOpenRoom}
        onLeaveRoom={onLeaveRoom}
      />
    </div>
  );
}
