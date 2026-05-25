import { DEMO_USERS, type DemoUserId } from '../data/personas';
import { teamAlias } from '../data/teamAliases';
import type { PlayMode } from '../domain/playMode';
import { ModeCard } from './ModeCard';
import './ModePicker.css';

export interface ModePickerProps {
  userId: DemoUserId;
  onSelectMode: (mode: PlayMode) => void;
  onSwitchUser?: () => void;
}

export function ModePicker({ userId, onSelectMode, onSwitchUser }: ModePickerProps) {
  const user = DEMO_USERS[userId];
  const team = teamAlias(user.favoriteTeamId);

  return (
    <div className="mode-picker" role="main" aria-label="Choose how to play">
      <div className="mode-picker__hero">
        {onSwitchUser && (
          <button
            type="button"
            className="mode-picker__back"
            onClick={onSwitchUser}
            aria-label="Switch demo fan"
          >
            ← Switch fan
          </button>
        )}
        <div className="mode-picker__brand">
          <span className="mode-picker__brand-dot" aria-hidden="true" />
          <span className="mode-picker__brand-name">PitchPulse</span>
        </div>
        <h1 className="mode-picker__title">How do you want to play?</h1>
        <p className="mode-picker__sub">
          Playing as <strong>{user.displayName}</strong> · {team.full} fan
        </p>
      </div>

      <div className="mode-picker__cards">
        <p className="mode-picker__label">PICK A MODE</p>
        <ModeCard
          title="Public Match"
          description="Jump into today's matchday. Predict prompts, earn PitchCoins, climb the live board."
          icon="⚽"
          variant="accent"
          onSelect={() => onSelectMode('public')}
        />
        <ModeCard
          title="Watch Room"
          description="Create or join a private room with friends. Live picks, reactions, and comments."
          icon="👥"
          onSelect={() => onSelectMode('watchRoom')}
        />
        <ModeCard
          title="Play Ranked"
          description="Matchmake against a rival. Hidden picks, tier progression, no distractions."
          icon="🏆"
          variant="accent"
          onSelect={() => onSelectMode('ranked')}
        />
      </div>
    </div>
  );
}
