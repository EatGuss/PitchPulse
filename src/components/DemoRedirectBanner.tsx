/**
 * Shown on `/` only — steers presenters to the two-phone `/demo` route.
 */

import { Link } from 'react-router-dom';
import './DemoRedirectBanner.css';

export function DemoRedirectBanner() {
  return (
    <aside className="demo-banner" role="note" aria-label="Demo route hint">
      <p className="demo-banner__text">
        <strong>Recording or presenting?</strong> Use the two-phone demo — pre-seeded tiers, shared
        match sim, Ranked 1v1, and Watch Rooms.
      </p>
      <Link className="demo-banner__cta" to="/demo">
        Open /demo →
      </Link>
    </aside>
  );
}
