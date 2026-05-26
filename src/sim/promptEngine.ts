/**
 * PromptEngine — server-side authority for Matchday Shots.
 *
 * Subscribes to MatchSim's clock + event stream and:
 *   - Fires prompt instances when triggers match (with per-match cap of 8 and
 *     "only one open" preempt rule)
 *   - Closes the 30s answer window
 *   - Validates and records votes (server-side per ADR-001)
 *   - Resolves prompts on the right trigger AFTER the window has closed
   *   - Computes payouts: ranked = fixed baseReward; watch room = base × min(1/share, 5)
 *   - Tracks per-user balance, streak, and history
 *
 * Gate 2 runs this in-browser as a singleton. Gate 4 replaces it with a Lambda
 * resolver against DynamoDB pp-prompts + pp-users tables. The PUBLIC SHAPE of
 * the bus events and submitVote() is what UI code depends on — keep stable.
 */

import { TypedEventBus } from './eventBus';
import { getMatchSim } from './matchSim';
import {
  consumeHotTake,
  HOT_TAKE_MULTIPLIER,
  refundHotTake,
  resetHotTakeState,
} from './hotTakeStore';
import { PROMPT_TEMPLATES } from '../data/promptTemplates';
import { DEMO_USERS } from '../data/personas';
import type {
  PromptInstance,
  PromptResolutionContext,
  PromptSkipReason,
  PromptTemplate,
  UserState,
} from '../domain/promptTypes';
import type { MatchClockState, MatchInfo, NormalizedEvent } from '../domain/types';

/**
 * The 30-second answer window is WALL TIME, not match time. The match clock
 * is sped up for the demo (1 match-min = 2 real sec by default) so a 30 match-
 * second window would collapse to 1 real second and be impossible to vote on.
 * Wall-time is also what a Lambda resolver will check in Gate 4. Env override
 * for shorter windows during local dev/recording.
 */
export const PROMPT_WINDOW_MS = (() => {
  // Cast via opt-typed view — see matchSim.ts for the headless-Node rationale.
  const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env;
  const raw = Number(env?.VITE_PROMPT_WINDOW_MS ?? 30_000);
  return Number.isFinite(raw) && raw > 1000 ? raw : 30_000;
})();
export const PER_MATCH_PROMPT_CAP = 8;
export const MAX_REWARD_MULTIPLIER = 5;

export interface PromptEngineEventMap extends Record<string, unknown> {
  promptOpened: { prompt: PromptInstance };
  promptUpdated: { prompt: PromptInstance };
  promptClosed: { prompt: PromptInstance };
  promptResolved: { prompt: PromptInstance };
  userMatchPointsChanged: { userId: string; matchPoints: number; delta: number; reason: string };
  userStreakChanged: { userId: string; streak: number };
  promptSkipped: { templateId: string; reason: PromptSkipReason };
  hotTakeWon: { userId: string; promptId: string; payout: number };
  reset: void;
}

interface ActivePrompt extends PromptInstance {
  template: PromptTemplate;
  eventsSinceOpen: NormalizedEvent[];
  /** Match minute of the most recent FCB/BVB goal anchor — used by 'onGoal' triggers. */
  triggerEventId?: string;
}

export class PromptEngine {
  readonly bus = new TypedEventBus<PromptEngineEventMap>();

  private active: ActivePrompt | null = null;
  private firedTemplateIds = new Set<string>();
  private firedMinuteTriggers = new Set<number>(); // dedupe minute-triggered fires
  private totalIssued = 0;
  private homeTeamId = '';
  private guestTeamId = '';

  /** Map<userId, UserState> — Map preserves insertion order (used by leaderboard later). */
  private users = new Map<string, UserState>();

  constructor() {
    for (const u of Object.values(DEMO_USERS)) {
      this.users.set(u.id, {
        userId: u.id,
        matchPoints: 0,
        streak: 0,
        totalCorrect: 0,
        totalVoted: 0,
        history: [],
      });
    }
  }

  private rankedScoring = false;

  /** Ranked 1v1 uses fixed baseReward per correct pick — no odds multiplier. */
  setRankedScoring(enabled: boolean): void {
    this.rankedScoring = enabled;
  }

  isRankedScoring(): boolean {
    return this.rankedScoring;
  }

  /** Bind to a MatchSim instance + arm with the match info for placeholder substitutions. */
  attach(info: MatchInfo): void {
    this.homeTeamId = info.teams.home.id;
    this.guestTeamId = info.teams.guest.id;
    const sim = getMatchSim();
    // Subscriptions are idempotent because we keep references to the unsubscribers.
    if (this.unsubClock) this.unsubClock();
    if (this.unsubEvent) this.unsubEvent();
    if (this.unsubReady) this.unsubReady();
    this.unsubClock = sim.bus.on('clock', this.onClock);
    this.unsubEvent = sim.bus.on('event', this.onEvent);
    this.unsubReady = sim.bus.on('ready', () => this.resetState());
  }

  /** Reset everything — used when the sim is reset or reloaded. */
  resetState(): void {
    this.active = null;
    this.firedTemplateIds.clear();
    this.firedMinuteTriggers.clear();
    this.totalIssued = 0;
    for (const u of this.users.values()) {
      u.matchPoints = 0;
      u.streak = 0;
      u.totalCorrect = 0;
      u.totalVoted = 0;
      u.history = [];
      this.bus.emit('userMatchPointsChanged', { userId: u.userId, matchPoints: 0, delta: 0, reason: 'reset' });
      this.bus.emit('userStreakChanged', { userId: u.userId, streak: 0 });
    }
    resetHotTakeState();
    this.bus.emit('reset', undefined);
  }

  /** Public read accessors. */
  getActive(): PromptInstance | null {
    return this.active ? this.snapshot(this.active) : null;
  }
  getUser(userId: string): UserState | undefined {
    return this.users.get(userId);
  }
  getAllUsers(): UserState[] {
    return Array.from(this.users.values());
  }
  getTotalIssued(): number {
    return this.totalIssued;
  }

  /**
   * Server-side vote submission.
   * Returns true on accepted vote, false if rejected (closed window, unknown
   * option, no active prompt, etc.). All rejections are SILENT in the UI —
   * the button is disabled when the window is closed, so a rejection here
   * almost always means a race or replay.
   *
   * Wall-clock validation is authoritative — mirrors what a Lambda resolver
   * does in Gate 4 (it never trusts the client-claimed timestamp).
   */
  submitVote(
    promptId: string,
    userId: string,
    optionId: string,
    opts?: { hotTake?: boolean; matchId?: string },
  ): boolean {
    const a = this.active;
    if (!a) return false;
    if (a.id !== promptId) return false;
    if (a.state !== 'open') return false;
    if (getMatchSim().isPaused()) return true;
    if (Date.now() > a.closesAtWallMs) return false;
    if (!a.options.some((o) => o.id === optionId)) return false;
    if (!this.users.has(userId)) return false;

    const hotTake = Boolean(opts?.hotTake);
    if (hotTake) {
      if (!this.rankedScoring) return false;
      const matchId = opts?.matchId;
      if (!matchId || !consumeHotTake(matchId, userId)) return false;
    }

    const previous = a.userVotes[userId];
    a.userVotes[userId] = optionId;
    if (!a.userHotTakes) a.userHotTakes = {};
    if (hotTake) a.userHotTakes[userId] = true;
    else if (!(userId in a.userHotTakes)) a.userHotTakes[userId] = false;

    a.voteCounts = { ...a.voteCounts };
    if (previous) a.voteCounts[previous] = Math.max(0, (a.voteCounts[previous] ?? 0) - 1);
    a.voteCounts[optionId] = (a.voteCounts[optionId] ?? 0) + 1;

    this.bus.emit('promptUpdated', { prompt: this.snapshot(a) });
    return true;
  }

  /**
   * Toggle Hot Take on an existing ranked vote while the prompt is still open.
   */
  setVoteHotTake(
    promptId: string,
    userId: string,
    enabled: boolean,
    matchId: string,
  ): boolean {
    const a = this.active;
    if (!a || a.id !== promptId || a.state !== 'open') return false;
    if (!this.rankedScoring) return false;
    if (!(userId in a.userVotes)) return false;
    if (getMatchSim().isPaused()) return true;

    if (!a.userHotTakes) a.userHotTakes = {};
    const wasHot = a.userHotTakes[userId] === true;

    if (enabled) {
      if (wasHot) return true;
      if (!consumeHotTake(matchId, userId)) return false;
      a.userHotTakes[userId] = true;
    } else if (wasHot) {
      a.userHotTakes[userId] = false;
      refundHotTake(matchId, userId);
    } else {
      a.userHotTakes[userId] = false;
    }

    this.bus.emit('promptUpdated', { prompt: this.snapshot(a) });
    return true;
  }

  // ─── private ──────────────────────────────────────────────────────────────

  private unsubClock?: () => void;
  private unsubEvent?: () => void;
  private unsubReady?: () => void;

  private onClock = (state: MatchClockState): void => {
    if (this.active) {
      this.active.serverMinute = state.matchMinute;

      // Close the 30-wall-second window once it expires — only while the match is running.
      if (
        this.active.state === 'open' &&
        state.isRunning &&
        Date.now() >= this.active.closesAtWallMs
      ) {
        this.active.state = 'locked';
        this.bus.emit('promptClosed', { prompt: this.snapshot(this.active) });
      }

      // Attempt to resolve if window is closed and resolution criteria match.
      if (this.active.state === 'locked') {
        this.tryResolve();
      }
    }

    if (!state.isRunning) return;

    // Minute-triggered prompts.
    for (const tpl of PROMPT_TEMPLATES) {
      if (tpl.trigger.kind !== 'matchMinute') continue;
      const m = tpl.trigger.minute;
      if (state.matchMinute < m) continue;
      if (this.firedMinuteTriggers.has(m)) continue;
      // Only consider this trigger ONCE per match — mark immediately to avoid
      // re-checking every tick. tryFire may still skip it (cap, another open).
      this.firedMinuteTriggers.add(m);
      this.tryFire(tpl, state.matchMinute);
    }
  };

  private onEvent = (ev: NormalizedEvent): void => {
    // Capture event in the active prompt's window log for later resolution.
    if (this.active && this.active.state !== 'resolved') {
      this.active.eventsSinceOpen.push(ev);
    }

    // Trigger prompts that depend on this event kind.
    if (ev.type === 'goal') {
      for (const tpl of PROMPT_TEMPLATES) {
        if (tpl.trigger.kind === 'onGoal') this.tryFire(tpl, ev.matchMinute);
      }
    } else if (ev.type === 'halfTime') {
      for (const tpl of PROMPT_TEMPLATES) {
        if (tpl.trigger.kind === 'onHalfTime') this.tryFire(tpl, ev.matchMinute);
      }
    }

    // Re-attempt resolution if window has already closed.
    if (this.active && this.active.state === 'locked') {
      this.tryResolve();
    }
  };

  private tryFire(template: PromptTemplate, currentMinute: number): void {
    if (this.firedTemplateIds.has(template.id)) {
      // Each template fires at most once per match (avoid spamming on every goal).
      return;
    }
    if (this.active && (this.active.state === 'open' || this.active.state === 'locked')) {
      this.bus.emit('promptSkipped', { templateId: template.id, reason: 'another_open' });
      return;
    }
    if (this.totalIssued >= PER_MATCH_PROMPT_CAP) {
      this.bus.emit('promptSkipped', { templateId: template.id, reason: 'cap_reached' });
      return;
    }

    const opened = currentMinute;
    const wallNow = Date.now();
    const instance: ActivePrompt = {
      id: `${template.id}@${opened.toFixed(3)}`,
      templateId: template.id,
      category: template.category,
      copy: template.copy,
      options: template.options,
      baseReward: template.baseReward,
      state: 'open',
      openedAtMinute: opened,
      serverMinute: opened,
      openedAtWallMs: wallNow,
      closesAtWallMs: wallNow + PROMPT_WINDOW_MS,
      voteCounts: Object.fromEntries(template.options.map((o) => [o.id, 0])),
      userVotes: {},
      userHotTakes: {},
      template,
      eventsSinceOpen: [],
    };

    this.active = instance;
    this.firedTemplateIds.add(template.id);
    this.totalIssued += 1;
    this.bus.emit('promptOpened', { prompt: this.snapshot(instance) });
  }

  private tryResolve(): void {
    const a = this.active;
    if (!a || a.state !== 'locked') return;

    const ctx: PromptResolutionContext = {
      eventsSince: a.eventsSinceOpen,
      currentMinute: a.serverMinute,
      openedAtMinute: a.openedAtMinute,
      homeTeamId: this.homeTeamId,
      guestTeamId: this.guestTeamId,
    };

    const winningOptionId = a.template.resolve(ctx);
    if (winningOptionId === null) return; // not ready

    a.winningOptionId = winningOptionId;
    a.resolvedAtMinute = a.serverMinute;
    a.state = 'resolved';
    a.payouts = this.computePayouts(a, winningOptionId);

    // Apply payouts + streak updates to each user.
    for (const [userId, pickedOption] of Object.entries(a.userVotes)) {
      const user = this.users.get(userId);
      if (!user) continue;
      const payout = a.payouts[userId] ?? 0;
      const won = pickedOption === winningOptionId;

      user.totalVoted += 1;
      const pickedLabel =
        a.options.find((o) => o.id === pickedOption)?.label ?? pickedOption;
      user.history.push({
        promptId: a.id,
        round: user.history.length + 1,
        copy: a.copy,
        pickedOptionId: pickedOption,
        pickedLabel,
        won,
        payout,
        baseReward: a.baseReward,
        hotTake: a.userHotTakes?.[userId] === true,
      });

      if (won) {
        user.matchPoints += payout;
        user.totalCorrect += 1;
        user.streak += 1;
      } else {
        user.streak = 0;
      }

      if (payout > 0) {
        this.bus.emit('userMatchPointsChanged', {
          userId,
          matchPoints: user.matchPoints,
          delta: payout,
          reason: 'prompt_win',
        });
        if (a.userHotTakes?.[userId] && won) {
          this.bus.emit('hotTakeWon', { userId, promptId: a.id, payout });
        }
      }
      this.bus.emit('userStreakChanged', { userId, streak: user.streak });
    }

    for (const user of this.users.values()) {
      if (user.userId in a.userVotes) continue;
      if (user.streak === 0) continue;
      user.streak = 0;
      this.bus.emit('userStreakChanged', { userId: user.userId, streak: 0 });
    }

    this.bus.emit('promptResolved', { prompt: this.snapshot(a) });

    // Hold the resolved sheet on-screen briefly so users see the result, then
    // clear `active` so the next prompt can fire. UI does its own fade-out.
    setTimeout(() => {
      if (this.active && this.active.id === a.id) this.active = null;
    }, 3200);
  }

  private computePayouts(a: ActivePrompt, winningOptionId: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [userId, pickedOption] of Object.entries(a.userVotes)) {
      out[userId] = pickedOption === winningOptionId ? a.baseReward : 0;
    }

    if (this.rankedScoring) {
      for (const [userId, pickedOption] of Object.entries(a.userVotes)) {
        if (pickedOption !== winningOptionId) {
          out[userId] = 0;
          continue;
        }
        const base = a.baseReward;
        out[userId] = a.userHotTakes?.[userId]
          ? Math.round(base * HOT_TAKE_MULTIPLIER)
          : base;
      }
      return out;
    }

    const totalVotes = Object.values(a.voteCounts).reduce((s, n) => s + n, 0);
    const winners = a.voteCounts[winningOptionId] ?? 0;
    if (totalVotes === 0 || winners === 0) {
      return {};
    }
    const share = winners / totalVotes;
    const multiplier = Math.min(1 / share, MAX_REWARD_MULTIPLIER);
    const reward = Math.round(a.baseReward * multiplier);

    for (const userId of Object.keys(out)) {
      out[userId] = out[userId]! > 0 ? reward : 0;
    }
    return out;
  }

  private snapshot(a: ActivePrompt): PromptInstance {
    // Return a structural clone so consumers can React-render without our
    // internal mutations causing missed re-renders.
    return {
      id: a.id,
      templateId: a.templateId,
      category: a.category,
      copy: a.copy,
      options: a.options,
      baseReward: a.baseReward,
      state: a.state,
      openedAtMinute: a.openedAtMinute,
      serverMinute: a.serverMinute,
      openedAtWallMs: a.openedAtWallMs,
      closesAtWallMs: a.closesAtWallMs,
      voteCounts: { ...a.voteCounts },
      userVotes: { ...a.userVotes },
      userHotTakes: a.userHotTakes ? { ...a.userHotTakes } : undefined,
      winningOptionId: a.winningOptionId,
      resolvedAtMinute: a.resolvedAtMinute,
      payouts: a.payouts ? { ...a.payouts } : undefined,
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _engine: PromptEngine | null = null;
export function getPromptEngine(): PromptEngine {
  if (!_engine) _engine = new PromptEngine();
  return _engine;
}
