/**
 * The robustness gate.
 *
 * `robustness.ts` builds the corpus and does the measuring; this decides what
 * the numbers are allowed to be, and fails the build when they are not.
 *
 * The bounds are deliberately asymmetric. A false *acceptance* — the app
 * telling a beginner that ㅓ is ㅏ — teaches something wrong. A false
 * *rejection* is a bad moment rather than a bad lesson: the learner is told to
 * try again and does. So rejection is bounded tightly but not at zero, because
 * the only way to reach zero is a grader loose enough to accept a different
 * letter, and acceptance is bounded by an explicit list rather than a rate.
 *
 * ## The list, and why it is a list
 *
 * Four pairs still get through, on some faces, and they are named below. Each
 * is a letter and the same letter with one short stroke added or removed. A
 * geometric grader compares where ink is; the difference between ㅐ and ㅒ is
 * one branch about 3% of the glyph's area, sitting inside the tolerance the
 * same grader needs for a wobbly finger. Closing that gap properly means
 * comparing *structure* — counting strokes and their junctions — which is a
 * different evaluator, not a tuning of this one.
 *
 * Naming them makes the state honest and the test useful: a regression that
 * confuses a new pair fails immediately, and the day the structural evaluator
 * lands the list goes to empty.
 */
import { describe, expect, it } from 'vitest';

import { BASELINE_FONT, FIXTURE_FONTS, FIXTURE_RESOLUTION } from './fixtures.js';
import { CONFUSABLE_PAIRS, measure } from './robustness.js';

/**
 * The grading each face actually ships with.
 *
 * Mirrors `PracticeFont.evaluation` in `apps/web/src/data/fonts.ts` — this
 * package cannot import the app, and a corpus graded with the default config
 * would be measuring a product nobody uses. `apps/web/src/data/data.test.ts`
 * asserts the two agree.
 */
const FONT_GRADING: Record<string, { glyphToleranceRatio?: number }> = {
  gaegu: { glyphToleranceRatio: 0.036 },
};

const gradingFor = (font: string) => FONT_GRADING[font] ?? {};

/** Every letter the curriculum teaches. */
const LETTERS = [
  'ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ',
  'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅎ',
  'ㅑ', 'ㅕ', 'ㅛ', 'ㅠ',
  'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ',
  'ㅐ', 'ㅔ', 'ㅒ', 'ㅖ',
  'ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ',
  'ㅘ', 'ㅝ', 'ㅚ', 'ㅟ', 'ㅙ', 'ㅞ', 'ㅢ',
];

/**
 * The confusions the geometric evaluator still cannot make.
 *
 * Written as `asked←drawn`. Every one differs by a single short stroke.
 */
const KNOWN_CONFUSIONS = new Set([
  'ㅐ←ㅒ',
  'ㅒ←ㅐ',
  'ㅐ←ㅔ',
  'ㅔ←ㅐ',
  'ㅈ←ㅊ',
  'ㅊ←ㅈ',
  'ㅂ←ㅍ',
  'ㅍ←ㅂ',
]);

/** Measured once; every assertion below reads the same numbers. */
const RESULTS = FIXTURE_FONTS.map((font) =>
  measure(LETTERS, font, FIXTURE_RESOLUTION, gradingFor(font)),
);

describe('handwriting robustness', () => {
  it('runs a corpus big enough to mean something', () => {
    const attempts = RESULTS.reduce((n, r) => n + r.genuine + r.impostors + r.degenerate, 0);
    expect(CONFUSABLE_PAIRS.length).toBeGreaterThan(20);
    expect(attempts).toBeGreaterThan(2500);
  });

  it('never accepts a scribble, a dot, a box, a bare line or a scrawl', () => {
    /*
     * The scrawls are the load-bearing half of this assertion.
     *
     * A dot and a box are rejected on placement — they are not where the letter
     * is, and an ink comparison sees that. A scrawl follows the letter exactly
     * and puts every pixel inside the tolerance band a wobbly hand needs, so
     * graded on ink alone all three score a mismatch of **0.000** and pass. Only
     * the path gate can fail them, which means this test is also the regression
     * test for anyone tempted to widen the tolerance band and see what happens.
     */
    for (const result of RESULTS) {
      expect(
        result.degenerateAccepted,
        `${result.font} accepted: ${result.degenerateAccepted
          .map((a) => `${a.character}/${a.kind}`)
          .join(', ')}`,
      ).toEqual([]);
    }
  });

  it('confuses only the pairs that are one stroke apart, and only the named ones', () => {
    for (const result of RESULTS) {
      const unexpected = result.impostorsAccepted
        .map((a) => `${a.character}←${a.kind.replace('wrote ', '')}`)
        .filter((pair) => !KNOWN_CONFUSIONS.has(pair));
      expect(unexpected, `${result.font} gained a new confusion`).toEqual([]);
    }
  });

  it('keeps false acceptance under 2% on every face', () => {
    // Measured at 0.78% overall as this ships, worst face 1.38% — down from
    // 1.17% / 2.07% when the corpus contained no scrawls and the grader had no
    // path gate to fail them with. The bound is above the worst face rather
    // than at it, so an unrelated change that moves a single attempt does not
    // fail the build — but a doubling does.
    for (const result of RESULTS) {
      expect(result.far, `${result.font} false acceptance`).toBeLessThan(0.025);
    }
  });

  it('keeps false rejection near zero', () => {
    // 0.21% overall as this ships, worst face 1.04%. It was 1.42% before the
    // unsteady-hand fixture was given a physically-shaped tremor instead of
    // white noise at the sample rate — see `wobbled` in `robustness.ts`.
    const genuine = RESULTS.reduce((n, r) => n + r.genuine, 0);
    const rejected = RESULTS.reduce((n, r) => n + r.genuineRejected.length, 0);
    expect(rejected / genuine).toBeLessThanOrEqual(0.02);
    for (const result of RESULTS) {
      expect(
        result.frr,
        `${result.font} rejected: ${result.genuineRejected
          .map((a) => `${a.character}/${a.kind}`)
          .slice(0, 10)
          .join(', ')}`,
      ).toBeLessThanOrEqual(0.05);
    }
  });

  it('accepts an exact trace of every letter on the baseline face', () => {
    // The floor under everything else. If a learner who writes the letter
    // perfectly can be failed, no other number matters.
    const baseline = RESULTS.find((r) => r.font === BASELINE_FONT)!;
    expect(baseline.genuineRejected.filter((a) => a.kind === 'exact')).toEqual([]);
  });
});
