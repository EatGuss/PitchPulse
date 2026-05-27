import { useEffect, useState } from 'react';
import { findRankedMatch } from '../aws/rankedClient';
import { ensureAwsLockInSynced } from '../aws/rankedMatchdayClient';
import type { DemoUserId } from '../data/personas';
import type { RankedOpponent } from '../domain/rankedTypes';
import { OpponentReveal } from './OpponentReveal';
import './RankedMatchmaking.css';

const MATCHMAKE_MS = 3000;

export interface RankedMatchmakingProps {
  userId: DemoUserId;
  onBack: () => void;
  onMatchStart: (opponent: RankedOpponent) => void;
}

type Phase = 'searching' | 'reveal';

export function RankedMatchmaking({ userId, onBack, onMatchStart }: RankedMatchmakingProps) {
  const [phase, setPhase] = useState<Phase>('searching');
  const [opponent, setOpponent] = useState<RankedOpponent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        await ensureAwsLockInSynced(userId);
        const [found] = await Promise.all([
          findRankedMatch(userId),
          new Promise<void>((resolve) => setTimeout(resolve, MATCHMAKE_MS)),
        ]);
        if (cancelled) return;
        setOpponent(found);
        setPhase('reveal');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Matchmaking failed');
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) {
    return (
      <div className="ranked-mm ranked-mm--err" role="alert">
        <button type="button" className="ranked-mm__back" onClick={onBack}>
          ← Back
        </button>
        <p className="ranked-mm__err">{error}</p>
      </div>
    );
  }

  if (phase === 'reveal' && opponent) {
    return (
      <OpponentReveal
        opponent={opponent}
        onComplete={() => onMatchStart(opponent)}
      />
    );
  }

  return (
    <div className="ranked-mm" role="main" aria-label="Finding ranked opponent">
      <button type="button" className="ranked-mm__back" onClick={onBack}>
        ← Back
      </button>
      <div className="ranked-mm__spinner" aria-hidden="true" />
      <h1 className="ranked-mm__title">Finding opponent…</h1>
      <p className="ranked-mm__sub">Pairing you with a rival for ranked matchday.</p>
    </div>
  );
}
