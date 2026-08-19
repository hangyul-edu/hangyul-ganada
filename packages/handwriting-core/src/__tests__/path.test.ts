/**
 * The path gate: what a beginner may do, and what a scribbler may not.
 *
 * `robustness.test.ts` measures the gate across the whole corpus and bounds the
 * rates. This is the other half — the named cases, held permanently, so that a
 * regression says *which* thing broke rather than that a percentage moved.
 *
 * The two lists below are the product rules §12 and §13 written as fixtures:
 *
 * * **Beginner writing must be accepted.** Small hand jitter, straight strokes
 *   drawn with a curve, imperfect proportions, small positional error, slight
 *   overshoot, strokes drawn short or long. Every one of these is somebody
 *   getting it right, and failing them is the expensive mistake.
 *
 * * **Scrawls must be rejected.** Zigzags, repeated S-curves, loops,
 *   direction reversals, detours, over-tracing. These are the ones the ink
 *   comparison structurally cannot see: each lays its ink inside the tolerance
 *   band and scores a mismatch of 0.000.
 *
 * The assertion in both directions is on the *shipped* evaluator rather than on
 * the metrics, so a change to a threshold that quietly breaks a case fails here.
 */
import { describe, expect, it } from 'vitest';

import { evaluateStrokes } from '../evaluate.js';
import { pathMetrics, resamplePath, skeletonLengthOf, smoothPath } from '../path.js';
import { rasterizeStrokes } from '../raster.js';
import { SHAPE_A, SHAPE_GA, SHAPE_GIYEOK, resample, transform } from '../test-shapes.js';
import type { Point, Stroke } from '../types.js';

const RESOLUTION = 128;
const reference = (strokes: Stroke[]) => rasterizeStrokes(strokes, RESOLUTION);

// --- Building attempts --------------------------------------------------------

/**
 * A sine wave laid along each stroke, perpendicular to its direction.
 *
 * The path is re-cut finely first. Laying a wave of period 0.05 onto points
 * that are 0.06 apart samples it below its own Nyquist rate and produces a
 * straight line with a wobble — which is a fixture that quietly stops testing
 * what it is named for.
 */
function zigzag(strokes: readonly Stroke[], amplitude: number, period: number): Stroke[] {
  return strokes.map((stroke) => {
    const dense = resamplePath(stroke.points, period / 8);
    const points: Point[] = [];
    let travelled = 0;
    for (let i = 0; i < dense.length; i += 1) {
      const previous = dense[Math.max(0, i - 1)]!;
      const point = dense[i]!;
      const next = dense[Math.min(dense.length - 1, i + 1)]!;
      travelled += Math.hypot(point.x - previous.x, point.y - previous.y);
      let tx = next.x - previous.x;
      let ty = next.y - previous.y;
      const length = Math.hypot(tx, ty) || 1;
      tx /= length;
      ty /= length;
      const offset = Math.sin((travelled / period) * Math.PI * 2) * amplitude;
      points.push({ x: point.x - ty * offset, y: point.y + tx * offset });
    }
    return { width: stroke.width, points };
  });
}

/** Each stroke drawn `times` times, alternating direction. */
function overTrace(strokes: readonly Stroke[], times: number): Stroke[] {
  return strokes.map((stroke) => {
    const points: Point[] = [];
    for (let pass = 0; pass < times; pass += 1) {
      const run = pass % 2 === 0 ? stroke.points : [...stroke.points].reverse();
      points.push(...run.map((p) => ({ x: p.x, y: p.y })));
    }
    return { width: stroke.width, points };
  });
}

/** Random wandering confined to the letter's own bounding box. */
function loops(strokes: readonly Stroke[], seed: number, count: number): Stroke[] {
  const xs = strokes.flatMap((s) => s.points.map((p) => p.x));
  const ys = strokes.flatMap((s) => s.points.map((p) => p.y));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const points: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    points.push({ x: x0 + random() * (x1 - x0), y: y0 + random() * (y1 - y0) });
  }
  return [{ points, width: strokes[0]!.width }];
}

// --- The fixtures -------------------------------------------------------------

/** §12. Every one of these is a beginner writing the letter correctly. */
const BEGINNER: Array<[string, Stroke[], Stroke[]]> = [
  ['a clean trace', SHAPE_A, resample(SHAPE_A)],
  ['small hand jitter', SHAPE_A, resample(transform(SHAPE_A, { jitter: 0.015, seed: 5 }))],
  ['more hand jitter', SHAPE_A, resample(transform(SHAPE_A, { jitter: 0.025, seed: 11 }))],
  // A "straight" stroke drawn as a long shallow bow — one full wave over the
  // whole letter, which is what an unsupported wrist produces.
  ['straight strokes drawn curved', SHAPE_A, zigzag(resample(SHAPE_A), 0.02, 0.9)],
  ['written a little small, a little off', SHAPE_A, resample(transform(SHAPE_A, { scale: 0.92, dx: 0.02, dy: -0.02 }))],
  ['written a little large', SHAPE_A, resample(transform(SHAPE_A, { scale: 1.08 }))],
  ['a corner drawn round', SHAPE_GIYEOK, zigzag(resample(SHAPE_GIYEOK), 0.025, 1.2)],
  ['a corner with jitter', SHAPE_GIYEOK, resample(transform(SHAPE_GIYEOK, { jitter: 0.02, seed: 3 }))],
  ['a syllable, cleanly', SHAPE_GA, resample(SHAPE_GA)],
  ['a syllable with jitter', SHAPE_GA, resample(transform(SHAPE_GA, { jitter: 0.02, seed: 8 }))],
];

/** §13. Every one of these lays the right ink down the wrong way. */
const SCRAWL: Array<[string, Stroke[], Stroke[]]> = [
  ['a zigzag along the stroke', SHAPE_A, zigzag(resample(SHAPE_A), 0.03, 0.05)],
  ['a tighter, wilder zigzag', SHAPE_A, zigzag(resample(SHAPE_A), 0.04, 0.04)],
  ['repeated S-curves', SHAPE_GIYEOK, zigzag(resample(SHAPE_GIYEOK), 0.03, 0.05)],
  ['a scrubbed syllable', SHAPE_GA, zigzag(resample(SHAPE_GA), 0.025, 0.05)],
  ['drawn three times over', SHAPE_A, overTrace(resample(SHAPE_A), 3)],
  ['drawn five times over', SHAPE_A, overTrace(resample(SHAPE_A), 5)],
  ['a syllable drawn three times over', SHAPE_GA, overTrace(resample(SHAPE_GA), 3)],
  ['random loops inside the letter', SHAPE_A, loops(SHAPE_A, 3, 60)],
  ['random loops inside a syllable', SHAPE_GA, loops(SHAPE_GA, 9, 80)],
];

describe('path metrics', () => {
  it('measures a clean trace at about one letter-length', () => {
    const skeleton = skeletonLengthOf(reference(SHAPE_A));
    const metrics = pathMetrics(resample(SHAPE_A), skeleton);
    expect(metrics.lengthRatio).toBeGreaterThan(0.8);
    expect(metrics.lengthRatio).toBeLessThan(1.3);
    expect(metrics.reversals).toBe(0);
  });

  it('reads a letter-length off the printed glyph, not off the attempt', () => {
    // ㅏ is two strokes of roughly 0.76 and 0.32 — about one box in total. The
    // yardstick has to come from the reference, because one derived from the
    // learner's own ink would stretch to fit whatever it was handed, which is
    // exactly how a scribble comes to look normal.
    expect(skeletonLengthOf(reference(SHAPE_A))).toBeGreaterThan(0.7);
    expect(skeletonLengthOf(reference(SHAPE_A))).toBeLessThan(1.4);
    // A syllable is longer than a single letter, and measurably so.
    expect(skeletonLengthOf(reference(SHAPE_GA))).toBeGreaterThan(
      skeletonLengthOf(reference(SHAPE_A)),
    );
  });

  it('reports zero rather than infinity for a reference with no ink', () => {
    const metrics = pathMetrics(resample(SHAPE_A), 0);
    expect(metrics.lengthRatio).toBe(0);
    expect(metrics.reversalDensity).toBe(0);
  });

  it('resamples to even steps without shortening the stroke', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const out = resamplePath(points, 0.1);
    expect(out.length).toBeGreaterThan(9);
    expect(out[out.length - 1]!.x).toBeCloseTo(1, 5);
  });

  it('smooths without pulling the ends in', () => {
    // A one-sided average at an endpoint still shifts it inwards by half the
    // window; what must not happen is the stroke losing a whole window at each
    // end, which would read as "stopped short" — a different mistake that the
    // ink comparison is already responsible for reporting.
    const step = 0.01;
    const window = 5;
    const points = resamplePath([{ x: 0, y: 0 }, { x: 1, y: 0 }], step);
    const out = smoothPath(points, window);
    expect(out[0]!.x).toBeLessThanOrEqual((window * step) / 2);
    expect(1 - out[out.length - 1]!.x).toBeLessThanOrEqual((window * step) / 2);
    expect(out).toHaveLength(points.length);
  });
});

describe('§12 — beginner writing is accepted', () => {
  for (const [name, model, drawn] of BEGINNER) {
    it(`accepts ${name}`, () => {
      const result = evaluateStrokes(drawn, reference(model));
      expect(result.reason, `${name} was called a scrawl`).not.toBe('scribble');
      expect(result.passed, `${name} was rejected`).toBe(true);
    });
  }
});

describe('§13 — scrawls are rejected', () => {
  for (const [name, model, drawn] of SCRAWL) {
    it(`rejects ${name}`, () => {
      const result = evaluateStrokes(drawn, reference(model));
      expect(result.passed, `${name} was accepted`).toBe(false);
    });
  }

  it('is the *only* thing that can reject the ones the ink comparison misses', () => {
    // The claim the whole module rests on. Graded on ink alone these score a
    // perfect zero; if that ever stops being true, the path gate has become
    // redundant and this test should be deleted rather than quietly kept.
    const drawn = zigzag(resample(SHAPE_A), 0.04, 0.04);
    const inkOnly = evaluateStrokes(drawn, reference(SHAPE_A), {
      maxPathLengthRatio: Number.POSITIVE_INFINITY,
      maxReversalDensity: Number.POSITIVE_INFINITY,
    });
    expect(inkOnly.passed).toBe(true);
    expect(inkOnly.mismatchRatio).toBeLessThan(0.01);
  });

  it('never turns a failure into a pass, and never rescores an honest attempt', () => {
    // The gate is a veto and only a veto.
    const honest = resample(SHAPE_A);
    const withGate = evaluateStrokes(honest, reference(SHAPE_A));
    const withoutGate = evaluateStrokes(honest, reference(SHAPE_A), {
      maxPathLengthRatio: Number.POSITIVE_INFINITY,
      maxReversalDensity: Number.POSITIVE_INFINITY,
    });
    expect(withGate.score).toBe(withoutGate.score);
    expect(withGate.passed).toBe(withoutGate.passed);

    // A wrong shape stays wrong, and keeps the reason that explains why.
    const wrong = evaluateStrokes(resample(SHAPE_GIYEOK), reference(SHAPE_A));
    expect(wrong.passed).toBe(false);
    expect(wrong.reason).not.toBe('scribble');
  });
});
