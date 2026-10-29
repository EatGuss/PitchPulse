/**
 * DemoSignIn — AWS mode only. Signs the demo accounts (alice, bob, operator)
 * in with the shared demo password before the app mounts, so every request
 * carries a verified identity. The password is set by whoever deployed the
 * stack (SSM parameter); it is never shipped in the bundle.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { isAwsMode } from '../aws/config';
import { isSignedIn, signInDemo, subscribeSession } from '../aws/session';
import './DemoSignIn.css';

export function DemoSignIn({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => !isAwsMode || isSignedIn());
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeSession(() => setSignedIn(isSignedIn())), []);

  if (signedIn) return <>{children}</>;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInDemo(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dsi">
      <form className="dsi__card" onSubmit={onSubmit}>
        <h1 className="dsi__title">PitchPulse demo</h1>
        <p className="dsi__sub">
          Enter the demo password to sign in as Alice, Bob and the match operator.
        </p>
        <label className="dsi__label" htmlFor="dsi-password">
          Demo password
        </label>
        <input
          id="dsi-password"
          className="dsi__input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          autoFocus
        />
        {error && (
          <p className="dsi__error" role="alert">
            {error}
          </p>
        )}
        <button className="dsi__btn" type="submit" disabled={busy || password.length === 0}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
