import { useEffect, useRef } from 'react';
import type { DemoUserId } from '../data/personas';
import { DEMO_USERS } from '../data/personas';
import { getFixtureById, resolveFixtureTitle } from '../domain/matchday';
import type { WatchRoomSession } from '../domain/watchRoomTypes';
import { useWatchRoomLobby } from '../hooks/useWatchRoomLobby';
import './WatchRoomLobby.css';

export interface WatchRoomLobbyProps {
  userId: DemoUserId;
  initialSession: WatchRoomSession;
  onMinimize: () => void;
  onLeaveRoom: () => void | Promise<void>;
  onMatchStarted: (session: WatchRoomSession) => void;
}

export function WatchRoomLobby({
  userId,
  initialSession,
  onMinimize,
  onLeaveRoom,
  onMatchStarted,
}: WatchRoomLobbyProps) {
  const { session, members, isHost, matchStarted, toast, copyCode, startMatch } =
    useWatchRoomLobby(userId, initialSession);

  const fixture = getFixtureById(session.matchId);
  const matchLabel = fixture ? resolveFixtureTitle(fixture) : session.matchId;

  const startedRef = useRef(false);

  useEffect(() => {
    if (!matchStarted || startedRef.current) return;
    startedRef.current = true;
    onMatchStarted({ ...session, status: 'ACTIVE', members: session.members });
  }, [matchStarted, session, onMatchStarted]);

  if (matchStarted) {
    return (
      <div className="wr-lobby wr-lobby--starting">
        <div className="wr-lobby__spinner" />
        <p>Entering match…</p>
      </div>
    );
  }

  return (
    <div className="wr-lobby" role="main" aria-label={`Watch Room — ${session.roomName}`}>
      {toast && (
        <div className="wr-lobby__toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <div className="wr-lobby__hero">
        <div className="wr-lobby__nav">
          <button type="button" className="wr-lobby__minimize" onClick={onMinimize}>
            ↓ Minimize
          </button>
          <button type="button" className="wr-lobby__leave" onClick={() => void onLeaveRoom()}>
            Leave room
          </button>
        </div>
        <p className="wr-lobby__eyebrow">WATCH ROOM</p>
        <h1 className="wr-lobby__name">{session.roomName}</h1>
        <p className="wr-lobby__match">{matchLabel}</p>
        <p className="wr-lobby__status">
          {isHost
            ? 'Share your invite code — start when everyone is in'
            : 'Waiting for host to start'}
        </p>
      </div>

      <button
        type="button"
        className="wr-lobby__code"
        onClick={copyCode}
        aria-label={`Invite code ${session.inviteCode}. Tap to copy.`}
      >
        <span className="wr-lobby__code-label">INVITE CODE</span>
        <span className="wr-lobby__code-value">{session.inviteCode}</span>
        <span className="wr-lobby__code-hint">Tap to copy</span>
      </button>

      <div className="wr-lobby__members">
        <p className="wr-lobby__members-label">IN THE ROOM · {members.length}</p>
        <ul className="wr-lobby__list">
          {members.map((member) => {
            const persona = DEMO_USERS[member.userId as DemoUserId];
            const isYou = member.userId === userId;
            const isRoomHost = member.userId === session.hostUserId;
            return (
              <li key={member.userId} className="wr-lobby__member">
                <span className="wr-lobby__avatar" aria-hidden="true">
                  {persona?.avatar ?? '👤'}
                </span>
                <span className="wr-lobby__member-txt">
                  <span className="wr-lobby__member-name">
                    {member.displayName}
                    {isYou ? ' (you)' : ''}
                  </span>
                  {isRoomHost && <span className="wr-lobby__host-badge">Host</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {isHost && (
        <button type="button" className="wr-lobby__start" onClick={startMatch}>
          Start Match
        </button>
      )}
    </div>
  );
}
