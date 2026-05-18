/**
 * SinglePhonePage — `/` route. Renders MatchPage inside one PhoneFrame.
 * Add ?frame=off to drop the chrome and view the raw mobile layout at 390px.
 * Add ?as=bob to view from Bob's perspective.
 */

import { useEffect, useState } from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { DataDisclosure } from '../components/DataDisclosure';
import { MatchPage } from './MatchPage';
import { DEMO_USERS, type DemoUserId } from '../data/personas';

function useDemoUserParam(): DemoUserId {
  const [user, setUser] = useState<DemoUserId>('alice');
  useEffect(() => {
    const update = () => {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('as');
      if (raw && raw in DEMO_USERS) setUser(raw as DemoUserId);
    };
    update();
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return user;
}

export function SinglePhonePage() {
  const userId = useDemoUserParam();
  const user = DEMO_USERS[userId];

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
      <PhoneFrame label={user.displayName} subLabel={`${user.archetypeName} · ${user.tagline.split('.')[0]}`}>
        <MatchPage userId={userId} />
      </PhoneFrame>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <DataDisclosure variant="footer" />
      </div>
    </main>
  );
}
// NOTE [Gate 5]: When the Onboarding flow lands, render
// <DataDisclosure variant="card" /> inside the "Continue as alice / bob" card
// so the disclosure is the LAST thing users read before entering the app.
