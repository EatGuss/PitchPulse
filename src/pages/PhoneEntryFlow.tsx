/**
 * PhoneEntryFlow — onboarding → mode picker → match (or Watch Room stub).
 * Shared by `/` (SinglePhonePage) and `/demo` (each phone frame).
 *
 * URL params (SinglePhonePage only):
 *   ?as=alice|bob       → skip onboarding, land on mode picker
 *   ?as=alice&mode=public → skip straight to Public Match
 */

import { useEffect, useState } from 'react';
import { OnboardingScreen } from '../components/OnboardingScreen';
import { ModePicker } from '../components/ModePicker';
import { WatchRoomFlow } from '../components/WatchRoomFlow';
import { MatchPage } from './MatchPage';
import { DEMO_USERS, type DemoUserId } from '../data/personas';
import { isPlayMode, type PlayMode } from '../domain/playMode';

function isDemoUserId(value: string | null): value is DemoUserId {
  return value !== null && value in DEMO_USERS;
}

export interface PhoneEntryFlowProps {
  hideSimControls?: boolean;
  /** Persist selection in URL via history.replaceState (single-phone route). */
  syncUrl?: boolean;
  /** Notify parent when the chosen demo user changes (phone chrome label). */
  onUserChange?: (userId: DemoUserId | null) => void;
}

function readUrlState(): { userId: DemoUserId | null; mode: PlayMode | null } {
  if (typeof window === 'undefined') return { userId: null, mode: null };
  const params = new URLSearchParams(window.location.search);
  const rawUser = params.get('as');
  const rawMode = params.get('mode');
  const userId = isDemoUserId(rawUser) ? rawUser : null;
  const mode = userId !== null && isPlayMode(rawMode) ? rawMode : null;
  return { userId, mode };
}

function writeUrlState(userId: DemoUserId | null, mode: PlayMode | null) {
  const url = new URL(window.location.href);
  if (userId === null) {
    url.searchParams.delete('as');
    url.searchParams.delete('mode');
  } else {
    url.searchParams.set('as', userId);
    if (mode === null) {
      url.searchParams.delete('mode');
    } else {
      url.searchParams.set('mode', mode);
    }
  }
  window.history.replaceState({}, '', url.toString());
}

export function PhoneEntryFlow({
  hideSimControls = false,
  syncUrl = false,
  onUserChange,
}: PhoneEntryFlowProps) {
  const [userId, setUserId] = useState<DemoUserId | null>(() => {
    if (!syncUrl) return null;
    return readUrlState().userId;
  });

  const [mode, setMode] = useState<PlayMode | null>(() => {
    if (!syncUrl) return null;
    const { userId: urlUser, mode: urlMode } = readUrlState();
    return urlUser !== null ? urlMode : null;
  });

  useEffect(() => {
    onUserChange?.(userId);
  }, [userId, onUserChange]);

  useEffect(() => {
    if (!syncUrl) return;
    const onPop = () => {
      const { userId: u, mode: m } = readUrlState();
      setUserId(u);
      setMode(m);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [syncUrl]);

  const handleContinue = (chosen: DemoUserId) => {
    setUserId(chosen);
    setMode(null);
    if (syncUrl) writeUrlState(chosen, null);
  };

  const handleSelectMode = (chosen: PlayMode) => {
    setMode(chosen);
    if (syncUrl && userId) writeUrlState(userId, chosen);
  };

  const handleSwitchUser = () => {
    setUserId(null);
    setMode(null);
    if (syncUrl) writeUrlState(null, null);
  };

  const handleBackToModePicker = () => {
    setMode(null);
    if (syncUrl && userId) writeUrlState(userId, null);
  };

  if (userId === null) {
    return <OnboardingScreen onContinue={handleContinue} />;
  }

  if (mode === null) {
    return (
      <ModePicker
        userId={userId}
        onSelectMode={handleSelectMode}
        onSwitchUser={handleSwitchUser}
      />
    );
  }

  if (mode === 'watchRoom') {
    return (
      <WatchRoomFlow
        userId={userId}
        hideSimControls={hideSimControls}
        onBack={handleBackToModePicker}
      />
    );
  }

  return (
    <MatchPage
      userId={userId}
      hideSimControls={hideSimControls}
      onSwitchUser={handleSwitchUser}
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
