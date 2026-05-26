import { useMemo } from 'react';

const COLORS = ['#F5D76E', '#FFFFFF', '#E10E1F', '#FFD700', '#FFF8E7'];

export function OutcomeConfetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: `${(i * 17 + 7) % 100}%`,
        delay: `${(i % 12) * 0.18}s`,
        duration: `${3.2 + (i % 5) * 0.35}s`,
        color: COLORS[i % COLORS.length]!,
        size: 6 + (i % 4) * 2,
        rotate: (i * 47) % 360,
      })),
    [],
  );

  return (
    <div className="outcome-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="outcome-confetti__piece"
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
            backgroundColor: p.color,
            width: p.size,
            height: p.size * 0.55,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
