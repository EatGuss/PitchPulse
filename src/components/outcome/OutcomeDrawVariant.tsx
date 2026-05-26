export interface OutcomeDrawVariantProps {
  userDisplayName: string;
  opponentName: string;
  userPoints: number;
  opponentPoints: number;
  showHint: boolean;
}

export function OutcomeDrawVariant({
  userDisplayName,
  opponentName,
  userPoints,
  opponentPoints,
  showHint,
}: OutcomeDrawVariantProps) {
  return (
    <div className="outcome-screen outcome-screen--draw">
      <div className="outcome-screen__content">
        <h1 className="outcome-screen__headline outcome-screen__headline--draw">DRAW</h1>
        <p className="outcome-screen__names outcome-screen__names--draw">
          {userDisplayName}
          <span className="outcome-screen__names-action"> drew with </span>
          {opponentName}
        </p>
        <p className="outcome-screen__score outcome-screen__score--draw">
          <span className="outcome-screen__score-draw-left">
            You <span className="tabular">{userPoints}p</span>
          </span>
          <span className="outcome-screen__score-sep"> — </span>
          <span className="outcome-screen__score-draw-right">
            {opponentName} <span className="tabular">{opponentPoints}p</span>
          </span>
        </p>
        <p className="outcome-screen__tagline">Evenly matched.</p>
        <p className="outcome-screen__subtext">
          Tier progress unchanged. Points earned still count toward weekly and seasonal totals.
        </p>
      </div>
      <p className={`outcome-screen__tap ${showHint ? 'is-visible' : ''}`}>Tap to continue</p>
    </div>
  );
}
