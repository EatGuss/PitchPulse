/**
 * start-match — AppSync Lambda data source for Mutation.startMatch.
 *
 * Flips the CLOCK item in pp-matches to isRunning=true with a fresh
 * startedAtWallMs anchor. The sim-emitter Lambda (running on the 2-second
 * EventBridge cron) picks up the change on its next tick and begins emitting
 * EVENT items.
 *
 * Idempotent — calling startMatch again resets the timeline to a fresh
 * kickoff (lastEmittedSeq = -1). That's intentional: it doubles as the demo
 * "Reset & restart" button.
 */

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { AppSyncResolverEvent } from 'aws-lambda';

const REGION = process.env.AWS_REGION ?? 'eu-central-1';
const MATCHES_TABLE = required('MATCHES_TABLE');
const SIM_EMITTER_FN = required('SIM_EMITTER_FN');

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const ddb = new DynamoDBClient({ region: REGION });
const lambda = new LambdaClient({ region: REGION });

interface StartMatchArgs {
  input: { matchId: string };
}

interface StartMatchResult {
  matchId: string;
  startedAtWallMs: number;
  isRunning: boolean;
}

export const handler = async (
  event: AppSyncResolverEvent<StartMatchArgs>,
): Promise<StartMatchResult> => {
  const { matchId } = event.arguments.input;
  const now = Date.now();

  await ddb.send(
    new PutItemCommand({
      TableName: MATCHES_TABLE,
      Item: {
        PK: { S: `MATCH#${matchId}` },
        SK: { S: 'CLOCK' },
        matchId: { S: matchId },
        isRunning: { BOOL: true },
        startedAtWallMs: { N: String(now) },
        matchMinute: { N: '0' },
        displayClock: { S: "0'" },
        phase: { S: 'firstHalf' },
        scoreHome: { N: '0' },
        scoreGuest: { N: '0' },
        lastEmittedSeq: { N: '-1' },
        updatedAt: { N: String(now) },
      },
    }),
  );

  // Async-invoke sim-emitter so the first event arrives in ~2 seconds rather
  // than waiting up to a minute for the next EventBridge cron tick.
  await lambda.send(
    new InvokeCommand({
      FunctionName: SIM_EMITTER_FN,
      InvocationType: 'Event',
      Payload: Buffer.from('{}'),
    }),
  );

  return { matchId, startedAtWallMs: now, isRunning: true };
};
