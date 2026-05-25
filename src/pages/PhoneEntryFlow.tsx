/**
 * PhoneEntryFlow — onboarding → 4-tab AppShell.
 * Mode Picker removed (Gate C). Users land on Home after onboarding.
 */

import { useEffect, useState } from 'react';
import { OnboardingScreen } from '../components/OnboardingScreen';
import { AppShell } from '../components/AppShell';
import { DEMO_USERS, type DemoUserId } from '../data/personas';

function isDemoUserId(value: string | null): value is DemoUserId {
  return value !== null && value in DEMO_USERS;
}

export interface PhoneEntryFlowProps {
  hideSimControls?: boolean;
  syncUrl?: boolean;
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
  onUserChange,
}: PhoneEntryFlowProps) {
  const [userId, setUserId] = useState<DemoUserId | null>(() =>
    syncUrl ? readUrlUserId() : null,
  );

  useEffect(() => {
    onUserChange?.(userId);
  }, [userId, onUserChange]);

  useEffect(() => {
    if (!syncUrl) return;
    const onPop = () => setUserId(readUrlUserId());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [syncUrl]);

  const handleContinue = (chosen: DemoUserId) => {
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

  if (userId === null) {
    return <OnboardingScreen onContinue={handleContinue} />;
  }

  return (
    <AppShell
      userId={userId}
      hideSimControls={hideSimControls}
      onSwitchUser={handleSwitchUser}
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
