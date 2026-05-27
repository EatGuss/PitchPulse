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
import {
  SECOND_HALF_START_MINUTE,
  type EventsFile,
  type MatchClockState,
  type NormalizedEvent,
} from '../domain/types';
import { formatDisplayClock } from '../utils/matchClock';

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
/** Real-time pause at HT before the clock resumes at 46'. */
const HT_BREAK_REAL_MS = Number(_viteEnv?.VITE_HT_BREAK_MS ?? 4_000);

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
   * downstream consumer (feed, prompts, reactions) individually.
   */
  private seenEventIds = new Set<string>();
  /** True while the demo Pause control has frozen the replay. */
  private paused = false;
  /** Events already emitted — for late-joining UI subscribers. */
  private deliveredEvents: NormalizedEvent[] = [];
  /** Set once the half-time whistle event has been emitted — gates 2H playback. */
  private halfTimeEmitted = false;
  /** Wall-clock HT break: timer frozen at HT until 2H resumes at 46'. */
  private inHalfTimeBreak = false;
  private halfTimeBreakEndsAt = 0;
  private frozenMatchMinute = 45.03;
  private halfTimeWhistleMinute = 45.03;
  /** True only after the HT break ends and the clock resumes at 46'. */
  private secondHalfStarted = false;
  /** Last 45+ display from a delivered 1H event (prevents 46/52 jumps before HT). */
  private lastStoppageDisplay = "45'";
  /** Index of the halfTime whistle row in events.json. */
  private halfTimeEventIndex = -1;
  /** Index of the post-HT kick-off (2H starts at 46'). */
  private secondHalfStartIndex = -1;

  /** Fetches the prebuilt events.json. Idempotent. */
  async load(): Promise<void> {
    if (this.loaded) return;
    const res = await fetch('/events.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load /events.json (${res.status})`);
    const data: EventsFile = await res.json();
    this.events = data.events;
    this.halfTimeEmitted = false;
    this.inHalfTimeBreak = false;
    this.secondHalfStarted = false;
    this.lastStoppageDisplay = "45'";
    this.halfTimeEventIndex = this.events.findIndex((e) => e.type === 'halfTime');
    this.secondHalfStartIndex = this.events.findIndex(
      (e) => e.kickOffRole === 'secondHalfStart',
    );
    const ht =
      this.halfTimeEventIndex >= 0 ? this.events[this.halfTimeEventIndex] : undefined;
    if (ht) {
      this.halfTimeWhistleMinute = ht.matchMinute;
      this.frozenMatchMinute = ht.matchMinute;
    }
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
      this.halfTimeEmitted = false;
      this.inHalfTimeBreak = false;
      this.secondHalfStarted = false;
      this.lastStoppageDisplay = "45'";
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
    this.halfTimeEmitted = false;
    this.inHalfTimeBreak = false;
    this.secondHalfStarted = false;
    this.lastStoppageDisplay = "45'";
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
      // Cascade reset to prompt engine, event feed, and reactions.
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
    this.secondHalfStarted =
      state.phase === 'secondHalf' ||
      state.matchMinute >= SECOND_HALF_START_MINUTE - 0.001;
    this.halfTimeEmitted =
      this.secondHalfStarted ||
      state.phase === 'halfTime' ||
      state.displayClock === 'HT';
    this.inHalfTimeBreak = state.phase === 'halfTime' && !this.secondHalfStarted;
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
    // AWS controls emission order — never drop injected rows (defer only applies to local drain).
    this.seenEventIds.add(event.id);

    const scoreChanged =
      event.scoreAfter !== undefined &&
      (event.scoreAfter.home !== this.state.score.home ||
        event.scoreAfter.guest !== this.state.score.guest);
    if (scoreChanged && event.scoreAfter) {
      this.state = { ...this.state, score: event.scoreAfter };
    }
    this.applyEventDelivery(event);
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

    if (this.inHalfTimeBreak) {
      this.drainDueEvents(this.frozenMatchMinute);
      if (performance.now() < this.halfTimeBreakEndsAt) {
        this.publishClock(this.frozenMatchMinute, 'halfTime', 'HT');
        return;
      }
      this.endHalfTimeBreak();
    }

    const elapsedSec = (performance.now() - this.startedAt) / 1000;
    let matchMinute = elapsedSec / SECONDS_PER_MATCH_MINUTE;

    if (!this.secondHalfStarted) {
      matchMinute = Math.min(matchMinute, this.halfTimeWhistleMinute);
    } else {
      matchMinute = Math.max(matchMinute, SECOND_HALF_START_MINUTE);
    }

    this.drainDueEvents(matchMinute);

    if (this.inHalfTimeBreak) {
      this.publishClock(this.frozenMatchMinute, 'halfTime', 'HT');
      return;
    }

    const phase = this.derivePhase(matchMinute);
    const displayClock = this.formatClock(matchMinute, phase);
    this.publishClock(
      this.secondHalfStarted ? matchMinute : Math.min(matchMinute, this.halfTimeWhistleMinute),
      phase,
      displayClock,
    );
  };

  /** HT break over — flush HT-window rows, then snap the clock to 46'. */
  private endHalfTimeBreak(): void {
    this.inHalfTimeBreak = false;
    this.drainHalfTimeWindowEvents();
    this.secondHalfStarted = true;
    this.startedAt =
      performance.now() - SECOND_HALF_START_MINUTE * SECONDS_PER_MATCH_MINUTE * 1000;
    this.drainDueEvents(SECOND_HALF_START_MINUTE);
    const phase = this.derivePhase(SECOND_HALF_START_MINUTE);
    this.publishClock(
      SECOND_HALF_START_MINUTE,
      phase,
      formatDisplayClock(SECOND_HALF_START_MINUTE, phase),
    );
  }

  /** Emit substitution rows that share the HT minute (45.03) before 2H kick-off. */
  private drainHalfTimeWindowEvents(): void {
    if (this.secondHalfStartIndex < 0) return;
    while (this.cursor < this.secondHalfStartIndex) {
      const ev = this.events[this.cursor];
      if (ev.matchMinute > this.frozenMatchMinute + 0.0001) break;
      if (this.shouldDeferEvent(ev)) break;
      this.cursor += 1;
      this.applyEventDelivery(ev);
    }
  }

  private publishClock(
    matchMinute: number,
    phase: MatchClockState['phase'],
    displayClock: string,
  ): void {
    this.state = {
      ...this.state,
      matchMinute,
      displayClock,
      phase,
    };
    this.bus.emit('clock', this.state);
  }

  /**
   * 1H events only until the HT whistle; 2H only after HT has been emitted.
   * Defers (does not skip) out-of-order rows so the cursor catches up once HT fires.
   */
  private shouldDeferEvent(ev: NormalizedEvent): boolean {
    if (this.secondHalfStarted) {
      return (
        ev.matchPhase === 'firstHalf' ||
        ev.type === 'halfTime' ||
        ev.matchPhase === 'halfTime'
      );
    }
    if (ev.matchPhase === 'secondHalf' || ev.kickOffRole === 'secondHalfStart') {
      return true;
    }
    if (this.halfTimeEmitted && ev.matchPhase === 'firstHalf') {
      return true;
    }
    return false;
  }

  private applyEventDelivery(ev: NormalizedEvent): void {
    this.deliveredEvents.push(ev);
    this.bus.emit('event', ev);
    if (ev.matchPhase === 'firstHalf' && ev.matchMinute >= 45) {
      this.lastStoppageDisplay = ev.displayMinute;
      if (!this.secondHalfStarted && !this.inHalfTimeBreak) {
        this.publishClock(ev.matchMinute, 'firstHalf', ev.displayMinute);
      }
    }
    if (ev.type === 'halfTime') {
      this.halfTimeEmitted = true;
      this.inHalfTimeBreak = true;
      this.frozenMatchMinute = ev.matchMinute;
      this.halfTimeWhistleMinute = ev.matchMinute;
      this.halfTimeBreakEndsAt = performance.now() + HT_BREAK_REAL_MS;
      this.publishClock(ev.matchMinute, 'halfTime', 'HT');
    }
    if (ev.scoreAfter) this.state = { ...this.state, score: ev.scoreAfter };
    if (ev.type === 'fullTime') {
      // Publish the fullTime phase BEFORE pausing. Symmetric with the
      // halfTime branch above. Critical for two reasons:
      //   1. AWS mode: the matchClock subscription that carries phase='fullTime'
      //      arrives AFTER this event; pause() sets this.paused=true and
      //      injectClock() then early-returns, so without this line the
      //      client never sees phase='fullTime' and the post-match outcome
      //      screen never triggers.
      //   2. Local mode: removes the race where the bus emits 'event' (FT
      //      card) and pause's 'clock' (still phase='secondHalf') before
      //      the next publishClock catches up.
      this.publishClock(ev.matchMinute, 'fullTime', ev.displayMinute || 'FT');
      this.bus.emit('end', { finalScore: ev.scoreAfter ?? this.state.score });
      this.pause();
    }
  }

  private drainDueEvents(matchMinute: number): void {
    while (this.cursor < this.events.length) {
      const ev = this.events[this.cursor];
      if (ev.matchMinute > matchMinute) break;
      if (this.shouldDeferEvent(ev)) break;
      this.cursor += 1;
      this.applyEventDelivery(ev);
      if (ev.type === 'fullTime') return;
    }
  }

  private derivePhase(matchMinute: number): MatchClockState['phase'] {
    if (this.secondHalfStarted) {
      const lastEvent = this.events[this.cursor - 1];
      if (lastEvent?.type === 'fullTime') return 'fullTime';
      return 'secondHalf';
    }
    if (this.inHalfTimeBreak) return 'halfTime';
    if (matchMinute < 0.05) return 'preMatch';
    return 'firstHalf';
  }

  private formatClock(matchMinute: number, phase: MatchClockState['phase']): string {
    if (phase === 'fullTime') return 'FT';
    if (this.secondHalfStarted) {
      return formatDisplayClock(matchMinute, 'secondHalf');
    }
    if (this.inHalfTimeBreak) return 'HT';
    if (matchMinute >= 45) return this.lastStoppageDisplay;
    return formatDisplayClock(matchMinute, phase);
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
