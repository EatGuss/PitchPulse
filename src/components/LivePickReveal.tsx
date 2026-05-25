/**
 * Live pick badges below the prompt card.
 *   - watch-room: reveal each member's pick as soon as they vote
 *   - both-voted: reveal only after all demo fans have voted (Ranked)
 */

import { DEMO_USERS, type DemoUserId } from '../data/personas';
import type { PromptInstance } from '../domain/promptTypes';
import type { RoomMember } from '../domain/watchRoomTypes';
import './LivePickReveal.css';

const PUBLIC_VOTERS: DemoUserId[] = ['alice', 'bob'];

export type PickRevealMode = 'live' | 'both-voted';

export interface LivePickRevealProps {
  prompt: PromptInstance;
  viewerId: string;
  mode: PickRevealMode;
  /** Room members when mode === 'live'. */
  members?: RoomMember[];
}

export function LivePickReveal({ prompt, viewerId, mode, members = [] }: LivePickRevealProps) {
  const voters =
    mode === 'live'
      ? members.map((m) => m.userId)
      : PUBLIC_VOTERS;

  const othersWithPicks = voters
    .filter((id) => id !== viewerId && prompt.userVotes[id])
    .map((id) => {
      const optionId = prompt.userVotes[id]!;
      const option = prompt.options.find((o) => o.id === optionId);
      const name =
        mode === 'live'
          ? (members.find((m) => m.userId === id)?.displayName ??
            DEMO_USERS[id as DemoUserId]?.displayName ??
            id)
          : (DEMO_USERS[id as DemoUserId]?.displayName ?? id);
      return { userId: id, name, label: option?.label ?? optionId };
    });

  if (mode === 'both-voted') {
    const allVoted = PUBLIC_VOTERS.every((id) => prompt.userVotes[id]);
    if (!allVoted) return null;
  }

  if (othersWithPicks.length === 0) return null;

  return (
    <div className="lpr" aria-live="polite">
      {othersWithPicks.map((pick) => (
        <span key={pick.userId} className="lpr__badge">
          <span className="lpr__name">{pick.name}</span>
          <span className="lpr__verb">picked</span>
          <span className="lpr__pick">{pick.label}</span>
        </span>
      ))}
    </div>
  );
}
