/**
 * OnboardingScreen — full-screen, mobile-native splash gating the single-phone
 * entry. Shown on `/` until the viewer taps "Continue as Alice / Bob".
 *
 * Mobile-first rules (PITCHPULSE.md §8.2):
 *   - One screen, two big stacked tap targets (>= 44px each).
 *   - No keyboard, no signup, no email — Cognito Identity Pool anonymous only,
 *     two pre-created demo users with fixed IDs (Gate 4 spec).
 *   - DataDisclosure card is the LAST thing read before entering — see the
 *     note in SinglePhonePage.tsx that asked for this.
 *
 * The selection persists for the session via the URL `?as=` param only — no
 * localStorage / sessionStorage per challenge-brief credential rules.
 */

import { DEMO_USERS, type DemoUserId } from '../data/personas';
import { teamAlias } from '../data/teamAliases';
import { DataDisclosure } from './DataDisclosure';
import './OnboardingScreen.css';

export interface OnboardingScreenProps {
  /** Called with the chosen demo user id. Parent should update the URL param. */
  onContinue: (userId: DemoUserId) => void;
}

export function OnboardingScreen({ onContinue }: OnboardingScreenProps) {
  const alice = DEMO_USERS.alice;
  const bob = DEMO_USERS.bob;
  const aliceTeam = teamAlias(alice.favoriteTeamId);
  const bobTeam = teamAlias(bob.favoriteTeamId);

  return (
    <div className="onb" role="main" aria-label="PitchPulse — choose a demo profile">
      <div className="onb__hero">
        <div className="onb__brand">
          <span className="onb__brand-dot" aria-hidden="true" />
          <span className="onb__brand-name">PitchPulse</span>
        </div>
        <h1 className="onb__title">Watch the match.<br />Predict the next moment.</h1>
        <p className="onb__sub">
          Live event ticker, 30-second prediction prompts,
          and a coin economy that rewards you for spotting
          the moment first — not last.
        </p>
      </div>

      <div className="onb__pillars" aria-label="What's in PitchPulse">
        <div className="onb__pill">
          <span className="onb__pill-ico" aria-hidden="true">⚡</span>
          <span className="onb__pill-txt">Real-time match feed</span>
        </div>
        <div className="onb__pill">
          <span className="onb__pill-ico" aria-hidden="true">🎯</span>
          <span className="onb__pill-txt">Predict the next goal, card &amp; more</span>
        </div>
        <div className="onb__pill">
          <span className="onb__pill-ico" aria-hidden="true">🏆</span>
          <span className="onb__pill-txt">Live leaderboard &amp; badges</span>
        </div>
      </div>

      <div className="onb__choose">
        <p className="onb__choose-label">CONTINUE AS A DEMO FAN</p>

        <button
          type="button"
          className="onb__user onb__user--alice"
          onClick={() => onContinue('alice')}
          aria-label={`Continue as ${alice.displayName}, ${aliceTeam.full} fan`}
        >
          <span className="onb__user-avatar" aria-hidden="true">{alice.avatar}</span>
          <span className="onb__user-txt">
            <span className="onb__user-name">{alice.displayName}</span>
            <span className="onb__user-meta">
              {alice.archetypeName}
              <span className="onb__user-dot" style={{ background: aliceTeam.accent }} />
              {aliceTeam.full} fan
            </span>
          </span>
          <span className="onb__user-cta" aria-hidden="true">→</span>
        </button>

        <button
          type="button"
          className="onb__user onb__user--bob"
          onClick={() => onContinue('bob')}
          aria-label={`Continue as ${bob.displayName}, ${bobTeam.full} fan`}
        >
          <span className="onb__user-avatar" aria-hidden="true">{bob.avatar}</span>
          <span className="onb__user-txt">
            <span className="onb__user-name">{bob.displayName}</span>
            <span className="onb__user-meta">
              {bob.archetypeName}
              <span className="onb__user-dot" style={{ background: bobTeam.accent }} />
              {bobTeam.full} fan
            </span>
          </span>
          <span className="onb__user-cta" aria-hidden="true">→</span>
        </button>

        <p className="onb__choose-foot">
          No signup, no email. Two anonymous demo profiles —
          gameplay is identical for both.
        </p>
      </div>

      <div className="onb__disc">
        <DataDisclosure variant="card" />
      </div>
    </div>
  );
}
