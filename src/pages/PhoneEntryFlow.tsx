/**
 * PhoneEntryFlow — onboarding → 4-tab AppShell.
 * Mode Picker removed (Gate C). Users land on Home after onboarding.
 */

import { useEffect, useRef, useState } from 'react';
import { OnboardingScreen } from '../components/OnboardingScreen';
import { AppShell } from '../components/AppShell';
import { DEMO_USERS, type DemoUserId } from '../data/personas';
import {
  claimDemoPersona,
  isDemoPersonaAvailable,
  otherDemoPersona,
  releaseDemoPersona,
} from '../sim/demoPersonaLock';

function isDemoUserId(value: string | null): value is DemoUserId {
  return value !== null && value in DEMO_USERS;
}

export interface PhoneEntryFlowProps {
  hideSimControls?: boolean;
  syncUrl?: boolean;
  /** /demo: lock this frame to Alice or Bob so both phones cannot pick the same fan. */
  forcedUserId?: DemoUserId;
  onUserChange?: (userId: DemoUserId | null) => void;
}

function readUrlUserId(): DemoUserId | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('as');
  return isDemoUserId(raw) ? raw : null;
}

export function PhoneEntryFlow({
  hideSimControls = false,
  syncUrl = false,
  forcedUserId,
  onUserChange,
}: PhoneEntryFlowProps) {
  const lockTokenRef = useRef(Symbol('demo-persona'));
  const [userId, setUserId] = useState<DemoUserId | null>(() => {
    if (forcedUserId) return forcedUserId;
    return syncUrl ? readUrlUserId() : null;
  });
  const [personaConflict, setPersonaConflict] = useState(false);

  useEffect(() => {
    onUserChange?.(userId);
  }, [userId, onUserChange]);

  useEffect(() => {
    if (!forcedUserId) return;
    const token = lockTokenRef.current;
    const ok = claimDemoPersona(forcedUserId, token);
    setPersonaConflict(!ok);
    if (ok) setUserId(forcedUserId);
    return () => releaseDemoPersona(forcedUserId, token);
  }, [forcedUserId]);

  useEffect(() => {
    if (!syncUrl) return;
    const onPop = () => setUserId(readUrlUserId());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [syncUrl]);

  const handleContinue = (chosen: DemoUserId) => {
    if (forcedUserId) return;
    if (!isDemoPersonaAvailable(chosen)) {
      setPersonaConflict(true);
      return;
    }
    const token = lockTokenRef.current;
    if (!claimDemoPersona(chosen, token)) {
      setPersonaConflict(true);
      return;
    }
    setPersonaConflict(false);
    setUserId(chosen);
    if (syncUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('as', chosen);
      url.searchParams.set('tab', 'home');
      url.searchParams.delete('mode');
      url.searchParams.delete('compete');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleSwitchUser = () => {
    if (forcedUserId) return;
    if (userId) releaseDemoPersona(userId, lockTokenRef.current);
    setUserId(null);
    if (syncUrl) {
      const url = new URL(window.location.href);
      url.searchParams.delete('as');
      url.searchParams.delete('tab');
      url.searchParams.delete('compete');
      url.searchParams.delete('mode');
      window.history.replaceState({}, '', url.toString());
    }
  };

  if (personaConflict && forcedUserId) {
    const other = DEMO_USERS[otherDemoPersona(forcedUserId)];
    return (
      <div className="tab-shell" role="alert">
        <h1 className="tab-shell__title">Profile in use</h1>
        <p className="tab-shell__sub">
          {DEMO_USERS[forcedUserId].displayName} is already active on the other phone in this demo.
          Refresh the page or use the {other.displayName} frame.
        </p>
      </div>
    );
  }

  if (userId === null) {
    return (
      <OnboardingScreen
        onContinue={handleContinue}
        allowedUserIds={
          forcedUserId
            ? [forcedUserId]
            : ['alice', 'bob'].filter((id) => isDemoPersonaAvailable(id as DemoUserId)) as DemoUserId[]
        }
        personaConflict={personaConflict}
      />
    );
  }

  return (
    <AppShell
      userId={userId}
      hideSimControls={hideSimControls}
      onSwitchUser={forcedUserId ? undefined : handleSwitchUser}
      syncUrl={syncUrl}
    />
  );
}

export function phoneEntryUserLabel(userId: DemoUserId | null): {
  label?: string;
  subLabel?: string;
} {
  if (userId === null) return {};
  const user = DEMO_USERS[userId];
  return {
    label: user.displayName,
    subLabel: `${user.archetypeName} · ${user.tagline.split('.')[0]}`,
  };
}
