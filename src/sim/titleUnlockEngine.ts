/**
 * Title unlock bus + PromptEngine hooks (local ranked matches).
 */

import type { DemoUserId } from '../data/personas';
import { titleUnlockLabel } from '../domain/titleRules';
import { titleDisplayName } from '../domain/titles';
import { TypedEventBus } from './eventBus';
import { getMatchSim } from './matchSim';
import { getPromptEngine } from './promptEngine';
import {
  localEvaluateVolumeTitles,
  localRecordPromptShot,
  localUnlockTitlesFromMatch,
} from './localProfileStore';

export interface TitleUnlock {
  userId: DemoUserId;
  titleId: string;
  label: string;
}

const bus = new TypedEventBus<{ titleUnlocked: { unlock: TitleUnlock }; reset: void }>();

let halfTimePoints: Record<string, number> = {};
let attached = false;

export function getTitleUnlockBus() {
  return bus;
}

export function getHalfTimePointsSnapshot(): Record<string, number> {
  return { ...halfTimePoints };
}

export function attachTitleUnlockEngine(): void {
  if (attached) return;
  attached = true;

  const pe = getPromptEngine();
  const sim = getMatchSim();

  pe.bus.on('promptResolved', ({ prompt }) => {
    if (!pe.isRankedScoring() || !prompt.winningOptionId) return;
    for (const [userId, picked] of Object.entries(prompt.userVotes)) {
      const won = picked === prompt.winningOptionId;
      const ids = localRecordPromptShot(userId as DemoUserId, won);
      for (const titleId of ids) {
        bus.emit('titleUnlocked', {
          unlock: {
            userId: userId as DemoUserId,
            titleId,
            label: titleUnlockLabel(titleId),
          },
        });
      }
    }
  });

  sim.bus.on('clock', (clock) => {
    if (!pe.isRankedScoring() || clock.phase !== 'halfTime') return;
    halfTimePoints = {};
    for (const u of pe.getAllUsers()) {
      halfTimePoints[u.userId] = u.matchPoints;
    }
  });

  pe.bus.on('reset', () => {
    halfTimePoints = {};
    bus.emit('reset', undefined);
  });
}

export function resetTitleUnlockSession(): void {
  halfTimePoints = {};
}

export function finalizeRankedMatchTitles(
  winnerId: DemoUserId,
  loserId: DemoUserId,
): void {
  const pe = getPromptEngine();
  const winnerUser = pe.getUser(winnerId);
  const loserUser = pe.getUser(loserId);
  const ht = getHalfTimePointsSnapshot();

  const winnerEnd = {
    shotsInMatch: winnerUser?.totalVoted ?? 0,
    correctInMatch: winnerUser?.totalCorrect ?? 0,
    pointsAtHalfTime: ht[winnerId] ?? 0,
    opponentPointsAtHalfTime: ht[loserId] ?? 0,
    wonMatch: true,
  };
  const loserEnd = {
    shotsInMatch: loserUser?.totalVoted ?? 0,
    correctInMatch: loserUser?.totalCorrect ?? 0,
    pointsAtHalfTime: ht[loserId] ?? 0,
    opponentPointsAtHalfTime: ht[winnerId] ?? 0,
    wonMatch: false,
  };

  for (const [userId, end] of [
    [winnerId, winnerEnd],
    [loserId, loserEnd],
  ] as const) {
    const ids = [
      ...localUnlockTitlesFromMatch(userId, end),
      ...localEvaluateVolumeTitles(userId),
    ];
    for (const titleId of ids) {
      bus.emit('titleUnlocked', {
        unlock: {
          userId,
          titleId,
          label: `Title unlocked: ${titleDisplayName(titleId)}`,
        },
      });
    }
  }

  halfTimePoints = {};
}

export function finalizeRankedDrawMatchTitles(
  player1Id: DemoUserId,
  player2Id: DemoUserId,
): void {
  const pe = getPromptEngine();
  const ht = getHalfTimePointsSnapshot();

  for (const userId of [player1Id, player2Id] as const) {
    const user = pe.getUser(userId);
    const opponentId = userId === player1Id ? player2Id : player1Id;
    const end = {
      shotsInMatch: user?.totalVoted ?? 0,
      correctInMatch: user?.totalCorrect ?? 0,
      pointsAtHalfTime: ht[userId] ?? 0,
      opponentPointsAtHalfTime: ht[opponentId] ?? 0,
      wonMatch: false,
    };
    const ids = [
      ...localUnlockTitlesFromMatch(userId, end),
      ...localEvaluateVolumeTitles(userId),
    ];
    for (const titleId of ids) {
      bus.emit('titleUnlocked', {
        unlock: {
          userId,
          titleId,
          label: `Title unlocked: ${titleDisplayName(titleId)}`,
        },
      });
    }
  }

  halfTimePoints = {};
}

export function emitTitleUnlock(userId: DemoUserId, titleId: string): void {
  bus.emit('titleUnlocked', {
    unlock: { userId, titleId, label: titleUnlockLabel(titleId) },
  });
}
