import type { StrokeStep } from '@hangyul-ganada/shared-types';

/**
 * Which stroke each part of a glyph belongs to, and how far along it.
 *
 * ## The problem this replaces
 *
 * The demonstration uncovers the real glyph — see `ui/StrokeOrder.tsx` — and it
 * used to do that with a thick line drawn along each stroke's polyline, used as
 * a mask. That works until you look closely, and then it is a mess:
 *
 * - the mask has to be *wider* than the face's strokes, because a polyline is
 *   an approximation of where a stroke runs. Too narrow and it leaves slivers
 *   of a finished stroke uncovered.
 * - wide enough to avoid that, it reaches whatever else is nearby and uncovers
 *   a corner of a stroke nobody has written yet. Those are the black nubs
 *   sticking out of the ㅂ of 바 in the middle of the animation.
 * - and the pen mark on top of it was a filled disc drawn on the paper, so it
 *   sat *outside* the glyph's outline: a blob of ink where the character has
 *   none.
 *
 * There is no width that fixes both, because the two failures pull in opposite
 * directions. The mask was the wrong tool.
 *
 * ## What this does instead
 *
 * Every pixel of the glyph is assigned to exactly one stroke and given its
 * position along that stroke. That is a partition, and a partition cannot do
 * either of those things: no pixel belongs to two strokes, so nothing bleeds,
 * and no ink pixel belongs to none, so nothing is left uncovered.
 *
 * ## Assigned by stroke *body*, not by nearest point
 *
 * The first version of the partition gave each pixel to the nearest polyline,
 * which is a Voronoi diagram, and a Voronoi diagram between two perpendicular
 * strokes puts the boundary on the 45° bisector. Every junction in the alphabet
 * therefore came out mitred: the waist of ㅂ appeared as a hexagon with the ends
 * sliced off, its foot as a trapezoid, the branch of ㅏ with a triangular notch
 * where it meets the stem. Geometrically impeccable, and it reads as a broken
 * vector shape, because a stroke is a bar and the eye knows it.
 *
 * So a stroke claims its own *body* — the band of ink it covers, a rectangle as
 * wide as the face's stroke weight — and where two bands overlap the earlier
 * stroke keeps it. The seams that leaves run along the strokes instead of
 * across them: writing the left upright of ㅂ fills the upright, all of it, and
 * writing the waist afterwards fills the bar between the uprights. Which is
 * what a hand does. Nearest-point survives only as the fallback for ink no
 * band reached, where there is nothing better to go on.
 *
 * Each pixel then reduces to one number: `stroke index + fraction along it`.
 * The whole animation is a comparison against that number.
 *
 * ```
 *   progress   0.0 ────── 1.0 ────── 2.0 ────── 3.0
 *              │ stroke 1 │ stroke 2 │ stroke 3 │
 *   drawn=1.6  ██████████████████░░░░░░░░░░░░░░░░
 *                                ↑ the pen
 * ```
 *
 * Because the comparison is per pixel of the *glyph*, the edges of what appears
 * are the typeface's own edges. The only soft edge is where the pen is, which
 * is the one place a soft edge belongs.
 *
 * The partition covers the whole square, not only the inked part of it. That
 * looks like waste and is not: the mask is scaled up to the display, so any
 * boundary inside it becomes a soft edge, and a mask that stopped at the ink
 * would put a soft edge along the glyph's own outline and eat into it. Carrying
 * the territories out to the edges of the box leaves the outline alone and
 * leaves the pen as the only place anything is soft.
 */

/** A glyph, cut up by stroke. */
export interface RevealMap {
  size: number;
  /**
   * Per pixel: which stroke owns it plus how far along that stroke it sits, so
   * `progress <= drawn` is the entire visibility test.
   */
  progress: Float32Array;
}

/** Resolution the partition is computed at. The reveal edge, and nothing else. */
const RESOLUTION = 192;

/** Below this alpha a pixel is paper, not ink. Only used to spot an empty glyph. */
const INK_ALPHA = 8;

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Arc length before this segment, as a fraction of the stroke. */
  from: number;
  /** Arc length after it. */
  to: number;
  stroke: number;
  /** Whether this segment's ends are the stroke's ends, or joins inside it. */
  capStart: boolean;
  capEnd: boolean;
}

/**
 * How much a pixel past the *end* of a stroke counts against it.
 *
 * Without this a stroke's territory fans out in a half-circle beyond where the
 * pen stops, and at a corner — the foot of ㅂ's upright, where the base stroke
 * arrives later — that half-circle reaches across and takes a diagonal bite out
 * of the neighbour. The animation then uncovers a wedge of the base while
 * drawing the upright. Charging for overshoot squares the boundary off, so a
 * stroke owns what it covers and stops.
 */
const OVERSHOOT = 3;

/**
 * How much nearer a *later* stroke has to be before it takes a pixel from an
 * earlier one, as a fraction of the face's stroke weight.
 *
 * Two strokes meeting at a corner — the foot of ㅂ's right upright, where the
 * base arrives — are equidistant from it, and splitting the difference draws
 * the boundary diagonally across the corner. What the eye sees is a triangular
 * bite out of the upright while it is being written. Giving the earlier stroke
 * the benefit of the doubt squares the corner off, and matches what a hand
 * does: the upright is drawn to its end, and the base comes along afterwards
 * and meets it.
 */
const EARLIER_WINS = 0.45;

/**
 * Half-widths a stroke claims at, as multiples of the face's stroke weight.
 *
 * Tried smallest first, each one in writing order. A pixel therefore goes to
 * the earliest stroke that reaches it *at the tightest radius that reaches it
 * at all* — which is the rule that makes every boundary square.
 *
 * One radius cannot do it. Tight, and a stroke's own ink falls outside its band
 * wherever the guide is a little off centre, so the leftovers go to whichever
 * guide they happen to sit nearest — and at a junction "nearest" is the 45°
 * bisector: the triangular wedges that stuck out of ㅂ's waist. Wide, and the
 * earlier stroke keeps a slice of its neighbour and is drawn with a tab on it.
 * Grading between them bounds the overhang by however far the guide actually
 * missed, which is a fraction of a stroke rather than a fifth of one.
 *
 * None of them may reach a *parallel* neighbour: the closest pair in the
 * alphabet is ㅂ's waist and its foot, a third of the letter apart, against a
 * widest radius of about a fifth.
 */
const RADII = [0.52, 0.64, 0.78, 0.95];
const REACH = 0.95;

/**
 * How many times the guides are nudged onto the ink before the final cut.
 *
 * Even a well-placed polyline is not on the middle of the stroke it describes.
 * The composed block is laid out from measurements of a typeface, and the
 * typeface then draws the character its own way — a waist a few percent higher,
 * uprights slightly further apart — which leaves each guide a fraction of a
 * stroke off centre. A band tight enough not to protrude then misses the far
 * edge of its own stroke, and the leftover goes to whichever guide it happens
 * to sit nearest, which at a junction is the 45° bisector: the chamfered
 * corners that made ㅂ look like a badly expanded polygon.
 *
 * Rather than widen the band and get tabs instead of chamfers, each stroke is
 * moved onto its own ink first: claim generously, take the mean offset of the
 * ink claimed, shift the guide by it, repeat. Two rounds is enough — the first
 * takes out nearly all of it — and after them a band barely wider than the
 * stroke covers the stroke, so there is almost nothing left for a bisector to
 * decide.
 */
const SETTLE_ROUNDS = 2;

/** Every segment of every stroke, carrying where it sits along its own stroke. */
function segmentsOf(strokes: StrokeStep[], scale: number): Segment[] {
  const out: Segment[] = [];
  strokes.forEach((step, stroke) => {
    const points = step.points;
    const lengths: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const d = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
      lengths.push(d);
      total += d;
    }
    if (total === 0) return;
    let walked = 0;
    for (let i = 1; i < points.length; i += 1) {
      const from = walked / total;
      walked += lengths[i - 1]!;
      out.push({
        ax: points[i - 1]!.x * scale,
        ay: points[i - 1]!.y * scale,
        bx: points[i]!.x * scale,
        by: points[i]!.y * scale,
        from,
        to: walked / total,
        stroke,
        capStart: i === 1,
        capEnd: i === points.length - 1,
      });
    }
  });
  return out;
}

/**
 * Cuts a rendered glyph up by stroke.
 *
 * `draw` is handed a context and the size to render the glyph at, so this
 * module does not need to know anything about fonts or where the glyph sits.
 * Returns null when the glyph could not be rasterised — no canvas, or nothing
 * drawn — and the caller shows the character whole instead of animating it.
 */
/** Perpendicular distance and position along one segment, in pixels. */
function project(segment: Segment, x: number, y: number) {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  return {
    length,
    along: ((x - segment.ax) * dx + (y - segment.ay) * dy) / length,
    across: ((x - segment.ax) * dy - (y - segment.ay) * dx) / length,
  };
}

/** Which stroke owns a pixel, and where along it — before renormalising. */
interface Claim {
  stroke: number;
  /** Position along the stroke. Outside 0–1 in the square ends. */
  fraction: number;
}

/**
 * The stroke a pixel belongs to, and how far along it, or null.
 *
 * `order` decides overlaps: `true` gives the pixel to the earliest stroke whose
 * band covers it — how a junction ends up belonging to the stroke that got
 * there first, with the seam running along the strokes rather than across them.
 * `false` gives it to whichever band it sits most squarely inside, which is
 * what edges want once the bodies are already carved.
 *
 * The fraction is deliberately *not* clamped to 0–1. A stroke's ink runs half a
 * pen-width past each end of the guide that describes it, and clamping put all
 * of that at exactly 0 — so the moment a stroke's turn came, the whole cap
 * appeared at once, before a single frame of it had been drawn. Those were the
 * little wedges that popped out at the top of ㅏ's stem. Letting the fraction go
 * negative keeps the cap in order with the rest of the stroke; `renormalise`
 * puts the range back to 0–1 afterwards.
 */
function claim(
  byStroke: Segment[][],
  x: number,
  y: number,
  half: number,
  reach: number,
  order: boolean,
): Claim | null {
  let best: Claim | null = null;
  let closest = Infinity;
  for (const group of byStroke) {
    if (!group) continue;
    let inside: Claim | null = null;
    let within = Infinity;
    for (const segment of group) {
      const at = project(segment, x, y);
      if (!at) continue;
      const across = Math.abs(at.across);
      // Square ends, not round: a stroke covers the corner it finishes in
      // rather than rounding off and leaving its neighbour a crescent.
      if (across > half || at.along < -reach || at.along > at.length + reach) continue;
      if (across < within) {
        within = across;
        inside = {
          stroke: segment.stroke,
          fraction: segment.from + (segment.to - segment.from) * (at.along / at.length),
        };
      }
    }
    if (!inside) continue;
    if (order) return inside;
    if (within < closest) {
      closest = within;
      best = inside;
    }
  }
  return best;
}

/**
 * Moves each guide sideways onto the ink it is describing.
 *
 * The shift is the mean offset of the ink the guide claimed, perpendicular to
 * itself, so a bar a little above its guide pulls the guide up to it. Only ink
 * within a generous band counts, and only the perpendicular component: a guide
 * is allowed to be off centre, not to slide along the stroke and change where
 * the writing starts.
 */
function settle(
  byStroke: Segment[][],
  pixels: Uint8ClampedArray,
  size: number,
  half: number,
): void {
  for (const group of byStroke) {
    if (!group) continue;
    let sum = 0;
    let count = 0;
    // Every second pixel each way. This is averaging an offset over thousands
    // of them, so a quarter of the samples gives the same answer for a quarter
    // of the work — and this is the most expensive thing here.
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        if (pixels[(y * size + x) * 4 + 3]! < INK_ALPHA) continue;
        let nearest = Infinity;
        let signed = 0;
        for (const segment of group) {
          const at = project(segment, x, y);
          if (!at) continue;
          if (at.along < 0 || at.along > at.length) continue;
          if (Math.abs(at.across) < Math.abs(nearest)) {
            nearest = at.across;
            signed = at.across;
          }
        }
        if (Math.abs(nearest) > half) continue;
        sum += signed;
        count += 1;
      }
    }
    if (count === 0) continue;
    const mean = sum / count;
    // The normal of the group's dominant direction, taken from its longest
    // segment: a stroke that turns a corner still moves as one piece.
    let longest = group[0]!;
    let best = -1;
    for (const segment of group) {
      const length = Math.hypot(segment.bx - segment.ax, segment.by - segment.ay);
      if (length > best) {
        best = length;
        longest = segment;
      }
    }
    const length = Math.hypot(longest.bx - longest.ax, longest.by - longest.ay) || 1;
    const nx = (longest.by - longest.ay) / length;
    const ny = -(longest.bx - longest.ax) / length;
    for (const segment of group) {
      segment.ax += nx * mean;
      segment.bx += nx * mean;
      segment.ay += ny * mean;
      segment.by += ny * mean;
    }
  }
}

/**
 * Cuts a rendered glyph up by stroke.
 *
 * `draw` is handed a context and the size to render the glyph at, so this
 * module does not need to know anything about fonts or where the glyph sits.
 * Returns null when the glyph could not be rasterised — no canvas, or nothing
 * drawn — and the caller shows the character whole instead of animating it.
 */
export function buildRevealMap(
  strokes: StrokeStep[],
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  /** The face's stroke weight, in the same 0–1 units as the polylines. */
  weight = 0.09,
): RevealMap | null {
  if (typeof document === 'undefined' || strokes.length === 0) return null;

  let pixels: Uint8ClampedArray;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = RESOLUTION;
    canvas.height = RESOLUTION;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    draw(context, RESOLUTION);
    pixels = context.getImageData(0, 0, RESOLUTION, RESOLUTION).data;
  } catch {
    return null;
  }

  const segments = segmentsOf(strokes, RESOLUTION);
  if (segments.length === 0) return null;
  const byStroke: Segment[][] = [];
  for (const segment of segments) {
    (byStroke[segment.stroke] ??= []).push(segment);
  }

  let inked = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i]! >= INK_ALPHA) {
      inked = true;
      break;
    }
  }
  if (!inked) return null;

  const pen = weight * RESOLUTION;
  const radii = RADII.map((r) => r * pen);
  const reach = REACH * pen;
  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    settle(byStroke, pixels, RESOLUTION, reach);
  }

  const owner = new Int16Array(RESOLUTION * RESOLUTION).fill(-1);
  const fraction = new Float32Array(RESOLUTION * RESOLUTION);
  const tolerance = weight * RESOLUTION * EARLIER_WINS;
  for (let y = 0; y < RESOLUTION; y += 1) {
    for (let x = 0; x < RESOLUTION; x += 1) {
      // Tightest band first, each in writing order, so a junction goes to the
      // stroke that got there first and the seam runs along the strokes.
      let found: Claim | null = null;
      for (const radius of radii) {
        found = claim(byStroke, x, y, radius, reach, true);
        if (found) break;
      }
      found ??= nearest(segments, x, y, tolerance);
      const at = y * RESOLUTION + x;
      owner[at] = found.stroke;
      fraction[at] = found.fraction;
    }
  }

  renormalise(owner, fraction, strokes.length);

  const progress = new Float32Array(RESOLUTION * RESOLUTION);
  for (let i = 0; i < progress.length; i += 1) {
    progress[i] = owner[i]! + fraction[i]!;
  }

  return { size: RESOLUTION, progress };
}

/**
 * Last resort, for ink no band reached at all: the nearest guide, with two
 * corrections — overshooting a stroke's end is charged for, and a later stroke
 * has to be clearly nearer before it takes a pixel from an earlier one.
 */
function nearest(segments: Segment[], x: number, y: number, tolerance: number): Claim {
  let bestDistance = Infinity;
  let best: Claim = { stroke: 0, fraction: 0 };
  for (const segment of segments) {
    const at = project(segment, x, y);
    if (!at) continue;
    const t = Math.max(0, Math.min(1, at.along / at.length));
    const overshoot =
      (at.along < 0 && segment.capStart) || (at.along > at.length && segment.capEnd)
        ? Math.abs(at.along - t * at.length)
        : 0;
    const alongGap = Math.max(0, Math.min(-at.along, at.along - at.length));
    const distance = Math.hypot(at.across, alongGap) + overshoot * (OVERSHOOT - 1);
    if (distance < bestDistance - tolerance) {
      bestDistance = distance;
      best = {
        stroke: segment.stroke,
        fraction: segment.from + (segment.to - segment.from) * (at.along / at.length),
      };
    } else if (distance < bestDistance) {
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Stretches each stroke's fractions back onto 0–1.
 *
 * After assignment a stroke's pixels run from a little below 0 to a little
 * above 1 — its square ends. Rescaling to the range actually claimed means the
 * pen starts at the true beginning of the ink and finishes at its true end,
 * instead of jumping over a cap at each end.
 */
function renormalise(owner: Int16Array, fraction: Float32Array, strokes: number): void {
  const low = new Float32Array(strokes).fill(Infinity);
  const high = new Float32Array(strokes).fill(-Infinity);
  for (let i = 0; i < owner.length; i += 1) {
    const at = owner[i]!;
    if (at < 0) continue;
    if (fraction[i]! < low[at]!) low[at] = fraction[i]!;
    if (fraction[i]! > high[at]!) high[at] = fraction[i]!;
  }
  for (let i = 0; i < owner.length; i += 1) {
    const at = owner[i]!;
    if (at < 0) continue;
    const span = high[at]! - low[at]!;
    fraction[i] = span <= 0 ? 0 : (fraction[i]! - low[at]!) / span;
  }
}

/**
 * The uncovered part of the glyph, as an alpha mask.
 *
 * Written into a canvas the caller keeps, because this runs every frame and
 * allocating an `ImageData` per frame is the kind of thing that turns a smooth
 * demonstration into a stuttering one on a cheap phone.
 */
export function paintRevealMask(
  context: CanvasRenderingContext2D,
  image: ImageData,
  map: RevealMap,
  drawn: number,
): void {
  const { progress } = map;
  const data = image.data;
  for (let i = 0; i < progress.length; i += 1) {
    data[i * 4 + 3] = progress[i]! <= drawn ? 255 : 0;
  }
  context.putImageData(image, 0, 0);
}
