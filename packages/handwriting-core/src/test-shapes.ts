/**
 * Synthetic glyph shapes and stroke perturbations for testing.
 *
 * Tests build their reference masks from these rather than from a real font, so
 * the evaluator is exercised independently of font availability and of canvas —
 * neither of which exists in Node. The shapes are drawn to Hangul proportions
 * so the numbers the tests assert on stay representative.
 */
import type { Point, Stroke } from './types.js';

/** Stroke width, as a fraction of the box, typical of a Hangul UI face at this size. */
export const REFERENCE_STROKE_WIDTH = 0.09;

const s = (points: readonly [number, number][], width = REFERENCE_STROKE_WIDTH): Stroke => ({
  points: points.map(([x, y]) => ({ x, y })),
  width,
});

/** ㅏ — two strokes. */
export const SHAPE_A: Stroke[] = [
  s([
    [0.42, 0.12],
    [0.42, 0.88],
  ]),
  s([
    [0.42, 0.5],
    [0.74, 0.5],
  ]),
];

/** ㄱ — one stroke with a corner. */
export const SHAPE_GIYEOK: Stroke[] = [
  s([
    [0.18, 0.22],
    [0.74, 0.22],
    [0.42, 0.78],
  ]),
];

/** 가 — three strokes: ㄱ, then the vertical and branch of ㅏ. */
export const SHAPE_GA: Stroke[] = [
  s([
    [0.12, 0.2],
    [0.46, 0.2],
    [0.28, 0.56],
  ]),
  s([
    [0.64, 0.12],
    [0.64, 0.88],
  ]),
  s([
    [0.64, 0.44],
    [0.86, 0.44],
  ]),
];

/** Deterministic PRNG (mulberry32) — jitter has to be reproducible across runs. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TransformOptions {
  /** Fraction-of-box translation. */
  dx?: number;
  dy?: number;
  /** Uniform scale about the box centre. */
  scale?: number;
  /** Peak per-point random displacement, fraction of box. */
  jitter?: number;
  seed?: number;
  /** Pen width override. */
  width?: number;
}

/** Applies a scale-about-centre, a translation and per-point jitter, in that order. */
export function transform(strokes: readonly Stroke[], opts: TransformOptions = {}): Stroke[] {
  const { dx = 0, dy = 0, scale = 1, jitter = 0, seed = 1, width } = opts;
  const rand = rng(seed);
  return strokes.map((stroke) => ({
    width: width ?? stroke.width * scale,
    points: stroke.points.map((p): Point => ({
      x: 0.5 + (p.x - 0.5) * scale + dx + (jitter ? (rand() - 0.5) * 2 * jitter : 0),
      y: 0.5 + (p.y - 0.5) * scale + dy + (jitter ? (rand() - 0.5) * 2 * jitter : 0),
    })),
  }));
}

/**
 * Densifies a polyline so jitter reads as a wobbly hand rather than as a few
 * displaced corners — real pointer input arrives at a high sample rate.
 */
export function resample(strokes: readonly Stroke[], stepsPerSegment = 12): Stroke[] {
  return strokes.map((stroke) => {
    const pts: Point[] = [];
    for (let i = 1; i < stroke.points.length; i += 1) {
      const a = stroke.points[i - 1]!;
      const b = stroke.points[i]!;
      for (let k = 0; k < stepsPerSegment; k += 1) {
        const t = k / stepsPerSegment;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    const last = stroke.points[stroke.points.length - 1];
    if (last) pts.push(last);
    return { width: stroke.width, points: pts };
  });
}

/** A dense random zigzag across the box — what a toddler or a cat produces. */
export function scribble(seed = 7, segments = 40, width = REFERENCE_STROKE_WIDTH): Stroke[] {
  const rand = rng(seed);
  const points: Point[] = [];
  for (let i = 0; i < segments; i += 1) {
    points.push({ x: 0.1 + rand() * 0.8, y: 0.1 + rand() * 0.8 });
  }
  return [{ points, width }];
}
