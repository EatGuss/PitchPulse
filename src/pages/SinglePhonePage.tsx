/**
 * SinglePhonePage — `/` route. Two-step flow inside one PhoneFrame:
 *   1. OnboardingScreen — "Continue as Alice / Bob" (gate; shown until selected).
 *   2. MatchPage        — the live matchday view.
 *
 * Query params honored:
 *   ?as=alice|bob   → skip onboarding (used for deep links + dev shortcuts)
 *   ?frame=off      → drop the phone chrome (raw mobile preview)
 *
 * Selection persistence:
 *   We reflect the choice into the URL via history.replaceState — no
 *   localStorage / sessionStorage per challenge-brief rules. Refreshing the
 *   tab carries the user through to MatchPage; closing the tab resets.
 */

import { useEffect, useState } from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { OnboardingScreen } from '../components/OnboardingScreen';
import { DataDisclosure } from '../components/DataDisclosure';
import { MatchPage } from './MatchPage';
import { DEMO_USERS, type DemoUserId } from '../data/personas';

function isDemoUserId(value: string | null): value is DemoUserId {
  return value !== null && value in DEMO_USERS;
}

function readUserParam(): DemoUserId | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('as');
  return isDemoUserId(raw) ? (raw as DemoUserId) : null;
}

function writeUserParam(userId: DemoUserId) {
  const url = new URL(window.location.href);
  url.searchParams.set('as', userId);
  window.history.replaceState({}, '', url.toString());
}

function clearUserParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete('as');
  window.history.replaceState({}, '', url.toString());
}

export function SinglePhonePage() {
  const [userId, setUserId] = useState<DemoUserId | null>(() => {
    if (typeof window === 'undefined') return null;
    return readUserParam();
  });

  useEffect(() => {
    const onPop = () => setUserId(readUserParam());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleContinue = (chosen: DemoUserId) => {
    writeUserParam(chosen);
    setUserId(chosen);
  };

  const handleSwitchUser = () => {
    clearUserParam();
    setUserId(null);
  };

  const showOnboarding = userId === null;
  const user = userId !== null ? DEMO_USERS[userId] : null;

  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 18,
        padding: '24px 16px',
      }}
    >
      <PhoneFrame
        label={user?.displayName}
        subLabel={user ? `${user.archetypeName} · ${user.tagline.split('.')[0]}` : undefined}
      >
        {showOnboarding ? (
          <OnboardingScreen onContinue={handleContinue} />
        ) : (
          <MatchPage userId={userId!} onSwitchUser={handleSwitchUser} />
        )}
      </PhoneFrame>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <DataDisclosure variant="footer" />
      </div>
    </main>
  );
}
