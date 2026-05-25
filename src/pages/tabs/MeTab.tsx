/**
 * MeTab — profile, titles, stats, match history (Gate G).
 */

import { useState } from 'react';
import type { DemoUserId } from '../../data/personas';
import { MeMatchHistory } from '../../components/me/MeMatchHistory';
import { MeProfileHeader } from '../../components/me/MeProfileHeader';
import { MeSettingsSheet } from '../../components/me/MeSettingsSheet';
import { MeStatsCard } from '../../components/me/MeStatsCard';
import { MeTierBar } from '../../components/me/MeTierBar';
import { MeTitlesGrid } from '../../components/me/MeTitlesGrid';
import { useMeProfile } from '../../hooks/useMeProfile';
import '../../components/me/MeTab.css';
import './TabShell.css';

export interface MeTabProps {
  userId: DemoUserId;
  onSwitchUser?: () => void;
}

export function MeTab({ userId, onSwitchUser }: MeTabProps) {
  const { profile, loading, equipping, equipTitle } = useMeProfile(userId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingTitles, setEditingTitles] = useState(false);

  const handleEquip = async (titleId: string) => {
    const ok = await equipTitle(titleId);
    if (ok) setEditingTitles(false);
  };

  return (
    <div className="tab-shell tab-shell--me" role="main" aria-label="Me">
      {loading ? (
        <p className="me-loading">Loading profile…</p>
      ) : !profile ? (
        <p className="me-loading">Could not load profile. Try refreshing the page.</p>
      ) : (
        <>
          <MeProfileHeader
            profile={profile}
            onEditTitle={() => setEditingTitles(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          {editingTitles ? (
            <p className="me-edit-hint">Tap an unlocked title to equip</p>
          ) : null}
          <MeStatsCard profile={profile} />
          <MeTierBar profile={profile} />
          <MeTitlesGrid
            profile={profile}
            editing={editingTitles}
            equipping={equipping}
            onEquip={handleEquip}
          />
          <MeMatchHistory entries={profile.matchHistory} />
        </>
      )}

      <MeSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSwitchUser={
          onSwitchUser
            ? () => {
                setSettingsOpen(false);
                onSwitchUser();
              }
            : undefined
        }
      />
    </div>
  );
}
