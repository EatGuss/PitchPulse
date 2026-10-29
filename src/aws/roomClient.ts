/**
 * Watch Room AppSync client — create/join mutations + member subscription.
 * Falls back to localRoomStore when AWS env vars are not set (/demo local).
 */

import { MATCH_ID, isAwsMode } from './config';
import { VIEWER, gql, gqlSubscribe, type SessionUser } from './session';
import { CREATE_ROOM, JOIN_ROOM, POST_COMMENT, SUB_ROOM_COMMENT, SUB_ROOM_MEMBER_JOINED } from './operations';
import type { JoinRoomPayload, RoomComment, WatchRoomSession } from '../domain/watchRoomTypes';
import {
  joinPayloadToSession,
  normalizeInviteCode,
  validateCommentText,
} from '../domain/watchRoomTypes';
import {
  getLocalComments,
  localCreateRoom,
  localJoinRoom,
  localLeaveRoom,
  localPostComment,
  subscribeLocalComments,
  subscribeLocalMemberJoined,
} from '../sim/localRoomStore';
import { clearMinimizedWatchRoom } from '../sim/watchRoomMinimizedStore';

interface CreateRoomResponse {
  createRoom: {
    roomId: string;
    inviteCode: string;
    roomName: string;
    matchId: string;
    hostUserId: string;
    status: string;
    createdAt: number;
  };
}

interface JoinRoomResponse {
  joinRoom: JoinRoomPayload;
}

export async function createWatchRoom(
  userId: string,
  displayName: string,
  matchId: string = MATCH_ID,
): Promise<WatchRoomSession> {
  clearMinimizedWatchRoom(userId);
  if (!isAwsMode) {
    return localCreateRoom(userId, displayName, matchId);
  }

  // The server names the host from the verified token, not from userId/displayName.
  const res = await gql<CreateRoomResponse>(userId as SessionUser, CREATE_ROOM, {
    input: { matchId },
  });
  if (res.errors?.length) throw new Error(res.errors[0]!.message);

  const room = res.data?.createRoom;
  if (!room) throw new Error('createRoom returned no data');

  return {
    roomId: room.roomId,
    inviteCode: room.inviteCode,
    roomName: room.roomName,
    matchId: room.matchId,
    hostUserId: room.hostUserId,
    status: room.status as WatchRoomSession['status'],
    members: [{ userId, displayName, joinedAt: room.createdAt }],
  };
}

export async function joinWatchRoom(
  rawCode: string,
  userId: string,
  displayName: string,
): Promise<WatchRoomSession> {
  const inviteCode = normalizeInviteCode(rawCode);
  if (!inviteCode) {
    throw new Error('Invite code must be in XXX-XXX format');
  }

  clearMinimizedWatchRoom(userId);

  if (!isAwsMode) {
    return joinPayloadToSession(localJoinRoom(inviteCode, userId, displayName));
  }

  const res = await gql<JoinRoomResponse>(userId as SessionUser, JOIN_ROOM, {
    input: { inviteCode },
  });

  if (res.errors?.length) {
    throw new Error(res.errors[0]!.message);
  }

  const payload = res.data?.joinRoom;
  if (!payload) throw new Error('joinRoom returned no data');

  return joinPayloadToSession(payload);
}

export async function leaveWatchRoom(userId: string): Promise<void> {
  clearMinimizedWatchRoom(userId);
  if (!isAwsMode) {
    localLeaveRoom(userId);
    return;
  }
  // AWS leave-room mutation not wired in demo MVP.
}

export function subscribeWatchRoomMembers(
  roomId: string,
  onUpdate: (payload: JoinRoomPayload) => void,
): () => void {
  if (!isAwsMode) {
    return subscribeLocalMemberJoined(roomId, onUpdate);
  }

  return gqlSubscribe<{ roomMemberJoined: JoinRoomPayload }>(
    VIEWER,
    SUB_ROOM_MEMBER_JOINED,
    { roomId },
    {
      next: (data) => {
        if (data?.roomMemberJoined) onUpdate(data.roomMemberJoined);
      },
      error: (err) => console.error('[room-client] roomMemberJoined subscription error', err),
    },
  );
}

export async function postRoomComment(
  roomId: string,
  promptId: string,
  userId: string,
  rawText: string,
): Promise<RoomComment> {
  const validated = validateCommentText(rawText);
  if (!validated.ok) throw new Error(validated.error);

  if (!isAwsMode) {
    return localPostComment(roomId, promptId, userId, validated.text);
  }

  const res = await gql<{ postComment: RoomComment }>(userId as SessionUser, POST_COMMENT, {
    input: { roomId, promptId, text: validated.text },
  });

  if (res.errors?.length) {
    throw new Error(res.errors[0]!.message);
  }

  const comment = res.data?.postComment;
  if (!comment) throw new Error('postComment returned no data');
  return comment;
}

export function subscribeRoomComments(
  roomId: string,
  promptId: string,
  onComment: (comment: RoomComment) => void,
): () => void {
  if (!isAwsMode) {
    getLocalComments(roomId, promptId).forEach(onComment);
    return subscribeLocalComments(roomId, promptId, onComment);
  }

  return gqlSubscribe<{ roomComment: RoomComment }>(
    VIEWER,
    SUB_ROOM_COMMENT,
    { roomId, promptId },
    {
      next: (data) => {
        if (data?.roomComment) onComment(data.roomComment);
      },
      error: (err) => console.error('[room-client] roomComment subscription error', err),
    },
  );
}

/** Copy invite code to clipboard; returns false if copy failed. */
export async function copyInviteCode(code: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
      return true;
    }
  } catch {
    // Fall through to legacy approach.
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = code;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
