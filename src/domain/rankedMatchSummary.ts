import type { DemoUserId } from '../data/personas';
import type { PromptHistoryEntry } from './promptTypes';
import type { RankedMatchResult } from './rankedTypes';
import { TIER_LABELS, WINS_TO_ADVANCE, type Tier } from './tiers';
import type { UserRankedOutcome } from './rankedTypes';

export interface PreMatchSnapshot {
  weeklyPoints: number;
  seasonalPoints: number;
  tier: Tier;
  tierWinsTowardNext: number;
}

export interface MatchPointsBreakdown {
  basePoints: number;
  streakBonus: number;
  hotTakeBonus: number;
}

export interface HotTakeLine {
  userId: string;
  displayName: string;
  hits: number;
  misses: number;
  hitPoints: number;
}

export interface TierProgressSummary {
  tier: Tier;
  winsTowardNext: number;
  winsNeeded: number | null;
  nextTier: Tier | null;
  label: string;
  muted: boolean;
  promoted: boolean;
  fillPercent: number;
  fillPercentBefore: number;
}

export interface MatchSummaryData {
  playedAt: string;
  matchPoints: number;
  breakdown: MatchPointsBreakdown;
  /** Points from this match added to weekly / seasonal totals. */
  weeklyAdded: number;
  seasonalAdded: number;
  tierProgress: TierProgressSummary;
  hotTakeLines: HotTakeLine[];
  timeline: PromptHistoryEntry[];
}

function nextTier(tier: Tier): Tier | null {
  const order: Tier[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'CHAMPION'];
  const idx = order.indexOf(tier);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1]!;
}

export function computePointsBreakdown(
  history: PromptHistoryEntry[],
  matchPoints: number,
): MatchPointsBreakdown {
  let basePoints = 0;
  let hotTakeBonus = 0;

  for (const row of history) {
    if (!row.won) continue;
    if (row.hotTake) {
      basePoints += row.baseReward;
      hotTakeBonus += Math.max(0, row.payout - row.baseReward);
    } else {
      basePoints += row.payout;
    }
  }

  const streakBonus = Math.max(0, matchPoints - basePoints - hotTakeBonus);
  return { basePoints, streakBonus, hotTakeBonus };
}

export function buildHotTakeLines(
  viewerId: DemoUserId,
  viewerName: string,
  opponentId: string,
  opponentName: string,
  viewerHistory: PromptHistoryEntry[],
  opponentHistory: PromptHistoryEntry[],
): HotTakeLine[] {
  const summarize = (userId: string, name: string, history: PromptHistoryEntry[]): HotTakeLine | null => {
    const hotRows = history.filter((h) => h.hotTake);
    if (hotRows.length === 0) return null;
    const hits = hotRows.filter((h) => h.won).length;
    const misses = hotRows.length - hits;
    const hitPoints = hotRows.filter((h) => h.won).reduce((s, h) => s + h.payout, 0);
    return { userId, displayName: name, hits, misses, hitPoints };
  };

  const lines = [
    summarize(viewerId, viewerName, viewerHistory),
    summarize(opponentId, opponentName, opponentHistory),
  ].filter((l): l is HotTakeLine => l !== null);

  return lines;
}

export function buildTierProgressSummary(
  outcome: UserRankedOutcome,
  before: PreMatchSnapshot,
  afterTier: Tier,
  afterWins: number,
  matchResult: RankedMatchResult | null,
): TierProgressSummary {
  const next = nextTier(afterTier);
  const winsNeeded = WINS_TO_ADVANCE[afterTier];
  const fillAfter =
    winsNeeded === null || winsNeeded <= 0
      ? 100
      : Math.min(100, Math.round((afterWins / winsNeeded) * 100));

  const beforeNeeded = WINS_TO_ADVANCE[before.tier];
  const fillBefore =
    beforeNeeded === null || beforeNeeded <= 0
      ? 100
      : Math.min(100, Math.round((before.tierWinsTowardNext / beforeNeeded) * 100));

  const promoted = Boolean(matchResult?.promoted && matchResult.newTier);
  const tierLabel = TIER_LABELS[afterTier];
  const nextLabel = next ? TIER_LABELS[next] : null;

  let label: string;
  let muted = false;

  if (outcome === 'WIN' && promoted && matchResult?.newTier) {
    const prevTier = before.tier;
    const threshold = WINS_TO_ADVANCE[prevTier];
    label = `${TIER_LABELS[prevTier]} — ${threshold ?? afterWins}/${threshold ?? afterWins} wins → Promoted to ${TIER_LABELS[matchResult.newTier]}!`;
  } else if (outcome === 'WIN' && nextLabel && winsNeeded !== null) {
    label = `${tierLabel} — ${afterWins}/${winsNeeded} wins to ${nextLabel}`;
  } else if (nextLabel && winsNeeded !== null) {
    label = `${tierLabel} — ${afterWins}/${winsNeeded} wins to ${nextLabel} (unchanged)`;
    muted = true;
  } else {
    label = `${tierLabel} — Champion tier (unchanged)`;
    muted = outcome !== 'WIN';
  }

  return {
    tier: afterTier,
    winsTowardNext: afterWins,
    winsNeeded,
    nextTier: next,
    label,
    muted,
    promoted,
    fillPercent: outcome === 'WIN' ? fillAfter : fillBefore,
    fillPercentBefore: fillBefore,
  };
}

export function buildMatchSummaryData(input: {
  viewerId: DemoUserId;
  viewerName: string;
  opponentId: string;
  opponentName: string;
  matchPoints: number;
  viewerHistory: PromptHistoryEntry[];
  opponentHistory: PromptHistoryEntry[];
  preMatch: PreMatchSnapshot;
  afterTier: Tier;
  afterWins: number;
  outcome: UserRankedOutcome;
  matchResult: RankedMatchResult | null;
}): MatchSummaryData {
  const breakdown = computePointsBreakdown(input.viewerHistory, input.matchPoints);
  const hotTakeLines = buildHotTakeLines(
    input.viewerId,
    input.viewerName,
    input.opponentId,
    input.opponentName,
    input.viewerHistory,
    input.opponentHistory,
  );

  return {
    playedAt: new Date().toISOString(),
    matchPoints: input.matchPoints,
    breakdown,
    weeklyAdded: input.matchPoints,
    seasonalAdded: input.matchPoints,
    tierProgress: buildTierProgressSummary(
      input.outcome,
      input.preMatch,
      input.afterTier,
      input.afterWins,
      input.matchResult,
    ),
    hotTakeLines,
    timeline: input.viewerHistory,
  };
}

