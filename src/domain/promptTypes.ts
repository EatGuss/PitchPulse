/**
 * Prompt types — server-side authoritative model for the Matchday Shots feature
 * (PITCHPULSE.md §6.2). Gate 2 runs this in-browser via PromptEngine; Gate 4
 * moves it to a Lambda resolver against DynamoDB.
 *
 * Key invariants enforced everywhere these types are used:
 *   - 30-second answer window — closesAtMinute = openedAtMinute + 0.5
 *   - Vote validity checked at submit time against server-authoritative clock
 *   - Resolution NEVER happens during the open window (ADR-001 + brief DO-NOT)
 *   - Wrong predictions = 0 points, never negative
 *   - Per-match cap of 8 prompts total
 */

import type { NormalizedEvent } from './types';

/** When a prompt template should fire. */
export type PromptTrigger =
  | { kind: 'matchMinute'; minute: number }
  | { kind: 'onGoal' }
  | { kind: 'onHalfTime' };

/** One selectable option in a prompt. */
export interface PromptOption {
  id: string;
  label: string;
  /** Optional short subtitle shown under the label (e.g. score line). */
  sublabel?: string;
}

/** Context passed to a template's resolve() function. */
export interface PromptResolutionContext {
  /** Events emitted strictly AFTER the prompt opened (in chronological order). */
  eventsSince: NormalizedEvent[];
  /** Authoritative server match-minute right now. */
  currentMinute: number;
  /** When this prompt opened (match-time). */
  openedAtMinute: number;
  /** The full match info (teams, etc.) — handy for team-id-relative resolves. */
  homeTeamId: string;
  guestTeamId: string;
}

/**
 * A reusable prompt blueprint. Templates are stateless; one PromptInstance is
 * created per firing.
 */
export interface PromptTemplate {
  id: string;
  /** Short title shown at the top of the sheet, e.g. "GOAL HUNT". */
  category: string;
  /** Main question. May include {homeCode} / {guestCode} placeholders. */
  copy: string;
  trigger: PromptTrigger;
  /** Options the user picks between (always rendered as full-width stacked buttons). */
  options: PromptOption[];
  /** Point reward seed; effective reward = base × min(1/share, 5). */
  baseReward: number;
  /**
   * Inspect the post-open event log + clock to decide if/when this prompt
   * resolves. Returns the winning option id when ready, or null to keep waiting.
   * Must NEVER be called while the answer window is still open — the engine
   * gates calls behind currentMinute >= closesAtMinute.
   */
  resolve(ctx: PromptResolutionContext): string | null;
}

/** Lifecycle states of a live prompt. */
export type PromptState = 'open' | 'locked' | 'resolved' | 'voided';

/** A single firing of a template. Lives until 'resolved' or 'voided'. */
export interface PromptInstance {
  id: string;
  templateId: string;
  category: string;
  copy: string;
  options: PromptOption[];
  baseReward: number;
  state: PromptState;
  /** Match-time the prompt opened (display + narrative). */
  openedAtMinute: number;
  /** Server-authoritative "now" match-minute snapshot. */
  serverMinute: number;
  /** Wall-time (ms since epoch) the prompt opened — used for window enforcement. */
  openedAtWallMs: number;
  /**
   * Wall-time (ms since epoch) when the 30s answer window closes. The engine
   * checks `Date.now() >= closesAtWallMs` server-side; the UI mirrors this for
   * the countdown ring. Decoupled from match-clock so the window is always
   * 30 real seconds regardless of sim speed (ADR-001 server clock authority).
   */
  closesAtWallMs: number;
  /** Vote counts per optionId — visible to everyone (drives live %). */
  voteCounts: Record<string, number>;
  /** Per-user picks. Visible to user themselves; not shown to others in the sheet. */
  userVotes: Record<string, string>; // userId -> optionId
  winningOptionId?: string;
  resolvedAtMinute?: number;
  /** Per-user payout after resolution. */
  payouts?: Record<string, number>;  // userId -> match points
}

/** Per-user gamification state held by the engine. */
export interface UserState {
  userId: string;
  matchPoints: number;
  streak: number;        // consecutive correct predictions (Gate 3 surfaces visually)
  totalCorrect: number;  // for badges (Gate 3)
  totalVoted: number;
  history: Array<{ promptId: string; pickedOptionId: string; won: boolean; payout: number }>;
}

/** Reasons a prompt may not have fired even though its trigger condition matched. */
export type PromptSkipReason = 'cap_reached' | 'another_open' | 'past_full_time';
