/**
 * MatchPage — the single in-phone match view. Used by:
 *   /        → standalone (defaults userId=alice)
 *   /demo    → twice (alice + bob phones side-by-side)
 *   Watch Room → after host starts match from lobby
 */

import { ProfilePill } from '../components/ProfilePill';
import { MatchPoints } from '../components/MatchPoints';
import { MatchHeader } from '../components/MatchHeader';
import { EventFeed } from '../components/EventFeed';
import { SimControls } from '../components/SimControls';
import { BottomTabBar } from '../components/BottomTabBar';
import { PromptSheet } from '../components/PromptSheet';
import { Leaderboard } from '../components/Leaderboard';
import { RoomMemberSidebar } from '../components/RoomMemberSidebar';
import { ReactionBar } from '../components/ReactionBar';
import { ReactionStream } from '../components/ReactionStream';
import { BadgeToast } from '../components/BadgeToast';
import { useMatchData } from '../hooks/useMatchData';
import { useMatchSimState } from '../hooks/useMatchSimState';
import { useActivePrompt } from '../hooks/useActivePrompt';
import { useMatchPoints } from '../hooks/useMatchPoints';
import type { DemoUserId } from '../data/personas';
import type { RankedOpponent } from '../domain/rankedTypes';
import type { WatchRoomSession } from '../domain/watchRoomTypes';
import './MatchPage.css';

export interface MatchPageProps {
  userId: DemoUserId;
  hideSimControls?: boolean;
  onSwitchUser?: () => void;
  /** When set, enables Watch Room match UX (sidebar, live picks, room reactions). */
  watchRoom?: WatchRoomSession;
  onLeaveWatchRoom?: () => void;
  /** When set, ranked mode — hidden picks, no reactions or comments. */
  rankedOpponent?: RankedOpponent;
  onLeaveRanked?: () => void;
}

export function MatchPage({
  userId,
  hideSimControls = false,
  onSwitchUser,
  watchRoom,
  onLeaveWatchRoom,
  rankedOpponent,
  onLeaveRanked,
}: MatchPageProps) {
  const { info, ready, error } = useMatchData();
  const { clock, events, paused } = useMatchSimState();
  const { prompt, vote, myPickedOptionId } = useActivePrompt(userId);
  const { matchPoints } = useMatchPoints(userId);
  const inWatchRoom = !!watchRoom;
  const inRanked = !!rankedOpponent;
  const memberIds = watchRoom?.members.map((m) => m.userId);

  if (error) {
    return (
      <div className="mpage mpage--err">
        <div className="mpage__err">
          <h2>Couldn't load match data</h2>
          <p>{error}</p>
          <p className="mpage__err-hint">
            Run <code>npm run parse</code> to regenerate <code>public/events.json</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!ready || !info) {
    return (
      <div className="mpage mpage--loading">
        <div className="mpage__spinner" />
        <p>Loading match…</p>
      </div>
    );
  }

  const reactionsDisabled = clock.phase === 'preMatch' || inRanked;

  return (
    <div
      className={`mpage ${inWatchRoom ? 'mpage--watch-room' : ''} ${inRanked ? 'mpage--ranked' : ''} ${hideSimControls ? 'mpage--hide-sim' : ''}`}
    >
      <div className="mpage__body">
        <div className="mpage__main">
          <div className="mpage__topbar">
            <div className="mpage__topbar-start">
              {onSwitchUser && (
                <button
                  type="button"
                  className="mpage__switch-user"
                  onClick={onSwitchUser}
                  aria-label="Switch demo fan — choose Alice or Bob"
                >
                  <span className="mpage__switch-user-icon" aria-hidden="true">←</span>
                  <span className="mpage__switch-user-label">Switch fan</span>
                </button>
              )}
              {inWatchRoom && onLeaveWatchRoom && (
                <button
                  type="button"
                  className="mpage__switch-user"
                  onClick={onLeaveWatchRoom}
                  aria-label="Leave watch room"
                >
                  <span className="mpage__switch-user-icon" aria-hidden="true">←</span>
                  <span className="mpage__switch-user-label">Room</span>
                </button>
              )}
              {inRanked && onLeaveRanked && (
                <button
                  type="button"
                  className="mpage__switch-user"
                  onClick={onLeaveRanked}
                  aria-label="Leave ranked match"
                >
                  <span className="mpage__switch-user-icon" aria-hidden="true">←</span>
                  <span className="mpage__switch-user-label">Ranked</span>
                </button>
              )}
              <ProfilePill userId={userId} />
            </div>
            <MatchPoints value={matchPoints} />
          </div>
          {inRanked && rankedOpponent && (
            <div className="mpage__ranked-bar" aria-label="Ranked opponent">
              <span className="mpage__ranked-label">vs</span>
              <span className="mpage__ranked-opp">{rankedOpponent.opponentName}</span>
            </div>
          )}
          <MatchHeader info={info} clock={clock} />
          {!inWatchRoom && <Leaderboard viewerId={userId} />}
          <EventFeed events={events} info={info} viewerId={userId} />
          <div className="mpage__dock-wrap">
            {!inRanked && (
              <div className="mpage__rx-anchor">
                <ReactionBar
                  viewerId={userId}
                  disabled={reactionsDisabled}
                  roomId={watchRoom?.roomId}
                  memberIds={memberIds}
                />
              </div>
            )}
            <div className="mpage__dock">
              {!hideSimControls && <SimControls variant="inline" />}
              <BottomTabBar active="match" />
            </div>
          </div>
        </div>
      </div>
      {inWatchRoom && watchRoom && (
        <RoomMemberSidebar
          viewerId={userId}
          members={watchRoom.members}
          roomName={watchRoom.roomName}
        />
      )}
      <ReactionStream hidden={inRanked} />
      <PromptSheet
        prompt={prompt}
        myPickedOptionId={myPickedOptionId}
        viewerId={userId}
        onVote={vote}
        pickRevealMode={inWatchRoom ? 'live' : 'both-voted'}
        roomMembers={watchRoom?.members}
        roomId={inWatchRoom ? watchRoom?.roomId : undefined}
        matchPaused={paused}
      />
      <BadgeToast viewerId={userId} />
    </div>
  );
}
