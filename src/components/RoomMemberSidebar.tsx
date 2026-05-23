/**
 * RoomMemberSidebar — overlay room leaderboard (Watch Room match).
 * Opens from a floating tab without shifting the main layout.
 */

import { useState } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import type { RoomMember } from '../domain/watchRoomTypes';
import './RoomMemberSidebar.css';

export interface RoomMemberSidebarProps {
  viewerId: string;
  members: RoomMember[];
  roomName: string;
}

export function RoomMemberSidebar({ viewerId, members, roomName }: RoomMemberSidebarProps) {
  const [open, setOpen] = useState(false);
  const allRows = useLeaderboard();
  const memberIds = new Set(members.map((m) => m.userId));
  const rows = allRows
    .filter((r) => memberIds.has(r.userId))
    .sort((a, b) => b.coinBalance - a.coinBalance);

  return (
    <aside
      className={`rms ${open ? 'rms--open' : ''}`}
      aria-label={`${roomName} room leaderboard`}
    >
      <button
        type="button"
        className="rms__fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close room leaderboard' : 'Open room leaderboard'}
      >
        <span className="rms__fab-icon" aria-hidden="true">
          {open ? '✕' : '👥'}
        </span>
        <span className="rms__fab-label">Room</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="rms__backdrop"
            aria-label="Close room leaderboard"
            onClick={() => setOpen(false)}
          />
          <div className="rms__panel">
            <div className="rms__head">
              <span className="rms__title">{roomName}</span>
              <button
                type="button"
                className="rms__close"
                onClick={() => setOpen(false)}
                aria-label="Close room panel"
              >
                ✕
              </button>
            </div>
            <p className="rms__sub">Room leaderboard · {members.length} fans</p>
            <ol className="rms__list">
              {rows.map((r, idx) => {
                const isMe = r.userId === viewerId;
                return (
                  <li
                    key={r.userId}
                    className={`rms__row ${isMe ? 'is-me' : ''}`}
                    style={{ ['--rms-tint' as string]: r.team.accent }}
                  >
                    <span className="rms__rank tabular">{idx + 1}</span>
                    <span className="rms__avatar" aria-hidden="true">
                      {r.avatar}
                    </span>
                    <span className="rms__meta">
                      <span className="rms__name">{r.displayName}</span>
                      <span className="rms__coins tabular">
                        {r.coinBalance}
                        <span className="rms__coins-suffix">c</span>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </aside>
  );
}
