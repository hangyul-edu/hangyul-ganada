/**
 * Calibration tests against real Korean outlines.
 *
 * The synthetic-stroke tests prove the algorithm behaves sensibly. These prove
 * the 10% threshold is calibrated for the proportions of an actual Korean
 * typeface — which is what learners will meet. The learner's "attempt" is built
 * by perturbing the glyph mask, so each case isolates exactly one variable.
 *
 * The face here is the baseline one: Pretendard, the app's default and the
 * shapes the default thresholds were tuned against. Every *other* bundled face
 * is covered by `font-tolerance.test.ts`, which asks the different question of
 * whether one tolerance can serve a brush-derived 바탕 and a heavy rounded
 * display face at once. The erase rectangles below are this face's geometry;
 * regenerating the fixtures against a different baseline means re-measuring
 * them, which `scripts/render-fixtures.py` prints the ink counts for.
 */
import { describe, expect, it } from 'vitest';

import { evaluateMasks } from '../evaluate.js';
import {
  eraseRegion,
  erodeOrDilateMask,
  glyphMask,
  scaleMask,
  shiftMask,
} from './fixtures.js';

const ga = glyphMask('가');
const sa = glyphMask('사');
const han = glyphMask('한');
const mul = glyphMask('물');
const i = glyphMask('이');

describe('honest attempts pass', () => {
  it('accepts an exact trace of every fixture character', () => {
    for (const ch of ['ㄱ', 'ㅏ', '가', '사', '한', '물', '이']) {
      const m = glyphMask(ch);
      const r = evaluateMasks(m, m);
      expect(r.passed, ch).toBe(true);
      expect(r.mismatchRatio, ch).toBe(0);
    }
  });

  it('tolerates a few pixels of drift', () => {
    for (const [dx, dy] of [
      [2, 0],
      [0, -2],
      [3, 3],
      [-4, 2],
    ] as const) {
      expect(evaluateMasks(shiftMask(ga, dx, dy), ga).passed, `${dx},${dy}`).toBe(true);
    }
  });

  it('tolerates a lighter or heavier pen', () => {
    expect(evaluateMasks(erodeOrDilateMask(ga, -1), ga).passed).toBe(true);
    expect(evaluateMasks(erodeOrDilateMask(ga, 2), ga).passed).toBe(true);
  });

  it('tolerates writing a little small or a little large', () => {
    for (const scale of [0.88, 0.95, 1.05, 1.15]) {
      expect(evaluateMasks(scaleMask(ga, scale), ga).passed, `scale ${scale}`).toBe(true);
    }
  });
});

describe('missing structure fails', () => {
  it('rejects a syllable missing its vowel', () => {
    const r = evaluateMasks(eraseRegion(ga, { x0: 0.6, y0: 0, x1: 1, y1: 1 }), ga);
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('incomplete');
  });

  it('rejects a syllable missing its initial consonant', () => {
    expect(evaluateMasks(eraseRegion(ga, { x0: 0, y0: 0, x1: 0.58, y1: 1 }), ga).passed).toBe(false);
  });

  it('rejects a syllable missing its final consonant', () => {
    expect(evaluateMasks(eraseRegion(han, { x0: 0, y0: 0.62, x1: 1, y1: 1 }), han).passed).toBe(
      false,
    );
    expect(evaluateMasks(eraseRegion(mul, { x0: 0, y0: 0.6, x1: 1, y1: 1 }), mul).passed).toBe(
      false,
    );
  });

  it('rejects a single omitted stroke, even a short one', () => {
    // Dropping ㅏ's branch turns 가 into 기 — a different syllable, and only
    // ~4% of the glyph's area. It has to fail anyway.
    const noBranch = eraseRegion(ga, { x0: 0.71, y0: 0.42, x1: 0.85, y1: 0.51 });
    const r = evaluateMasks(noBranch, ga);
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('incomplete');
    // The mean coverage term alone would not have caught this; the structural
    // gap is what does.
    expect(r.diagnostics.meanMissingRatio).toBeLessThan(0.1);
    expect(r.diagnostics.largestGapRatio).toBeGreaterThan(0.02);
  });

  it('rejects 사 written without the right leg of ㅅ', () => {
    const r = evaluateMasks(eraseRegion(sa, { x0: 0.4, y0: 0.48, x1: 0.65, y1: 0.7 }), sa);
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('incomplete');
  });
});

describe('the wrong character fails', () => {
  it('rejects a different syllable in place of the target', () => {
    for (const [attempt, target, label] of [
      [sa, ga, '사 for 가'],
      [ga, sa, '가 for 사'],
      [han, mul, '한 for 물'],
      [i, ga, '이 for 가'],
    ] as const) {
      expect(evaluateMasks(attempt, target).passed, label).toBe(false);
    }
  });
});

describe('placement and size fail outside the window', () => {
  it('rejects writing well off-centre', () => {
    for (const d of [7, 10, 16]) {
      expect(evaluateMasks(shiftMask(ga, d, 0), ga).passed, `${d}px`).toBe(false);
    }
  });

  it('rejects writing far too small or too large', () => {
    expect(evaluateMasks(scaleMask(ga, 0.6), ga).reason).toBe('incomplete');
    expect(evaluateMasks(scaleMask(ga, 1.5), ga).reason).toBe('outside');
  });

  it('has a usable pass window rather than a knife edge', () => {
    // Whatever the exact bounds, an ordinary beginner attempt has room. If this
    // window ever collapses, the product becomes unusable regardless of what
    // the unit tests say.
    const passing = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.2].filter(
      (s) => evaluateMasks(scaleMask(ga, s), ga).passed,
    );
    expect(passing.length).toBeGreaterThanOrEqual(6);
  });
});
