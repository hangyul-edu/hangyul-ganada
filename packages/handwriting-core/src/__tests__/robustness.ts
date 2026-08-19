/**
 * The adversarial corpus, and the two numbers that come out of it.
 *
 * ## What is being measured
 *
 * A grader has exactly two ways to be wrong, and they are not the same wrong:
 *
 * | | What it means here | Who it hurts |
 * | --- | --- | --- |
 * | **FRR** — false rejection | an honest attempt at the right letter is marked wrong | a beginner who is doing it correctly and is told they are not |
 * | **FAR** — false acceptance | a different letter, or a scribble, is marked correct | a beginner who is learning ㅓ and being told it is ㅏ |
 *
 * The product has been shipping a geometric evaluator with neither number
 * measured. "It looks about right on the six characters in the test suite" is
 * not a measurement, and the failure it hides is the expensive one: a learner
 * who is failed while writing correctly concludes the app is broken, and a
 * learner who is passed while writing the wrong letter learns the wrong letter.
 *
 * ## How the attempts are made
 *
 * Three populations, all synthetic and all reproducible — there are no human
 * writing samples in this environment, and inventing some would be worse than
 * saying so.
 *
 * **Genuine** attempts are a line drawn down the middle of the printed letter —
 * its skeleton, computed from the very face the learner is looking at — and
 * then perturbed the way a real hand and a real touchscreen perturb it: offset,
 * scale, a wobblier line, a heavier or lighter pen, a stroke that overshoots
 * its corner, a stroke that stops short.
 *
 * The skeleton matters twice over. It is not the reference — a thin line where
 * the font has a thick stroke is exactly the asymmetry the evaluator's
 * tolerance band exists to absorb — so this is not a test perturbing its own
 * input and calling the result a measurement. And it is derived per face, so
 * the corpus asks the same question of a brush-derived 바탕 as of a gothic
 * instead of asking whether one set of coordinates happens to suit both.
 *
 * **Impostors** are a different letter's honest pen path, drawn in the same
 * box. Weighted towards the pairs that actually get confused — ㅏ/ㅓ, ㅗ/ㅛ,
 * ㅂ/ㅍ, ㄷ/ㅌ, ㅈ/ㅊ — because those are where a grader that is merely measuring
 * ink overlap will fail, and averaging them into thirty-nine unrelated letters
 * would hide exactly the cases that matter.
 *
 * **Degenerate** attempts are the things a bored or confused person actually
 * does: a scribble, a single dot, a box drawn round the guide, a straight line
 * through the middle. None of them is any letter, and all of them must fail.
 *
 * ## What is *not* claimed
 *
 * These are not human samples. A synthetic corpus can prove a grader is
 * geometrically sane and can find the confusable pairs; it cannot tell you how
 * a seven-year-old with a stylus writes ㅎ. That measurement needs participants
 * and is named as an external blocker rather than approximated here.
 */
import { rasterizeStrokes } from '../raster.js';
import { evaluateMasks } from '../evaluate.js';
import type { EvaluationConfig, Mask, Point, Stroke } from '../types.js';
import { glyphMask } from './fixtures.js';
import { skeletonPaths } from './skeleton.js';

export interface Attempt {
  /** The letter the learner was asked for. */
  target: string;
  /** What they actually drew — the same as `target` for a genuine attempt. */
  drew: string;
  /** How the attempt was made, for the report. */
  kind: string;
  strokes: Stroke[];
  /** Whether a correct grader accepts it. */
  shouldPass: boolean;
}

/**
 * Pen width as a fraction of the box.
 *
 * The app's canvas draws at this width, and it is deliberately thinner than
 * every practice face's stroke: a learner traces a line down the middle of a
 * font stroke rather than filling it, which is the asymmetry the evaluator's
 * tolerance band exists to absorb.
 */
const PEN_WIDTH = 0.055;

/** A deterministic generator. A robustness number that moves per run is noise. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32: small, deterministic, and good enough to jitter a polyline.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

function toStroke(points: readonly Point[], width = PEN_WIDTH): Stroke {
  return { points: points.map((p) => ({ x: p.x, y: p.y })), width };
}

/**
 * Straight segments become many small ones, so jitter has somewhere to bite.
 *
 * `per = 1` returns the points unchanged, which is what a skeleton path wants:
 * it is already one point per pixel.
 */
function densify(points: readonly Point[], per = 8): Point[] {
  if (per <= 1) return points.map((p) => ({ x: p.x, y: p.y }));
  const out: Point[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    for (let step = 0; step < per; step += 1) {
      const t = step / per;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

function transform(
  strokes: readonly Stroke[],
  fn: (point: Point, strokeIndex: number, pointIndex: number) => Point,
): Stroke[] {
  return strokes.map((stroke, s) => ({
    width: stroke.width,
    points: stroke.points.map((point, i) => fn(point, s, i)),
  }));
}

/**
 * The honest pen path for a letter, as this face draws it.
 *
 * Cached because thinning a 128x128 mask is the expensive part of the corpus
 * and every letter is asked for once per target it can be confused with.
 */
const penCache = new Map<string, Stroke[]>();

export function penPath(character: string, mask: Mask, key: string, width = PEN_WIDTH): Stroke[] {
  const cacheKey = `${key}:${character}:${width}`;
  const hit = penCache.get(cacheKey);
  if (hit) return hit;
  const paths = skeletonPaths(mask);
  if (paths.length === 0) throw new Error(`no skeleton for ${character}`);
  const strokes = paths.map((points) => toStroke(densify(points, 1), width));
  penCache.set(cacheKey, strokes);
  return strokes;
}

/** The ink bounds of a mask, normalised to 0..1. Null when there is no ink. */
function inkBounds(mask: Mask): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.data[y * mask.width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x0: x0 / mask.width, y0: y0 / mask.height, x1: x1 / mask.width, y1: y1 / mask.height };
}

/**
 * Puts a pen path where the letter actually is on screen.
 *
 * The stroke data in `strokes.ts` is an idealisation drawn to fill its own box;
 * a typeface puts a standalone \u3151 in a narrow column two thirds of the way
 * across, and Gaegu puts it somewhere else again. A learner traces *what they
 * can see*, so the honest model of a correct attempt is the pen path scaled and
 * placed onto the glyph in front of them.
 *
 * This is also what makes the corpus mean the same thing for every face: the
 * question stops being "do these coordinates happen to match this font" and
 * becomes "does a person who writes this letter correctly, at the size and
 * position it is shown, pass".
 */
export function fitTo(strokes: readonly Stroke[], reference: Mask): Stroke[] {
  const target = inkBounds(reference);
  const drawn = inkBounds(rasterizeStrokes(strokes, reference.width));
  if (!target || !drawn) return [...strokes];
  const sourceWidth = Math.max(1e-6, drawn.x1 - drawn.x0);
  const sourceHeight = Math.max(1e-6, drawn.y1 - drawn.y0);
  const scaleX = (target.x1 - target.x0) / sourceWidth;
  const scaleY = (target.y1 - target.y0) / sourceHeight;
  return transform(strokes, (p) => ({
    x: target.x0 + (p.x - drawn.x0) * scaleX,
    y: target.y0 + (p.y - drawn.y0) * scaleY,
  }));
}

// --- The perturbations -------------------------------------------------------

const shifted = (by: number) => (strokes: Stroke[]) =>
  transform(strokes, (p) => ({ x: p.x + by, y: p.y + by * 0.6 }));

const scaled = (by: number) => (strokes: Stroke[]) =>
  transform(strokes, (p) => ({ x: 0.5 + (p.x - 0.5) * by, y: 0.5 + (p.y - 0.5) * by }));

const wobbled = (amount: number, seed: number) => (strokes: Stroke[]) => {
  const random = makeRandom(seed);
  return transform(strokes, (p) => ({
    x: p.x + (random() - 0.5) * amount,
    y: p.y + (random() - 0.5) * amount,
  }));
};

const penned = (width: number) => (strokes: Stroke[]) =>
  strokes.map((stroke) => ({ ...stroke, width }));

/** The last few samples of each stroke are dropped: a hand that stops short. */
const stoppedShort = (fraction: number) => (strokes: Stroke[]) =>
  strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.slice(0, Math.max(2, Math.round(stroke.points.length * (1 - fraction)))),
  }));

/** Each stroke runs on past its end: a hand that overshoots the corner. */
const overshot = (by: number) => (strokes: Stroke[]) =>
  strokes.map((stroke) => {
    const points = [...stroke.points];
    const last = points[points.length - 1]!;
    const previous = points[points.length - 2] ?? last;
    points.push({
      x: last.x + (last.x - previous.x) * by * 20,
      y: last.y + (last.y - previous.y) * by * 20,
    });
    return { ...stroke, points };
  });

/**
 * The genuine population.
 *
 * Every one of these is a person writing the right letter. The perturbations
 * are sized from what a finger on a phone actually does — a few per cent of the
 * box of drift, a tenth of scale, a pen a third thinner or thicker — not from
 * what makes the numbers look good.
 */
const GENUINE: Array<[string, (strokes: Stroke[]) => Stroke[]]> = [
  ['exact', (s) => s],
  ['drifted +3%', shifted(0.03)],
  ['drifted −3%', shifted(-0.03)],
  ['written small', scaled(0.88)],
  ['written large', scaled(1.1)],
  ['unsteady hand', wobbled(0.02, 12345)],
  ['very unsteady hand', wobbled(0.035, 777)],
  ['thin pen', penned(0.04)],
  ['thick pen', penned(0.075)],
  ['stopped short', stoppedShort(0.06)],
  ['overshot', overshot(0.05)],
  ['small and drifted', (s) => shifted(0.02)(scaled(0.9)(s))],
];

/**
 * Pairs a learner actually mixes up.
 *
 * Each is a real confusion from the curriculum's own look-alike data or from
 * the shape of the alphabet: a letter and the same letter with one stroke
 * added, or the same stroke pointing the other way. A grader that passes these
 * is not grading the letter.
 */
export const CONFUSABLE_PAIRS: Array<[string, string]> = [
  ['ㅏ', 'ㅓ'],
  ['ㅏ', 'ㅑ'],
  ['ㅓ', 'ㅕ'],
  ['ㅗ', 'ㅜ'],
  ['ㅗ', 'ㅛ'],
  ['ㅜ', 'ㅠ'],
  ['ㅡ', 'ㅣ'],
  ['ㄱ', 'ㄴ'],
  ['ㄱ', 'ㅋ'],
  ['ㄷ', 'ㅌ'],
  ['ㄷ', 'ㄹ'],
  ['ㅁ', 'ㅂ'],
  ['ㅂ', 'ㅍ'],
  ['ㅅ', 'ㅈ'],
  ['ㅈ', 'ㅊ'],
  ['ㅇ', 'ㅎ'],
  ['ㅐ', 'ㅔ'],
  ['ㅐ', 'ㅒ'],
  ['ㄱ', 'ㄲ'],
  ['ㅅ', 'ㅆ'],
  ['ㅗ', 'ㅘ'],
  ['ㅜ', 'ㅝ'],
];

/** Things that are not letters at all. */
export function degenerateAttempts(seed = 999): Array<[string, Stroke[]]> {
  const random = makeRandom(seed);
  const scribble: Point[] = [];
  for (let i = 0; i < 60; i += 1) {
    scribble.push({ x: 0.15 + random() * 0.7, y: 0.15 + random() * 0.7 });
  }
  return [
    ['a scribble', [toStroke(scribble)]],
    ['a single dot', [toStroke([{ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 }])]],
    [
      'a box round the guide',
      [
        toStroke(
          densify([
            { x: 0.15, y: 0.15 },
            { x: 0.85, y: 0.15 },
            { x: 0.85, y: 0.85 },
            { x: 0.15, y: 0.85 },
            { x: 0.15, y: 0.15 },
          ]),
        ),
      ],
    ],
    [
      'one line across',
      [toStroke(densify([{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]))],
    ],
    [
      'one line down',
      [toStroke(densify([{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }]))],
    ],
  ];
}

/**
 * Every attempt in the corpus, for one target letter as one face draws it.
 *
 * `maskFor` supplies the reference glyph for a character in the face under
 * test, so the pen paths can be placed where that face puts them — including
 * the impostor's, because someone who writes the wrong letter writes it at the
 * size and position that letter is normally written, not squeezed into the
 * target's outline.
 */
export function attemptsFor(
  target: string,
  maskFor: (character: string) => Mask,
  fontKey: string,
): Attempt[] {
  const out: Attempt[] = [];
  const base = penPath(target, maskFor(target), fontKey);
  for (const [kind, perturb] of GENUINE) {
    out.push({ target, drew: target, kind, strokes: perturb(base), shouldPass: true });
  }
  for (const [a, b] of CONFUSABLE_PAIRS) {
    const other = a === target ? b : b === target ? a : null;
    if (!other) continue;
    out.push({
      target,
      drew: other,
      kind: `wrote ${other}`,
      strokes: penPath(other, maskFor(other), fontKey),
      shouldPass: false,
    });
  }
  for (const [kind, strokes] of degenerateAttempts()) {
    // A bare vertical line *is* ㅣ and a bare horizontal one *is* ㅡ. Counting
    // either as a scribble the grader must reject would be asking it to fail
    // someone for writing the letter correctly.
    if (kind === 'one line down' && target === 'ㅣ') continue;
    if (kind === 'one line across' && target === 'ㅡ') continue;
    out.push({ target, drew: '', kind, strokes, shouldPass: false });
  }
  return out;
}

export interface RobustnessResult {
  font: string;
  genuine: number;
  genuineRejected: Array<{ character: string; kind: string; score: number }>;
  impostors: number;
  impostorsAccepted: Array<{ character: string; kind: string; score: number }>;
  degenerate: number;
  degenerateAccepted: Array<{ character: string; kind: string; score: number }>;
  /** False rejection rate: honest attempts marked wrong. */
  frr: number;
  /** False acceptance rate: wrong letters and scribbles marked correct. */
  far: number;
}

/** Runs the whole corpus against one practice face. */
export function measure(
  characters: readonly string[],
  fontId: string,
  resolution: number,
  config?: Partial<EvaluationConfig>,
): RobustnessResult {
  const result: RobustnessResult = {
    font: fontId,
    genuine: 0,
    genuineRejected: [],
    impostors: 0,
    impostorsAccepted: [],
    degenerate: 0,
    degenerateAccepted: [],
    frr: 0,
    far: 0,
  };

  const maskFor = (character: string) => glyphMask(character, fontId);
  for (const character of characters) {
    const reference: Mask = maskFor(character);
    for (const attempt of attemptsFor(character, maskFor, fontId)) {
      const mask = rasterizeStrokes(attempt.strokes, resolution);
      const evaluation = evaluateMasks(mask, reference, config);
      const degenerate = attempt.drew === '';
      if (attempt.shouldPass) {
        result.genuine += 1;
        if (!evaluation.passed) {
          result.genuineRejected.push({ character, kind: attempt.kind, score: evaluation.score });
        }
      } else if (degenerate) {
        result.degenerate += 1;
        if (evaluation.passed) {
          result.degenerateAccepted.push({
            character,
            kind: attempt.kind,
            score: evaluation.score,
          });
        }
      } else {
        result.impostors += 1;
        if (evaluation.passed) {
          result.impostorsAccepted.push({ character, kind: attempt.kind, score: evaluation.score });
        }
      }
    }
  }

  result.frr = result.genuine ? result.genuineRejected.length / result.genuine : 0;
  const wrong = result.impostors + result.degenerate;
  result.far = wrong
    ? (result.impostorsAccepted.length + result.degenerateAccepted.length) / wrong
    : 0;
  return result;
}
