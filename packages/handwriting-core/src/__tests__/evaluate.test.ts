import { describe, expect, it } from 'vitest';

import { COMPARISON_RESOLUTION, GLYPH_TOLERANCE_RATIO, MAX_MISMATCH_RATIO } from '../config.js';
import { evaluateMasks, evaluateStrokes } from '../evaluate.js';
import {
  countInk,
  createMask,
  dilate,
  largestComponentSize,
  squaredDistanceTransform,
} from '../mask.js';
import { rasterizeStrokes } from '../raster.js';
import {
  REFERENCE_STROKE_WIDTH,
  SHAPE_A,
  SHAPE_GA,
  SHAPE_GIYEOK,
  resample,
  scribble,
  transform,
} from '../test-shapes.js';
import type { Stroke } from '../types.js';

const R = COMPARISON_RESOLUTION;

/** Builds a reference mask the way a font rasteriser would — from ideal shapes. */
const reference = (shape: readonly Stroke[]) => rasterizeStrokes(resample(shape), R);

/** Evaluates a stroke attempt against a synthetic shape. */
const evaluate = (attempt: readonly Stroke[], shape: readonly Stroke[]) =>
  evaluateStrokes(resample(attempt), reference(shape));

describe('mask geometry', () => {
  it('computes exact squared distances', () => {
    const m = createMask(5);
    m.data[2 * 5 + 2] = 1; // single ink pixel at the centre
    const d = squaredDistanceTransform(m);
    expect(d[2 * 5 + 2]).toBe(0);
    expect(d[2 * 5 + 0]).toBe(4); // two cells left
    expect(d[0 * 5 + 0]).toBe(8); // two left, two up
  });

  it('dilates into a disc, not a diamond', () => {
    const m = createMask(21);
    m.data[10 * 21 + 10] = 1;
    const d = dilate(m, 5);
    // A chamfer approximation would exclude the diagonal at distance √18.
    expect(d.data[(10 + 3) * 21 + (10 + 3)]).toBe(1); // √18 ≈ 4.24 <= 5
    expect(d.data[(10 + 4) * 21 + (10 + 4)]).toBe(0); // √32 ≈ 5.66 > 5
  });

  it('dilation with a zero radius is a copy', () => {
    const m = rasterizeStrokes(SHAPE_A, 64);
    expect(countInk(dilate(m, 0))).toBe(countInk(m));
  });

  it('finds the largest connected blob, not the total', () => {
    const m = createMask(20);
    // One 3x3 blob and two single pixels, well separated.
    for (let y = 2; y < 5; y += 1) for (let x = 2; x < 5; x += 1) m.data[y * 20 + x] = 1;
    m.data[15 * 20 + 15] = 1;
    m.data[18 * 20 + 2] = 1;
    expect(countInk(m)).toBe(11);
    expect(largestComponentSize(m)).toBe(9);
  });

  it('reports zero for a mask with no ink', () => {
    expect(largestComponentSize(createMask(8))).toBe(0);
  });
});

describe('accepting genuine attempts', () => {
  it('passes a near-perfect trace', () => {
    const r = evaluate(SHAPE_GA, SHAPE_GA);
    expect(r.passed).toBe(true);
    expect(r.mismatchRatio).toBeLessThan(0.01);
    expect(r.score).toBeGreaterThan(0.99);
    expect(r.reason).toBeNull();
  });

  it('passes a hand-wobbly trace', () => {
    const r = evaluate(transform(SHAPE_GA, { jitter: 0.012, seed: 42 }), SHAPE_GA);
    expect(r.passed).toBe(true);
  });

  it('passes a slightly shifted trace', () => {
    const r = evaluate(transform(SHAPE_GA, { dx: 0.02, dy: -0.015 }), SHAPE_GA);
    expect(r.passed).toBe(true);
  });

  it('passes a thinner or thicker pen', () => {
    for (const width of [REFERENCE_STROKE_WIDTH * 0.7, REFERENCE_STROKE_WIDTH * 1.25]) {
      expect(evaluate(transform(SHAPE_GA, { width }), SHAPE_GA).passed, `pen ${width}`).toBe(true);
    }
  });
});

describe('rejecting invalid attempts', () => {
  it('rejects an empty attempt', () => {
    const r = evaluateStrokes([], reference(SHAPE_GA));
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('empty');
    expect(r.score).toBe(0);
    expect(r.mismatchRatio).toBe(1);
  });

  it('rejects a single dot', () => {
    const dot: Stroke[] = [{ points: [{ x: 0.5, y: 0.5 }], width: REFERENCE_STROKE_WIDTH }];
    const r = evaluateStrokes(dot, reference(SHAPE_GA));
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('empty');
  });

  it('rejects a random scribble', () => {
    const r = evaluateStrokes(scribble(), reference(SHAPE_GA));
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('outside');
    expect(r.mismatchRatio).toBeGreaterThan(0.3);
  });

  it('rejects an incomplete character and says so', () => {
    const r = evaluate(SHAPE_GA.slice(0, 2), SHAPE_GA); // ㅏ's branch never written
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('incomplete');
  });

  it('rejects a character drawn largely outside the valid region', () => {
    const r = evaluate(transform(SHAPE_GA, { dx: 0.3, dy: 0.25 }), SHAPE_GA);
    expect(r.passed).toBe(false);
    expect(r.outsideStrokeRatio).toBeGreaterThan(0.3);
  });

  it('rejects an oversized character', () => {
    const r = evaluate(transform(SHAPE_GA, { scale: 1.45 }), SHAPE_GA);
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('outside');
  });

  it('rejects an undersized character', () => {
    const r = evaluate(transform(SHAPE_GA, { scale: 0.5 }), SHAPE_GA);
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('incomplete');
  });

  it('rejects the wrong character', () => {
    expect(evaluate(SHAPE_A, SHAPE_GIYEOK).passed).toBe(false);
    expect(evaluate(SHAPE_GIYEOK, SHAPE_GA).passed).toBe(false);
  });

  it('rejects flooding the box with ink', () => {
    const flood: Stroke[] = [];
    for (let i = 0; i <= 20; i += 1) {
      const y = 0.05 + (i / 20) * 0.9;
      flood.push({
        points: [
          { x: 0.05, y },
          { x: 0.95, y },
        ],
        width: 0.09,
      });
    }
    const r = evaluateStrokes(resample(flood), reference(SHAPE_GA));
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('outside');
  });
});

describe('placement is part of the task', () => {
  it('does not auto-centre a displaced attempt', () => {
    // Same shape, same size — only the position differs. An evaluator that
    // re-centred would score this identically to a perfect trace.
    const centred = evaluate(SHAPE_GA, SHAPE_GA);
    const displaced = evaluate(transform(SHAPE_GA, { dx: 0.22 }), SHAPE_GA);
    expect(centred.passed).toBe(true);
    expect(displaced.passed).toBe(false);
    expect(displaced.mismatchRatio).toBeGreaterThan(centred.mismatchRatio + 0.3);
  });

  it('does not auto-rescale a shrunken attempt', () => {
    const full = evaluate(SHAPE_A, SHAPE_A);
    const small = evaluate(transform(SHAPE_A, { scale: 0.55 }), SHAPE_A);
    expect(full.passed).toBe(true);
    expect(small.passed).toBe(false);
    expect(small.mismatchRatio).toBeGreaterThan(full.mismatchRatio + 0.2);
  });
});

describe('grading degrades monotonically', () => {
  it('never scores a further drift better than a nearer one', () => {
    const ratios = [0, 0.03, 0.06, 0.09, 0.12, 0.2].map(
      (dx) => evaluate(transform(SHAPE_GA, { dx }), SHAPE_GA).mismatchRatio,
    );
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i]!, `drift step ${i}`).toBeGreaterThanOrEqual(ratios[i - 1]!);
    }
    // And it must actually move, not sit flat — a step function carries no
    // information in `score`.
    expect(ratios.at(-1)!).toBeGreaterThan(0.5);
  });

  it('keeps every ratio within 0..1', () => {
    const cases = [
      evaluate(SHAPE_GA, SHAPE_GA),
      evaluate(transform(SHAPE_GA, { dx: 0.4, dy: 0.4 }), SHAPE_GA),
      evaluateStrokes(scribble(), reference(SHAPE_GA)),
      evaluate(SHAPE_GA.slice(0, 1), SHAPE_GA),
    ];
    for (const r of cases) {
      for (const v of [r.mismatchRatio, r.score, r.outsideStrokeRatio, r.missingCoverageRatio]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('configuration', () => {
  it('honours a stricter threshold without changing the measurement', () => {
    const attempt = resample(transform(SHAPE_GA, { jitter: 0.02, seed: 3 }));
    const lenient = evaluateStrokes(attempt, reference(SHAPE_GA), { maxMismatchRatio: 0.5 });
    const strict = evaluateStrokes(attempt, reference(SHAPE_GA), { maxMismatchRatio: -1 });
    expect(lenient.passed).toBe(true);
    expect(strict.passed).toBe(false);
    expect(strict.mismatchRatio).toBeCloseTo(lenient.mismatchRatio, 10);
  });

  it('honours a wider tolerance band', () => {
    const attempt = resample(transform(SHAPE_GA, { dx: 0.09 }));
    const tight = evaluateStrokes(attempt, reference(SHAPE_GA), { glyphToleranceRatio: 0.02 });
    const loose = evaluateStrokes(attempt, reference(SHAPE_GA), { glyphToleranceRatio: 0.18 });
    expect(loose.mismatchRatio).toBeLessThan(tight.mismatchRatio);
  });

  it('can disable the structural gap floor', () => {
    const attempt = resample(SHAPE_GA.slice(0, 2));
    const withGap = evaluateStrokes(attempt, reference(SHAPE_GA));
    const withoutGap = evaluateStrokes(attempt, reference(SHAPE_GA), { useStructuralGap: false });
    expect(withGap.passed).toBe(false);
    expect(withoutGap.mismatchRatio).toBeLessThan(withGap.mismatchRatio);
  });

  it('reports diagnostics for tuning', () => {
    const r = evaluate(SHAPE_GA, SHAPE_GA);
    expect(r.diagnostics.resolution).toBe(R);
    expect(r.diagnostics.referenceInk).toBeGreaterThan(0);
    expect(r.diagnostics.inkRatio).toBeGreaterThan(0.9);
    expect(r.diagnostics.inkRatio).toBeLessThan(1.1);
    expect(r.diagnostics.toleranceRadiusPx).toBeCloseTo(GLYPH_TOLERANCE_RATIO * R, 6);
    expect(r.diagnostics.largestGapRatio).toBe(0);
  });
});

describe('input validation', () => {
  it('rejects mismatched mask sizes', () => {
    expect(() => evaluateMasks(createMask(64), createMask(128))).toThrow(/mask size mismatch/);
  });

  it('rejects an empty reference rather than passing the learner', () => {
    const user = rasterizeStrokes(SHAPE_A, 64);
    expect(() => evaluateMasks(user, createMask(64))).toThrow(/reference glyph mask is empty/);
  });
});

describe('the documented product rule', () => {
  it('passes at or below the threshold and fails above it', () => {
    for (const dx of [0, 0.02, 0.04, 0.06, 0.08, 0.12, 0.25]) {
      const r = evaluate(transform(SHAPE_GA, { dx }), SHAPE_GA);
      expect(r.passed, `dx ${dx} (mismatch ${r.mismatchRatio})`).toBe(
        r.mismatchRatio <= MAX_MISMATCH_RATIO,
      );
    }
  });

  it('uses the 10% threshold by default', () => {
    expect(MAX_MISMATCH_RATIO).toBe(0.1);
  });
});
