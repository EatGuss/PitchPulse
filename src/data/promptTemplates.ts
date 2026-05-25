/**
 * Prompt template catalog for Matchday Shots.
 *
 * Sized for the 8-prompts-per-match cap (PITCHPULSE.md §6.2): we register 6
 * deterministic templates that span minute-triggered, event-triggered, and
 * half-time-triggered families. The PromptEngine enforces the cap and the
 * "only one open at a time" rule — if a trigger fires while another prompt
 * is mid-window, the new one is dropped (event-triggered preempt rule).
 *
 * Resolution functions are pure: given (eventsSince, currentMinute) they
 * deterministically return a winning option id or null. No side effects.
 *
 * Reward math (spec):  payout = baseReward × min(1 / vote_share, 5.0)
 * Wrong = 0 points, never negative. Implemented in PromptEngine.resolve().
 */

import type { PromptTemplate } from '../domain/promptTypes';
import { TEAM_ALIASES } from './teamAliases';

const FCB_ID = 'DFL-CLU-000001';
const BVB_ID = 'DFL-CLU-000002';
const FCB_CODE = TEAM_ALIASES[FCB_ID].code;
const BVB_CODE = TEAM_ALIASES[BVB_ID].code;

// Helper: did a goal occur for `teamId` in the events-since window?
function hasGoalFor(events: { type: string; teamId?: string }[], teamId: string): boolean {
  return events.some((e) => e.type === 'goal' && e.teamId === teamId);
}
function hasAnyGoal(events: { type: string }[]): boolean {
  return events.some((e) => e.type === 'goal');
}
function hasAnyCard(events: { type: string }[]): boolean {
  return events.some((e) => e.type === 'card');
}
function lastFullTime(events: { type: string }[]): boolean {
  return events.some((e) => e.type === 'fullTime');
}
function lastHalfTime(events: { type: string }[]): boolean {
  return events.some((e) => e.type === 'halfTime');
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // 1. Min 20 — will FCB score in the next 10 minutes?
  {
    id: 'fcb-scores-next-10-at-20',
    category: 'Goal hunt',
    copy: `Will ${FCB_CODE} score in the next 10 minutes?`,
    trigger: { kind: 'matchMinute', minute: 20 },
    baseReward: 200,
    options: [
      { id: 'yes', label: 'Yes', sublabel: `${FCB_CODE} to score by 30'` },
      { id: 'no',  label: 'No',  sublabel: 'No goal or BVB scores first' },
    ],
    resolve: ({ eventsSince, currentMinute }) => {
      if (hasGoalFor(eventsSince, FCB_ID)) return 'yes';
      if (currentMinute >= 30) return 'no';
      return null;
    },
  },

  // 2. Min 40 — another card before HT?
  {
    id: 'another-card-before-ht',
    category: 'Card watch',
    copy: 'Will there be another card before half-time?',
    trigger: { kind: 'matchMinute', minute: 40 },
    baseReward: 150,
    options: [
      { id: 'yes', label: 'Yes' },
      { id: 'no',  label: 'No' },
    ],
    resolve: ({ eventsSince }) => {
      if (hasAnyCard(eventsSince)) return 'yes';
      if (lastHalfTime(eventsSince)) return 'no';
      return null;
    },
  },

  // 3. On HT — call the final result
  {
    id: 'final-result-at-ht',
    category: 'Final call',
    copy: 'How does this match finish?',
    trigger: { kind: 'onHalfTime' },
    baseReward: 400,
    options: [
      { id: 'home', label: `${FCB_CODE} win` },
      { id: 'draw', label: 'Draw' },
      { id: 'away', label: `${BVB_CODE} win` },
    ],
    resolve: ({ eventsSince }) => {
      const ft = eventsSince.find((e) => e.type === 'fullTime');
      if (!ft || !ft.scoreAfter) return null;
      const { home, guest } = ft.scoreAfter;
      if (home > guest) return 'home';
      if (guest > home) return 'away';
      return 'draw';
    },
  },

  // 4. Min 65 — will BVB score in next 10?
  {
    id: 'bvb-scores-next-10-at-65',
    category: 'Goal hunt',
    copy: `Will ${BVB_CODE} score in the next 10 minutes?`,
    trigger: { kind: 'matchMinute', minute: 65 },
    baseReward: 250,
    options: [
      { id: 'yes', label: 'Yes', sublabel: `${BVB_CODE} to score by 75'` },
      { id: 'no',  label: 'No' },
    ],
    resolve: ({ eventsSince, currentMinute }) => {
      if (hasGoalFor(eventsSince, BVB_ID)) return 'yes';
      if (currentMinute >= 75) return 'no';
      return null;
    },
  },

  // 5. Min 80 — any goal in last 10 minutes?
  {
    id: 'any-goal-last-10',
    category: 'Final whistle',
    copy: 'Will there be a goal in the last 10 minutes?',
    trigger: { kind: 'matchMinute', minute: 80 },
    baseReward: 200,
    options: [
      { id: 'yes', label: 'Yes', sublabel: 'Anyone scores 80–FT' },
      { id: 'no',  label: 'No',  sublabel: 'Match ends with current score' },
    ],
    resolve: ({ eventsSince }) => {
      if (hasAnyGoal(eventsSince)) return 'yes';
      if (lastFullTime(eventsSince)) return 'no';
      return null;
    },
  },

  // 6. On goal — who scores next?
  // Fires the FIRST time a goal happens (engine guards against re-fire because
  // the open-prompt rule blocks until first resolves; each goal afterwards is
  // a candidate trigger but cap or open-state usually blocks them — by design).
  {
    id: 'who-scores-next',
    category: 'Goal hunt',
    copy: 'Who scores next?',
    trigger: { kind: 'onGoal' },
    baseReward: 300,
    options: [
      { id: 'home',    label: `${FCB_CODE}` },
      { id: 'away',    label: `${BVB_CODE}` },
      { id: 'neither', label: 'Neither (no more goals before HT)' },
    ],
    resolve: ({ eventsSince, openedAtMinute }) => {
      const nextGoal = eventsSince.find((e) => e.type === 'goal');
      if (nextGoal) {
        if (nextGoal.teamId === FCB_ID) return 'home';
        if (nextGoal.teamId === BVB_ID) return 'away';
      }
      // If HT (or FT) arrived without another goal AND we were in the first half
      // when we opened, "neither" wins.
      if (openedAtMinute < 45 && lastHalfTime(eventsSince)) return 'neither';
      if (lastFullTime(eventsSince)) return 'neither';
      return null;
    },
  },
];
