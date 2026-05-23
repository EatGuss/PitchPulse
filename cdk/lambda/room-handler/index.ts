/**
 * room-handler — AppSync Lambda data source for Watch Room mutations:
 *   createRoom, joinRoom, postComment, leaveRoom
 *
 * pp-rooms single-table layout (PK/SK):
 *   ROOM#<roomId> / META              — inviteCode, matchId, hostUserId, status, roomName
 *   ROOM#<roomId> / MEMBER#<userId>   — displayName, joinedAt
 *   ROOM#<roomId> / REACTION#<ts>#id  — userId, emoji (TTL 24h) — written by fireReaction resolver
 *   ROOM#<roomId> / COMMENT#<ts>#id    — userId, promptId, text (TTL 24h)
 *
 * GSI InviteCodeIndex: inviteCode → room META lookup for joinRoom.
 */

import { randomBytes } from 'node:crypto';
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AppSyncResolverEvent } from 'aws-lambda';

const REGION = process.env.AWS_REGION ?? 'eu-central-1';
const ROOMS_TABLE = required('ROOMS_TABLE');
const INVITE_CODE_INDEX = 'InviteCodeIndex';
const MAX_COMMENT_LEN = 140;
const TTL_SECONDS = 86400;

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_NAME_PREFIXES = ['FC Team', 'Club', 'Team', 'CLU'];

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const ddb = new DynamoDBClient({ region: REGION });

type RoomStatus = 'WAITING' | 'ACTIVE' | 'ENDED';

interface RoomMember {
  userId: string;
  displayName: string;
  joinedAt: number;
}

interface RoomMeta {
  roomId: string;
  inviteCode: string;
  matchId: string;
  hostUserId: string;
  roomName: string;
  status: RoomStatus;
  createdAt: number;
}

export const handler = async (event: AppSyncResolverEvent<Record<string, unknown>>) => {
  switch (event.info.fieldName) {
    case 'createRoom':
      return createRoom(event.arguments.input as CreateRoomInput);
    case 'joinRoom':
      return joinRoom(event.arguments.input as JoinRoomInput);
    case 'postComment':
      return postComment(event.arguments.input as PostCommentInput);
    case 'leaveRoom':
      return leaveRoom(event.arguments.input as LeaveRoomInput);
    default:
      throw new Error(`Unsupported field: ${event.info.fieldName}`);
  }
};

interface CreateRoomInput {
  matchId: string;
  userId: string;
  displayName: string;
}

interface JoinRoomInput {
  inviteCode: string;
  userId: string;
  displayName: string;
}

interface PostCommentInput {
  roomId: string;
  promptId: string;
  userId: string;
  text: string;
}

interface LeaveRoomInput {
  roomId: string;
  userId: string;
}

function randomId(): string {
  return randomBytes(8).toString('hex');
}

function randomInvitePart(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += INVITE_CHARS[bytes[i]! % INVITE_CHARS.length];
  }
  return out;
}

function generateInviteCode(): string {
  return `${randomInvitePart(3)}-${randomInvitePart(3)}`;
}

function generateRoomName(): string {
  const prefix = ROOM_NAME_PREFIXES[randomBytes(1)[0]! % ROOM_NAME_PREFIXES.length]!;
  return `${prefix} Watchers`;
}

function normalizeInviteCode(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/[^A-Z0-9]/g, '');
  if (compact.length === 6) {
    return `${compact.slice(0, 3)}-${compact.slice(3)}`;
  }
  throw new Error('Invite code must be in XXX-XXX format');
}

async function inviteCodeTaken(inviteCode: string): Promise<boolean> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: ROOMS_TABLE,
      IndexName: INVITE_CODE_INDEX,
      KeyConditionExpression: 'inviteCode = :code',
      ExpressionAttributeValues: { ':code': { S: inviteCode } },
      Limit: 1,
    }),
  );
  return (res.Items?.length ?? 0) > 0;
}

async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateInviteCode();
    if (!(await inviteCodeTaken(code))) return code;
  }
  throw new Error('Could not allocate a unique invite code');
}

async function getRoomMeta(roomId: string): Promise<RoomMeta | null> {
  const res = await ddb.send(
    new GetItemCommand({
      TableName: ROOMS_TABLE,
      Key: {
        PK: { S: `ROOM#${roomId}` },
        SK: { S: 'META' },
      },
    }),
  );
  if (!res.Item) return null;
  const item = unmarshall(res.Item) as Record<string, unknown>;
  return {
    roomId: String(item.roomId),
    inviteCode: String(item.inviteCode),
    matchId: String(item.matchId),
    hostUserId: String(item.hostUserId),
    roomName: String(item.roomName),
    status: item.status as RoomStatus,
    createdAt: Number(item.createdAt),
  };
}

async function listMembers(roomId: string): Promise<RoomMember[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: ROOMS_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': { S: `ROOM#${roomId}` },
        ':prefix': { S: 'MEMBER#' },
      },
    }),
  );
  return (res.Items ?? []).map((raw) => {
    const item = unmarshall(raw) as Record<string, unknown>;
    return {
      userId: String(item.userId),
      displayName: String(item.displayName),
      joinedAt: Number(item.joinedAt),
    };
  });
}

async function createRoom(input: CreateRoomInput) {
  const { matchId, userId, displayName } = input;
  if (!matchId || !userId || !displayName?.trim()) {
    throw new Error('matchId, userId, and displayName are required');
  }

  const roomId = randomId();
  const inviteCode = await generateUniqueInviteCode();
  const roomName = generateRoomName();
  const now = Date.now();
  const expiresAt = Math.floor(now / 1000) + TTL_SECONDS * 7;

  await ddb.send(
    new PutItemCommand({
      TableName: ROOMS_TABLE,
      Item: {
        PK: { S: `ROOM#${roomId}` },
        SK: { S: 'META' },
        roomId: { S: roomId },
        inviteCode: { S: inviteCode },
        matchId: { S: matchId },
        hostUserId: { S: userId },
        roomName: { S: roomName },
        status: { S: 'WAITING' },
        createdAt: { N: String(now) },
        expiresAt: { N: String(expiresAt) },
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );

  await ddb.send(
    new PutItemCommand({
      TableName: ROOMS_TABLE,
      Item: {
        PK: { S: `ROOM#${roomId}` },
        SK: { S: `MEMBER#${userId}` },
        userId: { S: userId },
        displayName: { S: displayName.trim() },
        joinedAt: { N: String(now) },
        expiresAt: { N: String(expiresAt) },
      },
    }),
  );

  return {
    roomId,
    inviteCode,
    roomName,
    matchId,
    hostUserId: userId,
    status: 'WAITING' as const,
    createdAt: now,
  };
}

async function joinRoom(input: JoinRoomInput) {
  const { userId, displayName } = input;
  if (!userId || !displayName?.trim()) {
    throw new Error('userId and displayName are required');
  }

  const inviteCode = normalizeInviteCode(input.inviteCode);

  const lookup = await ddb.send(
    new QueryCommand({
      TableName: ROOMS_TABLE,
      IndexName: INVITE_CODE_INDEX,
      KeyConditionExpression: 'inviteCode = :code',
      ExpressionAttributeValues: { ':code': { S: inviteCode } },
      Limit: 1,
    }),
  );

  const metaItem = lookup.Items?.[0];
  if (!metaItem) {
    throw new Error('Room not found — check the invite code');
  }

  const meta = unmarshall(metaItem) as Record<string, unknown>;
  const roomId = String(meta.roomId);
  const status = String(meta.status) as RoomStatus;

  if (status === 'ENDED') {
    throw new Error('This room has ended');
  }

  const now = Date.now();
  const expiresAt = Math.floor(now / 1000) + TTL_SECONDS * 7;
  const memberSk = `MEMBER#${userId}`;

  const existingMember = await ddb.send(
    new GetItemCommand({
      TableName: ROOMS_TABLE,
      Key: {
        PK: { S: `ROOM#${roomId}` },
        SK: { S: memberSk },
      },
    }),
  );

  if (!existingMember.Item) {
    await ddb.send(
      new PutItemCommand({
        TableName: ROOMS_TABLE,
        Item: {
          PK: { S: `ROOM#${roomId}` },
          SK: { S: memberSk },
          userId: { S: userId },
          displayName: { S: displayName.trim() },
          joinedAt: { N: String(now) },
          expiresAt: { N: String(expiresAt) },
        },
      }),
    );
  }

  const members = await listMembers(roomId);
  const joinedMember =
    members.find((m) => m.userId === userId) ??
    ({ userId, displayName: displayName.trim(), joinedAt: now } satisfies RoomMember);

  return {
    roomId,
    inviteCode: String(meta.inviteCode),
    roomName: String(meta.roomName),
    matchId: String(meta.matchId),
    status,
    members,
    joinedMember,
  };
}

function validateCommentText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Comment cannot be empty');
  if (trimmed.length > MAX_COMMENT_LEN) {
    throw new Error(`Comment must be ${MAX_COMMENT_LEN} characters or fewer`);
  }
  if (/@/.test(trimmed)) {
    throw new Error('@ mentions are not allowed in comments');
  }
  return trimmed;
}

async function postComment(input: PostCommentInput) {
  const { roomId, promptId, userId } = input;
  const text = validateCommentText(input.text);

  const meta = await getRoomMeta(roomId);
  if (!meta) throw new Error('Room not found');
  if (meta.status === 'ENDED') throw new Error('Room has ended — comments are closed');

  const now = Date.now();
  const commentId = randomId();
  const expiresAt = Math.floor(now / 1000) + TTL_SECONDS;

  await ddb.send(
    new PutItemCommand({
      TableName: ROOMS_TABLE,
      Item: {
        PK: { S: `ROOM#${roomId}` },
        SK: { S: `COMMENT#${now}#${commentId}` },
        roomId: { S: roomId },
        commentId: { S: commentId },
        promptId: { S: promptId },
        userId: { S: userId },
        text: { S: text },
        ts: { N: String(now) },
        expiresAt: { N: String(expiresAt) },
      },
    }),
  );

  return { roomId, commentId, promptId, userId, text, ts: now };
}

async function leaveRoom(input: LeaveRoomInput) {
  const { roomId, userId } = input;

  const meta = await getRoomMeta(roomId);
  if (!meta) throw new Error('Room not found');

  await ddb.send(
    new DeleteItemCommand({
      TableName: ROOMS_TABLE,
      Key: {
        PK: { S: `ROOM#${roomId}` },
        SK: { S: `MEMBER#${userId}` },
      },
    }),
  );

  return true;
}
