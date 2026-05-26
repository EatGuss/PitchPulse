/**
 * titleUnlocked subscription (AWS) — mirrors local titleUnlockEngine bus.
 */

import { generateClient } from 'aws-amplify/api';
import type { DemoUserId } from '../data/personas';
import { titleUnlockLabel } from '../domain/titleRules';
import { isAwsMode } from './config';
import { SUB_TITLE_UNLOCKED } from './operations';
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

  const client = generateClient();
  const sub = (
    client.graphql({
      query: SUB_TITLE_UNLOCKED,
      variables: { userId },
    }) as { subscribe: (handlers: {
      next: (v: { data?: SubPayload }) => void;
      error?: (err: unknown) => void;
    }) => { unsubscribe: () => void } }
  ).subscribe({
    next: ({ data }) => {
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

  return () => sub.unsubscribe();
}

/** After AWS equip/unlock paths — surface toast on this device. */
export function notifyLocalTitleUnlock(userId: DemoUserId, titleId: string): void {
  emitTitleUnlock(userId, titleId);
}
