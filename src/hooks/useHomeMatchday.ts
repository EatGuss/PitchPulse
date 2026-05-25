import { useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import {
  getUserRankedMatchdayStatus,
  isPrimaryFixtureLive,
  resolveHeroState,
  subscribeMatchdayStore,
} from '../sim/matchdayStore';
import type { MatchdayHeroState, MatchdayScheduleContext } from '../domain/matchday';
import { useMatchdaySchedule } from './useMatchdaySchedule';

export interface HomeMatchdayState {
  heroState: MatchdayHeroState;
  rankedStatus: ReturnType<typeof getUserRankedMatchdayStatus>;
  matchSimLive: boolean;
  schedule: MatchdayScheduleContext;
}

export function useHomeMatchday(userId: DemoUserId): HomeMatchdayState {
  const schedule = useMatchdaySchedule();
  const [, bump] = useState(0);

  useEffect(() => subscribeMatchdayStore(() => bump((t) => t + 1)), []);

  const rankedStatus = getUserRankedMatchdayStatus(userId);
  const heroState = resolveHeroState(
    schedule.clockPhase,
    schedule.isRunning,
    rankedStatus,
    schedule.simKickoffWallMs,
  );
  const matchSimLive = isPrimaryFixtureLive(schedule.clockPhase, schedule.isRunning);

  return { heroState, rankedStatus, matchSimLive, schedule };
}
