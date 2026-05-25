import { useEffect, useState } from 'react';
import type { MatchdayScheduleContext } from '../domain/matchday';
import { getSimKickoffWallMs, subscribeMatchdaySchedule } from '../sim/matchdaySchedule';
import { useMatchSimState } from './useMatchSimState';

export function useMatchdaySchedule(): MatchdayScheduleContext {
  const { clock } = useMatchSimState();
  const [, bump] = useState(0);

  useEffect(() => subscribeMatchdaySchedule(() => bump((t) => t + 1)), []);

  useEffect(() => {
    const timer = setInterval(() => bump((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  return {
    clockPhase: clock.phase,
    isRunning: clock.isRunning,
    simKickoffWallMs: getSimKickoffWallMs(),
  };
}
