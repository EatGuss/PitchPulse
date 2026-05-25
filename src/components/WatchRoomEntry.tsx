import { useState } from 'react';
import type { DemoUserId } from '../data/personas';
import { DEMO_USERS } from '../data/personas';
import { createWatchRoom, joinWatchRoom } from '../aws/roomClient';
import type { WatchRoomSession } from '../domain/watchRoomTypes';
import { isInviteCodeComplete, normalizeInviteCode } from '../domain/watchRoomTypes';
import { SelectMatchModal } from './home/SelectMatchModal';
import { useMatchdaySchedule } from '../hooks/useMatchdaySchedule';
import { WatchRoomMinimizedCard } from './WatchRoomMinimizedCard';
import './WatchRoomEntry.css';

export interface WatchRoomEntryProps {
  userId: DemoUserId;
  activeRoom: WatchRoomSession | null;
  onBack: () => void;
  onJoined: (session: WatchRoomSession) => void;
  onOpenRoom: (session: WatchRoomSession) => void;
  onLeaveRoom: () => void | Promise<void>;
}

type Step = 'menu' | 'enterCode' | 'pickMatch';

export function WatchRoomEntry({
  userId,
  activeRoom,
  onBack,
  onJoined,
  onOpenRoom,
  onLeaveRoom,
}: WatchRoomEntryProps) {
  const user = DEMO_USERS[userId];
  const schedule = useMatchdaySchedule();
  const [step, setStep] = useState<Step>('menu');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCreate = async (matchId: string) => {
    setBusy(true);
    setError(null);
    try {
      const session = await createWatchRoom(userId, user.displayName, matchId);
      onJoined(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room');
    } finally {
      setBusy(false);
    }
  };

  const runJoin = async () => {
    const normalized = normalizeInviteCode(code);
    if (!normalized) {
      setError('Enter a valid code in XXX-XXX format');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await joinWatchRoom(normalized, userId, user.displayName);
      onJoined(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join room');
    } finally {
      setBusy(false);
    }
  };

  const formatCodeInput = (raw: string) => {
    const upper = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const compact = upper.replace(/-/g, '').slice(0, 6);
    if (compact.length <= 3) return compact;
    return `${compact.slice(0, 3)}-${compact.slice(3)}`;
  };

  return (
    <div className="wr-entry" role="main" aria-label="Watch Room — create or join">
      <div className="wr-entry__hero">
        <button type="button" className="wr-entry__back" onClick={onBack} disabled={busy}>
          ← Back
        </button>
        <h1 className="wr-entry__title">Watch Room</h1>
        <p className="wr-entry__sub">
          One room at a time — create or join with an invite code.
        </p>
      </div>

      {activeRoom && step === 'menu' && (
        <WatchRoomMinimizedCard
          room={activeRoom}
          onOpen={() => onOpenRoom(activeRoom)}
          onLeave={() => void onLeaveRoom()}
        />
      )}

      {step === 'menu' ? (
        !activeRoom && (
          <div className="wr-entry__actions">
            <button
              type="button"
              className="wr-entry__primary"
              onClick={() => {
                setStep('pickMatch');
                setError(null);
              }}
              disabled={busy}
            >
              Create Room
            </button>
            <button
              type="button"
              className="wr-entry__secondary"
              onClick={() => {
                setStep('enterCode');
                setError(null);
              }}
              disabled={busy}
            >
              Enter Code
            </button>
          </div>
        )
      ) : step === 'enterCode' ? (
        <div className="wr-entry__join">
          <p className="wr-entry__label">INVITE CODE</p>
          <input
            className="wr-entry__input"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={7}
            placeholder="PLZ-739"
            value={code}
            onChange={(e) => {
              setCode(formatCodeInput(e.target.value));
              setError(null);
            }}
            aria-label="6-character invite code"
          />
          <button
            type="button"
            className="wr-entry__primary"
            onClick={() => void runJoin()}
            disabled={busy || !isInviteCodeComplete(code)}
          >
            {busy ? 'Joining…' : 'Join Room'}
          </button>
          <button
            type="button"
            className="wr-entry__link"
            onClick={() => {
              setStep('menu');
              setCode('');
              setError(null);
            }}
            disabled={busy}
          >
            ← Back to options
          </button>
        </div>
      ) : null}

      <SelectMatchModal
        open={step === 'pickMatch'}
        mode="room"
        schedule={schedule}
        onClose={() => {
          if (!busy) setStep('menu');
        }}
        onPick={(fixtureId) => {
          setStep('menu');
          void runCreate(fixtureId);
        }}
      />

      {error && (
        <p className="wr-entry__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
