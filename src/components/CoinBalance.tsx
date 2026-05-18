/**
 * CoinBalance — top-right of every screen. Displays the user's PitchCoin total
 * with tabular figures (no shimmy on increment) and a brief +N tick when it grows.
 *
 * Gate 1: balance is purely cosmetic (no events award coins yet — that lands in
 * Gate 2 with the prompt resolution flow). The widget is still wired so the
 * tick animation is ready to test as soon as Gate 2 attaches a real counter.
 */

import { useEffect, useRef, useState } from 'react';
import './CoinBalance.css';

export interface CoinBalanceProps {
  /** Current coin balance. */
  value: number;
}

const formatter = new Intl.NumberFormat('en-US');

export function CoinBalance({ value }: CoinBalanceProps) {
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
    <div className="cbal" aria-label={`PitchCoin balance: ${value}`}>
      <span className="cbal__icon" aria-hidden="true">●</span>
      <span className="cbal__num tabular">{formatter.format(value)}c</span>
      {delta !== null && <span className="cbal__delta tabular">+{formatter.format(delta)}</span>}
    </div>
  );
}
