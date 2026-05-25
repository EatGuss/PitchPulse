import type { WatchRoomSession } from '../../domain/watchRoomTypes';
import { WatchRoomMinimizedCard } from '../WatchRoomMinimizedCard';
import './HomeWatchRooms.css';

export interface HomeWatchRoomsProps {
  room: WatchRoomSession | null;
  onOpenRoom: (session: WatchRoomSession) => void;
  onLeaveRoom: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

export function HomeWatchRooms({
  room,
  onOpenRoom,
  onLeaveRoom,
  onCreateRoom,
  onJoinRoom,
}: HomeWatchRoomsProps) {
  return (
    <section
      className={`hwroom${room ? '' : ' hwroom--empty'}`}
      aria-label="Watch with friends"
    >
      <h2 className="hwroom__title">Watch with friends</h2>
      {room ? (
        <>
          <p className="hwroom__sub">Your room is minimized — open to continue.</p>
          <WatchRoomMinimizedCard
            room={room}
            onOpen={() => onOpenRoom(room)}
            onLeave={onLeaveRoom}
          />
        </>
      ) : (
        <>
          <p className="hwroom__sub">Create a room or join with an invite code.</p>
          <div className="hwroom__actions">
            <button type="button" className="hwroom__btn hwroom__btn--primary" onClick={onCreateRoom}>
              Create Room
            </button>
            <button type="button" className="hwroom__btn" onClick={onJoinRoom}>
              Join Room
            </button>
          </div>
        </>
      )}
    </section>
  );
}
