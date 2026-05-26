/**
 * Offline check: half-time trivia question selection from sample events.
 * Run: npx tsx scripts/verify-trivia-generate.ts
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS = resolve(__dirname, '../public/events.json');

// Mirror trivia-handler types (no path alias in script)
type Row = {
  type: string;
  matchMinute: number;
  matchPhase?: string;
  teamId?: string;
  cardColor?: string;
  scoreHome?: number;
  scoreGuest?: number;
};

async function main() {
  const { generateTriviaQuestions } = await import('../src/domain/triviaQuestionGenerator.ts');
  const parsed = JSON.parse(readFileSync(EVENTS, 'utf8')) as { events: Row[] };
  const raw = parsed.events;
  const firstHalf = raw.filter(
    (e) =>
      e.type === 'halfTime' ||
      e.matchPhase === 'firstHalf' ||
      (e.matchMinute <= 45 && e.matchPhase !== 'secondHalf'),
  );
  const questions = generateTriviaQuestions(firstHalf);
  console.log('[verify-trivia] Selected', questions.length, 'questions:');
  for (const q of questions) {
    console.log(`  Q${q.questionNumber}: ${q.text}`);
    console.log(`    correct=${q.correctAnswer} options=${q.options.map((o) => o.id).join(',')}`);
  }
  if (questions.length !== 3) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
