/**
 * PhoneFrame — desktop wrapper that renders its children inside a 390×844
 * mobile chrome (rounded corners, bezel, notch, fake iOS status bar, 34px
 * bottom safe-area). Toggle off with ?frame=off for raw mobile preview.
 *
 * The constraint IS the visual story: every screen below this component is
 * authored as if it were a real native app. Do not exceed 390px width inside.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import './PhoneFrame.css';

export interface PhoneFrameProps {
  /** Optional label rendered as a small chip ABOVE the phone (demo only). */
  label?: string;
  /** Optional sub-label (e.g. team affinity). */
  subLabel?: string;
  /** Force chrome on/off. Default = consult ?frame=off query param. */
  withChrome?: boolean;
  children: ReactNode;
}

function useFrameQueryParam(): boolean {
  const [withChrome, setWithChrome] = useState(true);
  useEffect(() => {
    const update = () => {
      const params = new URLSearchParams(window.location.search);
      setWithChrome(params.get('frame') !== 'off');
    };
    update();
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return withChrome;
}

function StatusBar() {
  // Static fake status bar so the screenshot looks like a real device.
  // Time is frozen at 9:41 — Apple's iconic launch-day time — to keep
  // recorded demos looking polished without an animating real-time clock
  // distracting from match events.
  return (
    <div className="ppfr-statusbar">
      <span className="ppfr-statusbar__time tabular">9:41</span>
      <div className="ppfr-statusbar__dynamic-island" aria-hidden="true" />
      <span className="ppfr-statusbar__icons" aria-hidden="true">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
          <rect x="0"  y="7" width="3" height="5" rx="0.5" />
          <rect x="5"  y="4" width="3" height="8" rx="0.5" />
          <rect x="10" y="2" width="3" height="10" rx="0.5" />
          <rect x="15" y="0" width="3" height="12" rx="0.5" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
          <path d="M8 11.2c.66 0 1.2-.54 1.2-1.2S8.66 8.8 8 8.8 6.8 9.34 6.8 10s.54 1.2 1.2 1.2Z" fill="currentColor" />
          <path d="M3.8 7.7a5.95 5.95 0 0 1 8.4 0l-1.06 1.06a4.45 4.45 0 0 0-6.28 0L3.8 7.7Z" fill="currentColor"/>
          <path d="M1.7 5.6a8.94 8.94 0 0 1 12.6 0l-1.06 1.06a7.44 7.44 0 0 0-10.48 0L1.7 5.6Z" fill="currentColor"/>
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none" aria-hidden="true">
          <rect x="0.5" y="0.5" width="21" height="11" rx="2.5" stroke="currentColor" opacity="0.45" />
          <rect x="2" y="2" width="18" height="8" rx="1.5" fill="currentColor" />
          <rect x="22.5" y="4" width="1.5" height="4" rx="0.5" fill="currentColor" opacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

export function PhoneFrame({ label, subLabel, withChrome, children }: PhoneFrameProps) {
  const queryChrome = useFrameQueryParam();
  const showChrome = withChrome ?? queryChrome;
  const innerRef = useRef<HTMLDivElement>(null);

  if (!showChrome) {
    return <div className="ppfr-raw">{children}</div>;
  }

  return (
    <div className="ppfr-wrap">
      {label && (
        <div className="ppfr-chip" data-testid="phone-label">
          <span className="ppfr-chip__dot" />
          <span className="ppfr-chip__label">{label}</span>
          {subLabel && <span className="ppfr-chip__sub">· {subLabel}</span>}
        </div>
      )}

      <div className="ppfr-device">
        <div className="ppfr-bezel">
          <div className="ppfr-screen" ref={innerRef}>
            <StatusBar />
            <div className="ppfr-content">{children}</div>
            <div className="ppfr-homebar" aria-hidden="true" />
          </div>
        </div>
        {/* Side buttons for visual depth */}
        <div className="ppfr-sidebtn ppfr-sidebtn--silent" aria-hidden="true" />
        <div className="ppfr-sidebtn ppfr-sidebtn--vol-up" aria-hidden="true" />
        <div className="ppfr-sidebtn ppfr-sidebtn--vol-down" aria-hidden="true" />
        <div className="ppfr-sidebtn ppfr-sidebtn--power" aria-hidden="true" />
      </div>
    </div>
  );
}
