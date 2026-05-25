import { useCallback, useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import type { WatchRoomSession } from '../domain/watchRoomTypes';
import { useActiveWatchRoom } from '../hooks/useUserWatchRooms';
import { MatchPage } from '../pages/MatchPage';
import { WatchRoomEntry } from './WatchRoomEntry';
import { WatchRoomLobby } from './WatchRoomLobby';

export interface WatchRoomFlowProps {
  userId: DemoUserId;
  hideSimControls?: boolean;
  onBack: () => void;
  onMinimize: (session: WatchRoomSession, inMatch: boolean) => void;
  onLeaveRoom: () => void | Promise<void>;
  onLiveMatchChange?: (inLiveMatch: boolean) => void;
  initialSession?: WatchRoomSession | null;
  openInMatch?: boolean;
  restoreInMatch?: boolean;
}

export function WatchRoomFlow({
  userId,
  hideSimControls = false,
  onBack,
  onMinimize,
  onLeaveRoom,
  onLiveMatchChange,
  initialSession = null,
  openInMatch = false,
  restoreInMatch = false,
}: WatchRoomFlowProps) {
  const activeRoom = useActiveWatchRoom(userId);
  const [session, setSession] = useState<WatchRoomSession | null>(() => initialSession);
  const [inMatch, setInMatch] = useState(() => Boolean(initialSession && openInMatch));

  useEffect(() => {
    if (initialSession) {
      setSession(initialSession);
      setInMatch(openInMatch);
      if (openInMatch) onLiveMatchChange?.(true);
    }
  }, [initialSession, openInMatch, onLiveMatchChange]);

  const handleMatchStarted = useCallback(
    (activeSession: WatchRoomSession) => {
      setSession(activeSession);
      setInMatch(true);
      onLiveMatchChange?.(true);
    },
    [onLiveMatchChange],
  );

  const handleMinimize = useCallback(() => {
    if (!session) {
      onBack();
      return;
    }
    const wasInMatch = inMatch;
    setSession(null);
    setInMatch(false);
    onLiveMatchChange?.(false);
    onMinimize(session, wasInMatch);
  }, [session, inMatch, onBack, onLiveMatchChange, onMinimize]);

  const handleLeaveRoom = useCallback(async () => {
    setInMatch(false);
    onLiveMatchChange?.(false);
    setSession(null);
    await onLeaveRoom();
  }, [onLeaveRoom, onLiveMatchChange]);

  const handleOpenExistingRoom = useCallback(
    (room: WatchRoomSession) => {
      setSession(room);
      if (restoreInMatch) {
        setInMatch(true);
        onLiveMatchChange?.(true);
      }
    },
    [restoreInMatch, onLiveMatchChange],
  );

  if (inMatch && session) {
    return (
      <MatchPage
        userId={userId}
        hideSimControls={hideSimControls}
        watchRoom={session}
        onMinimizeWatchRoom={handleMinimize}
        onLeaveWatchRoom={handleLeaveRoom}
      />
    );
  }

  if (session) {
    return (
      <WatchRoomLobby
        userId={userId}
        initialSession={session}
        onMinimize={handleMinimize}
        onLeaveRoom={handleLeaveRoom}
        onMatchStarted={handleMatchStarted}
      />
    );
  }

  return (
    <WatchRoomEntry
      userId={userId}
      activeRoom={activeRoom}
      onBack={onBack}
      onJoined={setSession}
      onOpenRoom={handleOpenExistingRoom}
      onLeaveRoom={handleLeaveRoom}
    />
  );
}
