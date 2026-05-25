/**
 * CompeteTab — Ranked matchday + Live & Watch Rooms (Gate E).
 */

import { useState } from 'react';
import { CompeteLiveWatchPanel } from '../../components/compete/CompeteLiveWatchPanel';
import { CompeteRankedPanel } from '../../components/compete/CompeteRankedPanel';
import type { DemoUserId } from '../../data/personas';
import type { MatchdayScheduleContext } from '../../domain/matchday';
import type { WatchRoomSession } from '../../domain/watchRoomTypes';
import { useRankedMatchdaySync } from '../../hooks/useRankedMatchdaySync';
import '../../components/compete/CompeteTab.css';
import './TabShell.css';

export type CompeteSubTab = 'ranked' | 'liveWatch';

export interface CompeteTabProps {
  userId: DemoUserId;
  schedule: MatchdayScheduleContext;
  onPlayRanked: (fixtureId: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onOpenRoom: (session: WatchRoomSession) => void;
  onLeaveRoom: () => void | Promise<void>;
}

export function CompeteTab({
  userId,
  schedule,
  onPlayRanked,
  onCreateRoom,
  onJoinRoom,
  onOpenRoom,
  onLeaveRoom,
}: CompeteTabProps) {
  const [subTab, setSubTab] = useState<CompeteSubTab>('ranked');
  useRankedMatchdaySync(userId);

  return (
    <div className="tab-shell tab-shell--compete" role="main" aria-label="Compete">
      <div className="tab-shell__hero">
        <span className="tab-shell__brand-dot" aria-hidden="true" />
        <h1 className="tab-shell__title">Compete</h1>
        <p className="tab-shell__sub">Ranked matchday, live feed, and watch rooms.</p>
      </div>

      <div className="compete-toggle" role="tablist" aria-label="Compete sections">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'ranked'}
          className={`compete-toggle__btn${subTab === 'ranked' ? ' compete-toggle__btn--active' : ''}`}
          onClick={() => setSubTab('ranked')}
        >
          Ranked
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'liveWatch'}
          className={`compete-toggle__btn${subTab === 'liveWatch' ? ' compete-toggle__btn--active' : ''}`}
          onClick={() => setSubTab('liveWatch')}
        >
          Live &amp; Watch Rooms
        </button>
      </div>

      {subTab === 'ranked' ? (
        <CompeteRankedPanel userId={userId} schedule={schedule} onPlayRanked={onPlayRanked} />
      ) : (
        <CompeteLiveWatchPanel
          userId={userId}
          schedule={schedule}
          onCreateRoom={onCreateRoom}
          onJoinRoom={onJoinRoom}
          onOpenRoom={onOpenRoom}
          onLeaveRoom={onLeaveRoom}
        />
      )}
    </div>
  );
}
