/**
 * The adaptive scheduler against the fixed-interval one it replaced.
 *
 *     npm run review:benchmark            # print the table
 *     npm run review:benchmark -- --json  # and write docs/review-benchmark.json
 *
 * The numbers in `docs/report.md` come from here rather than being typed in, so
 * the document and the code cannot drift. `review.test.ts` asserts the
 * direction of every row; this prints the sizes.
 *
 * What the comparison is, and is not, is written at length in `simulate.ts` and
 * in the section-69 block of `review.test.ts`. In short: a stated model of
 * forgetting, seven synthetic learners, the same number of exercises per day
 * for both schedulers, and one outcome measure — how much of what was taught
 * the learner still has after sixty days.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { PROFILES, simulate } from '../apps/web/src/domain/simulate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Sixteen letters and twelve words — a learner a month or so in. */
const ITEMS: Array<{ kind: ItemProgress['kind']; key: string }> = [
  ...['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅎ', 'ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'].map(
    (key) => ({ kind: 'character' as const, key }),
  ),
  ...Array.from({ length: 12 }, (_, n) => ({ kind: 'word' as const, key: `word_${n}` })),
];

const DAYS = 60;
const SEED = 20260301;

const rows = PROFILES.map((profile) => {
  const { adaptive, fixed } = simulate({ days: DAYS, items: ITEMS, profile, seed: SEED });
  return { profile: profile.name, adaptive, fixed };
});

const pad = (text: string, width: number) => text.padEnd(width);
const num = (value: number, places = 1) => value.toFixed(places).padStart(6);

console.log(`ADAPTIVE REVIEW vs FIXED 1/3/7/21 — ${DAYS} days, ${ITEMS.length} items, seed ${SEED}\n`);
console.log(
  `${pad('learner', 30)}${pad('scheduler', 16)}${pad('asked', 8)}${pad('covered', 9)}` +
    `${pad('retained', 10)}${pad('per slot', 10)}${pad('late', 8)}${pad('interval', 9)}chronic`,
);
console.log('-'.repeat(112));
for (const row of rows) {
  for (const [name, result] of [
    ['adaptive', row.adaptive],
    ['fixed', row.fixed],
  ] as const) {
    console.log(
      pad(name === 'adaptive' ? row.profile : '', 30) +
        pad(name, 16) +
        pad(String(result.asked), 8) +
        pad(String(result.covered), 9) +
        pad(num(result.retainedTotal), 10) +
        pad(num(result.retainedCovered, 2), 10) +
        pad(num(result.lateRate, 2), 8) +
        pad(num(result.meanInterval), 9) +
        String(result.chronic),
    );
  }
}

console.log(`
  asked      exercises the scheduler asked over the run
  covered    item-and-skill pairs it ever exercised, of ${ITEMS.reduce((n, i) => n + (i.kind === 'word' ? 5 : 4), 0)}
  retained   sum of predicted recall over every pair on the last day
  per slot   the same, averaged over only the pairs that scheduler covered
  late       share of repeat askings that arrived after the learner had lost it
  interval   mean scheduled interval at the end, in days
  chronic    items lost four or more times at one skill`);

const better = rows.filter((row) => row.adaptive.retainedTotal > row.fixed.retainedTotal).length;
console.log(`\nadaptive retains more in total for ${better} of ${rows.length} profiles.`);

if (process.argv.includes('--json')) {
  const path = join(ROOT, 'docs', 'review-benchmark.json');
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        days: DAYS,
        seed: SEED,
        items: ITEMS.length,
        slots: ITEMS.reduce((n, i) => n + (i.kind === 'word' ? 5 : 4), 0),
        profiles: rows,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`wrote ${path}`);
}
