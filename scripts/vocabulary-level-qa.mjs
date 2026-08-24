#!/usr/bin/env node
/**
 * Is the 1–30 Vocabulary Level a real scale, or a number beside `Lv.`?
 *
 *   npm run vocabulary:level:qa
 *   npm run vocabulary:level:qa -- --check
 *
 * ## What this is for
 *
 * The level it replaced was a word's **frequency rank**, bucketed against a
 * scale sized for ten thousand words when the corpus had under three thousand.
 * Levels 15 to 29 held nothing at all; level 30 held the eight words the
 * frequency corpora had never seen. Simulated, a learner placed at 15 and a
 * learner placed at 20 received an identical list, and one placed at 30 cycled
 * through 82 words. Every automated check in the repository was green.
 *
 * So the checks here are the ones that would have caught that, and each is
 * written to fail on the state the product was actually in:
 *
 * | | |
 * | --- | --- |
 * | **Every level is valid** | an integer in 1–30, on every taught word |
 * | **Every level is populated** | enough words to build a day from, not one |
 * | **Difficulty rises** | the median score of level N+1 is above level N's |
 * | **The anchors hold** | 162 words a person placed, still where they were put |
 * | **No contamination** | no beginner word at the top, no idiom at the bottom |
 *
 * ## What it cannot tell you
 *
 * Whether the words at level 17 are the right words for level 17. Nothing
 * automated can: the levels were read one at a time, and
 * `docs/level-galleries/` is what they were read from. A green run here means
 * the scale is shaped like a scale.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const built = read('apps/web/src/data/generated/vocabulary.json');
const english = read('apps/web/src/data/generated/vocabulary.en.json').words;
const anchors = read('content/vocabulary/level-anchors.json');
const signals = read('content/vocabulary/word-signals.json').words;
/**
 * Words a person has already looked at.
 *
 * The contamination checks below are §25's "warnings requiring review, not
 * simplistic automatic truth", and a review that cannot be recorded is a review
 * that has to be done again every build. A word in `level-overrides.json` has
 * been read — either moved, or explicitly left where it was with the reason —
 * so it is not flagged a second time. The anchor check is deliberately *not*
 * skipped: an anchor is the stronger statement, and if the two ever disagree
 * that disagreement should be loud.
 */
const reviewed = new Set(Object.keys(read('content/vocabulary/level-overrides.json').words ?? {}));

const LEVELS = 30;
/**
 * The smallest level that can still build a day.
 *
 * A daily plan asks for ten words drawn from L−1, L and L+1, and it must be
 * able to do that for a fortnight without repeating itself. Forty is that
 * number with room; below it the selector starts returning the same words to
 * the same learner, which is the failure this whole exercise is about.
 */
const MIN_PER_LEVEL = 40;

const WEIGHTS = { frequency: 0.34, utility: 0.26, linguistic: 0.22, semantic: 0.18 };
const scoreOf = (w) =>
  WEIGHTS.frequency * w.lv[0] + WEIGHTS.utility * w.lv[1] +
  WEIGHTS.linguistic * w.lv[2] + WEIGHTS.semantic * w.lv[3];

const findings = [];
const fail = (rule, detail) => findings.push({ rule, detail });

const byWord = new Map(built.words.map((w) => [w.word, w]));
const glossOf = new Map(built.words.map((w, i) => [w.word, english[i]?.[0] ?? '']));

// --- 1. Every level is a valid level -----------------------------------------
for (const word of built.words) {
  const level = word.level;
  if (!Number.isInteger(level) || level < 1 || level > LEVELS) {
    fail('invalid-level', `${word.word} has level ${JSON.stringify(level)}`);
  }
}

// --- 2. Every level can build a day ------------------------------------------
const byLevel = new Map();
for (const word of built.words) {
  if (!byLevel.has(word.level)) byLevel.set(word.level, []);
  byLevel.get(word.level).push(word);
}
for (let level = 1; level <= LEVELS; level += 1) {
  const count = byLevel.get(level)?.length ?? 0;
  if (count === 0) fail('empty-level', `level ${level} has no words`);
  else if (count < MIN_PER_LEVEL) {
    fail('thin-level', `level ${level} has ${count} words, under the ${MIN_PER_LEVEL} a daily plan needs`);
  }
}

// --- 3. Difficulty rises with the level --------------------------------------
//
// Median, not mean, and adjacent pairs rather than a global correlation: a
// single inverted pair is the thing worth knowing about, and a correlation of
// 0.98 hides it comfortably.
const medians = [];
for (let level = 1; level <= LEVELS; level += 1) {
  const scores = (byLevel.get(level) ?? []).map(scoreOf).sort((a, b) => a - b);
  medians[level] = scores.length ? scores[Math.floor(scores.length / 2)] : null;
}
for (let level = 1; level < LEVELS; level += 1) {
  const here = medians[level];
  const next = medians[level + 1];
  if (here === null || next === null) continue;
  if (next < here) {
    fail('inversion', `level ${level + 1} median ${next.toFixed(3)} is below level ${level}'s ${here.toFixed(3)}`);
  }
}

// --- 4. The anchors are where a person put them ------------------------------
let anchorCount = 0;
for (const [band, words] of Object.entries(anchors.words)) {
  const { min, max } = anchors.bands[band];
  for (const word of words) {
    anchorCount += 1;
    const entry = byWord.get(word);
    if (!entry) {
      fail('anchor-missing', `${word} is an anchor and is not in the taught corpus`);
      continue;
    }
    if (entry.level < min || entry.level > max) {
      fail('anchor-moved', `${word} is a ${band} anchor (${min}–${max}) and is at level ${entry.level}`);
    }
  }
}

// --- 5. Contamination, in both directions ------------------------------------
//
// The two failures a learner would actually notice, checked from evidence
// rather than from a word list: a word that is frequent, concrete and marked
// useful has no business at the top of the scale, and a word that cannot be
// read from its parts has none at the bottom.
const TOP_FREQUENCY = 400;
const BEGINNER_CEILING = 20;
const IDIOM_FLOOR = 25;
const REGISTER_FLOOR = 8;

for (const word of built.words) {
  if (reviewed.has(word.word)) continue;
  const rank = word.f?.[1] ?? null;
  const marks = signals[word.word] ?? {};

  if (rank !== null && rank <= TOP_FREQUENCY && word.usefulness <= 2 && word.level > BEGINNER_CEILING) {
    fail(
      'beginner-word-at-the-top',
      `${word.word} — rank ${rank}, usefulness ${word.usefulness} — is at level ${word.level}: ${glossOf.get(word.word)}`,
    );
  }
  if (marks.idiom && word.level < IDIOM_FLOOR) {
    fail('idiom-at-the-bottom', `${word.word} is a fixed idiom at level ${word.level}`);
  }
  const heavy = (marks.registers ?? []).filter((r) => r === 'literary' || r === 'historical' || r === 'rare');
  if (heavy.length > 0 && word.level < REGISTER_FLOOR) {
    fail(
      'marked-register-at-the-bottom',
      `${word.word} is marked ${heavy.join('/')} and is at level ${word.level}`,
    );
  }
}

// --- Report -------------------------------------------------------------------
const counts = Array.from({ length: LEVELS }, (_, i) => byLevel.get(i + 1)?.length ?? 0);
console.log('Vocabulary levels — is the scale a scale?\n');
console.log(`  taught words          ${built.words.length.toLocaleString('en')}`);
console.log(`  levels populated      ${counts.filter((c) => c > 0).length}/${LEVELS}`);
console.log(`  smallest level        ${Math.min(...counts)} words`);
console.log(`  largest level         ${Math.max(...counts)} words`);
console.log(`  anchors held          ${anchorCount}`);
console.log(`  levels set by hand    ${reviewed.size}`);
console.log('');
console.log('  level  words  median difficulty');
for (let level = 1; level <= LEVELS; level += 1) {
  const bar = '█'.repeat(Math.round((counts[level - 1] / Math.max(...counts)) * 24));
  console.log(
    `  ${String(level).padStart(5)}  ${String(counts[level - 1]).padStart(5)}  ` +
      `${medians[level] === null ? '   —  ' : medians[level].toFixed(3)}  ${bar}`,
  );
}

const byRule = new Map();
for (const finding of findings) byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1);
if (findings.length === 0) {
  console.log('\n  every level is valid, populated and harder than the one below it.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) console.log(`  ${count} ${rule}`);
  console.log('');
  for (const finding of findings.slice(0, 40)) console.log(`  ${finding.rule.padEnd(28)} ${finding.detail}`);
  if (findings.length > 40) console.log(`  … and ${findings.length - 40} more`);
}
console.log(
  '\n  Shape, not content. Whether level 17 holds the right words is a question\n' +
    '  for docs/level-galleries/, which is where they were read one at a time.',
);

if (CHECK && findings.length > 0) process.exit(1);
