/**
 * SinglePhonePage — `/` route. Flow inside one PhoneFrame:
 *   1. OnboardingScreen — choose Alice or Bob
 *   2. ModePicker       — Public Match or Watch Room
 *   3. MatchPage / WatchRoomStub
 *
 * Query params:
 *   ?as=alice|bob           → skip onboarding
 *   ?as=alice&mode=public   → skip to Public Match
 *   ?frame=off              → drop phone chrome
 */

import { useState } from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { DataDisclosure } from '../components/DataDisclosure';
import { PhoneEntryFlow, phoneEntryUserLabel } from './PhoneEntryFlow';
import type { DemoUserId } from '../data/personas';

function readInitialUserId(): DemoUserId | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('as');
  return raw === 'alice' || raw === 'bob' ? raw : null;
}

export function SinglePhonePage() {
  const [frameUserId, setFrameUserId] = useState<DemoUserId | null>(() => readInitialUserId());
  const chrome = phoneEntryUserLabel(frameUserId);

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
      <PhoneFrame label={chrome.label} subLabel={chrome.subLabel}>
        <PhoneEntryFlow syncUrl onUserChange={setFrameUserId} />
      </PhoneFrame>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <DataDisclosure variant="footer" />
      </div>
    </main>
  );
}
