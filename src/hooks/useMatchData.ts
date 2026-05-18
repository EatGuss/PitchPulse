/**
 * useMatchData — loads /public/match-info.json + ensures MatchSim has loaded events.json.
 *
 * Both files are produced by scripts/parse-match-xml.ts (npm run parse, auto-run via predev).
 * Idempotent: safe to call from multiple components — fetches once, returns cached result.
 */

import { useEffect, useState } from 'react';
import type { MatchInfo } from '../domain/types';
import { getMatchSim } from '../sim/matchSim';
import { getPromptEngine } from '../sim/promptEngine';

let cachedInfo: MatchInfo | null = null;
let inflight: Promise<MatchInfo> | null = null;

async function loadMatchInfo(): Promise<MatchInfo> {
  if (cachedInfo) return cachedInfo;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch('/match-info.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load /match-info.json (${res.status})`);
    cachedInfo = (await res.json()) as MatchInfo;
    return cachedInfo;
  })();
  return inflight;
}

export interface MatchDataState {
  info: MatchInfo | null;
  ready: boolean;
  error: string | null;
}

export function useMatchData(): MatchDataState {
  const [state, setState] = useState<MatchDataState>({
    info: cachedInfo,
    ready: cachedInfo !== null && getMatchSim().isLoaded(),
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [info] = await Promise.all([loadMatchInfo(), getMatchSim().load()]);
        if (cancelled) return;
        // Attach the PromptEngine to the live sim once info is known. Idempotent —
        // attach() re-binds clean if called twice (both phone frames trigger this).
        getPromptEngine().attach(info);
        setState({ info, ready: true, error: null });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setState({ info: null, ready: false, error: msg });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
