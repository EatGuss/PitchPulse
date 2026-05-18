/**
 * DataDisclosure — single source for the on-screen "this is anonymized
 * hackathon data, not a real broadcast" line.
 *
 * Three render variants:
 *   - `footer`  — full-width subtle line for /demo page bottom
 *   - `card`    — boxed for the onboarding modal (lands in Gate 5)
 *   - `inline`  — one-liner pill, for tight chrome spots
 *
 * Keep the copy short. We are NOT trying to write a license agreement here —
 * just a single honest sentence so judges and viewers know what they're seeing.
 */

import './DataDisclosure.css';

export interface DataDisclosureProps {
  variant?: 'footer' | 'card' | 'inline';
}

const HEADLINE = 'Anonymized hackathon match data';
const BODY =
  'Replayed from the DFL-supplied anonymized XML (match ID DFL-MAT-000001, final 5:0). ' +
  'Team labels (FC Bayern, Borussia Dortmund) and player numbers are illustrative — ' +
  'no real-world crests, kits, logos, or player photos are used anywhere in this app.';

export function DataDisclosure({ variant = 'footer' }: DataDisclosureProps) {
  if (variant === 'inline') {
    return (
      <p className="disc disc--inline" role="note">
        <span className="disc__badge">i</span>
        {HEADLINE}. Team labels illustrative.
      </p>
    );
  }
  if (variant === 'card') {
    return (
      <aside className="disc disc--card" role="note" aria-label="Data and licensing disclosure">
        <h3 className="disc__title">
          <span className="disc__badge">i</span>
          {HEADLINE}
        </h3>
        <p className="disc__body">{BODY}</p>
      </aside>
    );
  }
  return (
    <footer className="disc disc--footer" role="note" aria-label="Data and licensing disclosure">
      <span className="disc__badge">i</span>
      <span className="disc__copy">
        <strong>{HEADLINE}.</strong> {BODY}
      </span>
    </footer>
  );
}
