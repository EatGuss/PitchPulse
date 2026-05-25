/**
 * AppShell — 4-tab layout with persistent BottomNav.
 * Hides nav during live match takeover; re-shows at full-time.
 */

import { useCallback, useEffect, useState } from 'react';
import { BottomNav } from './BottomNav';
import { RankedFlow } from './RankedFlow';
import { WatchRoomFlow } from './WatchRoomFlow';
import { HomeTab, type HomeOverlay } from '../pages/tabs/HomeTab';
import { CompeteTab } from '../pages/tabs/CompeteTab';
import { StandingsTab } from '../pages/tabs/StandingsTab';
import { MeTab } from '../pages/tabs/MeTab';
import type { DemoUserId } from '../data/personas';
import {
  isAppTab,
  isCompeteView,
  type AppTab,
  type CompeteView,
} from '../domain/appTab';
import { useMatchSimState } from '../hooks/useMatchSimState';
import { useMatchdaySchedule } from '../hooks/useMatchdaySchedule';
import type { WatchRoomSession } from '../domain/watchRoomTypes';
import {
  canPlayRankedFixture,
  getUserRankedMatchdayStatus,
  isPrimaryFixtureLive,
} from '../sim/matchdayStore';
import { leaveWatchRoom } from '../aws/roomClient';
import { setMinimizedWatchRoom } from '../sim/watchRoomMinimizedStore';
import './AppShell.css';

export interface AppShellProps {
  userId: DemoUserId;
  hideSimControls?: boolean;
  onSwitchUser?: () => void;
  syncUrl?: boolean;
}

function readUrlTabState(): { tab: AppTab; compete: CompeteView } {
  if (typeof window === 'undefined') return { tab: 'home', compete: 'root' };
  const params = new URLSearchParams(window.location.search);
  const legacyMode = params.get('mode');
  if (legacyMode === 'public') {
    return { tab: 'home', compete: 'root' };
  }
  if (legacyMode === 'watchRoom') {
    return { tab: 'compete', compete: 'watchRoom' };
  }
  if (legacyMode === 'ranked') {
    return { tab: 'compete', compete: 'ranked' };
  }
  const tab = isAppTab(params.get('tab')) ? params.get('tab')! as AppTab : 'home';
  const compete = isCompeteView(params.get('compete')) ? params.get('compete')! as CompeteView : 'root';
  return { tab, compete };
}

function writeUrlTabState(tab: AppTab, compete: CompeteView, userId: DemoUserId) {
  const url = new URL(window.location.href);
  url.searchParams.set('as', userId);
  url.searchParams.set('tab', tab);
  if (tab === 'compete' && compete !== 'root') {
    url.searchParams.set('compete', compete);
  } else {
    url.searchParams.delete('compete');
  }
  url.searchParams.delete('mode');
  window.history.replaceState({}, '', url.toString());
}

export function AppShell({
  userId,
  hideSimControls = false,
  onSwitchUser,
  syncUrl = false,
}: AppShellProps) {
  const initial = syncUrl ? readUrlTabState() : { tab: 'home' as AppTab, compete: 'root' as CompeteView };
  const [activeTab, setActiveTab] = useState<AppTab>(initial.tab);
  const [competeView, setCompeteView] = useState<CompeteView>(initial.compete);
  const [rankedInMatch, setRankedInMatch] = useState(false);
  const [watchInMatch, setWatchInMatch] = useState(false);
  const { clock } = useMatchSimState();
  const schedule = useMatchdaySchedule();

  const inMatchTakeover = rankedInMatch || watchInMatch;
  const matchIsLive =
    clock.phase !== 'preMatch' && clock.phase !== 'fullTime';
  const hideBottomNav = inMatchTakeover && matchIsLive;

  const [rankedFixtureId, setRankedFixtureId] = useState<string | null>(null);
  const [competeResetKey, setCompeteResetKey] = useState(0);
  const [homeOverlay, setHomeOverlay] = useState<HomeOverlay>('none');
  const [watchRoomBootstrap, setWatchRoomBootstrap] = useState<WatchRoomSession | null>(null);
  const [watchOpenInMatch, setWatchOpenInMatch] = useState(false);
  const [watchRoomRestoreInMatch, setWatchRoomRestoreInMatch] = useState(false);
  /** Tab to restore when backing out of a compete sub-flow opened from Home (etc.). */
  const [competeReturnTab, setCompeteReturnTab] = useState<AppTab | null>(null);

  useEffect(() => {
    if (!syncUrl) return;
    const onPop = () => {
      const { tab, compete } = readUrlTabState();
      setActiveTab(tab);
      setCompeteView(compete);
      if (compete === 'root') {
        setRankedInMatch(false);
        setWatchInMatch(false);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [syncUrl]);

  const resetCompete = useCallback(() => {
    setCompeteView('root');
    setRankedInMatch(false);
    setWatchInMatch(false);
    setWatchRoomBootstrap(null);
    setWatchOpenInMatch(false);
    setWatchRoomRestoreInMatch(false);
    setRankedFixtureId(null);
    setCompeteResetKey((k) => k + 1);
  }, []);

  const handleTabChange = useCallback(
    (tab: AppTab) => {
      if (hideBottomNav) return;
      if (tab === activeTab) {
        if (tab === 'compete') resetCompete();
        if (tab === 'home') setHomeOverlay('none');
        setCompeteReturnTab(null);
        return;
      }
      setActiveTab(tab);
      setCompeteReturnTab(null);
      if (tab !== 'compete') resetCompete();
      if (tab !== 'home') setHomeOverlay('none');
      if (syncUrl) writeUrlTabState(tab, tab === 'compete' ? 'root' : 'root', userId);
    },
    [activeTab, hideBottomNav, resetCompete, syncUrl, userId],
  );

  const handleSelectCompeteView = useCallback(
    (view: Exclude<CompeteView, 'root'>) => {
      if (view === 'watchRoom') {
        setWatchRoomBootstrap(null);
        setWatchOpenInMatch(false);
      }
      setCompeteView(view);
      setActiveTab('compete');
      if (syncUrl) writeUrlTabState('compete', view, userId);
    },
    [syncUrl, userId],
  );

  const handleCompeteBack = useCallback(() => {
    const returnTab = competeReturnTab;
    resetCompete();
    setCompeteReturnTab(null);
    if (returnTab && returnTab !== 'compete') {
      setActiveTab(returnTab);
      if (syncUrl) writeUrlTabState(returnTab, 'root', userId);
      return;
    }
    if (syncUrl) writeUrlTabState('compete', 'root', userId);
  }, [competeReturnTab, resetCompete, syncUrl, userId]);

  const openCompeteFromTab = useCallback(
    (view: Exclude<CompeteView, 'root'>, returnTab: AppTab) => {
      setCompeteReturnTab(returnTab);
      handleSelectCompeteView(view);
    },
    [handleSelectCompeteView],
  );

  const handlePlayRanked = useCallback(
    (fixtureId: string) => {
      if (!canPlayRankedFixture(userId, schedule)) return;
      const status = getUserRankedMatchdayStatus(userId);
      if (status.lockedFixtureId !== fixtureId) return;
      setRankedFixtureId(fixtureId);
      setHomeOverlay('none');
      openCompeteFromTab('ranked', 'home');
    },
    [openCompeteFromTab, schedule, userId],
  );

  const handlePlayRankedFromCompete = useCallback(
    (fixtureId: string) => {
      if (!canPlayRankedFixture(userId, schedule)) return;
      const status = getUserRankedMatchdayStatus(userId);
      if (status.lockedFixtureId !== fixtureId) return;
      setRankedFixtureId(fixtureId);
      handleSelectCompeteView('ranked');
    },
    [handleSelectCompeteView, schedule, userId],
  );

  const handleCreateRoomFromCompete = useCallback(() => {
    setWatchOpenInMatch(false);
    handleSelectCompeteView('watchRoom');
  }, [handleSelectCompeteView]);

  const handleJoinRoomFromCompete = useCallback(() => {
    setWatchOpenInMatch(false);
    handleSelectCompeteView('watchRoom');
  }, [handleSelectCompeteView]);

  const handleRankedMatchComplete = useCallback(() => {
    setRankedInMatch(false);
    setRankedFixtureId(null);
    setCompeteView('root');
    setCompeteReturnTab(null);
    setActiveTab('home');
    if (syncUrl) writeUrlTabState('home', 'root', userId);
  }, [syncUrl, userId]);

  const handleCreateRoom = useCallback(() => {
    setHomeOverlay('none');
    setWatchOpenInMatch(false);
    openCompeteFromTab('watchRoom', 'home');
  }, [openCompeteFromTab]);

  const handleJoinRoom = useCallback(() => {
    setHomeOverlay('none');
    setWatchOpenInMatch(false);
    openCompeteFromTab('watchRoom', 'home');
  }, [openCompeteFromTab]);

  const handleMinimizeWatchRoom = useCallback(
    (session: WatchRoomSession, wasInMatch: boolean) => {
      setMinimizedWatchRoom(userId, session, wasInMatch);
      setWatchRoomBootstrap(null);
      setWatchRoomRestoreInMatch(wasInMatch);
      setWatchOpenInMatch(false);
      setWatchInMatch(false);
      const returnTab = competeReturnTab ?? 'home';
      setCompeteReturnTab(null);
      setCompeteView('root');
      setActiveTab(returnTab);
      if (syncUrl) writeUrlTabState(returnTab, 'root', userId);
    },
    [competeReturnTab, syncUrl, userId],
  );

  const handleLeaveWatchRoom = useCallback(async () => {
    const returnTab = competeReturnTab ?? 'home';
    await leaveWatchRoom(userId);
    resetCompete();
    setCompeteReturnTab(null);
    setActiveTab(returnTab);
    if (syncUrl) writeUrlTabState(returnTab, 'root', userId);
  }, [competeReturnTab, resetCompete, syncUrl, userId]);

  const handleOpenRoom = useCallback(
    (session: WatchRoomSession) => {
      setHomeOverlay('none');
      setWatchRoomBootstrap(session);
      const resumeInMatch =
        watchRoomRestoreInMatch || isPrimaryFixtureLive(schedule.clockPhase, schedule.isRunning);
      setWatchOpenInMatch(resumeInMatch);
      setWatchRoomRestoreInMatch(false);
      openCompeteFromTab('watchRoom', 'home');
    },
    [openCompeteFromTab, schedule.clockPhase, schedule.isRunning, watchRoomRestoreInMatch],
  );

  const renderContent = () => {
    if (activeTab === 'compete') {
      if (competeView === 'ranked') {
        return (
          <RankedFlow
            key={`ranked-${competeResetKey}`}
            userId={userId}
            fixtureId={rankedFixtureId}
            schedule={schedule}
            hideSimControls={hideSimControls}
            onBack={handleCompeteBack}
            onComplete={handleRankedMatchComplete}
            onLiveMatchChange={setRankedInMatch}
          />
        );
      }
      if (competeView === 'watchRoom') {
        return (
          <WatchRoomFlow
            key={`watch-${competeResetKey}`}
            userId={userId}
            hideSimControls={hideSimControls}
            onBack={handleCompeteBack}
            onMinimize={handleMinimizeWatchRoom}
            onLeaveRoom={handleLeaveWatchRoom}
            onLiveMatchChange={setWatchInMatch}
            initialSession={watchRoomBootstrap}
            openInMatch={watchOpenInMatch}
            restoreInMatch={watchRoomRestoreInMatch}
          />
        );
      }
      return (
        <CompeteTab
          userId={userId}
          schedule={schedule}
          onPlayRanked={handlePlayRankedFromCompete}
          onCreateRoom={handleCreateRoomFromCompete}
          onJoinRoom={handleJoinRoomFromCompete}
          onOpenRoom={handleOpenRoom}
          onLeaveRoom={handleLeaveWatchRoom}
        />
      );
    }

    switch (activeTab) {
      case 'home':
        return (
          <HomeTab
            userId={userId}
            overlay={homeOverlay}
            onOverlayChange={setHomeOverlay}
            onPlayRanked={handlePlayRanked}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onOpenRoom={handleOpenRoom}
            onLeaveRoom={handleLeaveWatchRoom}
          />
        );
      case 'standings':
        return <StandingsTab userId={userId} />;
      case 'me':
        return <MeTab userId={userId} onSwitchUser={onSwitchUser} />;
      default:
        return (
          <HomeTab
            userId={userId}
            overlay={homeOverlay}
            onOverlayChange={setHomeOverlay}
            onPlayRanked={handlePlayRanked}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onOpenRoom={handleOpenRoom}
            onLeaveRoom={handleLeaveWatchRoom}
          />
        );
    }
  };

  return (
    <div className={`app-shell ${hideBottomNav ? 'app-shell--match' : ''}`}>
      <div className="app-shell__content">{renderContent()}</div>
      {!hideBottomNav && (
        <BottomNav active={activeTab} onTabChange={handleTabChange} />
      )}
    </div>
  );
}
