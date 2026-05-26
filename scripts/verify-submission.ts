/**
 * Gate K — pre-zip checklist for hackathon submission artifacts.
 *
 * Run: npm run verify:submission
 *
 * Does not create the zip; validates files under submission/ before you zip.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SUB = join(ROOT, 'submission');

const PLACEHOLDER_HANDLE = '<your-github-handle>';

let errors = 0;
let warnings = 0;

function fail(msg: string): void {
  console.error(`✗ ${msg}`);
  errors += 1;
}

function warn(msg: string): void {
  console.warn(`⚠ ${msg}`);
  warnings += 1;
}

function pass(msg: string): void {
  console.log(`✓ ${msg}`);
}

function requireFile(name: string, maxMb?: number): void {
  const path = join(SUB, name);
  if (!existsSync(path)) {
    fail(`Missing submission/${name}`);
    return;
  }
  const bytes = statSync(path).size;
  if (bytes === 0) {
    fail(`submission/${name} is empty`);
    return;
  }
  const mb = bytes / (1024 * 1024);
  if (maxMb !== undefined && mb > maxMb) {
    warn(`submission/${name} is ${mb.toFixed(2)} MB (target < ${maxMb} MB)`);
  } else {
    pass(`submission/${name} (${(bytes / 1024).toFixed(1)} KB)`);
  }
}

console.log('[verify-submission] Checking submission/ artifacts…\n');

requireFile('github_link.txt');

const linkPath = join(SUB, 'github_link.txt');
if (existsSync(linkPath)) {
  const raw = readFileSync(linkPath, 'utf8');
  const urlLine = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith('http'));
  if (!urlLine) {
    fail('github_link.txt has no http URL on its own line');
  } else if (urlLine.includes(PLACEHOLDER_HANDLE)) {
    fail(`github_link.txt still contains placeholder "${PLACEHOLDER_HANDLE}"`);
  } else if (!/^https:\/\/github\.com\/.+\/PitchPulse\/?$/i.test(urlLine)) {
    warn(`github_link.txt URL looks unusual: ${urlLine}`);
  } else {
    pass(`github_link.txt → ${urlLine}`);
  }
}

requireFile('presentation_video.mp4', 80);
requireFile('executive_summary.pdf', 5);

const prfaq = join(SUB, 'prfaq.pdf');
if (existsSync(prfaq)) {
  requireFile('prfaq.pdf', 5);
} else {
  pass('prfaq.pdf omitted (optional)');
}

const gitignorePath = join(ROOT, '.gitignore');
if (existsSync(gitignorePath)) {
  const gi = readFileSync(gitignorePath, 'utf8');
  if (!gi.includes('.env.local')) {
    warn('.gitignore may not ignore .env.local');
  } else {
    pass('.env.local is gitignored');
  }
}

console.log('');
if (errors > 0) {
  console.error(`[verify-submission] FAILED — ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
}
if (warnings > 0) {
  console.log(`[verify-submission] OK with ${warnings} warning(s) — review before uploading`);
  process.exit(0);
}
console.log('[verify-submission] All required artifacts present — ready to zip');
