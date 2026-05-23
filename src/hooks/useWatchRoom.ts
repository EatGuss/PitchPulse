/**
 * useWatchRoom — subscribes a component to the WatchRoomEngine's reaction stream.
 *
 * When `roomId` is set (private Watch Room), reactions also broadcast via
 * AppSync using that room id. Public match passes no roomId and uses the
 * in-memory engine only (or matchId-as-roomId in AWS public mode).
 */

import { useCallback, useEffect, useState } from 'react';
import { awsFireReaction, ensureWatchRoomReactionBridge } from '../aws/bridge';
import { isAwsMode } from '../aws/config';
import {
  getWatchRoomEngine,
  type ReactionEmoji,
  type ReactionEvent,
} from '../sim/watchRoomEngine';

export interface UseWatchRoomOptions {
  roomId?: string;
  memberIds?: string[];
}

export interface UseWatchRoomResult {
  reactions: ReactionEvent[];
  fireReaction: (emoji: ReactionEmoji) => ReactionEvent | null;
  members: string[];
}

export function useWatchRoom(viewerId: string, options: UseWatchRoomOptions = {}): UseWatchRoomResult {
  const { roomId, memberIds } = options;
  const room = getWatchRoomEngine();
  const memberKey = memberIds?.slice().sort().join(',') ?? '';
  const [reactions, setReactions] = useState<ReactionEvent[]>(() => room.getReactions());
  const [members, setMembers] = useState<string[]>(() => room.getMembers());

  useEffect(() => {
    if (memberIds && memberIds.length > 0) {
      room.setMembers(memberIds);
      room.setRoomId(roomId ?? null);
      setMembers(room.getMembers());
    } else {
      room.join(viewerId);
      setMembers(room.getMembers());
    }

    const offs = [
      room.bus.on('reaction', () => setReactions(room.getReactions())),
      room.bus.on('memberJoined', () => setMembers(room.getMembers())),
      room.bus.on('reset', () => setReactions(room.getReactions())),
    ];
    return () => offs.forEach((off) => off());
  }, [room, viewerId, roomId, memberKey]);

  useEffect(() => {
    if (!roomId || !isAwsMode) return;
    ensureWatchRoomReactionBridge(roomId);
  }, [roomId]);

  const fireReaction = useCallback(
    (emoji: ReactionEmoji) => {
      const targetRoomId = roomId ?? room.getRoomId();

      // AWS: broadcast via AppSync only — subscription injects one puff for all viewers.
      if (isAwsMode && targetRoomId) {
        void awsFireReaction(targetRoomId, viewerId, emoji).catch((err) => {
          console.error('[useWatchRoom] fireReaction failed', err);
        });
        return null;
      }

      return room.fireReaction(viewerId, emoji);
    },
    [room, viewerId, roomId],
  );

  return { reactions, fireReaction, members };
}
