import { useCallback, useEffect, useState } from 'react';
import { copyInviteCode, subscribeWatchRoomMembers } from '../aws/roomClient';
import type { JoinRoomPayload, WatchRoomSession } from '../domain/watchRoomTypes';
import {
  isWatchRoomMatchStarted,
  signalWatchRoomMatchStarted,
  subscribeWatchRoomMatchStarted,
} from '../sim/watchRoomCoordination';

const TOAST_MS = 2200;

export interface UseWatchRoomLobbyResult {
  session: WatchRoomSession;
  members: WatchRoomSession['members'];
  isHost: boolean;
  matchStarted: boolean;
  toast: string | null;
  copyCode: () => void;
  startMatch: () => void;
}

export function useWatchRoomLobby(
  userId: string,
  initialSession: WatchRoomSession,
): UseWatchRoomLobbyResult {
  const [session, setSession] = useState(initialSession);
  const [toast, setToast] = useState<string | null>(null);
  const [matchStarted, setMatchStarted] = useState(() =>
    isWatchRoomMatchStarted(initialSession.roomId),
  );

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  useEffect(() => {
    return subscribeWatchRoomMembers(session.roomId, (payload: JoinRoomPayload) => {
      setSession((prev) => ({
        ...prev,
        members: payload.members,
        status: payload.status,
      }));
    });
  }, [session.roomId]);

  useEffect(() => {
    return subscribeWatchRoomMatchStarted(session.roomId, () => {
      setMatchStarted(true);
    });
  }, [session.roomId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const copyCode = useCallback(() => {
    void (async () => {
      const ok = await copyInviteCode(session.inviteCode);
      setToast(ok ? 'Invite code copied!' : 'Could not copy — select and copy manually');
    })();
  }, [session.inviteCode]);

  const startMatch = useCallback(() => {
    if (session.hostUserId !== userId) return;
    signalWatchRoomMatchStarted(session.roomId);
    setMatchStarted(true);
  }, [session.hostUserId, session.roomId, userId]);

  return {
    session,
    members: session.members,
    isHost: session.hostUserId === userId,
    matchStarted,
    toast,
    copyCode,
    startMatch,
  };
}
