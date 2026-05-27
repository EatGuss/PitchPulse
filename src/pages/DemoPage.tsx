/**
 * DemoPage — `/demo` route. Two phone frames side-by-side, shared MatchSim.
 *
 * Each phone: onboarding → 4-tab AppShell (Home default).
 */

import { useEffect, useRef } from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { SimControls } from '../components/SimControls';
import { DataDisclosure } from '../components/DataDisclosure';
import { PhoneEntryFlow } from './PhoneEntryFlow';
import { DEMO_USERS } from '../data/personas';
import { teamAlias } from '../data/teamAliases';
import { resetRankedMatchdayPlay } from '../sim/matchdayStore';
import './DemoPage.css';

export function DemoPage() {
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    resetRankedMatchdayPlay();
  }, []);
  const alice = DEMO_USERS.alice;
  const bob = DEMO_USERS.bob;
  const aliceTeam = teamAlias(alice.favoriteTeamId);
  const bobTeam = teamAlias(bob.favoriteTeamId);

  return (
    <main className="demo">
      <header className="demo__header">
        <div className="demo__brand">
          <span className="demo__brand-dot" />
          <span className="demo__brand-name">PitchPulse</span>
          <span className="demo__brand-tag">DEMO — Two-fan watch room</span>
        </div>
        <div className="demo__sub">
          Both phones below subscribe to the same in-memory match simulator.
          Events are replayed at <strong>1 match-minute ≈ 2 real seconds</strong>.
        </div>
      </header>

      <div className="demo__stage">
        <PhoneFrame label={`${alice.displayName} — ${aliceTeam.full} fan`} subLabel={alice.archetypeName}>
          <PhoneEntryFlow hideSimControls forcedUserId="alice" />
        </PhoneFrame>

        <div className="demo__bridge">
          <SimControls variant="demo" />
        </div>

        <PhoneFrame label={`${bob.displayName} — ${bobTeam.full} fan`} subLabel={bob.archetypeName}>
          <PhoneEntryFlow hideSimControls forcedUserId="bob" />
        </PhoneFrame>
      </div>

      <DataDisclosure variant="footer" />
    </main>
  );
}
