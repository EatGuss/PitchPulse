/**
 * Watch Room AppSync client — create/join mutations + member subscription.
 * Falls back to localRoomStore when AWS env vars are not set (/demo local).
 */

import { generateClient } from 'aws-amplify/api';
import { MATCH_ID, isAwsMode } from './config';
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

interface SubscriptionLike<T> {
  subscribe: (handlers: {
    next: (value: { data: T }) => void;
    error?: (err: unknown) => void;
  }) => { unsubscribe: () => void };
}

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

  const client = generateClient();
  const res = (await client.graphql({
    query: CREATE_ROOM,
    variables: {
      input: { matchId, userId, displayName },
    },
  })) as { data?: CreateRoomResponse };

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

  const client = generateClient();
  const res = (await client.graphql({
    query: JOIN_ROOM,
    variables: {
      input: { inviteCode, userId, displayName },
    },
  })) as { data?: JoinRoomResponse; errors?: Array<{ message: string }> };

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

  const client = generateClient();
  const obs = client.graphql({
    query: SUB_ROOM_MEMBER_JOINED,
    variables: { roomId },
  }) as unknown as SubscriptionLike<{ roomMemberJoined: JoinRoomPayload }>;

  const sub = obs.subscribe({
    next: ({ data }) => {
      if (data?.roomMemberJoined) onUpdate(data.roomMemberJoined);
    },
    error: (err) => {
      console.error('[room-client] roomMemberJoined subscription error', err);
    },
  });

  return () => sub.unsubscribe();
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

  const client = generateClient();
  const res = (await client.graphql({
    query: POST_COMMENT,
    variables: {
      input: {
        roomId,
        promptId,
        userId,
        text: validated.text,
      },
    },
  })) as { data?: { postComment: RoomComment }; errors?: Array<{ message: string }> };

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

  const client = generateClient();
  const obs = client.graphql({
    query: SUB_ROOM_COMMENT,
    variables: { roomId, promptId },
  }) as unknown as SubscriptionLike<{ roomComment: RoomComment }>;

  const sub = obs.subscribe({
    next: ({ data }) => {
      if (data?.roomComment) onComment(data.roomComment);
    },
    error: (err) => {
      console.error('[room-client] roomComment subscription error', err);
    },
  });

  return () => sub.unsubscribe();
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
