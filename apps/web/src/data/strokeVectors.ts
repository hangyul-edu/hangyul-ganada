import type { StrokeStep } from '@hangyul-ganada/shared-types';

import { COMPOSED_PEN, composeSyllableStrokes } from './compose';
import METRICS from './generated/jamoMetrics.json';
import { isSyllable } from './jamo';
import { STROKE_ORDER, STROKE_ORDER_UPRIGHT } from './strokes';

/**
 * The instructional stroke model: what a hand does, drawn as a hand does it.
 *
 * ## What this replaces, and why replacing it was the only option left
 *
 * The demonstration used to be built by *cutting up the reference glyph*.
 * Pretendard's ㅂ was rasterised, each pixel of ink was awarded to whichever
 * stroke's centreline reached it first, the awarded regions were traced back to
 * contours, simplified, and the resulting filled polygons were animated behind
 * reveal masks. The appeal was an invariant: `union(strokes)` was the glyph
 * exactly, so the finished frame could not drift from the letter above it.
 *
 * It bought that invariant with two defects it could not stop producing, and
 * four rounds of corrective heuristics did not stop them:
 *
 * **Ownership wedges.** A T-junction is ink that two strokes both have a claim
 * on. Whatever rule divides it draws a *boundary*, and the boundary is visible
 * the moment one side is black and the other is grey. ㅂ's uprights grew
 * triangular spurs into the crossbars before the crossbars were written; ㅅ's
 * first stroke grew a chunk of the second one's shoulder; ㅈ's lid chipped into
 * the fork. A learner watching stroke one of ㅂ could see a piece of stroke
 * three already on the paper. No division rule fixes this, because there is
 * nothing to divide: the ink at a junction belongs to both strokes and is
 * written twice.
 *
 * **Polygons.** A traced raster contour is a polygon. ㅇ came out of it with
 * around thirty segments a side, flat spots, and a staircase where the tracer
 * met the rasteriser. At lesson size it read as a lumpy ring rather than a
 * circle. This one is not a tuning problem at all — no ownership rule can turn
 * a traced polygon into a smooth curve.
 *
 * ## The change
 *
 * A reference glyph and a writing animation are answering different questions,
 * and they no longer share geometry:
 *
 * - **The reference glyph** — the large character a learner studies — is set in
 *   the real typeface. See `ui/ReferenceGlyph`. It is the shape they are aiming
 *   at, and a typeface designer has already drawn it better than any generator
 *   here will.
 * - **The instruction** — the animation, the numbered diagram, the grey guide
 *   under the writing canvas — comes from this module: canonical vector
 *   centrelines, drawn as *stroked* paths with `fill="none"`.
 *
 * A stroked centreline cannot have an ownership artefact, because ownership is
 * not a concept it contains. Two strokes that meet simply overlap, exactly as
 * two pen strokes on paper overlap, and the ink at the junction is laid down
 * twice by whoever passes through it. There is no boundary to see, so §11's
 * rule — a learner must never be able to infer how the renderer divided the
 * glyph — holds by construction rather than by care.
 *
 * ## Where the geometry comes from
 *
 * Not from anywhere new. `data/strokes.ts` has always held the pedagogical
 * truth — which strokes, in which order, from which end, travelling which way —
 * as parametric jamo primitives, and `data/compose.ts` has always placed those
 * primitives into syllable blocks using part boxes *measured off the reference
 * face* (`generated/composition.json`). Both were sound. They were being used
 * only to steer a raster cut; now they are drawn directly.
 *
 * Two things were added to them:
 *
 * 1. Curved strokes carry the curve. ㅇ is four cubic segments — a true circle,
 *    and a true ellipse after a block flattens it — and ㄱ's leg is one. See
 *    `circle` and `giyeok` in `strokes.ts`.
 * 2. This module classifies every stroke end, below.
 *
 * ## Ends are classified, not decreed
 *
 * §9 asks for endpoint-aware terminals: a stroke that stops against another
 * stroke must stop *cleanly*, and one that stops in open paper gets a terminal.
 * That is a property of the geometry, so it is read off the geometry rather than
 * annotated per character — 73 items of hand-annotation is 73 chances to write
 * `join` where the letter says `free`, and character-specific data is exactly
 * what this project keeps having to unpick.
 *
 * Each end is one of:
 *
 * | | |
 * | --- | --- |
 * | `join` | It lands *inside* another stroke. Cut square, no extension: the terminal would be under that stroke's ink anyway, and extending it is how ink appears where the pen has not been. |
 * | `corner` | It meets another stroke's own end, and this stroke is the later one. Extended by half a pen so the two close a flush corner — ㅂ's base under its uprights, ㅁ's box. |
 * | `free` | Neither. Cut square where the pen stopped. |
 *
 * The order rule in `corner` is what keeps §10: only the *later* stroke extends,
 * so a completed stroke never grows a millimetre towards one not yet written.
 * At every moment of the animation, the black on the paper is a state a hand
 * could have left it in.
 *
 * ## One geometry for instruction
 *
 * The animation, the numbered still, and the guide beneath the writing canvas
 * all call `vectorGlyph`. There is no second instructional geometry that could
 * disagree with the first (§12).
 */

/** The viewBox everything here is drawn in. */
export const STROKE_VIEWBOX = '0 0 100 100';
const BOX = 100;


/**
 * The pen, in viewBox units.
 *
 * A single letter fills the box and is written heavier than the same letter
 * sharing a block with two others, so there are two numbers and they come from
 * different places.
 *
 * `JAMO_PEN` is measured off the reference face: scanning Pretendard's own ㅂ
 * across the box gives uprights of about 10.7 units and bars of about 9.5, and
 * a uniform pen a little under the lighter of those reads as the same weight
 * without inheriting the face's stem/bar contrast — which is typography, not
 * handwriting, and not something a learner is being asked to reproduce.
 *
 * `SYLLABLE_PEN` is not measured at all: it is `compose.ts`'s own pen, which
 * that module lays blocks out *around*. The gaps between the letters of 국 are
 * only as wide as they are once this much ink is on them, so reading a
 * different number here would close them. Importing it is the only way the two
 * cannot drift.
 */
const JAMO_PEN = 9;
const SYLLABLE_PEN = COMPOSED_PEN * BOX;

/**
 * How close an end has to be to another stroke to count as touching it.
 *
 * Exactly half a pen, because that is where the other stroke's ink ends. Set
 * wider, an end is called `join` — reported as landing under ink — while
 * actually standing a fraction of a pen proud of it, which is a nub on the
 * outside of the letter and a claim `strokes:qa` cannot verify. Set narrower,
 * ㅐ's crossbar stops being judged against the stem it genuinely reaches.
 */
const TOUCH = 0.5;

/**
 * How much of the box a letter written on its own fills, ink included.
 *
 * The rest is margin. A letter drawn to all four edges reads as wedged into the
 * frame however well it is proportioned inside it.
 */
const JAMO_SPAN = 84;

const ASPECT = (METRICS as { aspect: Record<string, number> }).aspect;

export interface VectorStroke {
  /** 1-based, and the order the character is actually written in. */
  order: number;
  /** The centreline as an SVG path. Stroked, never filled. */
  d: string;
  /** How each end terminates. See the note on classification above. */
  ends: { start: StrokeEndKind; end: StrokeEndKind };
  /** Where the pen lands, in viewBox units. The numbered marker's anchor. */
  start: [number, number];
  /** Where the pen lifts. */
  finish: [number, number];
  /**
   * The unit direction the pen is travelling as it leaves `start`.
   *
   * Carried rather than re-derived, so the numbered marker can be placed behind
   * the stroke without a second copy of the geometry to read it from.
   */
  heading: [number, number];
  /** Path length in viewBox units, for pacing the animation and the dash reveal. */
  length: number;
  /** A closed loop — ㅇ, and ㅎ's bowl. It has no ends to terminate. */
  closed: boolean;
}

export type StrokeEndKind = 'free' | 'join' | 'corner';

export interface VectorGlyph {
  character: string;
  viewBox: string;
  /** `stroke-width`, in viewBox units. */
  pen: number;
  strokes: VectorStroke[];
}

interface Point {
  x: number;
  y: number;
}

const cache = new Map<string, VectorGlyph>();

/**
 * The instructional strokes for a character.
 *
 * Throws for anything the curriculum should not contain, rather than falling
 * back to a placeholder: a lesson that cannot show how a letter is written is a
 * build failure, not a degraded lesson. `npm run strokes:qa` is what catches it
 * before a learner does.
 */
export function vectorGlyph(character: string): VectorGlyph {
  const hit = cache.get(character);
  if (hit) return hit;

  const steps = strokeStepsFor(character);
  if (!steps.length) {
    throw new Error(
      `No stroke geometry for "${character}". Every character the curriculum teaches must have it — see data/strokes.ts and data/compose.ts.`,
    );
  }

  const syllable = isSyllable(character);
  const pen = syllable ? SYLLABLE_PEN : JAMO_PEN;
  const scaled = steps.map((step) => scale(step, BOX));
  const placed = syllable ? scaled : shapeToFace(scaled, character, pen);
  const glyph: VectorGlyph = {
    character,
    viewBox: STROKE_VIEWBOX,
    pen,
    strokes: placed.map((step, index) => build(step, index, placed, pen)),
  };

  cache.set(character, glyph);
  return glyph;
}

export function hasVectorGlyph(character: string): boolean {
  return strokeStepsFor(character).length > 0;
}

/** The whole character as one path, for a guide or a finished still. */
export function vectorGlyphPaths(character: string): string[] {
  return vectorGlyph(character).strokes.map((stroke) => stroke.d);
}

/**
 * A letter, in the proportions the reference face gives it.
 *
 * `data/strokes.ts` authors *how a letter is written* — which strokes, in which
 * order, from which end — and authoring it in a roughly square box is what makes
 * that data readable. It does not author how tall or wide the letter is, because
 * that is a fact about the typeface and the typeface ships with the app.
 *
 * A lesson puts the reference character and the demonstration on one screen, so
 * the two disagreeing about proportion is the learner being shown two letters
 * and told they are one: Pretendard's ㅏ is a tall stem with a short branch
 * (an ink box about three tenths as wide as it is high) and the authored
 * polyline is nearer half. So the authored strokes are fitted into a box of the
 * measured shape — see `scripts/measure-jamo.mjs` — and the two agree.
 *
 * A syllable never comes through here. Its letters are already placed by
 * `compose.ts`, into part boxes measured off the same face by the same method.
 */
function shapeToFace(strokes: StrokeStep[], character: string, pen: number): StrokeStep[] {
  const aspect = ASPECT[character];
  if (!aspect) return strokes;

  const source = inkBounds(strokes);
  const inkWidth = aspect >= 1 ? JAMO_SPAN : JAMO_SPAN * aspect;
  const inkHeight = aspect >= 1 ? JAMO_SPAN / aspect : JAMO_SPAN;

  // The measurement is of ink; these strokes are centrelines, and the pen puts
  // half its width outside each one. Inset by that and the drawn result
  // reproduces the box that was measured rather than a fatter version of it.
  const half = pen / 2;
  const spanX = Math.max(0, inkWidth - pen);
  const spanY = Math.max(0, inkHeight - pen);
  void half;

  const sourceWidth = source.x1 - source.x0;
  const sourceHeight = source.y1 - source.y0;
  const scaleX = sourceWidth < 0.01 ? 0 : spanX / sourceWidth;
  const scaleY = sourceHeight < 0.01 ? 0 : spanY / sourceHeight;
  const midX = (source.x0 + source.x1) / 2;
  const midY = (source.y0 + source.y1) / 2;

  const move = (point: Point): Point => ({
    x: round(BOX / 2 + (point.x - midX) * scaleX),
    y: round(BOX / 2 + (point.y - midY) * scaleY),
  });

  return strokes.map((stroke) => {
    const next: StrokeStep = { points: stroke.points.map(move) };
    if (stroke.curve) {
      next.curve = stroke.curve.map((segment) => ({
        c1: move(segment.c1),
        c2: move(segment.c2),
        to: move(segment.to),
      }));
    }
    return next;
  });
}

function inkBounds(strokes: StrokeStep[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      if (point.x < x0) x0 = point.x;
      if (point.x > x1) x1 = point.x;
      if (point.y < y0) y0 = point.y;
      if (point.y > y1) y1 = point.y;
    }
  }
  return { x0, y0, x1, y1 };
}

// --- Geometry ----------------------------------------------------------------

function strokeStepsFor(character: string): StrokeStep[] {
  // A letter on its own is drawn as the face draws it on its own: ㄱ's leg comes
  // straight down. See `STROKE_ORDER_UPRIGHT`, which `compose.ts` also reads for
  // the block slots the face gives the same form to. Inside a block the choice
  // is that module's, and this branch is never taken.
  const alone = STROKE_ORDER_UPRIGHT[character];
  if (alone) return alone;
  const direct = STROKE_ORDER[character];
  if (direct) return direct;
  if (isSyllable(character)) return composeSyllableStrokes(character);
  return [];
}

/** From the normalised 0..1 box the data is authored in, into the viewBox. */
function scale(step: StrokeStep, box: number): StrokeStep {
  const move = (p: Point): Point => ({ x: round(p.x * box), y: round(p.y * box) });
  const next: StrokeStep = { points: step.points.map(move) };
  if (step.curve) {
    next.curve = step.curve.map((segment) => ({
      c1: move(segment.c1),
      c2: move(segment.c2),
      to: move(segment.to),
    }));
  }
  return next;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function build(
  step: StrokeStep,
  index: number,
  all: StrokeStep[],
  pen: number,
): VectorStroke {
  const points = step.points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const closed = distance(first, last) < 0.01 && points.length > 2;

  const ends = closed
    ? { start: 'free' as StrokeEndKind, end: 'free' as StrokeEndKind }
    : {
        start: classify(first, index, all, pen),
        end: classify(last, index, all, pen),
      };

  const overhang = pen / 2;
  const startPad = ends.start === 'corner' ? overhang : 0;
  const endPad = ends.end === 'corner' ? overhang : 0;

  const heading = tangentAt(step, 'start');

  return {
    order: index + 1,
    d: toPath(step, closed, startPad, endPad),
    ends,
    start: [first.x, first.y],
    heading: [round(-heading.x), round(-heading.y)],
    finish: [last.x, last.y],
    // The pads are part of the drawn path, so they are part of its length: the
    // dash reveal is paced by this number, and leaving them out would finish
    // the stroke a pen's width before its end.
    length: round(polylineLength(points) + startPad + endPad),
    closed,
  };
}

/**
 * What the end at `point` is doing, given every other stroke in the character.
 *
 * `corner` is deliberately asymmetric: of two strokes whose ends meet, only the
 * later one is extended to close the corner. Extending both would work too, but
 * extending the earlier one puts ink beyond where the pen has been *while the
 * later stroke is still grey* — a completed stroke reaching towards one not yet
 * written, which is the whole class of defect this model exists to remove.
 */
function classify(
  point: Point,
  index: number,
  all: StrokeStep[],
  pen: number,
): StrokeEndKind {
  const tolerance = pen * TOUCH;
  let corner: StrokeEndKind | null = null;

  for (let other = 0; other < all.length; other += 1) {
    if (other === index) continue;
    const step = all[other]!;
    const near = nearestOnPolyline(point, step.points);
    if (near.distance > tolerance) continue;

    const ownEnds = step.points[0]!;
    const ownLast = step.points[step.points.length - 1]!;
    const atTheirEnd =
      distance(point, ownEnds) <= tolerance || distance(point, ownLast) <= tolerance;

    // Landing in the body of another stroke settles it: cut square, and let
    // their ink cover the cut. Nothing later can promote it to a corner.
    if (!atTheirEnd) return 'join';
    if (other < index) corner = 'corner';
  }

  return corner ?? 'free';
}

/**
 * The stroke as SVG path data.
 *
 * `startPad`/`endPad` extend the centreline along its own tangent, which is how
 * a `corner` end reaches half a pen further and closes the box. Everything is
 * stroked with `butt` caps, so the drawn ink ends exactly where the path does
 * and there is no terminal to spill past a junction.
 */
function toPath(step: StrokeStep, closed: boolean, startPad: number, endPad: number): string {
  const points = step.points;
  const first = points[0]!;
  const segments: string[] = [];

  const head = startPad > 0 ? extend(first, tangentAt(step, 'start'), startPad) : first;
  segments.push(`M${fmt(head.x)} ${fmt(head.y)}`);
  if (startPad > 0) segments.push(`L${fmt(first.x)} ${fmt(first.y)}`);

  if (step.curve) {
    for (const segment of step.curve) {
      segments.push(
        `C${fmt(segment.c1.x)} ${fmt(segment.c1.y)} ${fmt(segment.c2.x)} ${fmt(
          segment.c2.y,
        )} ${fmt(segment.to.x)} ${fmt(segment.to.y)}`,
      );
    }
  } else {
    for (let i = 1; i < points.length; i += 1) {
      const p = points[i]!;
      segments.push(`L${fmt(p.x)} ${fmt(p.y)}`);
    }
  }

  if (closed) {
    segments.push('Z');
  } else if (endPad > 0) {
    const last = points[points.length - 1]!;
    const tail = extend(last, tangentAt(step, 'end'), endPad);
    segments.push(`L${fmt(tail.x)} ${fmt(tail.y)}`);
  }

  return segments.join('');
}

/** The direction the pen is travelling as it enters or leaves the stroke. */
function tangentAt(step: StrokeStep, which: 'start' | 'end'): Point {
  const points = step.points;
  if (which === 'start') {
    const from = step.curve
      ? controlAfterStart(step, points[1]!)
      : points[1] ?? points[0]!;
    return unit({ x: points[0]!.x - from.x, y: points[0]!.y - from.y });
  }
  const last = points[points.length - 1]!;
  const from = step.curve
    ? controlBeforeEnd(step, points[points.length - 2] ?? last)
    : points[points.length - 2] ?? last;
  return unit({ x: last.x - from.x, y: last.y - from.y });
}

function controlAfterStart(step: StrokeStep, fallback: Point): Point {
  const c1 = step.curve?.[0]?.c1;
  if (!c1) return fallback;
  return distance(c1, step.points[0]!) < 0.01 ? fallback : c1;
}

function controlBeforeEnd(step: StrokeStep, fallback: Point): Point {
  const segment = step.curve?.[step.curve.length - 1];
  if (!segment) return fallback;
  return distance(segment.c2, segment.to) < 0.01 ? fallback : segment.c2;
}

function extend(point: Point, direction: Point, by: number): Point {
  return { x: round(point.x + direction.x * by), y: round(point.y + direction.y * by) };
}

function unit(vector: Point): Point {
  const size = Math.hypot(vector.x, vector.y);
  return size < 1e-6 ? { x: 0, y: 0 } : { x: vector.x / size, y: vector.y / size };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestOnPolyline(point: Point, points: Point[]): { distance: number } {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    best = Math.min(best, distanceToSegment(point, points[i - 1]!, points[i]!));
  }
  if (points.length === 1) best = distance(point, points[0]!);
  return { distance: best };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-9) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1]!, points[i]!);
  return total;
}

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}
