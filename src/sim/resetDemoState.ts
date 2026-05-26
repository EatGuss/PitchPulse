/**
 * Dev-only client reset — ranked matchday, standings seeds, local rooms.
 * Does not clear AWS DynamoDB; hard refresh may re-hydrate from the server.
 */

import { isAwsMode } from '../aws/config';
import { DEMO_USERS, type DemoUserId } from '../data/personas';
import { resetLocalLeaderboardStore } from './localLeaderboardStore';
import { resetLocalProfileStore } from './localProfileStore';
import { resetTitleUnlockSession } from './titleUnlockEngine';
import { resetHotTakeState } from './hotTakeStore';
import { resetLocalRoomStore } from './localRoomStore';
import { resetRankedMatchdayPlay } from './matchdayStore';
import { clearMinimizedWatchRoom } from './watchRoomMinimizedStore';

export interface ResetDemoStateResult {
  awsMode: boolean;
  localRoomsCleared: boolean;
}

export function resetDemoClientState(): ResetDemoStateResult {
  resetRankedMatchdayPlay();
  resetLocalLeaderboardStore();
  resetLocalProfileStore();
  resetTitleUnlockSession();
  resetHotTakeState();

  for (const userId of Object.keys(DEMO_USERS) as DemoUserId[]) {
    clearMinimizedWatchRoom(userId);
  }

  let localRoomsCleared = false;
  if (!isAwsMode) {
    resetLocalRoomStore();
    localRoomsCleared = true;
  }

  console.info('[demo-reset] client state cleared', {
    ranked: 'all users',
    standings: 'seed values',
    localRooms: localRoomsCleared,
    awsMode: isAwsMode,
  });

  return { awsMode: isAwsMode, localRoomsCleared };
}
