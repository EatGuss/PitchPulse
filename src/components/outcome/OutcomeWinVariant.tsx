import { OutcomeConfetti } from './OutcomeConfetti';

export interface OutcomeWinVariantProps {
  userDisplayName: string;
  opponentName: string;
  userPoints: number;
  opponentPoints: number;
  showHint: boolean;
}

export function OutcomeWinVariant({
  userDisplayName,
  opponentName,
  userPoints,
  opponentPoints,
  showHint,
}: OutcomeWinVariantProps) {
  return (
    <div className="outcome-screen outcome-screen--win">
      <div className="outcome-screen__glow outcome-screen__glow--gold" aria-hidden="true" />
      <OutcomeConfetti />
      <div className="outcome-screen__content">
        <h1 className="outcome-screen__headline outcome-screen__headline--victory">VICTORY</h1>
        <p className="outcome-screen__names">
          {userDisplayName}
          <span className="outcome-screen__names-action"> defeated </span>
          {opponentName}
        </p>
        <p className="outcome-screen__score">
          <span className="outcome-screen__score-you">
            You <span className="tabular">{userPoints}p</span>
          </span>
          <span className="outcome-screen__score-sep"> — </span>
          <span className="outcome-screen__score-opp">
            {opponentName} <span className="tabular">{opponentPoints}p</span>
          </span>
        </p>
      </div>
      <p className={`outcome-screen__tap ${showHint ? 'is-visible' : ''}`}>Tap to continue</p>
    </div>
  );
}
