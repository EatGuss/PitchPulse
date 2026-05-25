import type { MatchInfo, NormalizedEvent } from '../../domain/types';
import { demoFixtureDisplayTitle } from '../../domain/matchday';
import { summarizeEvent } from '../../utils/eventSummary';
import './HomeWhatsLive.css';

export interface HomeWhatsLiveProps {
  events: NormalizedEvent[];
  info: MatchInfo;
  onOpenFeed: () => void;
}

export function HomeWhatsLive({ events, info, onOpenFeed }: HomeWhatsLiveProps) {
  const recent = events.slice(-3).reverse().map((e) => summarizeEvent(e, info));
  const demoLabel = demoFixtureDisplayTitle();

  return (
    <section className="hwlive" aria-label="What's Live">
      <button type="button" className="hwlive__card" onClick={onOpenFeed}>
        <header className="hwlive__head">
          <div className="hwlive__head-left">
            <span className="hwlive__live-dot" aria-hidden="true" />
            <h2 className="hwlive__title">What&apos;s Live</h2>
          </div>
          <span className="hwlive__chev" aria-hidden="true">Open feed →</span>
        </header>

        <p className="hwlive__match">{demoLabel}</p>

        {recent.length > 0 ? (
          <ul className="hwlive__list">
            {recent.map((row) => (
              <li key={row.id} className="hwlive__row">
                <span className="hwlive__headline">{row.headline}</span>
                {row.subline && <span className="hwlive__sub">{row.subline}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hwlive__waiting">Match is live — waiting for the first event…</p>
        )}

        <span className="hwlive__tap">Tap for full live feed</span>
      </button>
    </section>
  );
}
