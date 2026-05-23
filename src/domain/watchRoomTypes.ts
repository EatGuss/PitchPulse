/** Watch Room session types shared by lobby UI and AWS/local clients. */

export type RoomStatus = 'WAITING' | 'ACTIVE' | 'ENDED';

export interface RoomMember {
  userId: string;
  displayName: string;
  joinedAt: number;
}

export interface WatchRoomSession {
  roomId: string;
  inviteCode: string;
  roomName: string;
  matchId: string;
  hostUserId: string;
  status: RoomStatus;
  members: RoomMember[];
}

export interface JoinRoomPayload {
  roomId: string;
  inviteCode: string;
  roomName: string;
  matchId: string;
  status: RoomStatus;
  members: RoomMember[];
  joinedMember: RoomMember;
}

const INVITE_RE = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;

/** Normalize user input to XXX-XXX (uppercase). Returns null if invalid. */
export function normalizeInviteCode(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (INVITE_RE.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/[^A-Z0-9]/g, '');
  if (compact.length === 6) {
    const formatted = `${compact.slice(0, 3)}-${compact.slice(3)}`;
    return INVITE_RE.test(formatted) ? formatted : null;
  }
  return null;
}

export function joinPayloadToSession(payload: JoinRoomPayload): WatchRoomSession {
  const hostUserId = payload.members.reduce((earliest, member) =>
    member.joinedAt < earliest.joinedAt ? member : earliest,
  ).userId;
  return {
    roomId: payload.roomId,
    inviteCode: payload.inviteCode,
    roomName: payload.roomName,
    matchId: payload.matchId,
    hostUserId,
    status: payload.status,
    members: payload.members,
  };
}

export function isInviteCodeComplete(raw: string): boolean {
  return normalizeInviteCode(raw) !== null;
}

export interface RoomComment {
  roomId: string;
  commentId: string;
  promptId: string;
  userId: string;
  text: string;
  ts: number;
}

export const MAX_COMMENT_LEN = 140;

/** Client-side mirror of room-handler validation. */
export function validateCommentText(raw: string): { ok: true; text: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Comment cannot be empty' };
  if (trimmed.length > MAX_COMMENT_LEN) {
    return { ok: false, error: `Comment must be ${MAX_COMMENT_LEN} characters or fewer` };
  }
  if (/@/.test(trimmed)) {
    return { ok: false, error: '@ mentions are not allowed in comments' };
  }
  return { ok: true, text: trimmed };
}
