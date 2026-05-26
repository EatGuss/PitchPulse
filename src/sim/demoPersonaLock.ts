/**
 * In-memory demo persona lock — one Alice and one Bob per browser tab (/demo).
 * No localStorage (challenge brief).
 */

import type { DemoUserId } from '../data/personas';

const claimed = new Map<DemoUserId, symbol>();

export function claimDemoPersona(userId: DemoUserId, token: symbol): boolean {
  const existing = claimed.get(userId);
  if (existing && existing !== token) return false;
  claimed.set(userId, token);
  return true;
}

export function releaseDemoPersona(userId: DemoUserId, token: symbol): void {
  if (claimed.get(userId) === token) {
    claimed.delete(userId);
  }
}

export function isDemoPersonaAvailable(userId: DemoUserId): boolean {
  return !claimed.has(userId);
}

export function otherDemoPersona(userId: DemoUserId): DemoUserId {
  return userId === 'alice' ? 'bob' : 'alice';
}
