import { useCallback, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import type { WatchRoomSession } from '../domain/watchRoomTypes';
import { MatchPage } from '../pages/MatchPage';
import { WatchRoomEntry } from './WatchRoomEntry';
import { WatchRoomLobby } from './WatchRoomLobby';

export interface WatchRoomFlowProps {
  userId: DemoUserId;
  hideSimControls?: boolean;
  onBack: () => void;
}

export function WatchRoomFlow({ userId, hideSimControls = false, onBack }: WatchRoomFlowProps) {
  const [session, setSession] = useState<WatchRoomSession | null>(null);
  const [inMatch, setInMatch] = useState(false);

  const handleMatchStarted = useCallback((activeSession: WatchRoomSession) => {
    setSession(activeSession);
    setInMatch(true);
  }, []);

  const handleLeaveMatch = useCallback(() => {
    setInMatch(false);
    setSession(null);
  }, []);

  if (inMatch && session) {
    return (
      <MatchPage
        userId={userId}
        hideSimControls={hideSimControls}
        watchRoom={session}
        onLeaveWatchRoom={handleLeaveMatch}
      />
    );
  }

  if (session) {
    return (
      <WatchRoomLobby
        userId={userId}
        initialSession={session}
        onLeave={() => setSession(null)}
        onMatchStarted={handleMatchStarted}
      />
    );
  }

  return <WatchRoomEntry userId={userId} onBack={onBack} onJoined={setSession} />;
}
