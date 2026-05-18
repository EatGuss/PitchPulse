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
import type { EventsFile, MatchClockState, NormalizedEvent } from '../domain/types';

export interface SimEventMap extends Record<string, unknown> {
  clock: MatchClockState;
  event: NormalizedEvent;
  /** Fired once when the sim is started (after events.json is loaded). */
  ready: { totalEvents: number };
  /** Fired once when the sim reaches the final fullTime event. */
  end: { finalScore: { home: number; guest: number } };
}

const TICK_INTERVAL_MS = 100;
const SECONDS_PER_MATCH_MINUTE = Number(
  import.meta.env.VITE_SIM_SECONDS_PER_MATCH_MINUTE ?? 2,
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
    this.startedAt = performance.now();
    this.cursor = 0;
    this.state = {
      matchMinute: 0,
      displayClock: "0'",
      phase: 'preMatch',
      score: { home: 0, guest: 0 },
      isRunning: true,
    };
    this.bus.emit('clock', this.state);
    this.intervalHandle = setInterval(this.tick, TICK_INTERVAL_MS);
  }

  pause(): void {
    if (!this.intervalHandle) return;
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    this.state = { ...this.state, isRunning: false };
    this.bus.emit('clock', this.state);
  }

  reset(): void {
    this.pause();
    this.cursor = 0;
    this.startedAt = null;
    this.state = {
      matchMinute: 0,
      displayClock: "0'",
      phase: 'preMatch',
      score: { home: 0, guest: 0 },
      isRunning: false,
    };
    this.bus.emit('clock', this.state);
  }

  getState(): MatchClockState {
    return this.state;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  // ── private ─────────────────────────────────────────────────────────────────

  private tick = (): void => {
    if (this.startedAt === null) return;
    const elapsedSec = (performance.now() - this.startedAt) / 1000;
    const matchMinute = elapsedSec / SECONDS_PER_MATCH_MINUTE;

    // Drain any due events.
    while (this.cursor < this.events.length && this.events[this.cursor].matchMinute <= matchMinute) {
      const ev = this.events[this.cursor++];
      this.bus.emit('event', ev);
      if (ev.scoreAfter) this.state = { ...this.state, score: ev.scoreAfter };
      if (ev.type === 'fullTime') {
        this.bus.emit('end', { finalScore: ev.scoreAfter ?? this.state.score });
        this.pause();
        return;
      }
    }

    // Compute display state from latest matchMinute + latest known phase from events.
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
export function getMatchSim(): MatchSim {
  if (!_singleton) _singleton = new MatchSim();
  return _singleton;
}
