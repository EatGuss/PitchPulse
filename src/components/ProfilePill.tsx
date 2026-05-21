/**
 * ProfilePill — top-left of every screen. Avatar + name + team accent dot.
 * Coin balance is rendered separately by CoinBalance on the top-right.
 *
 * Gate 3: a 🔥N streak chip appears next to the name once the viewer's
 * consecutive-correct-predictions counter hits 2. The chip is driven by
 * useUserBalance so it updates in lock-step with leaderboard + toasts.
 */

import { DEMO_USERS, type DemoUserId } from '../data/personas';
import { teamAlias } from '../data/teamAliases';
import { useUserBalance } from '../hooks/useUserBalance';
import './ProfilePill.css';

export interface ProfilePillProps {
  userId: DemoUserId;
}

export function ProfilePill({ userId }: ProfilePillProps) {
  const user = DEMO_USERS[userId];
  const team = teamAlias(user.favoriteTeamId);
  const { streak } = useUserBalance(userId);

  return (
    <div className="ppill">
      <div className="ppill__avatar" aria-hidden="true">{user.avatar}</div>
      <div className="ppill__text">
        <div className="ppill__name">
          {user.displayName}
          <span className="ppill__team-dot" style={{ background: team.accent }} aria-hidden="true" />
          <span className="ppill__team-code">{team.code}</span>
          {streak >= 2 && (
            <span className="ppill__streak tabular" aria-label={`${streak} correct picks in a row`}>
              <span aria-hidden="true">🔥</span>
              {streak}
            </span>
          )}
        </div>
        <div className="ppill__archetype">{user.archetypeName}</div>
      </div>
    </div>
  );
}
