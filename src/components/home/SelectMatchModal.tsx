import type { DemoUserId } from '../../data/personas';
import {
  DEMO_MATCHDAY_FIXTURES,
  fixtureRoomLiveClock,
  fixtureScheduleStatus,
  fixtureUnavailablePickLabel,
  getFixtureById,
  isFixtureRoomPickable,
  resolveFixtureTitle,
  type MatchdayScheduleContext,
} from '../../domain/matchday';
import type { UserRankedMatchdayStatus } from '../../sim/matchdayStore';
import { canLockInFixture } from '../../sim/matchdayStore';
import { useMatchSimState } from '../../hooks/useMatchSimState';
import { getSimKickoffWallMs } from '../../sim/matchdaySchedule';
import './HomeModal.css';

export interface SelectMatchModalProps {
  open: boolean;
  schedule: MatchdayScheduleContext;
  onClose: () => void;
  onPick: (fixtureId: string) => void;
  mode?: 'ranked' | 'room';
  userId?: DemoUserId;
  rankedStatus?: UserRankedMatchdayStatus;
}

export function SelectMatchModal({
  open,
  onClose,
  onPick,
  mode = 'ranked',
  userId,
  rankedStatus,
}: SelectMatchModalProps) {
  const { clock } = useMatchSimState();
  const liveSchedule: MatchdayScheduleContext = {
    clockPhase: clock.phase,
    isRunning: clock.isRunning,
    simKickoffWallMs: getSimKickoffWallMs(),
  };

  if (!open) return null;

  const isRanked = mode === 'ranked';
  const lockedId = isRanked ? rankedStatus?.lockedFixtureId ?? null : null;
  const canChange = lockedId !== null;

  const title = isRanked ? 'Select your match' : 'Pick a match for your room';
  const lead = isRanked
    ? canChange
      ? 'Change your pick before kickoff — one ranked match per gameweek.'
      : 'Lock in before kickoff — one ranked match per gameweek.'
    : 'Live and upcoming fixtures can be selected — join mid-match if needed.';

  return (
    <div className="home-modal" role="presentation">
      <button type="button" className="home-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div
        className="home-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="home-modal__head">
          <h2 className="home-modal__title">{title}</h2>
          <button type="button" className="home-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <p className="home-modal__lead">{lead}</p>
        <ul className="home-modal__list">
          {DEMO_MATCHDAY_FIXTURES.map((f) => {
            const isCurrentPick = lockedId === f.id;
            const canPick = isRanked
              ? !!userId && canLockInFixture(userId, f.id, liveSchedule)
              : isFixtureRoomPickable(f.id, liveSchedule);
            const fixture = getFixtureById(f.id);
            const badge = fixtureScheduleStatus(
              f,
              liveSchedule.clockPhase,
              liveSchedule.isRunning,
              liveSchedule.simKickoffWallMs,
            );
            const liveClock = fixtureRoomLiveClock(f.id, liveSchedule, clock.displayClock);
            const isLive = badge === 'Live';
            const actionLabel = isRanked
              ? 'Lock In'
              : liveClock
                ? `Select (${liveClock})`
                : 'Select';
            const disabledLabel = fixtureUnavailablePickLabel(f.id, liveSchedule);

            return (
              <li key={f.id} className="home-modal__row">
                <div className="home-modal__row-main">
                  <span className="home-modal__fixture">{resolveFixtureTitle(f)}</span>
                  {fixture && (
                    <span className="home-modal__kickoff">
                      {fixture.kickoffLabel}
                      {liveClock && (
                        <span className="home-modal__live-clock" aria-label={`Live at ${liveClock}`}>
                          {' · '}
                          <span className="home-modal__live-dot" aria-hidden="true" />
                          {liveClock}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {isCurrentPick ? (
                  <span className="home-modal__picked">{isRanked ? 'Your pick ✓' : 'Selected ✓'}</span>
                ) : canPick ? (
                  <button
                    type="button"
                    className={`home-modal__lock${isLive ? ' home-modal__lock--live' : ''}`}
                    onClick={() => onPick(f.id)}
                  >
                    {actionLabel}
                  </button>
                ) : (
                  <span
                    className={`home-modal__status home-modal__status--${badge.toLowerCase()}`}
                    aria-label={`Match status: ${badge}`}
                  >
                    {disabledLabel}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
