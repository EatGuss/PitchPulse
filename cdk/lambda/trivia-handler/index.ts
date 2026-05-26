/**
 * trivia-handler — half-time trivia round (Gate B).
 *
 * Invoked by:
 *   - AppSync: submitTriviaAnswer, getHalfTimeTriviaQuestions
 *   - Async from stream-handler on halfTime: { action: 'startRound', matchId }
 *   - Async self-invoke: { action: 'waitAndComplete', matchId }
 */

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { AppSyncResolverEvent } from 'aws-lambda';
import {
  appsyncMutation,
  PUBLISH_TRIVIA_COMPLETED,
  PUBLISH_TRIVIA_QUESTION_CLOSED,
  PUBLISH_TRIVIA_SCORE_UPDATED,
  PUBLISH_TRIVIA_STARTED,
} from '../shared/triviaPublish';
import {
  generateTriviaQuestions,
  type GeneratedQuestion,
  type MatchEventRow,
} from './generateQuestions';

const REGION = process.env.AWS_REGION ?? 'eu-central-1';
const PROMPTS_TABLE = required('PROMPTS_TABLE');
const MATCHES_TABLE = required('MATCHES_TABLE');
const MATCH_ID = process.env.MATCH_ID ?? 'DFL-MAT-000001';
const QUESTION_MS = 10_000;
const REVEAL_MS = 1_000;
const ROUND_COMPLETE_MS = 2_000;
const POINTS_PER_CORRECT = 100;

const ddb = new DynamoDBClient({ region: REGION });
const lambda = new LambdaClient({ region: REGION });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function triviaPk(matchId: string) {
  return `TRIVIA#${matchId}`;
}

interface TriviaSessionMeta {
  PK: string;
  SK: 'META';
  matchId: string;
  status: 'active' | 'completed';
  roundStartedAt: number;
  completeAt: number;
  questionDurationMs: number;
}

interface TriviaQuestionRow {
  PK: string;
  SK: string;
  questionId: string;
  questionNumber: number;
  text: string;
  options: string;
  correctAnswer: string;
  questionEndsAt: number;
  expiresAt: number;
}

async function loadMatchEvents(matchId: string): Promise<MatchEventRow[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: MATCHES_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: marshall({
        ':pk': `MATCH#${matchId}`,
        ':sk': 'EVENT#',
      }),
    }),
  );
  const rows = (res.Items ?? []).map((i) => unmarshall(i) as Record<string, unknown>);
  return rows
    .map((r) => ({
      type: String(r.type ?? ''),
      matchMinute: Number(r.matchMinute ?? 0),
      matchPhase: r.matchPhase ? String(r.matchPhase) : undefined,
      teamId: r.teamId ? String(r.teamId) : undefined,
      cardColor: r.cardColor ? String(r.cardColor) : undefined,
      scoreHome: r.scoreHome !== undefined ? Number(r.scoreHome) : undefined,
      scoreGuest: r.scoreGuest !== undefined ? Number(r.scoreGuest) : undefined,
      scoreAfter:
        r.scoreHome !== undefined && r.scoreGuest !== undefined
          ? { home: Number(r.scoreHome), guest: Number(r.scoreGuest) }
          : undefined,
    }))
    .sort((a, b) => a.matchMinute - b.matchMinute);
}

async function getSessionMeta(matchId: string): Promise<TriviaSessionMeta | null> {
  const res = await ddb.send(
    new GetItemCommand({
      TableName: PROMPTS_TABLE,
      Key: marshall({ PK: triviaPk(matchId), SK: 'META' }),
    }),
  );
  if (!res.Item) return null;
  return unmarshall(res.Item) as TriviaSessionMeta;
}

async function getQuestionRow(matchId: string, questionNumber: number): Promise<TriviaQuestionRow | null> {
  const res = await ddb.send(
    new GetItemCommand({
      TableName: PROMPTS_TABLE,
      Key: marshall({ PK: triviaPk(matchId), SK: `Q#${questionNumber}` }),
    }),
  );
  if (!res.Item) return null;
  return unmarshall(res.Item) as TriviaQuestionRow;
}

async function listScores(matchId: string): Promise<{ userId: string; triviaPoints: number }[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: PROMPTS_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: marshall({
        ':pk': triviaPk(matchId),
        ':sk': 'SCORE#',
      }),
    }),
  );
  return (res.Items ?? []).map((i) => {
    const row = unmarshall(i) as { userId: string; triviaPoints: number };
    return { userId: row.userId, triviaPoints: row.triviaPoints ?? 0 };
  });
}

async function upsertScore(matchId: string, userId: string, addPoints: number): Promise<number> {
  const now = Date.now();
  const res = await ddb.send(
    new UpdateItemCommand({
      TableName: PROMPTS_TABLE,
      Key: marshall({ PK: triviaPk(matchId), SK: `SCORE#${userId}` }),
      UpdateExpression:
        'SET userId = :uid, triviaPoints = if_not_exists(triviaPoints, :zero) + :add, updatedAt = :ts, expiresAt = :exp',
      ExpressionAttributeValues: marshall({
        ':uid': userId,
        ':zero': 0,
        ':add': addPoints,
        ':ts': now,
        ':exp': Math.floor(now / 1000) + 86400,
      }),
      ReturnValues: 'ALL_NEW',
    }),
  );
  const row = unmarshall(res.Attributes ?? {}) as { triviaPoints: number };
  return row.triviaPoints ?? addPoints;
}

async function publishScores(matchId: string): Promise<void> {
  const scores = await listScores(matchId);
  await appsyncMutation(PUBLISH_TRIVIA_SCORE_UPDATED, {
    input: {
      matchId,
      scores: scores.map((s) => ({ userId: s.userId, triviaPoints: s.triviaPoints })),
      updatedAt: Date.now(),
    },
  });
}

function clientQuestions(questions: GeneratedQuestion[], startedAt: number): object[] {
  return questions.map((q, i) => ({
    questionId: q.questionId,
    questionNumber: q.questionNumber,
    text: q.text,
    options: q.options,
    expiresAt: startedAt + (i + 1) * QUESTION_MS,
  }));
}

async function persistRound(matchId: string, questions: GeneratedQuestion[], startedAt: number): Promise<void> {
  const ttl = Math.floor(startedAt / 1000) + 86400;
  const completeAt =
    startedAt + questions.length * QUESTION_MS + (questions.length - 1) * REVEAL_MS + ROUND_COMPLETE_MS;

  await ddb.send(
    new PutItemCommand({
      TableName: PROMPTS_TABLE,
      Item: marshall({
        PK: triviaPk(matchId),
        SK: 'META',
        matchId,
        status: 'active',
        roundStartedAt: startedAt,
        completeAt,
        questionDurationMs: QUESTION_MS,
        expiresAt: ttl,
      }),
    }),
  );

  for (const q of questions) {
    await ddb.send(
      new PutItemCommand({
        TableName: PROMPTS_TABLE,
        Item: marshall({
          PK: triviaPk(matchId),
          SK: `Q#${q.questionNumber}`,
          questionId: q.questionId,
          questionNumber: q.questionNumber,
          text: q.text,
          options: JSON.stringify(q.options),
          correctAnswer: q.correctAnswer,
          questionEndsAt: startedAt + q.questionNumber * QUESTION_MS,
          expiresAt: ttl,
        }),
      }),
    );
  }
}

export async function startHalfTimeTrivia(matchId: string): Promise<void> {
  const existing = await getSessionMeta(matchId);
  if (existing?.status === 'active' || existing?.status === 'completed') {
    console.log(JSON.stringify({ msg: 'trivia: skip duplicate start', matchId, status: existing.status }));
    return;
  }

  const events = await loadMatchEvents(matchId);
  const questions = generateTriviaQuestions(events);
  if (questions.length === 0) {
    console.error(JSON.stringify({ msg: 'trivia: no questions generated', matchId }));
    return;
  }

  const startedAt = Date.now();
  await persistRound(matchId, questions, startedAt);

  await appsyncMutation(PUBLISH_TRIVIA_STARTED, {
    input: {
      matchId,
      startsAt: startedAt,
      questionDurationMs: QUESTION_MS,
      questions: clientQuestions(questions, startedAt),
    },
  });

  const fnName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (fnName) {
    await lambda.send(
      new InvokeCommand({
        FunctionName: fnName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ action: 'waitAndComplete', matchId })),
      }),
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitAndCompleteRound(matchId: string): Promise<void> {
  const meta = await getSessionMeta(matchId);
  if (!meta || meta.status !== 'active') return;

  for (let n = 1; n <= 3; n++) {
    const qRow = await getQuestionRow(matchId, n);
    if (!qRow) continue;

    const waitUntil = qRow.questionEndsAt;
    const delay = waitUntil - Date.now();
    if (delay > 0) await sleep(delay);

    const options = JSON.parse(qRow.options) as { id: string; label: string }[];
    const correctOption = options.find((o) => o.id === qRow.correctAnswer);
    await appsyncMutation(PUBLISH_TRIVIA_QUESTION_CLOSED, {
      input: {
        matchId,
        questionNumber: n,
        questionId: qRow.questionId,
        correctOptionId: qRow.correctAnswer,
        correctLabel: correctOption?.label ?? qRow.correctAnswer,
        closedAt: Date.now(),
      },
    });

    if (n < 3) await sleep(REVEAL_MS);
  }

  await sleep(ROUND_COMPLETE_MS);
  await finishRound(matchId);
}

async function finishRound(matchId: string): Promise<void> {
  const meta = await getSessionMeta(matchId);
  if (!meta || meta.status === 'completed') return;

  await ddb.send(
    new UpdateItemCommand({
      TableName: PROMPTS_TABLE,
      Key: marshall({ PK: triviaPk(matchId), SK: 'META' }),
      UpdateExpression: 'SET #st = :done',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: marshall({ ':done': 'completed' }),
    }),
  );

  const scores = await listScores(matchId);
  await appsyncMutation(PUBLISH_TRIVIA_COMPLETED, {
    input: {
      matchId,
      scores: scores.map((s) => ({ userId: s.userId, triviaPoints: s.triviaPoints })),
      completedAt: Date.now(),
    },
  });
}

async function tryEarlyComplete(matchId: string): Promise<void> {
  const meta = await getSessionMeta(matchId);
  if (!meta || meta.status !== 'active') return;
  if (Date.now() < meta.completeAt) return;
  await finishRound(matchId);
}

async function submitTriviaAnswer(args: {
  matchId: string;
  userId: string;
  questionId: string;
  answer: string;
}) {
  const { matchId, userId, questionId, answer } = args;
  const meta = await getSessionMeta(matchId);
  if (!meta || meta.status !== 'active') {
    throw new Error('No active trivia round for this match');
  }

  const qRes = await ddb.send(
    new QueryCommand({
      TableName: PROMPTS_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: marshall({
        ':pk': triviaPk(matchId),
        ':sk': 'Q#',
      }),
    }),
  );
  const qRows = (qRes.Items ?? []).map((i) => unmarshall(i) as TriviaQuestionRow);
  const question = qRows.find((q) => q.questionId === questionId);
  if (!question) throw new Error('Unknown trivia question');

  const now = Date.now();
  if (now > question.questionEndsAt) {
    throw new Error('Trivia question expired');
  }

  const answerSk = `ANSWER#${userId}#${question.questionNumber}`;
  const prior = await ddb.send(
    new GetItemCommand({
      TableName: PROMPTS_TABLE,
      Key: marshall({ PK: triviaPk(matchId), SK: answerSk }),
    }),
  );
  if (prior.Item) {
    throw new Error('Already answered this trivia question');
  }

  const correct = answer === question.correctAnswer;
  const pointsAwarded = correct ? POINTS_PER_CORRECT : 0;

  await ddb.send(
    new PutItemCommand({
      TableName: PROMPTS_TABLE,
      Item: marshall({
        PK: triviaPk(matchId),
        SK: answerSk,
        userId,
        questionId,
        questionNumber: question.questionNumber,
        answer,
        correct,
        pointsAwarded,
        submittedAt: now,
        expiresAt: Math.floor(now / 1000) + 86400,
      }),
    }),
  );

  if (pointsAwarded > 0) {
    await upsertScore(matchId, userId, pointsAwarded);
  } else {
    await upsertScore(matchId, userId, 0);
  }

  await publishScores(matchId);
  await tryEarlyComplete(matchId);

  const options = JSON.parse(question.options) as { id: string; label: string }[];
  const correctOption = options.find((o) => o.id === question.correctAnswer);

  return {
    correct,
    pointsAwarded,
    correctOptionId: question.correctAnswer,
    correctLabel: correctOption?.label ?? question.correctAnswer,
  };
}

async function getHalfTimeTriviaQuestions(matchId: string) {
  const meta = await getSessionMeta(matchId);
  if (!meta) return null;

  const qRes = await ddb.send(
    new QueryCommand({
      TableName: PROMPTS_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: marshall({
        ':pk': triviaPk(matchId),
        ':sk': 'Q#',
      }),
    }),
  );
  const questions = (qRes.Items ?? [])
    .map((i) => unmarshall(i) as TriviaQuestionRow)
    .sort((a, b) => a.questionNumber - b.questionNumber)
    .map((q) => ({
      questionId: q.questionId,
      questionNumber: q.questionNumber,
      text: q.text,
      options: JSON.parse(q.options),
      expiresAt: q.questionEndsAt,
    }));

  return {
    matchId,
    startsAt: meta.roundStartedAt,
    questionDurationMs: meta.questionDurationMs,
    questions,
  };
}

type DirectEvent =
  | { action: 'startRound'; matchId: string }
  | { action: 'waitAndComplete'; matchId: string };

export const handler = async (
  event: AppSyncResolverEvent<unknown> | DirectEvent,
): Promise<unknown> => {
  if (event && typeof event === 'object' && 'action' in event) {
    const direct = event as DirectEvent;
    if (direct.action === 'startRound') {
      await startHalfTimeTrivia(direct.matchId ?? MATCH_ID);
      return { ok: true };
    }
    if (direct.action === 'waitAndComplete') {
      await waitAndCompleteRound(direct.matchId ?? MATCH_ID);
      return { ok: true };
    }
    return null;
  }

  const ev = event as AppSyncResolverEvent<unknown>;
  const field = ev.info?.fieldName;

  if (field === 'submitTriviaAnswer') {
    const input = (ev.arguments as { input: Parameters<typeof submitTriviaAnswer>[0] }).input;
    return submitTriviaAnswer(input);
  }

  if (field === 'getHalfTimeTriviaQuestions') {
    const matchId = (ev.arguments as { matchId: string }).matchId ?? MATCH_ID;
    return getHalfTimeTriviaQuestions(matchId);
  }

  throw new Error(`Unknown field: ${field}`);
};
