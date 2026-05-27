/**
 * sim-emitter — drives match-time progression for a single match instance.
 *
 * Invocation sources (both supported, both safe to run concurrently):
 *   1. EventBridge rate(1 minute) cron rule — safety net; ensures the loop
 *      restarts if a prior invocation died with an unhandled exception.
 *   2. Direct Lambda Invoke (Event invocation type) from start-match — for
 *      instant kickoff (no 0–60s lag waiting for the next cron tick).
 *
 * Per-invocation behaviour:
 *   - Cold start: read the two XMLs from S3, parse into a normalized event
 *     stream, cache in module scope (reused on subsequent warm invocations).
 *   - Loop until ~220 seconds elapsed OR match becomes idle:
 *       1. Read CLOCK from pp-matches
 *       2. If !isRunning or phase=fullTime → return (no work)
 *       3. Compute current match-minute from elapsed wall-time × SIM_RATE
 *       4. Emit any newly-due EVENT#<seq> items (BatchWriteItem)
 *       5. Update the CLOCK item
 *       6. Sleep 2 real-seconds, repeat
 *
 * Why such a long loop: a 90' match at SIM_RATE=30 (1 match-min = 2 real-sec)
 * plays in ~184 real seconds. Running for the full match in one invocation
 * avoids the 0–60s gap that would otherwise sit between the Lambda exiting
 * and EventBridge re-firing — the user would see cards stop appearing during
 * that window. EventBridge's rate(1 minute) rule stays in place as a recovery
 * net: if the loop dies mid-match it will resume on the next cron tick.
 *
 * All writes hit pp-matches, which has DynamoDB Streams enabled. The
 * stream-handler Lambda picks up each write and broadcasts via the
 * AppSync publishMatchClock / publishMatchEvent mutations — those mutations
 * carry the @aws_subscribe directive, so all WebSocket-subscribed clients
 * receive the update in real time.
 */

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  BatchWriteItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import {
  formatDisplayClock,
  parseMatchXmlBundle,
  SECOND_HALF_START_MINUTE,
  type NormalizedEvent,
  type MatchPhase,
  type ParsedMatch,
} from './parser';

// ─── Config (from env) ─────────────────────────────────────────────────────

const REGION = process.env.AWS_REGION ?? 'eu-central-1';
const DATA_BUCKET = required('HACKATHON_DATA_BUCKET');
const EVENTS_KEY = required('MATCH_EVENTS_KEY');
const INFO_KEY = required('MATCH_INFO_KEY');
const MATCHES_TABLE = required('MATCHES_TABLE');
const MATCH_ID = process.env.MATCH_ID ?? 'DFL-MAT-000001';
/** Match-time speed-up. 30 = 1 match-minute / 2 real-seconds (default). */
const SIM_RATE = Number(process.env.SIM_RATE ?? 30);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

// ─── Clients (constructed once per warm container) ─────────────────────────

const s3 = new S3Client({ region: REGION });
const ddb = new DynamoDBClient({ region: REGION });

// ─── Module-scoped cache for the parsed match data ─────────────────────────

let matchCache: ParsedMatch | null = null;

async function loadMatch(): Promise<ParsedMatch> {
  if (matchCache) return matchCache;
  const [eventsXml, infoXml] = await Promise.all([
    s3GetText(DATA_BUCKET, EVENTS_KEY),
    s3GetText(DATA_BUCKET, INFO_KEY),
  ]);
  matchCache = parseMatchXmlBundle(eventsXml, infoXml);
  console.log(
    JSON.stringify({
      msg: 'sim-emitter: match XML loaded',
      events: matchCache.events.length,
      matchId: matchCache.info.matchId,
    }),
  );
  return matchCache;
}

async function s3GetText(bucket: string, key: string): Promise<string> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`Empty body for s3://${bucket}/${key}`);
  return await res.Body.transformToString('utf-8');
}

// ─── CLOCK item shape ──────────────────────────────────────────────────────

interface ClockState {
  matchId: string;
  isRunning: boolean;
  startedAtWallMs: number;
  matchMinute: number;
  displayClock: string;
  phase: MatchPhase;
  scoreHome: number;
  scoreGuest: number;
  lastEmittedSeq: number;
  updatedAt: number;
  /** Wall ms when the HT break ends and 2H resumes at 46'. */
  htBreakEndsAt?: number;
}

function emptyClock(): ClockState {
  return {
    matchId: MATCH_ID,
    isRunning: false,
    startedAtWallMs: 0,
    matchMinute: 0,
    displayClock: "0'",
    phase: 'preMatch',
    scoreHome: 0,
    scoreGuest: 0,
    lastEmittedSeq: -1,
    updatedAt: 0,
  };
}

async function readClock(): Promise<ClockState> {
  const res = await ddb.send(
    new GetItemCommand({
      TableName: MATCHES_TABLE,
      Key: {
        PK: { S: `MATCH#${MATCH_ID}` },
        SK: { S: 'CLOCK' },
      },
    }),
  );
  if (!res.Item) return emptyClock();
  return {
    matchId: MATCH_ID,
    isRunning: res.Item['isRunning']?.BOOL ?? false,
    startedAtWallMs: Number(res.Item['startedAtWallMs']?.N ?? 0),
    matchMinute: Number(res.Item['matchMinute']?.N ?? 0),
    displayClock: res.Item['displayClock']?.S ?? "0'",
    phase: (res.Item['phase']?.S ?? 'preMatch') as MatchPhase,
    scoreHome: Number(res.Item['scoreHome']?.N ?? 0),
    scoreGuest: Number(res.Item['scoreGuest']?.N ?? 0),
    lastEmittedSeq: Number(res.Item['lastEmittedSeq']?.N ?? -1),
    updatedAt: Number(res.Item['updatedAt']?.N ?? 0),
    htBreakEndsAt: res.Item['htBreakEndsAt']?.N
      ? Number(res.Item['htBreakEndsAt'].N)
      : undefined,
  };
}

function clockToItem(c: ClockState): Record<string, AttributeValue> {
  return {
    PK: { S: `MATCH#${c.matchId}` },
    SK: { S: 'CLOCK' },
    matchId: { S: c.matchId },
    isRunning: { BOOL: c.isRunning },
    startedAtWallMs: { N: String(c.startedAtWallMs) },
    matchMinute: { N: c.matchMinute.toFixed(3) },
    displayClock: { S: c.displayClock },
    phase: { S: c.phase },
    scoreHome: { N: String(c.scoreHome) },
    scoreGuest: { N: String(c.scoreGuest) },
    lastEmittedSeq: { N: String(c.lastEmittedSeq) },
    updatedAt: { N: String(c.updatedAt) },
    ...(c.htBreakEndsAt !== undefined
      ? { htBreakEndsAt: { N: String(c.htBreakEndsAt) } }
      : {}),
  };
}

function eventToItem(seq: number, ev: NormalizedEvent): Record<string, AttributeValue> {
  const item: Record<string, AttributeValue> = {
    PK: { S: `MATCH#${MATCH_ID}` },
    SK: { S: `EVENT#${String(seq).padStart(6, '0')}` },
    matchId: { S: MATCH_ID },
    seq: { N: String(seq) },
    id: { S: ev.id },
    type: { S: ev.type },
    matchMinute: { N: ev.matchMinute.toFixed(3) },
    displayMinute: { S: ev.displayMinute },
    matchPhase: { S: ev.matchPhase },
    eventTimeIso: { S: ev.eventTimeIso },
    // Wall-clock timestamp of this write. The events.json data itself is
    // deterministic — without this, replaying the same match would write
    // attribute-for-attribute-identical items, and DynamoDB Streams suppresses
    // stream records for no-op writes. Adding a per-write timestamp guarantees
    // every replay produces a real MODIFY record that the stream-handler
    // (and downstream AppSync subscribers) actually receives.
    emittedAt: { N: String(Date.now()) },
  };
  if (ev.teamId) item['teamId'] = { S: ev.teamId };
  if (ev.playerId) item['playerId'] = { S: ev.playerId };
  if (ev.assistPlayerId) item['assistPlayerId'] = { S: ev.assistPlayerId };
  if (ev.cardColor) item['cardColor'] = { S: ev.cardColor };
  if (ev.reason) item['reason'] = { S: ev.reason };
  if (ev.scoreAfter) {
    item['scoreHome'] = { N: String(ev.scoreAfter.home) };
    item['scoreGuest'] = { N: String(ev.scoreAfter.guest) };
  }
  return item;
}

// ─── Phase + clock display ─────────────────────────────────────────────────

function derivePhase(
  matchMinute: number,
  lastEvent: NormalizedEvent | undefined,
  secondHalfStarted: boolean,
  inHalfTimeBreak: boolean,
): MatchPhase {
  if (lastEvent?.type === 'fullTime') return 'fullTime';
  if (secondHalfStarted) return 'secondHalf';
  if (inHalfTimeBreak) return 'halfTime';
  if (matchMinute < 0.05) return 'preMatch';
  return 'firstHalf';
}

function formatClock(
  matchMinute: number,
  phase: MatchPhase,
  lastEvent: NormalizedEvent | undefined,
  secondHalfStarted: boolean,
  inHalfTimeBreak: boolean,
): string {
  if (phase === 'fullTime') return 'FT';
  if (secondHalfStarted) {
    return formatDisplayClock(matchMinute, 'secondHalf');
  }
  if (inHalfTimeBreak) return 'HT';
  if (
    lastEvent &&
    lastEvent.matchPhase === 'firstHalf' &&
    lastEvent.matchMinute >= 45
  ) {
    return lastEvent.displayMinute;
  }
  return formatDisplayClock(matchMinute, phase);
}

function shouldDeferEvent(
  ev: NormalizedEvent,
  secondHalfStarted: boolean,
  halfTimeEmitted: boolean,
): boolean {
  if (secondHalfStarted) {
    return (
      ev.matchPhase === 'firstHalf' ||
      ev.type === 'halfTime' ||
      ev.matchPhase === 'halfTime'
    );
  }
  if (ev.matchPhase === 'secondHalf' || ev.kickOffRole === 'secondHalfStart') {
    return true;
  }
  if (halfTimeEmitted && ev.matchPhase === 'firstHalf') return true;
  return false;
}

// ─── One tick of the simulation ────────────────────────────────────────────

/** Real-time pause at HT before the clock resumes at 46'. */
const HT_BREAK_REAL_MS = Number(process.env.HT_BREAK_REAL_MS ?? 4_000);

/** Returns true if the match remains active after this tick (loop should continue). */
async function tickOnce(match: ParsedMatch): Promise<boolean> {
  const clock = await readClock();
  if (!clock.isRunning) return false;
  if (clock.phase === 'fullTime') return false;

  const htIdx = match.events.findIndex((e) => e.type === 'halfTime');
  const ko2Idx = match.events.findIndex((e) => e.kickOffRole === 'secondHalfStart');
  const htMinute = htIdx >= 0 ? match.events[htIdx].matchMinute : 45.03;

  const now = Date.now();
  let startedAtWallMs = clock.startedAtWallMs;

  // Recover state flags from the previous CLOCK row. These are the source of
  // truth across tick boundaries (and across Lambda invocations during the
  // EventBridge safety-net failover).
  const halfTimeEmittedBefore = match.events
    .slice(0, clock.lastEmittedSeq + 1)
    .some((e) => e.type === 'halfTime');
  const secondHalfStartedBefore =
    clock.phase === 'secondHalf' ||
    clock.phase === 'fullTime' ||
    (ko2Idx >= 0 && clock.lastEmittedSeq >= ko2Idx);

  let inHalfTimeBreak = halfTimeEmittedBefore && !secondHalfStartedBefore;
  let htBreakEndsAt = clock.htBreakEndsAt ?? 0;
  let secondHalfStarted = secondHalfStartedBefore;
  let halfTimeEmitted = halfTimeEmittedBefore;

  // If we're in the wall-clock HT break and it has now expired, snap to 46'
  // and re-anchor the wall-clock so subsequent ticks compute matchMinute
  // continuously from there.
  if (inHalfTimeBreak && htBreakEndsAt > 0 && now >= htBreakEndsAt) {
    inHalfTimeBreak = false;
    secondHalfStarted = true;
    startedAtWallMs = now - (SECOND_HALF_START_MINUTE * 60 * 1000) / SIM_RATE;
  }

  let matchMinute = ((now - startedAtWallMs) * SIM_RATE) / 60 / 1000;

  if (inHalfTimeBreak) {
    matchMinute = htMinute;
  } else if (!secondHalfStarted) {
    matchMinute = Math.min(matchMinute, htMinute);
  } else {
    matchMinute = Math.max(matchMinute, SECOND_HALF_START_MINUTE);
  }

  const toEmit: Array<{ seq: number; event: NormalizedEvent }> = [];
  let lastSeq = clock.lastEmittedSeq;
  let lastEvent: NormalizedEvent | undefined =
    lastSeq >= 0 ? match.events[lastSeq] : undefined;
  let scoreHome = clock.scoreHome;
  let scoreGuest = clock.scoreGuest;

  // Drain up to (and including) htMinute when the break is active so any
  // HT-window rows (subs at 45.030) finish before we move on.
  const drainMinute = inHalfTimeBreak ? htMinute : matchMinute;

  for (let i = lastSeq + 1; i < match.events.length; i++) {
    const ev = match.events[i];
    if (ev.matchMinute > drainMinute + 1e-6) break;
    if (shouldDeferEvent(ev, secondHalfStarted, halfTimeEmitted)) break;
    toEmit.push({ seq: i, event: ev });
    lastSeq = i;
    lastEvent = ev;
    if (ev.scoreAfter) {
      scoreHome = ev.scoreAfter.home;
      scoreGuest = ev.scoreAfter.guest;
    }
    if (ev.type === 'halfTime') {
      halfTimeEmitted = true;
      inHalfTimeBreak = true;
      htBreakEndsAt = now + HT_BREAK_REAL_MS;
      // Critical: stop draining at the whistle. The HT-window subs and 2H
      // events must wait for subsequent ticks so the UI gets the 'HT' freeze.
      break;
    }
    if (ev.kickOffRole === 'secondHalfStart') {
      secondHalfStarted = true;
      inHalfTimeBreak = false;
    }
  }

  // Snap the wall-clock anchor exactly once when we cross into 2H so the
  // sub-second jitter at the boundary doesn't show up as 47'+.
  if (secondHalfStarted && !secondHalfStartedBefore) {
    startedAtWallMs = now - (SECOND_HALF_START_MINUTE * 60 * 1000) / SIM_RATE;
    matchMinute = Math.max(matchMinute, SECOND_HALF_START_MINUTE);
  }

  const phase = derivePhase(matchMinute, lastEvent, secondHalfStarted, inHalfTimeBreak);
  const publishedMinute = inHalfTimeBreak
    ? htMinute
    : secondHalfStarted
      ? Math.max(matchMinute, SECOND_HALF_START_MINUTE)
      : Math.min(matchMinute, htMinute);

  const next: ClockState = {
    matchId: clock.matchId,
    isRunning: phase !== 'fullTime',
    startedAtWallMs,
    matchMinute: publishedMinute,
    displayClock: formatClock(
      publishedMinute,
      phase,
      lastEvent,
      secondHalfStarted,
      inHalfTimeBreak,
    ),
    phase,
    scoreHome,
    scoreGuest,
    lastEmittedSeq: lastSeq,
    updatedAt: now,
    htBreakEndsAt: inHalfTimeBreak ? htBreakEndsAt : undefined,
  };

  for (let i = 0; i < toEmit.length; i += 25) {
    const slice = toEmit.slice(i, i + 25);
    await ddb.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [MATCHES_TABLE]: slice.map(({ seq, event }) => ({
            PutRequest: { Item: eventToItem(seq, event) },
          })),
        },
      }),
    );
  }

  await ddb.send(
    new PutItemCommand({ TableName: MATCHES_TABLE, Item: clockToItem(next) }),
  );

  if (toEmit.length > 0 || phase === 'fullTime') {
    console.log(
      JSON.stringify({
        msg: 'sim-emitter: tick',
        seq: lastSeq,
        emitted: toEmit.length,
        matchMinute: Number(matchMinute.toFixed(2)),
        phase,
        scoreHome,
        scoreGuest,
      }),
    );
  }

  return phase !== 'fullTime';
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── Entrypoint — internal 2-second loop ───────────────────────────────────

// A full 90' match at SIM_RATE=30 plays in ~184 real seconds. Run a single
// invocation long enough to cover the entire match (plus stoppage + HT break)
// so the user never sees the gap caused by exiting before EventBridge re-fires.
// Lambda timeout in CDK is bumped to 240s to match.
const LOOP_MAX_MS = 220_000;
const TICK_INTERVAL_MS = 2_000;

export const handler = async (): Promise<void> => {
  const match = await loadMatch();
  const startedAt = Date.now();
  let firstTick = true;

  while (Date.now() - startedAt < LOOP_MAX_MS) {
    if (!firstTick) await sleep(TICK_INTERVAL_MS);
    firstTick = false;

    try {
      const stillRunning = await tickOnce(match);
      if (!stillRunning) {
        console.log(JSON.stringify({ msg: 'sim-emitter: loop exit (match idle or over)' }));
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ msg: 'sim-emitter: tick error', err: msg }));
    }
  }
  console.log(JSON.stringify({ msg: 'sim-emitter: loop exit (LOOP_MAX_MS reached)' }));
};
