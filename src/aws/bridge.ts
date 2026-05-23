/**
 * AppSync → local engine bridge.
 *
 * In AWS mode this module owns the AppSync subscriptions and forwards the
 * received payloads into the existing in-browser engines via their inject
 * methods. The rest of the UI stays exactly the same — components consume
 * the same buses (matchSim.bus, watchRoomEngine.bus) regardless of mode.
 *
 * Subscriptions opened:
 *   - matchClock(matchId)   → matchSim.injectClock(...)
 *   - matchEvent(matchId)   → matchSim.injectEvent(...)
 *   - roomReaction(matchId) → watchRoomEngine.injectReaction(...)  (Gate 4 stretch)
 *
 * Mutations exposed:
 *   - startMatch()    — flips the server-side CLOCK to running
 *   - fireReaction()  — broadcasts a reaction (Gate 4 stretch — currently local-only)
 *
 * The bridge is idempotent — calling attach() twice with the same matchId
 * tears down the previous subscriptions before opening fresh ones.
 */

import { generateClient } from 'aws-amplify/api';
import { MATCH_ID, isAwsMode } from './config';
import { FIRE_REACTION, START_MATCH, SUB_MATCH_CLOCK, SUB_MATCH_EVENT, SUB_ROOM_REACTION } from './operations';
import { getMatchSim } from '../sim/matchSim';
import { getWatchRoomEngine, REACTION_EMOJIS, type ReactionEmoji } from '../sim/watchRoomEngine';
import type { MatchClockState, NormalizedEvent, NormalizedEventType, MatchPhase } from '../domain/types';

/**
 * Local narrowing for AppSync subscription responses. The Amplify v6
 * `client.graphql()` return type is a union (Promise for queries/mutations,
 * Observable for subscriptions). TypeScript can't infer which from a string
 * literal query, so we cast at the call site.
 */
interface SubscriptionLike<T> {
  subscribe: (handlers: {
    next: (value: { data: T }) => void;
    error?: (err: unknown) => void;
  }) => { unsubscribe: () => void };
}

interface MatchClockPayload {
  matchId: string;
  matchMinute: number;
  displayClock: string;
  phase: string;
  scoreHome: number;
  scoreGuest: number;
  isRunning: boolean;
  updatedAt: number;
}

interface MatchEventPayload {
  matchId: string;
  seq: number;
  id: string;
  type: string;
  matchMinute: number;
  displayMinute: string;
  matchPhase: string;
  teamId?: string | null;
  playerId?: string | null;
  assistPlayerId?: string | null;
  cardColor?: string | null;
  reason?: string | null;
  scoreHome?: number | null;
  scoreGuest?: number | null;
  eventTimeIso?: string | null;
}

let attached = false;
let unsubscribers: Array<() => void> = [];
let reactionBridgeRoomId: string | null = null;
let reactionBridgeUnsub: (() => void) | null = null;

function clockFromPayload(p: MatchClockPayload): MatchClockState {
  return {
    matchMinute: p.matchMinute,
    displayClock: p.displayClock,
    phase: p.phase as MatchPhase,
    score: { home: p.scoreHome, guest: p.scoreGuest },
    isRunning: p.isRunning,
  };
}

function eventFromPayload(p: MatchEventPayload): NormalizedEvent {
  return {
    id: p.id,
    type: p.type as NormalizedEventType,
    matchMinute: p.matchMinute,
    displayMinute: p.displayMinute,
    matchPhase: p.matchPhase as MatchPhase,
    eventTimeIso: p.eventTimeIso ?? '',
    teamId: p.teamId ?? undefined,
    playerId: p.playerId ?? undefined,
    assistPlayerId: p.assistPlayerId ?? undefined,
    cardColor: (p.cardColor ?? undefined) as NormalizedEvent['cardColor'],
    reason: p.reason ?? undefined,
    scoreAfter:
      p.scoreHome !== null && p.scoreHome !== undefined && p.scoreGuest !== null && p.scoreGuest !== undefined
        ? { home: p.scoreHome, guest: p.scoreGuest }
        : undefined,
  };
}

export function attachAwsBridge(): void {
  if (!isAwsMode) {
    console.info('[aws-bridge] skipped: not in AWS mode');
    return;
  }
  if (attached) {
    console.info('[aws-bridge] skipped: already attached');
    return;
  }

  const client = generateClient();
  const sim = getMatchSim();
  let clockMsgCount = 0;
  let eventMsgCount = 0;

  console.info('[aws-bridge] opening subscriptions for matchId=%s', MATCH_ID);

  const clockObs = client.graphql({
    query: SUB_MATCH_CLOCK,
    variables: { matchId: MATCH_ID },
  }) as unknown as SubscriptionLike<{ matchClock: MatchClockPayload }>;
  const clockSub = clockObs.subscribe({
    next: ({ data }) => {
      clockMsgCount += 1;
      if (clockMsgCount <= 3 || clockMsgCount % 10 === 0) {
        console.info('[aws-bridge] clock #%d', clockMsgCount, data?.matchClock);
      }
      if (!data?.matchClock) return;
      sim.injectClock(clockFromPayload(data.matchClock));
    },
    error: (err) => {
      console.error('[aws-bridge] matchClock subscription error', err);
    },
  });

  const eventObs = client.graphql({
    query: SUB_MATCH_EVENT,
    variables: { matchId: MATCH_ID },
  }) as unknown as SubscriptionLike<{ matchEvent: MatchEventPayload }>;
  const eventSub = eventObs.subscribe({
    next: ({ data }) => {
      eventMsgCount += 1;
      console.info(
        '[aws-bridge] event #%d type=%s min=%s',
        eventMsgCount,
        data?.matchEvent?.type,
        data?.matchEvent?.displayMinute,
      );
      if (!data?.matchEvent) return;
      sim.injectEvent(eventFromPayload(data.matchEvent));
    },
    error: (err) => {
      console.error('[aws-bridge] matchEvent subscription error', err);
    },
  });

  unsubscribers.push(() => clockSub.unsubscribe());
  unsubscribers.push(() => eventSub.unsubscribe());
  attached = true;
  console.info('[aws-bridge] attached — matchClock + matchEvent subscriptions live');
}

export function detachAwsBridge(): void {
  unsubscribers.forEach((u) => {
    try {
      u();
    } catch {
      // Ignore — best-effort cleanup on tab close.
    }
  });
  unsubscribers = [];
  attached = false;
}

/** Fire the server-side match clock. Resolves once the CLOCK row is written. */
export async function awsStartMatch(): Promise<void> {
  const client = generateClient();
  console.info('[aws-bridge] calling startMatch mutation for %s', MATCH_ID);
  // Clear local replay state so a fresh kickoff isn't filtered by the
  // injectEvent dedup set from the prior run. The server's start-match Lambda
  // resets its CLOCK / lastEmittedSeq independently.
  getMatchSim().reset();
  try {
    const res = await client.graphql({
      query: START_MATCH,
      variables: { input: { matchId: MATCH_ID } },
    });
    console.info('[aws-bridge] startMatch ok', res);
  } catch (err) {
    console.error('[aws-bridge] startMatch FAILED', err);
    throw err;
  }
}

/** Reset the server-side match timeline (same as kick off — seq restarts at 0). */
export async function awsResetMatch(): Promise<void> {
  return awsStartMatch();
}

/** Broadcast a reaction emoji to all connected viewers in a room. */
export async function awsFireReaction(
  roomId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  const client = generateClient();
  await client.graphql({
    query: FIRE_REACTION,
    variables: { input: { roomId, userId, emoji } },
  });
}

/** Subscribe once per room to room-scoped reactions and inject into the local engine. */
export function ensureWatchRoomReactionBridge(roomId: string): void {
  if (!isAwsMode) return;
  if (reactionBridgeRoomId === roomId && reactionBridgeUnsub) return;

  reactionBridgeUnsub?.();
  reactionBridgeRoomId = roomId;

  const client = generateClient();
  const engine = getWatchRoomEngine();
  const obs = client.graphql({
    query: SUB_ROOM_REACTION,
    variables: { roomId },
  }) as unknown as SubscriptionLike<{
    roomReaction: { userId: string; emoji: string; ts: number; reactionId: string };
  }>;

  const sub = obs.subscribe({
    next: ({ data }) => {
      const r = data?.roomReaction;
      if (!r) return;
      if (!REACTION_EMOJIS.includes(r.emoji as ReactionEmoji)) return;
      engine.injectReaction(r.userId, r.emoji, r.ts, r.reactionId);
    },
    error: (err) => {
      console.error('[aws-bridge] roomReaction subscription error', err);
    },
  });

  reactionBridgeUnsub = () => {
    sub.unsubscribe();
    if (reactionBridgeRoomId === roomId) {
      reactionBridgeRoomId = null;
      reactionBridgeUnsub = null;
    }
  };
}

/** @deprecated Prefer ensureWatchRoomReactionBridge — kept for call-site compat. */
export function attachWatchRoomReactionBridge(roomId: string): () => void {
  ensureWatchRoomReactionBridge(roomId);
  return () => {};
}
