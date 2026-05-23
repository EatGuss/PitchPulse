/**
 * WatchRoomEngine — singleton owning the global watch room for the match.
 *
 * For MVP (PITCHPULSE.md §6.7) there is one room per match. Users join when
 * MatchPage mounts and stay until reset. The engine fans out reactions on its
 * own bus so every <PhoneFrame> on the page sees the same puff at the same time
 * (mirrors the PromptEngine pattern; Gate 4 swaps this for AppSync subs).
 *
 * Reactions are fire-and-forget — no per-reaction persistence beyond a small
 * in-memory ring buffer used by the live feed for "rejoin and catch up".
 */

import { TypedEventBus } from './eventBus';
import { getMatchSim } from './matchSim';

/** Allowed reaction emojis — limited set per brief (🔥 ⚽ 😱 🎉). */
export const REACTION_EMOJIS = ['🔥', '⚽', '😱', '🎉'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface ReactionEvent {
  /** Unique id so React keys stay stable across re-renders. */
  id: string;
  userId: string;
  emoji: ReactionEmoji;
  /** Wall-clock ms the reaction was fired. */
  ts: number;
}

export interface WatchRoomEventMap extends Record<string, unknown> {
  reaction: { reaction: ReactionEvent };
  memberJoined: { userId: string };
  reset: void;
}

const MAX_RING_BUFFER = 40;

export class WatchRoomEngine {
  readonly bus = new TypedEventBus<WatchRoomEventMap>();

  private members = new Set<string>();
  /** Most-recent-first ring buffer. Bounded so memory doesn't grow with a long match. */
  private reactions: ReactionEvent[] = [];
  private nextSeq = 1;
  private seenReactionKeys = new Set<string>();
  private unsubReady?: () => void;

  /** Bind to MatchSim so a sim `reset()` clears reaction history. Idempotent. */
  attach(): void {
    if (this.unsubReady) this.unsubReady();
    const sim = getMatchSim();
    this.unsubReady = sim.bus.on('ready', () => this.resetState());
  }

  resetState(): void {
    this.reactions = [];
    this.seenReactionKeys.clear();
    // Membership is preserved across resets — alice/bob stay in the room.
    this.bus.emit('reset', undefined);
  }

  join(userId: string): void {
    if (this.members.has(userId)) return;
    this.members.add(userId);
    this.bus.emit('memberJoined', { userId });
  }

  isMember(userId: string): boolean {
    return this.members.has(userId);
  }

  getMembers(): string[] {
    return Array.from(this.members);
  }

  /** Latest reactions, newest-first. Bounded length. */
  getReactions(): ReactionEvent[] {
    return this.reactions.slice();
  }

  fireReaction(userId: string, emoji: ReactionEmoji): ReactionEvent | null {
    if (!this.members.has(userId)) return null;
    return this.emitReaction(userId, emoji);
  }

  /** Inject a reaction from AppSync (or another phone) without re-broadcasting. */
  injectReaction(
    userId: string,
    emoji: string,
    ts = Date.now(),
    reactionId?: string,
  ): ReactionEvent | null {
    if (!REACTION_EMOJIS.includes(emoji as ReactionEmoji)) return null;
    const dedupeKey = reactionId ?? `${userId}:${emoji}:${ts}`;
    if (this.seenReactionKeys.has(dedupeKey)) return null;
    this.seenReactionKeys.add(dedupeKey);
    return this.emitReaction(userId, emoji as ReactionEmoji, ts, reactionId);
  }

  /** Replace membership — used when entering a private Watch Room match. */
  setMembers(userIds: string[]): void {
    this.members = new Set(userIds);
  }

  setRoomId(roomId: string | null): void {
    this.roomId = roomId;
  }

  getRoomId(): string | null {
    return this.roomId;
  }

  private roomId: string | null = null;

  private emitReaction(
    userId: string,
    emoji: ReactionEmoji,
    ts = Date.now(),
    reactionId?: string,
  ): ReactionEvent {
    const ev: ReactionEvent = {
      id: reactionId ?? `r-${this.nextSeq++}-${userId}-${ts}`,
      userId,
      emoji,
      ts,
    };
    this.reactions.unshift(ev);
    if (this.reactions.length > MAX_RING_BUFFER) {
      this.reactions.length = MAX_RING_BUFFER;
    }
    this.bus.emit('reaction', { reaction: ev });
    return ev;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _engine: WatchRoomEngine | null = null;
export function getWatchRoomEngine(): WatchRoomEngine {
  if (!_engine) _engine = new WatchRoomEngine();
  return _engine;
}
