/**
 * BadgeEngine — singleton owning per-user collectible badges (PITCHPULSE.md §6.7).
 *
 * Listens to MatchSim, PromptEngine, and WatchRoomEngine and decides when to
 * unlock one of the four MVP badges. Each badge unlocks AT MOST ONCE per user
 * per match; state resets when the sim emits `ready` (a new playback).
 *
 *   first-goal-watcher  — user was a room member when the first goal fired
 *   card-spotter        — user was a room member when the first card fired
 *   half-time-hero      — user voted on the half-time prompt (correctness ignored)
 *   perfect-predictor   — user's prediction streak reaches 3+
 *
 * Gate 4 moves this to a Lambda invoked off the DynamoDB Stream + AppSync
 * subscription. The bus event shape (`badgeUnlocked`) is what UI binds to —
 * keep stable across the rewrite.
 */

import { TypedEventBus } from './eventBus';
import { getMatchSim } from './matchSim';
import { getPromptEngine } from './promptEngine';
import { getWatchRoomEngine } from './watchRoomEngine';
import { PROMPT_TEMPLATES } from '../data/promptTemplates';
import type { NormalizedEvent } from '../domain/types';
import type { PromptInstance } from '../domain/promptTypes';

export type BadgeId =
  | 'first-goal-watcher'
  | 'card-spotter'
  | 'half-time-hero'
  | 'perfect-predictor';

export interface BadgeDefinition {
  id: BadgeId;
  label: string;        // short title shown in the toast
  icon: string;         // emoji rendered as the badge glyph
  description: string;  // one-liner shown below the title
}

export const BADGES: Record<BadgeId, BadgeDefinition> = {
  'first-goal-watcher': {
    id: 'first-goal-watcher',
    label: 'First Goal Watcher',
    icon: '⚽',
    description: 'You were in the room when the first goal hit the net.',
  },
  'card-spotter': {
    id: 'card-spotter',
    label: 'Card Spotter',
    icon: '🟨',
    description: 'You caught the first booking of the match.',
  },
  'half-time-hero': {
    id: 'half-time-hero',
    label: 'Half-time Hero',
    icon: '⏱️',
    description: 'You called the final result at the half-time whistle.',
  },
  'perfect-predictor': {
    id: 'perfect-predictor',
    label: 'Perfect Predictor',
    icon: '🎯',
    description: 'Three correct predictions in a row. Hot streak.',
  },
};

export interface BadgeUnlock {
  userId: string;
  badgeId: BadgeId;
  /** Wall-clock ms the badge fired. Powers the toast queue. */
  unlockedAt: number;
  /** Sticky reference to the definition so consumers don't have to look it up. */
  definition: BadgeDefinition;
}

export interface BadgeEventMap extends Record<string, unknown> {
  badgeUnlocked: { unlock: BadgeUnlock };
  reset: void;
}

/** Returns the templateId of the half-time-triggered prompt (used to detect HT resolutions). */
const HALFTIME_PROMPT_TEMPLATE_IDS = new Set(
  PROMPT_TEMPLATES.filter((t) => t.trigger.kind === 'onHalfTime').map((t) => t.id),
);

export class BadgeEngine {
  readonly bus = new TypedEventBus<BadgeEventMap>();

  private unlocked = new Map<string, Set<BadgeId>>();
  private firstGoalFired = false;
  private firstCardFired = false;

  private unsubs: Array<() => void> = [];

  /** Bind to all three upstream buses. Idempotent — safe to call repeatedly. */
  attach(): void {
    this.detach();

    const sim = getMatchSim();
    const prompt = getPromptEngine();
    const room = getWatchRoomEngine();

    this.unsubs.push(sim.bus.on('ready', () => this.resetState()));
    this.unsubs.push(sim.bus.on('event', (ev) => this.onSimEvent(ev)));
    this.unsubs.push(prompt.bus.on('promptResolved', ({ prompt }) => this.onPromptResolved(prompt)));
    this.unsubs.push(
      prompt.bus.on('userStreakChanged', ({ userId, streak }) =>
        this.onStreakChanged(userId, streak),
      ),
    );
    this.unsubs.push(prompt.bus.on('reset', () => this.resetState()));
    // Room reset is a strict subset of sim ready — no need to bind separately,
    // but we listen to keep the engine working even if room is reset on its own.
    this.unsubs.push(room.bus.on('reset', () => this.resetState()));
  }

  detach(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  resetState(): void {
    this.unlocked.clear();
    this.firstGoalFired = false;
    this.firstCardFired = false;
    this.bus.emit('reset', undefined);
  }

  /** Public read accessors. */
  getBadges(userId: string): BadgeDefinition[] {
    const set = this.unlocked.get(userId);
    if (!set) return [];
    return Array.from(set).map((id) => BADGES[id]);
  }

  hasBadge(userId: string, badgeId: BadgeId): boolean {
    return this.unlocked.get(userId)?.has(badgeId) ?? false;
  }

  // ─── handlers ─────────────────────────────────────────────────────────────

  private onSimEvent(ev: NormalizedEvent): void {
    if (ev.type === 'goal' && !this.firstGoalFired) {
      this.firstGoalFired = true;
      this.unlockForAllMembers('first-goal-watcher');
    } else if (ev.type === 'card' && !this.firstCardFired) {
      this.firstCardFired = true;
      this.unlockForAllMembers('card-spotter');
    }
  }

  private onPromptResolved(prompt: PromptInstance): void {
    // Half-time-hero: any user who voted on the HT-triggered prompt earns it,
    // regardless of correctness (the spec's "vote on the HT prompt" reading).
    if (HALFTIME_PROMPT_TEMPLATE_IDS.has(prompt.templateId)) {
      for (const userId of Object.keys(prompt.userVotes)) {
        this.tryUnlock(userId, 'half-time-hero');
      }
    }
  }

  private onStreakChanged(userId: string, streak: number): void {
    if (streak >= 3) this.tryUnlock(userId, 'perfect-predictor');
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private unlockForAllMembers(badgeId: BadgeId): void {
    const room = getWatchRoomEngine();
    for (const userId of room.getMembers()) {
      this.tryUnlock(userId, badgeId);
    }
  }

  private tryUnlock(userId: string, badgeId: BadgeId): void {
    let set = this.unlocked.get(userId);
    if (!set) {
      set = new Set();
      this.unlocked.set(userId, set);
    }
    if (set.has(badgeId)) return;
    set.add(badgeId);
    const unlock: BadgeUnlock = {
      userId,
      badgeId,
      unlockedAt: Date.now(),
      definition: BADGES[badgeId],
    };
    this.bus.emit('badgeUnlocked', { unlock });
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _engine: BadgeEngine | null = null;
export function getBadgeEngine(): BadgeEngine {
  if (!_engine) _engine = new BadgeEngine();
  return _engine;
}
