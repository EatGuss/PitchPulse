/**
 * Browser-side replay-based match emitter.
 *
 * Loads the parsed events.json (produced by scripts/parse-match-xml.ts), runs a
 * sped-up match clock, and dispatches events through a shared TypedEventBus so
 * every <PhoneFrame> on the page reacts to the same moment in the same tick.
 *
 * Match cadence: 1 match-minute = SECONDS_PER_MATCH_MINUTE real seconds
 *   (default 2s → a 90' match plays in ~3 minutes wall clock — demo cadence).
 *
 * This sim runs in ONE tab. Both demo phone frames share its emissions because
 * they share the same browser context. When Gate 4 lands, this class is replaced
 * by an EventBridge-cron-triggered Lambda + AppSync subscription stream; the
 * UI API stays identical.
 */

import { TypedEventBus } from './eventBus';
import { bindMatchdaySchedule } from './matchdaySchedule';
import type { EventsFile, MatchClockState, NormalizedEvent } from '../domain/types';

export interface SimEventMap extends Record<string, unknown> {
  clock: MatchClockState;
  event: NormalizedEvent;
  /** Fired once when the sim is started (after events.json is loaded). */
  ready: { totalEvents: number };
  /** Fired when the demo controls reset the replay. */
  reset: void;
  /** Fired once when the sim reaches the final fullTime event. */
  end: { finalScore: { home: number; guest: number } };
}

const TICK_INTERVAL_MS = 100;
// Cast via an opt-typed view so headless verify scripts can import this
// module under Node where `import.meta.env` is undefined. Vite still injects
// the env object at build time; Node sees `undefined` and we fall back.
const _viteEnv = (import.meta as { env?: Partial<ImportMetaEnv> }).env;
const SECONDS_PER_MATCH_MINUTE = Number(
  _viteEnv?.VITE_SIM_SECONDS_PER_MATCH_MINUTE ?? 2,
);

export class MatchSim {
  readonly bus = new TypedEventBus<SimEventMap>();

  private events: NormalizedEvent[] = [];
  private cursor = 0;
  private startedAt: number | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private state: MatchClockState = {
    matchMinute: 0,
    displayClock: "0'",
    phase: 'preMatch',
    score: { home: 0, guest: 0 },
    isRunning: false,
  };
  private loaded = false;
  /**
   * AWS-mode only: tracks whether we've taken the server's clock score yet.
   * The first matchClock subscription frame bootstraps the local score so a
   * mid-match tab refresh sees the correct current score; every subsequent
   * clock arrival preserves the local score (which goal events drive). This
   * keeps the score-in-header in lockstep with the goal card landing in the
   * feed instead of jumping ahead by the AppSync subscription delivery race.
   */
  private hasBootstrappedScore = false;
  /**
   * Idempotency set for injected events. The AWS sim-emitter Lambda can be
   * invoked concurrently (manual invoke from start-match + EventBridge cron
   * safety-net), and each invocation rewrites the same seq#s with new
   * emittedAt timestamps. DDB Streams fans both writes through the
   * stream-handler → AppSync pipeline, so subscribers can see the same event
   * id more than once. Deduping here means we don't have to harden every
   * downstream consumer (feed, prompts, badges, reactions) individually.
   */
  private seenEventIds = new Set<string>();
  /** True while the demo Pause control has frozen the replay. */
  private paused = false;
  /** Events already emitted — for late-joining UI subscribers. */
  private deliveredEvents: NormalizedEvent[] = [];

  /** Fetches the prebuilt events.json. Idempotent. */
  async load(): Promise<void> {
    if (this.loaded) return;
    const res = await fetch('/events.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load /events.json (${res.status})`);
    const data: EventsFile = await res.json();
    this.events = data.events;
    this.loaded = true;
    this.bus.emit('ready', { totalEvents: this.events.length });
  }

  start(): void {
    if (!this.loaded) {
      throw new Error('MatchSim.start() called before load() — call await sim.load() first.');
    }
    if (this.intervalHandle) return; // already running

    this.paused = false;

    const freshKickoff = this.startedAt === null || this.state.phase === 'preMatch';

    if (freshKickoff) {
      this.deliveredEvents = [];
      this.startedAt = performance.now();
      this.cursor = 0;
      this.state = {
        matchMinute: 0,
        displayClock: "0'",
        phase: 'preMatch',
        score: { home: 0, guest: 0 },
        isRunning: true,
      };
    } else {
      // Resume after pause — preserve cursor and wall-clock anchor.
      const elapsedMatchMin = this.state.matchMinute;
      this.startedAt = performance.now() - elapsedMatchMin * SECONDS_PER_MATCH_MINUTE * 1000;
      this.state = { ...this.state, isRunning: true };
    }

    this.bus.emit('clock', this.state);
    this.intervalHandle = setInterval(this.tick, TICK_INTERVAL_MS);
  }

  pause(): void {
    if (this.paused || !this.state.isRunning) return;
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.paused = true;
    this.state = { ...this.state, isRunning: false };
    this.bus.emit('clock', this.state);
  }

  /** Resume after pause — local tick loop or AWS subscription unfreeze. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.startedAt === null && this.state.phase === 'preMatch') {
      this.start();
      return;
    }
    this.state = { ...this.state, isRunning: true };
    this.bus.emit('clock', this.state);
    if (this.loaded && this.intervalHandle === null && this.startedAt !== null) {
      this.startedAt = performance.now() - this.state.matchMinute * SECONDS_PER_MATCH_MINUTE * 1000;
      this.intervalHandle = setInterval(this.tick, TICK_INTERVAL_MS);
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.cursor = 0;
    this.startedAt = null;
    this.paused = false;
    this.hasBootstrappedScore = false;
    this.seenEventIds.clear();
    this.deliveredEvents = [];
    this.state = {
      matchMinute: 0,
      displayClock: "0'",
      phase: 'preMatch',
      score: { home: 0, guest: 0 },
      isRunning: false,
    };
    this.bus.emit('clock', this.state);
    this.bus.emit('reset', undefined);
    if (this.loaded) {
      // Cascade reset to prompt engine, event feed, badges, and reactions.
      this.bus.emit('ready', { totalEvents: this.events.length });
    }
  }

  getState(): MatchClockState {
    return this.state;
  }

  /** All events emitted so far (local replay + AWS injections). */
  getDeliveredEvents(): NormalizedEvent[] {
    return [...this.deliveredEvents];
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  // ── AWS bridge injection points (Gate 4) ───────────────────────────────────
  // In AWS mode the local tick loop never starts; instead the AppSync bridge
  // calls injectClock() / injectEvent() with payloads received over the
  // matchClock + matchEvent subscriptions. The UI consumes the same `clock`
  // and `event` bus topics as before — nothing downstream needs to change.

  /**
   * Replace clock state from an external source (AppSync subscription).
   *
   * Score handling is subtle: the matchClock payload always carries the
   * server's current score, but applying it directly causes the score in
   * <MatchHeader> to update milliseconds BEFORE the corresponding goal card
   * lands in <EventFeed>, because the matchClock and matchEvent subscriptions
   * arrive on independent WebSocket frames. To keep them visually in sync we
   * accept the clock's score only on the FIRST arrival (bootstrapping a
   * mid-match tab refresh) and preserve the local score on every clock after
   * that. The score then moves only when injectEvent() processes a goal.
   */
  injectClock(state: MatchClockState): void {
    if (this.paused) return;
    const score = this.hasBootstrappedScore ? this.state.score : state.score;
    this.hasBootstrappedScore = true;
    this.state = { ...state, score };
    this.bus.emit('clock', this.state);
  }

  /**
   * Inject a single normalized event from an external source.
   *
   * Drops the event if its id has already been delivered (see seenEventIds
   * above for the race that makes this necessary).
   *
   * For goal events we emit BOTH 'event' (feed card) and 'clock' (score
   * update) inside the same synchronous call so React batches them into a
   * single render — the score change and the goal card appear together.
   */
  injectEvent(event: NormalizedEvent): void {
    if (this.paused) return;
    if (this.seenEventIds.has(event.id)) return;
    this.seenEventIds.add(event.id);

    const scoreChanged =
      event.scoreAfter !== undefined &&
      (event.scoreAfter.home !== this.state.score.home ||
        event.scoreAfter.guest !== this.state.score.guest);
    if (scoreChanged && event.scoreAfter) {
      this.state = { ...this.state, score: event.scoreAfter };
    }
    this.deliveredEvents.push(event);
    this.bus.emit('event', event);
    // Emit the clock update AFTER the event so React's batched render shows
    // the goal card and updated score in the same frame.
    if (scoreChanged) {
      this.bus.emit('clock', this.state);
    }
    if (event.type === 'fullTime') {
      this.bus.emit('end', { finalScore: event.scoreAfter ?? this.state.score });
    }
  }

  // ── private ─────────────────────────────────────────────────────────────────

  private tick = (): void => {
    if (this.startedAt === null) return;
    const elapsedSec = (performance.now() - this.startedAt) / 1000;
    const matchMinute = elapsedSec / SECONDS_PER_MATCH_MINUTE;

    // Drain any due events.
    while (this.cursor < this.events.length && this.events[this.cursor].matchMinute <= matchMinute) {
      const ev = this.events[this.cursor++];
      this.deliveredEvents.push(ev);
      this.bus.emit('event', ev);
      if (ev.scoreAfter) this.state = { ...this.state, score: ev.scoreAfter };
      if (ev.type === 'fullTime') {
        this.bus.emit('end', { finalScore: ev.scoreAfter ?? this.state.score });
        this.pause();
        return;
      }
    }

    const phase = this.derivePhase(matchMinute);
    this.state = {
      ...this.state,
      matchMinute,
      displayClock: this.formatClock(matchMinute, phase),
      phase,
    };
    this.bus.emit('clock', this.state);
  };

  private derivePhase(matchMinute: number): MatchClockState['phase'] {
    // Use the last emitted event's phase as authoritative for HT/FT, since
    // those are explicit FinalWhistle events — but during simulation we may
    // be between events. Approximate from matchMinute when no signal yet.
    const lastEvent = this.events[this.cursor - 1];
    if (lastEvent) {
      if (lastEvent.type === 'fullTime') return 'fullTime';
      if (lastEvent.type === 'halfTime') return 'halfTime';
      if (lastEvent.matchPhase === 'secondHalf') return 'secondHalf';
      if (lastEvent.matchPhase === 'firstHalf') return 'firstHalf';
    }
    if (matchMinute < 0.05) return 'preMatch';
    if (matchMinute < 45) return 'firstHalf';
    if (matchMinute < 46) return 'halfTime';
    return 'secondHalf';
  }

  private formatClock(matchMinute: number, phase: MatchClockState['phase']): string {
    if (phase === 'halfTime') return 'HT';
    if (phase === 'fullTime') return 'FT';
    const minute = Math.floor(matchMinute);
    if (phase === 'firstHalf' && minute >= 45) return `45+${minute - 45}'`;
    if (phase === 'secondHalf' && minute >= 90) return `90+${minute - 90}'`;
    return `${minute}'`;
  }
}

// ─── Singleton shared by every component on the page ───────────────────────────
// One sim per browser tab = both demo phone frames receive the same emissions
// inside the same JS event-loop tick (the "<200ms parity" Gate 1 check).

let _singleton: MatchSim | null = null;
let _scheduleBound = false;
export function getMatchSim(): MatchSim {
  if (!_singleton) _singleton = new MatchSim();
  if (!_scheduleBound) {
    bindMatchdaySchedule(_singleton);
    _scheduleBound = true;
  }
  return _singleton;
}
