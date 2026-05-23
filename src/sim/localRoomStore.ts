/**
 * In-memory Watch Room store for local-only mode (/demo without AWS env vars).
 * Module singleton — both phone frames in the same tab share this state.
 */

import { randomBytes } from './randomBytes';
import { generateWatchRoomName } from '../data/teamAliases';
import type { JoinRoomPayload, RoomComment, RoomMember, WatchRoomSession } from '../domain/watchRoomTypes';
import { normalizeInviteCode } from '../domain/watchRoomTypes';
import { MATCH_ID } from '../aws/config';
import { TypedEventBus } from './eventBus';

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface LocalRoom {
  roomId: string;
  inviteCode: string;
  roomName: string;
  matchId: string;
  hostUserId: string;
  status: 'WAITING';
  members: Map<string, RoomMember>;
}

const roomsByCode = new Map<string, LocalRoom>();
const commentsByKey = new Map<string, RoomComment[]>();
const bus = new TypedEventBus<{ memberJoined: JoinRoomPayload; comment: RoomComment }>();

function commentKey(roomId: string, promptId: string): string {
  return `${roomId}#${promptId}`;
}

function randomId(): string {
  return randomBytes(8);
}

function randomInvitePart(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += INVITE_CHARS[bytes[i]! % INVITE_CHARS.length];
  }
  return out;
}

function generateInviteCode(): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `${randomInvitePart(3)}-${randomInvitePart(3)}`;
    if (!roomsByCode.has(code)) return code;
  }
  throw new Error('Could not allocate invite code');
}

function generateRoomName(): string {
  return generateWatchRoomName();
}

function toSession(room: LocalRoom): WatchRoomSession {
  return {
    roomId: room.roomId,
    inviteCode: room.inviteCode,
    roomName: room.roomName,
    matchId: room.matchId,
    hostUserId: room.hostUserId,
    status: room.status,
    members: Array.from(room.members.values()).sort((a, b) => a.joinedAt - b.joinedAt),
  };
}

function toJoinPayload(room: LocalRoom, joinedMember: RoomMember): JoinRoomPayload {
  return {
    ...toSession(room),
    joinedMember,
  };
}

export function localCreateRoom(
  userId: string,
  displayName: string,
  matchId: string = MATCH_ID,
): WatchRoomSession {
  const roomId = randomId();
  const inviteCode = generateInviteCode();
  const now = Date.now();
  const member: RoomMember = { userId, displayName, joinedAt: now };
  const room: LocalRoom = {
    roomId,
    inviteCode,
    roomName: generateRoomName(),
    matchId,
    hostUserId: userId,
    status: 'WAITING',
    members: new Map([[userId, member]]),
  };
  roomsByCode.set(inviteCode, room);
  return toSession(room);
}

export function localJoinRoom(
  rawCode: string,
  userId: string,
  displayName: string,
): JoinRoomPayload {
  const inviteCode = normalizeInviteCode(rawCode);
  if (!inviteCode) {
    throw new Error('Invite code must be in XXX-XXX format');
  }

  const room = roomsByCode.get(inviteCode);
  if (!room) {
    throw new Error('Room not found — check the invite code');
  }

  const now = Date.now();
  let joinedMember = room.members.get(userId);
  if (!joinedMember) {
    joinedMember = { userId, displayName, joinedAt: now };
    room.members.set(userId, joinedMember);
    const payload = toJoinPayload(room, joinedMember);
    bus.emit('memberJoined', payload);
    return payload;
  }

  return toJoinPayload(room, joinedMember);
}

export function subscribeLocalMemberJoined(
  roomId: string,
  onUpdate: (payload: JoinRoomPayload) => void,
): () => void {
  return bus.on('memberJoined', (payload) => {
    if (payload.roomId === roomId) onUpdate(payload);
  });
}

export function getLocalComments(roomId: string, promptId: string): RoomComment[] {
  return [...(commentsByKey.get(commentKey(roomId, promptId)) ?? [])];
}

export function localPostComment(
  roomId: string,
  promptId: string,
  userId: string,
  text: string,
): RoomComment {
  const comment: RoomComment = {
    roomId,
    commentId: randomId(),
    promptId,
    userId,
    text,
    ts: Date.now(),
  };
  const key = commentKey(roomId, promptId);
  const list = commentsByKey.get(key) ?? [];
  list.push(comment);
  commentsByKey.set(key, list);
  bus.emit('comment', comment);
  return comment;
}

export function subscribeLocalComments(
  roomId: string,
  promptId: string,
  onComment: (comment: RoomComment) => void,
): () => void {
  return bus.on('comment', (comment) => {
    if (comment.roomId === roomId && comment.promptId === promptId) onComment(comment);
  });
}
