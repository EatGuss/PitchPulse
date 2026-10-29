/**
 * titleUnlocked subscription (AWS) — mirrors local titleUnlockEngine bus.
 */

import type { DemoUserId } from '../data/personas';
import { titleUnlockLabel } from '../domain/titleRules';
import { isAwsMode } from './config';
import { SUB_TITLE_UNLOCKED } from './operations';
import { gqlSubscribe } from './session';
import { localUnlockTitle } from '../sim/localProfileStore';
import type { TitleUnlock } from '../sim/titleUnlockEngine';
import { emitTitleUnlock } from '../sim/titleUnlockEngine';

type SubPayload = {
  titleUnlocked: { userId: string; titleId: string; titleName: string; ts: number };
};

export function subscribeTitleUnlocked(
  userId: DemoUserId,
  onUnlock: (unlock: TitleUnlock) => void,
): () => void {
  if (!isAwsMode) return () => {};

  return gqlSubscribe<SubPayload>(userId, SUB_TITLE_UNLOCKED, { userId }, {
    next: (data) => {
      const evt = data?.titleUnlocked;
      if (!evt || evt.userId !== userId) return;
      localUnlockTitle(userId, evt.titleId);
      const unlock: TitleUnlock = {
        userId,
        titleId: evt.titleId,
        label: titleUnlockLabel(evt.titleId),
      };
      onUnlock(unlock);
    },
    error: (err) => console.warn('[title] subscription error', err),
  });
}

/** After AWS equip/unlock paths — surface toast on this device. */
export function notifyLocalTitleUnlock(userId: DemoUserId, titleId: string): void {
  emitTitleUnlock(userId, titleId);
}
