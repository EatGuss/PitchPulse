/**
 * DemoPage — `/demo` route. Two phone frames side-by-side, shared MatchSim.
 *
 * Layout target: 1920×1080 desktop (demo-video screen). Both phones AT their
 * full 390×844 logical size, with the SimControls panel between them. Auto-
 * scales on smaller viewports via PhoneFrame's transform-scale rules.
 *
 * This is the screen that proves the multiplayer pillar in the demo video.
 */

import { PhoneFrame } from '../components/PhoneFrame';
import { SimControls } from '../components/SimControls';
import { DataDisclosure } from '../components/DataDisclosure';
import { MatchPage } from './MatchPage';
import { DEMO_USERS } from '../data/personas';
import { teamAlias } from '../data/teamAliases';
import './DemoPage.css';

export function DemoPage() {
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
          <MatchPage userId="alice" hideSimControls />
        </PhoneFrame>

        <div className="demo__bridge">
          <SimControls variant="demo" />
          <div className="demo__pillars">
            <div className="demo__pillar">
              <div className="demo__pillar-label">PILLAR 1</div>
              <div className="demo__pillar-name">Multiplayer</div>
              <div className="demo__pillar-desc">Two fans · shared room · live reactions</div>
            </div>
            <div className="demo__pillar">
              <div className="demo__pillar-label">PILLAR 2</div>
              <div className="demo__pillar-name">Real-time data</div>
              <div className="demo__pillar-desc">XML replay · goal · card · half-time</div>
            </div>
            <div className="demo__pillar">
              <div className="demo__pillar-label">PILLAR 3</div>
              <div className="demo__pillar-name">Gamification</div>
              <div className="demo__pillar-desc">PitchCoins · odds × correctness · badges</div>
            </div>
          </div>
        </div>

        <PhoneFrame label={`${bob.displayName} — ${bobTeam.full} fan`} subLabel={bob.archetypeName}>
          <MatchPage userId="bob" hideSimControls />
        </PhoneFrame>
      </div>

      <DataDisclosure variant="footer" />
    </main>
  );
}
