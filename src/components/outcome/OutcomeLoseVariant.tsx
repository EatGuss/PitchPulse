export interface OutcomeLoseVariantProps {
  opponentName: string;
  userPoints: number;
  opponentPoints: number;
  showHint: boolean;
}

export function OutcomeLoseVariant({
  opponentName,
  userPoints,
  opponentPoints,
  showHint,
}: OutcomeLoseVariantProps) {
  return (
    <div className="outcome-screen outcome-screen--lose">
      <div className="outcome-screen__content">
        <h1 className="outcome-screen__headline outcome-screen__headline--over">MATCH OVER</h1>
        <p className="outcome-screen__names outcome-screen__names--muted">
          Defeated by {opponentName}
        </p>
        <p className="outcome-screen__score outcome-screen__score--neutral">
          <span>
            You <span className="tabular">{userPoints}p</span>
          </span>
          <span className="outcome-screen__score-sep"> — </span>
          <span>
            {opponentName} <span className="tabular">{opponentPoints}p</span>
          </span>
        </p>
        <p className="outcome-screen__subtext">
          Tier progress unchanged. Points earned this match still count toward your weekly and
          seasonal totals.
        </p>
      </div>
      <p className={`outcome-screen__tap ${showHint ? 'is-visible' : ''}`}>Tap to continue</p>
    </div>
  );
}
