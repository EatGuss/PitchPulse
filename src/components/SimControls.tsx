/**
 * SimControls — Gate-1-only dev/demo controls for the local MatchSim.
 *
 * Lives BETWEEN the two phones on /demo and at the bottom of the single-phone
 * view. NOT a production UI surface — when Gate 4 replaces the local sim with
 * EventBridge + Lambda, these controls are gated behind a hidden dev flag.
 */

import { useEffect, useState } from 'react';
import { getMatchSim } from '../sim/matchSim';
import { isAwsMode } from '../aws/config';
import { awsStartMatch } from '../aws/bridge';
import type { MatchClockState } from '../domain/types';
import './SimControls.css';

export interface SimControlsProps {
  /** Visual variant — 'demo' is the larger inter-phone bar, 'inline' is in-phone. */
  variant?: 'demo' | 'inline';
}

export function SimControls({ variant = 'inline' }: SimControlsProps) {
  const sim = getMatchSim();
  const [clock, setClock] = useState<MatchClockState>(sim.getState());
  const [pending, setPending] = useState(false);

  useEffect(() => {
    return sim.bus.on('clock', setClock);
  }, [sim]);

  const onStart = async () => {
    if (isAwsMode) {
      // AWS mode: the server-side sim-emitter Lambda owns the timeline.
      // Pause/reset on the client are local conveniences only — the source
      // of truth lives in DynamoDB CLOCK and is broadcast via AppSync.
      setPending(true);
      try {
        await awsStartMatch();
      } catch (err) {
        console.error('[simctl] awsStartMatch failed', err);
      } finally {
        setPending(false);
      }
      return;
    }
    sim.start();
  };

  const onPause = () => sim.pause();
  const onReset = () => sim.reset();

  const canStart = !pending && !clock.isRunning && clock.phase !== 'fullTime';
  const canPause = !isAwsMode && clock.isRunning;

  return (
    <div className={`simctl simctl--${variant}`} role="toolbar" aria-label="Match sim controls">
      {variant === 'demo' && (
        <div className="simctl__title">
          <span className="simctl__dot" />
          MATCH SIM · 1 match-min = {import.meta.env.VITE_SIM_SECONDS_PER_MATCH_MINUTE ?? 2}s
        </div>
      )}
      <div className="simctl__btns">
        <button
          type="button"
          className="simctl__btn simctl__btn--primary"
          disabled={!canStart}
          onClick={onStart}
        >
          {clock.phase === 'preMatch' ? '▶ Kick off' : '▶ Resume'}
        </button>
        <button type="button" className="simctl__btn" disabled={!canPause} onClick={onPause}>
          ❚❚ Pause
        </button>
        <button type="button" className="simctl__btn simctl__btn--ghost" onClick={onReset}>
          ↺ Reset
        </button>
      </div>
      {variant === 'demo' && (
        <div className="simctl__hint">
          Both phones below subscribe to the same emitter. Press Kick off to start the replay.
        </div>
      )}
    </div>
  );
}
