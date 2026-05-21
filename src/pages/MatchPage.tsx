/**
 * MatchPage — the single in-phone match view. Used by:
 *   /        → standalone (defaults userId=alice)
 *   /demo    → twice (alice + bob phones side-by-side)
 *
 * Pure render: state comes from useMatchData (info JSON) + useMatchSimState
 * (live clock + events). Top of phone = ProfilePill + CoinBalance.
 * Middle = MatchHeader (score chip) + EventFeed.
 * Bottom = SimControls (dev-only) + BottomTabBar (mobile chrome).
 */

import { ProfilePill } from '../components/ProfilePill';
import { CoinBalance } from '../components/CoinBalance';
import { MatchHeader } from '../components/MatchHeader';
import { EventFeed } from '../components/EventFeed';
import { SimControls } from '../components/SimControls';
import { BottomTabBar } from '../components/BottomTabBar';
import { PromptSheet } from '../components/PromptSheet';
import { Leaderboard } from '../components/Leaderboard';
import { ReactionBar } from '../components/ReactionBar';
import { ReactionStream } from '../components/ReactionStream';
import { BadgeToast } from '../components/BadgeToast';
import { useMatchData } from '../hooks/useMatchData';
import { useMatchSimState } from '../hooks/useMatchSimState';
import { useActivePrompt } from '../hooks/useActivePrompt';
import { useUserBalance } from '../hooks/useUserBalance';
import type { DemoUserId } from '../data/personas';
import './MatchPage.css';

export interface MatchPageProps {
  userId: DemoUserId;
  /** Hide the dev sim controls (useful on /demo where the controls live between phones). */
  hideSimControls?: boolean;
}

export function MatchPage({ userId, hideSimControls = false }: MatchPageProps) {
  const { info, ready, error } = useMatchData();
  const { clock, events } = useMatchSimState();
  const { prompt, vote, myPickedOptionId } = useActivePrompt(userId);
  const { balance } = useUserBalance(userId);

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

  // Reactions are gated to "match in progress" — pre-match the bar is dimmed
  // so taps don't fire ghost reactions while alice/bob are still onboarding.
  const reactionsDisabled = clock.phase === 'preMatch';

  return (
    <div className="mpage">
      <div className="mpage__topbar">
        <ProfilePill userId={userId} />
        <CoinBalance value={balance} />
      </div>
      <MatchHeader info={info} clock={clock} />
      <Leaderboard viewerId={userId} />
      <EventFeed events={events} info={info} viewerId={userId} />
      <ReactionBar viewerId={userId} disabled={reactionsDisabled} />
      {!hideSimControls && <SimControls variant="inline" />}
      <BottomTabBar active="match" />
      <ReactionStream />
      <PromptSheet prompt={prompt} myPickedOptionId={myPickedOptionId} viewerId={userId} onVote={vote} />
      <BadgeToast viewerId={userId} />
    </div>
  );
}
