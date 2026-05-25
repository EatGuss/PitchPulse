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
import { awsResetMatch, awsStartMatch } from '../aws/bridge';
import { resetDemoClientState } from '../sim/resetDemoState';
import type { MatchClockState } from '../domain/types';
import './SimControls.css';

const isDevBuild = import.meta.env.DEV;

export interface SimControlsProps {
  /** Visual variant — 'demo' is the larger inter-phone bar, 'inline' is in-phone. */
  variant?: 'demo' | 'inline';
}

export function SimControls({ variant = 'inline' }: SimControlsProps) {
  const sim = getMatchSim();
  const [clock, setClock] = useState<MatchClockState>(sim.getState());
  const [paused, setPaused] = useState(() => sim.isPaused());
  const [pending, setPending] = useState(false);
  const [demoResetNote, setDemoResetNote] = useState<string | null>(null);

  useEffect(() => {
    return sim.bus.on('clock', (c) => {
      setClock(c);
      setPaused(sim.isPaused());
    });
  }, [sim]);

  const onStart = async () => {
    if (sim.isPaused()) {
      sim.resume();
      return;
    }
    if (isAwsMode) {
      // AWS mode: the server-side sim-emitter Lambda owns the timeline.
      // Pause freezes the client view; resume unblocks AppSync injects.
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

  const onReset = async () => {
    if (isAwsMode) {
      setPending(true);
      try {
        await awsResetMatch();
      } catch (err) {
        console.error('[simctl] awsResetMatch failed', err);
      } finally {
        setPending(false);
      }
      return;
    }
    sim.reset();
  };

  const onResetDemoState = () => {
    const result = resetDemoClientState();
    setDemoResetNote(
      result.awsMode
        ? 'Demo state cleared locally. AWS ranked/standings may return after refresh.'
        : 'Demo state cleared — ranked, standings, and rooms reset.',
    );
    window.setTimeout(() => setDemoResetNote(null), 4000);
  };

  const canStart =
    !pending &&
    (paused || (!clock.isRunning && clock.phase !== 'fullTime'));
  const canPause =
    !pending &&
    clock.isRunning &&
    !paused &&
    clock.phase !== 'fullTime' &&
    clock.phase !== 'preMatch';

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
          {paused ? '▶ Resume' : clock.phase === 'preMatch' ? '▶ Kick off' : '▶ Resume'}
        </button>
        <button type="button" className="simctl__btn" disabled={!canPause} onClick={onPause}>
          ❚❚ Pause
        </button>
        <button type="button" className="simctl__btn simctl__btn--ghost" onClick={onReset}>
          ↺ Reset
        </button>
        {isDevBuild ? (
          <button
            type="button"
            className="simctl__btn simctl__btn--ghost simctl__btn--dev"
            onClick={onResetDemoState}
            title="Clears ranked matchday, standings seeds, and local watch rooms"
          >
            ⌫ Demo state
          </button>
        ) : null}
      </div>
      {demoResetNote ? (
        <p className="simctl__reset-note" role="status">
          {demoResetNote}
        </p>
      ) : null}
      {variant === 'demo' && (
        <div className="simctl__hint">
          Both phones below subscribe to the same emitter. Press Kick off to start the replay.
          {isDevBuild ? ' Use Demo state to clear ranked + standings between test runs.' : null}
        </div>
      )}
    </div>
  );
}
