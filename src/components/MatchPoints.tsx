/**
 * MatchPoints — top-right of every screen. Displays the user's match-local
 * PitchPoints total with tabular figures and a brief +N tick when it grows.
 */

import { useEffect, useRef, useState } from 'react';
import './MatchPoints.css';

export interface MatchPointsProps {
  /** Current match points total. */
  value: number;
}

const formatter = new Intl.NumberFormat('en-US');

export function MatchPoints({ value }: MatchPointsProps) {
  const prev = useRef(value);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    if (value > prev.current) {
      setDelta(value - prev.current);
      const t = setTimeout(() => setDelta(null), 1400);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);

  return (
    <div className="mpoints" aria-label={`Match points: ${value} PitchPoints`}>
      <span className="mpoints__icon" aria-hidden="true">●</span>
      <span className="mpoints__num tabular">{formatter.format(value)}</span>
      <span className="mpoints__suffix">pts</span>
      {delta !== null && <span className="mpoints__delta tabular">+{formatter.format(delta)}</span>}
    </div>
  );
}
