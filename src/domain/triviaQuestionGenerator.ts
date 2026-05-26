/**
 * Half-time trivia question generation (mirrors cdk/lambda/trivia-handler/generateQuestions.ts).
 */

import type { NormalizedEvent } from './types';

export interface TriviaOption {
  id: string;
  label: string;
}

export interface GeneratedQuestion {
  questionId: string;
  questionNumber: number;
  text: string;
  options: TriviaOption[];
  correctAnswer: string;
  include: boolean;
  priority: number;
}

const SHOT_TYPES = new Set(['shotMissed', 'shotSaved', 'shotBlocked']);

function aggregateFirstHalf(events: NormalizedEvent[]) {
  const homeTeamId = 'DFL-CLU-000001';
  const guestTeamId = 'DFL-CLU-000002';
  let scoreHome = 0;
  let scoreGuest = 0;
  let shotsHome = 0;
  let shotsGuest = 0;
  let yellowCards = 0;
  let cornersHome = 0;
  let cornersGuest = 0;
  let goals = 0;
  let firstGoalMinute: number | null = null;

  for (const ev of events) {
    if (ev.type === 'halfTime') {
      if (ev.scoreAfter) {
        scoreHome = ev.scoreAfter.home;
        scoreGuest = ev.scoreAfter.guest;
      }
      continue;
    }
    const inFirstHalf =
      ev.matchPhase === 'firstHalf' ||
      (ev.matchMinute <= 45 && ev.matchPhase !== 'secondHalf' && ev.type !== 'fullTime');
    if (!inFirstHalf) continue;

    if (ev.type === 'goal') {
      goals += 1;
      if (firstGoalMinute === null) firstGoalMinute = ev.matchMinute;
      if (ev.teamId === homeTeamId) scoreHome += 1;
      else if (ev.teamId === guestTeamId) scoreGuest += 1;
    }
    if (SHOT_TYPES.has(ev.type)) {
      if (ev.teamId === homeTeamId) shotsHome += 1;
      else if (ev.teamId === guestTeamId) shotsGuest += 1;
    }
    if (ev.type === 'card' && ev.cardColor === 'yellow') yellowCards += 1;
    if (ev.type === 'corner') {
      if (ev.teamId === homeTeamId) cornersHome += 1;
      else if (ev.teamId === guestTeamId) cornersGuest += 1;
    }
  }

  return {
    scoreHome,
    scoreGuest,
    shotsHome,
    shotsGuest,
    yellowCards,
    cornersHome,
    cornersGuest,
    goals,
    firstGoalMinute,
  };
}

function teamMoreLabel(home: number, guest: number) {
  const correct = home > guest ? 'HOME' : guest > home ? 'AWAY' : 'EQUAL';
  return {
    correct,
    options: [
      { id: 'HOME', label: 'HOME' },
      { id: 'AWAY', label: 'AWAY' },
      { id: 'EQUAL', label: 'EQUAL' },
    ],
  };
}

function yellowCardOptions(count: number) {
  const correct = count >= 3 ? '3+' : String(count);
  return {
    correct,
    options: [
      { id: '0', label: '0' },
      { id: '1', label: '1' },
      { id: '2', label: '2' },
      { id: '3+', label: '3+' },
    ],
  };
}

function goalsOptions(count: number) {
  const correct = count >= 3 ? '3+' : String(count);
  return {
    correct,
    options: [
      { id: '0', label: '0' },
      { id: '1', label: '1' },
      { id: '2', label: '2' },
      { id: '3+', label: '3+' },
    ],
  };
}

function scoreLabel(h: number, g: number): string {
  if (h === g) return `${h}-${g}`;
  const leader = h > g ? 'HOME' : 'AWAY';
  return `${Math.max(h, g)}-${Math.min(h, g)} ${leader}`;
}

function buildScoreQuestion(stats: ReturnType<typeof aggregateFirstHalf>): GeneratedQuestion {
  const correct = scoreLabel(stats.scoreHome, stats.scoreGuest);
  const decoys = new Set<string>();
  const candidates = [
    scoreLabel(0, 0),
    scoreLabel(1, 0),
    scoreLabel(0, 1),
    scoreLabel(1, 1),
    scoreLabel(2, 0),
    scoreLabel(0, 2),
    scoreLabel(2, 1),
    scoreLabel(1, 2),
  ].filter((s) => s !== correct);
  while (decoys.size < 3 && candidates.length > 0) {
    const pick = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
    if (pick) decoys.add(pick);
  }
  const options = [correct, ...Array.from(decoys).slice(0, 3)].map((label, i) => ({
    id: `opt-${i}`,
    label,
  }));
  const shuffled = [...options].sort(() => Math.random() - 0.5);
  const correctId = shuffled.find((o) => o.label === correct)?.id ?? shuffled[0].id;
  return {
    questionId: 'ht_score',
    questionNumber: 0,
    text: 'What was the score at half-time?',
    options: shuffled,
    correctAnswer: correctId,
    include: true,
    priority: 100,
  };
}

function firstGoalBucket(minute: number | null, goals: number) {
  if (goals === 0 || minute === null) {
    return {
      correct: 'none',
      options: [
        { id: '0-15', label: "0-15'" },
        { id: '16-30', label: "16-30'" },
        { id: '31-45', label: "31-45'" },
        { id: 'none', label: 'No goal' },
      ],
    };
  }
  let correct: string;
  if (minute <= 15) correct = '0-15';
  else if (minute <= 30) correct = '16-30';
  else correct = '31-45';
  return {
    correct,
    options: [
      { id: '0-15', label: "0-15'" },
      { id: '16-30', label: "16-30'" },
      { id: '31-45', label: "31-45'" },
      { id: 'none', label: 'No goal' },
    ],
  };
}

export function generateTriviaQuestions(events: NormalizedEvent[]): GeneratedQuestion[] {
  const stats = aggregateFirstHalf(events);
  const shots = teamMoreLabel(stats.shotsHome, stats.shotsGuest);
  const corners = teamMoreLabel(stats.cornersHome, stats.cornersGuest);
  const yellow = yellowCardOptions(stats.yellowCards);
  const goalCount = goalsOptions(stats.goals);
  const fg = firstGoalBucket(stats.firstGoalMinute, stats.goals);
  const scoreQ = buildScoreQuestion(stats);
  const totalShots = stats.shotsHome + stats.shotsGuest;
  const totalCorners = stats.cornersHome + stats.cornersGuest;

  const pool = [
    {
      questionId: 'shots_more',
      questionNumber: 0,
      text: 'Which team had more shots in the first half?',
      options: shots.options,
      correctAnswer: shots.correct,
      include: true,
      priority: totalShots > 0 ? 80 : 50,
    },
    {
      questionId: 'yellow_cards',
      questionNumber: 0,
      text: 'How many yellow cards were shown in the first half?',
      options: yellow.options,
      correctAnswer: yellow.correct,
      include: true,
      priority: 70,
    },
    scoreQ,
    {
      questionId: 'corners_more',
      questionNumber: 0,
      text: 'Which team had more corners in the first half?',
      options: corners.options,
      correctAnswer: corners.correct,
      include: true,
      priority: totalCorners > 0 ? 60 : 40,
    },
    {
      questionId: 'goals_count',
      questionNumber: 0,
      text: 'How many goals were scored in the first half?',
      options: goalCount.options,
      correctAnswer: goalCount.correct,
      include: true,
      priority: 90,
    },
    {
      questionId: 'first_goal_minute',
      questionNumber: 0,
      text: 'Which half-minute did the first goal happen?',
      options: fg.options,
      correctAnswer: fg.correct,
      include: stats.goals >= 1,
      priority: stats.goals >= 1 ? 75 : 0,
    },
  ].filter((q) => q.include);

  const sorted = [...pool].sort((a, b) => b.priority - a.priority);
  return sorted.slice(0, 3).map((q, i) => ({ ...q, questionNumber: i + 1 }));
}
