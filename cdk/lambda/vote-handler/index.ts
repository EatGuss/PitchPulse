/**
 * vote-handler — AppSync Lambda: submitVote (with hot take) + signalHotTake.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { AppSyncResolverEvent } from 'aws-lambda';

const REGION = process.env.AWS_REGION ?? 'eu-central-1';
const PROMPTS_TABLE = required('PROMPTS_TABLE');
const HOT_TAKES_PER_MATCH = 2;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const ddb = new DynamoDBClient({ region: REGION });

interface SubmitVoteArgs {
  input: {
    matchId: string;
    promptId: string;
    userId: string;
    optionId: string;
    hotTake?: boolean;
    rankedMode?: boolean;
  };
}

interface SignalHotTakeArgs {
  input: {
    matchId: string;
    promptId: string;
    userId: string;
    rivalUserId: string;
  };
}

function hotTakeKey(userId: string, matchId: string) {
  return {
    PK: `HOT_TAKE_STATE#${userId}`,
    SK: `MATCH#${matchId}`,
  };
}

async function getRemainingHotTakes(userId: string, matchId: string): Promise<number> {
  const res = await ddb.send(
    new GetItemCommand({
      TableName: PROMPTS_TABLE,
      Key: marshall(hotTakeKey(userId, matchId)),
    }),
  );
  if (!res.Item) return HOT_TAKES_PER_MATCH;
  const row = unmarshall(res.Item) as { remainingHotTakes?: number };
  return row.remainingHotTakes ?? HOT_TAKES_PER_MATCH;
}

async function initHotTakeState(userId: string, matchId: string): Promise<void> {
  const now = Date.now();
  await ddb.send(
    new UpdateItemCommand({
      TableName: PROMPTS_TABLE,
      Key: marshall(hotTakeKey(userId, matchId)),
      UpdateExpression:
        'SET userId = :userId, matchId = :matchId, remainingHotTakes = if_not_exists(remainingHotTakes, :max), updatedAt = :ts, expiresAt = :exp',
      ExpressionAttributeValues: marshall({
        ':userId': userId,
        ':matchId': matchId,
        ':max': HOT_TAKES_PER_MATCH,
        ':ts': now,
        ':exp': Math.floor(now / 1000) + 86400,
      }),
    }),
  );
}

async function decrementHotTake(userId: string, matchId: string): Promise<void> {
  const remaining = await getRemainingHotTakes(userId, matchId);
  if (remaining <= 0) {
    throw new Error('No hot takes remaining this match');
  }
  if (remaining === HOT_TAKES_PER_MATCH) {
    await initHotTakeState(userId, matchId);
  }
  await ddb.send(
    new UpdateItemCommand({
      TableName: PROMPTS_TABLE,
      Key: marshall(hotTakeKey(userId, matchId)),
      UpdateExpression: 'SET remainingHotTakes = remainingHotTakes - :one, updatedAt = :ts',
      ConditionExpression: 'remainingHotTakes > :zero',
      ExpressionAttributeValues: marshall({
        ':one': 1,
        ':zero': 0,
        ':ts': Date.now(),
      }),
    }),
  );
}

async function submitVote(args: SubmitVoteArgs['input']) {
  const { matchId, promptId, userId, optionId, hotTake = false, rankedMode = false } = args;
  const votedAt = Date.now();
  const expiresAt = Math.floor(votedAt / 1000) + 86400;

  if (hotTake && rankedMode) {
    const remaining = await getRemainingHotTakes(userId, matchId);
    if (remaining <= 0) {
      throw new Error('No hot takes remaining this match');
    }
    await decrementHotTake(userId, matchId);
  }

  await ddb.send(
    new PutItemCommand({
      TableName: PROMPTS_TABLE,
      Item: marshall({
        PK: `PROMPT#${promptId}`,
        SK: `VOTE#${userId}`,
        matchId,
        promptId,
        userId,
        optionId,
        hotTake: hotTake && rankedMode,
        rankedMode,
        votedAt,
        expiresAt,
      }),
    }),
  );

  return { matchId, promptId, userId, optionId, hotTake: hotTake && rankedMode, votedAt };
}

async function signalHotTake(args: SignalHotTakeArgs['input']) {
  const { matchId, promptId, userId, rivalUserId } = args;
  const remaining = await getRemainingHotTakes(userId, matchId);
  if (remaining <= 0) {
    throw new Error('No hot takes remaining this match');
  }
  return {
    matchId,
    promptId,
    userId,
    rivalUserId,
    ts: Date.now(),
  };
}

export const handler = async (event: AppSyncResolverEvent<Record<string, unknown>>) => {
  switch (event.info.fieldName) {
    case 'submitVote':
      return submitVote(event.arguments.input as SubmitVoteArgs['input']);
    case 'signalHotTake':
      return signalHotTake(event.arguments.input as SignalHotTakeArgs['input']);
    case 'initRankedHotTake':
      await initHotTakeState(event.arguments.userId as string, event.arguments.matchId as string);
      return true;
    default:
      throw new Error(`Unsupported field: ${event.info.fieldName}`);
  }
};
