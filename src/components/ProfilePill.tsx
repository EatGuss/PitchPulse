/**
 * ProfilePill — top-left of every screen. Avatar + name + team accent dot.
 * Coin balance is rendered separately by CoinBalance on the top-right.
 */

import { DEMO_USERS, type DemoUserId } from '../data/personas';
import { teamAlias } from '../data/teamAliases';
import './ProfilePill.css';

export interface ProfilePillProps {
  userId: DemoUserId;
}

export function ProfilePill({ userId }: ProfilePillProps) {
  const user = DEMO_USERS[userId];
  const team = teamAlias(user.favoriteTeamId);

  return (
    <div className="ppill">
      <div className="ppill__avatar" aria-hidden="true">{user.avatar}</div>
      <div className="ppill__text">
        <div className="ppill__name">
          {user.displayName}
          <span className="ppill__team-dot" style={{ background: team.accent }} aria-hidden="true" />
          <span className="ppill__team-code">{team.code}</span>
        </div>
        <div className="ppill__archetype">{user.archetypeName}</div>
      </div>
    </div>
  );
}
