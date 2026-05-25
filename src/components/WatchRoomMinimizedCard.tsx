import { getFixtureById, resolveFixtureTitle } from '../domain/matchday';
import type { WatchRoomSession } from '../domain/watchRoomTypes';
import './WatchRoomMinimizedCard.css';

export interface WatchRoomMinimizedCardProps {
  room: WatchRoomSession;
  onOpen: () => void;
  onLeave: () => void;
}

export function WatchRoomMinimizedCard({ room, onOpen, onLeave }: WatchRoomMinimizedCardProps) {
  const fixture = getFixtureById(room.matchId);
  const matchLabel = fixture ? resolveFixtureTitle(fixture) : null;

  return (
    <div className="wr-mini" aria-label={`Minimized watch room ${room.roomName}`}>
      <div className="wr-mini__meta">
        <span className="wr-mini__badge">Minimized</span>
        <span className="wr-mini__name">{room.roomName}</span>
        {matchLabel && <span className="wr-mini__match">{matchLabel}</span>}
        <span className="wr-mini__count">{room.members.length} fans · {room.inviteCode}</span>
      </div>
      <div className="wr-mini__actions">
        <button type="button" className="wr-mini__open" onClick={onOpen}>
          Open
        </button>
        <button type="button" className="wr-mini__leave" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </div>
  );
}
