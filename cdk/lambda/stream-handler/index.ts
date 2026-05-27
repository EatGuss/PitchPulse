/**
 * stream-handler — DynamoDB Streams → AppSync mutation broadcaster.
 *
 * Receives batches of stream records from pp-matches. For each record:
 *   - SK = "CLOCK"   → call Mutation.publishMatchClock to fire the matchClock subscription
 *   - SK ~ "EVENT#" → call Mutation.publishMatchEvent to fire the matchEvent subscription
 *
 * Both mutations are NONE-data-source resolvers on the AppSync API — they
 * exist solely so @aws_subscribe can fan out the broadcast to all connected
 * WebSocket clients. This Lambda is the only authorized invoker (IAM auth).
 *
 * Failures are intentionally NON-fatal at the record level: a single bad
 * record won't block the rest of the batch. Lambda returns successfully so
 * DynamoDB Streams doesn't replay the whole batch on retry.
 */

import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';

const REGION = process.env.AWS_REGION ?? 'eu-central-1';
const APPSYNC_URL = required('APPSYNC_URL');

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const endpoint = new URL(APPSYNC_URL);

const signer = new SignatureV4({
  credentials: defaultProvider(),
  region: REGION,
  service: 'appsync',
  sha256: Sha256,
});

// ─── Helpers ───────────────────────────────────────────────────────────────

type DdbAttr = NonNullable<DynamoDBRecord['dynamodb']>['NewImage'];

function s(img: DdbAttr | undefined, k: string): string | undefined {
  return img?.[k]?.S;
}
function n(img: DdbAttr | undefined, k: string): number | undefined {
  const v = img?.[k]?.N;
  return v === undefined ? undefined : Number(v);
}
function b(img: DdbAttr | undefined, k: string): boolean | undefined {
  return img?.[k]?.BOOL;
}

async function appsyncMutation(query: string, variables: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ query, variables });
  const req = new HttpRequest({
    hostname: endpoint.hostname,
    path: endpoint.pathname,
    protocol: endpoint.protocol,
    method: 'POST',
    headers: {
      host: endpoint.hostname,
      'content-type': 'application/json',
    },
    body,
  });
  const signed = await signer.sign(req);

  const res = await fetch(
    `${endpoint.protocol}//${endpoint.hostname}${endpoint.pathname}`,
    {
      method: 'POST',
      headers: signed.headers as Record<string, string>,
      body: signed.body as string,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(JSON.stringify({ msg: 'sh: appsync HTTP error', status: res.status, body: text.slice(0, 500) }));
    throw new Error(`AppSync ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { errors?: unknown; data?: unknown };
  if (json.errors) {
    console.error(JSON.stringify({ msg: 'sh: appsync GraphQL errors', errors: json.errors }));
    throw new Error(`AppSync GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
}

// ─── Mutation envelopes ────────────────────────────────────────────────────

const PUBLISH_MATCH_CLOCK = /* GraphQL */ `
  mutation PublishMatchClock($input: MatchClockInput!) {
    publishMatchClock(input: $input) {
      matchId
      matchMinute
      displayClock
      phase
      scoreHome
      scoreGuest
      isRunning
      updatedAt
    }
  }
`;

const PUBLISH_MATCH_EVENT = /* GraphQL */ `
  mutation PublishMatchEvent($input: MatchEventInput!) {
    publishMatchEvent(input: $input) {
      matchId
      seq
      id
      type
      matchMinute
      displayMinute
      matchPhase
      teamId
      playerId
      assistPlayerId
      cardColor
      reason
      scoreHome
      scoreGuest
      eventTimeIso
    }
  }
`;

// ─── Per-record dispatch ───────────────────────────────────────────────────

async function dispatch(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.NewImage) {
    console.log(JSON.stringify({ msg: 'sh: skip - no NewImage', en: record.eventName }));
    return;
  }
  if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') {
    console.log(JSON.stringify({ msg: 'sh: skip - wrong eventName', en: record.eventName }));
    return;
  }

  const img = record.dynamodb.NewImage;
  const sk = s(img, 'SK');
  console.log(JSON.stringify({ msg: 'sh: record', en: record.eventName, sk, pk: s(img, 'PK') }));
  if (!sk) return;

  if (sk === 'CLOCK') {
    const matchId = s(img, 'matchId');
    if (!matchId) return;
    const input = {
      matchId,
      matchMinute: n(img, 'matchMinute') ?? 0,
      displayClock: s(img, 'displayClock') ?? "0'",
      phase: s(img, 'phase') ?? 'preMatch',
      scoreHome: n(img, 'scoreHome') ?? 0,
      scoreGuest: n(img, 'scoreGuest') ?? 0,
      isRunning: b(img, 'isRunning') ?? false,
      updatedAt: n(img, 'updatedAt') ?? Date.now(),
    };
    await appsyncMutation(PUBLISH_MATCH_CLOCK, { input });
    return;
  }

  if (sk.startsWith('EVENT#')) {
    const matchId = s(img, 'matchId');
    if (!matchId) {
      console.error(JSON.stringify({ msg: 'sh: EVENT skipped - no matchId', sk, keys: Object.keys(img) }));
      return;
    }
    const input = {
      matchId,
      seq: n(img, 'seq') ?? 0,
      id: s(img, 'id') ?? sk,
      type: s(img, 'type') ?? 'unknown',
      matchMinute: n(img, 'matchMinute') ?? 0,
      displayMinute: s(img, 'displayMinute') ?? '',
      matchPhase: s(img, 'matchPhase') ?? 'preMatch',
      teamId: s(img, 'teamId') ?? null,
      playerId: s(img, 'playerId') ?? null,
      assistPlayerId: s(img, 'assistPlayerId') ?? null,
      cardColor: s(img, 'cardColor') ?? null,
      reason: s(img, 'reason') ?? null,
      scoreHome: n(img, 'scoreHome') ?? null,
      scoreGuest: n(img, 'scoreGuest') ?? null,
      eventTimeIso: s(img, 'eventTimeIso') ?? null,
    };
    console.log(JSON.stringify({ msg: 'sh: publishing EVENT', input }));
    await appsyncMutation(PUBLISH_MATCH_EVENT, { input });
    console.log(JSON.stringify({ msg: 'sh: EVENT published OK', seq: input.seq, type: input.type }));
    return;
  }

  console.log(JSON.stringify({ msg: 'sh: skip - unhandled SK', sk }));
}

// ─── Lambda entrypoint ─────────────────────────────────────────────────────

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  // RAW dump of every record's key + eventName, FIRST thing - no filtering, no parsing.
  // This will run even if dispatch() returns early or throws downstream.
  console.log(JSON.stringify({
    msg: 'sh: BATCH',
    n: event.Records.length,
    records: event.Records.map((r) => ({
      en: r.eventName,
      pk: r.dynamodb?.Keys?.PK?.S,
      sk: r.dynamodb?.Keys?.SK?.S,
      hasNewImage: !!r.dynamodb?.NewImage,
      newImageKeys: r.dynamodb?.NewImage ? Object.keys(r.dynamodb.NewImage) : undefined,
    })),
  }));
  const errors: string[] = [];
  for (const record of event.Records) {
    try {
      await dispatch(record);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ msg: 'stream-handler: dispatch error', err: msg }));
      errors.push(msg);
    }
  }
  if (errors.length > 0) {
    // Surface errors in logs without throwing — throwing would replay the
    // entire batch, which can double-broadcast successful records.
    console.error(JSON.stringify({ msg: 'stream-handler: completed with errors', count: errors.length }));
  }
};
