import type { MatchHistoryEntry } from '../../domain/profileTypes';
import './MeTab.css';

export interface MeMatchHistoryProps {
  entries: MatchHistoryEntry[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const RESULT_CLASS: Record<MatchHistoryEntry['result'], string> = {
  Win: 'me-history__result--win',
  Loss: 'me-history__result--loss',
  Draw: 'me-history__result--draw',
};

export function MeMatchHistory({ entries }: MeMatchHistoryProps) {
  return (
    <section className="me-history" aria-label="Match history">
      <h2 className="me-section__title">Recent matches</h2>
      {entries.length === 0 ? (
        <p className="me-history__empty">No ranked matches yet — play from Compete.</p>
      ) : (
        <ol className="me-history__list">
          {entries.map((entry) => (
            <li key={entry.id} className="me-history__row">
              <div className="me-history__meta">
                <span className="me-history__date">{formatDate(entry.playedAt)}</span>
                <span className="me-history__mode">{entry.mode}</span>
              </div>
              <div className="me-history__main">
                <span className="me-history__fixture">{entry.fixtureLabel}</span>
                <span className="me-history__opp">vs {entry.opponent}</span>
              </div>
              <div className="me-history__tail">
                <span className="me-history__pts tabular">{entry.points}p</span>
                <span className={`me-history__result ${RESULT_CLASS[entry.result]}`}>
                  {entry.result}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
