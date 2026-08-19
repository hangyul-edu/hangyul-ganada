import raw from './generated/strokeAssets.json';

/**
 * The stroke assets: one validated shape per stroke, per shipping character.
 *
 * ## Why these are built and not composed
 *
 * The demonstration used to assemble each syllable at runtime — take the jamo,
 * drop them into layout slots, transform their polylines, draw the result. It
 * was rebuilt six times and broke somewhere new each time: a chamfered ㅂ, a
 * polygonal ㅇ, a ㄱ leaning the wrong way, a 글 whose ㄹ collapsed into three
 * overlapping lines. The approach has one flaw that cannot be patched out of it:
 * it *invents* the finished shape, so it can always invent a wrong one, and the
 * only way to find out is for someone to look.
 *
 * The curriculum teaches 73 characters. That is small enough to stop inventing.
 * Each one is cut from the reference glyph itself at build time by
 * `scripts/build-stroke-assets.mjs`, which means
 *
 *     union(strokes) === the reference glyph
 *
 * holds by construction rather than by resemblance — there is no second
 * geometry that could disagree with the first, because there is no second
 * geometry. The large glyph at the top of a lesson, the grey guide underneath
 * the demonstration, the ink as it grows and the frame it finishes on are all
 * these same paths.
 *
 * ## There is no fallback, deliberately
 *
 * `strokeAsset` throws for a character it does not have, and `npm run
 * strokes:qa` fails the build if the curriculum contains one. A silent fall back
 * to the old composer is exactly how a broken 글 shipped: it looked like it
 * worked, and nothing in the build had an opinion about whether it looked right.
 * A missing asset is a build failure, not a degraded lesson.
 *
 * ## Keep this out of the first load
 *
 * The data is around 190 kB of path geometry. It is imported only by the
 * demonstration components, which are reachable only from lesson routes, so it
 * is bundled with those and never with the home screen. Importing it from
 * anything in the first-load graph — `data/characters.ts`, a store, a router
 * module — would put all of it in front of the first paint. `npm run
 * bundle:budget` is what notices if that happens.
 */

export interface StrokeShape {
  /** 1-based, and the order the character is actually written in. */
  order: number;
  /** The stroke as a filled outline, cut from the glyph. Needs `evenodd`. */
  shape: string;
  /** The centreline, as `x y L x y …` — what the reveal grows along. */
  draw: string;
  /** Where the pen lands, in viewBox units. The numbered marker's anchor. */
  start: [number, number];
  /**
   * How wide the brush that uncovers this stroke must be, in viewBox units.
   *
   * Measured at build time as the furthest any point of `shape` lies from
   * `draw`, doubled. A narrower brush would leave part of the stroke hidden at
   * the moment it is supposed to be finished — a flick at the end of every
   * stroke, worst on short wide ones like the tick of ㅊ.
   */
  reveal: number;
}

export interface StrokeAsset {
  character: string;
  group: string;
  viewBox: string;
  /** The face's own stroke weight in viewBox units, for sizing marks to it. */
  pen: number;
  strokes: StrokeShape[];
  /** How the glyph was divided into letters. Diagnostic; see the build script. */
  segmentation?: string;
}

interface AssetFile {
  face: string;
  items: Record<string, StrokeAsset>;
}

const file = raw as unknown as AssetFile;

/** The face every asset was cut from. */
export const STROKE_ASSET_FACE = file.face;

export const STROKE_ASSETS: Readonly<Record<string, StrokeAsset>> = file.items;

export const STROKE_ASSET_CHARACTERS = Object.keys(file.items);

export function hasStrokeAsset(character: string): boolean {
  return Object.prototype.hasOwnProperty.call(file.items, character);
}

/**
 * The asset for a character, or an error.
 *
 * Never a fallback and never a placeholder: a lesson that cannot show the real
 * shape should fail loudly in development and never reach a learner, which is
 * what `strokes:qa` in `verify:quick` is for.
 */
export function strokeAsset(character: string): StrokeAsset {
  const asset = file.items[character];
  if (!asset) {
    throw new Error(
      `No stroke asset for "${character}". Every character the curriculum teaches must have one — run \`npm run strokes:build\`, and see scripts/build-stroke-assets.mjs.`,
    );
  }
  return asset;
}

/** The centreline as points, for measuring a stroke or animating along it. */
export function drawPoints(draw: string): Array<{ x: number; y: number }> {
  return draw.split('L').map((pair) => {
    const [x, y] = pair.trim().split(/\s+/).map(Number);
    return { x: x ?? 0, y: y ?? 0 };
  });
}

/** How far the pen travels along a stroke, in viewBox units. */
export function drawLength(draw: string): number {
  return polylineLength(drawPoints(draw));
}

function polylineLength(points: ReadonlyArray<{ x: number; y: number }>): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return total;
}

// --- Revealing a stroke -------------------------------------------------------

/**
 * The shape of "how much of this stroke has been written", at a given progress.
 *
 * ## The artefact this exists to remove
 *
 * A stroke is uncovered by masking its filled outline with a region that grows
 * as the pen travels. The obvious region — the stroke's own centreline, drawn
 * as a fat line with a dash offset — has a defect that is invisible in the
 * markup and unmissable on screen:
 *
 * ```
 *   ┌────────────●          the pen is here
 *   │            ◣          …and a triangular wedge is already black
 * ```
 *
 * The fat line has **one width**, and that width has to be the widest the
 * stroke ever gets — which is wherever it meets another stroke. On ㅂ that is 25
 * units against a pen of 9. Two things then go wrong at once, and neither can be
 * fixed by choosing a different single number:
 *
 * * **It runs ahead.** A round cap puts a semicircle of half that width — a
 *   sixth of the whole glyph — in front of the pen, and every junction bump
 *   inside that radius turns black before the pen arrives. That is the wedge at
 *   the corner of ㄱ, the nub on the stem of ㅂ, the spike off the top bar of ㄹ.
 * * **It reaches across.** ㅎ's ring is about six units thick with a nine-unit
 *   hole, and its brush is 17.7 wide because the ring meets the bar above it.
 *   Half of 17.7 is more than the hole, so the brush covering the near side of
 *   the ring also covers the *far* side, and the bottom of the circle appears
 *   while the pen is still at the top.
 *
 * Narrowing the brush trades the second fault for a third: ink further from the
 * centreline than the brush reaches is never uncovered at all, and the stroke
 * snaps into place at the end.
 *
 * ## What is used instead
 *
 * A **ribbon of the stroke's own varying width**, built as a filled polygon
 * rather than a stroked line, and cut square across at the pen:
 *
 * ```
 *        ╭──────────╮              ← left edge, offset by the local half-width
 *   ═════●══════════╡  ← the cut, square across, exactly at the pen
 *        ╰──────────╯              ← right edge
 * ```
 *
 * The half-width is measured per sample from the outline itself, so the ribbon
 * is wide where the stroke is wide — over a junction bump — and narrow where it
 * is narrow, which is everywhere else. It therefore covers everything up to the
 * pen and nothing beyond it, and because a narrow ribbon cannot bridge a hole,
 * a ring uncovers one end at a time.
 *
 * Being a polygon, it has no caps and no joins to choose: the two former sources
 * of overshoot are not parameters any more, they are gone.
 *
 * ## One implementation, two callers
 *
 * `ui/StrokeOrder.tsx` draws this and `scripts/strokes-qa.mjs` renders the same
 * frames to a gallery for a person to look at. They call this function rather
 * than each writing the markup, so the thing being checked is the thing that
 * ships — the wedge was in both, identically, and passing QA.
 */
export interface StrokeReveal {
  /**
   * The region written so far, as overlapping quads in one `nonzero` path.
   *
   * Several subpaths rather than one outline, deliberately — see the note in
   * `strokeReveal` about what a single loop does to a ring.
   */
  path: string;
}

export function strokeReveal(stroke: StrokeShape, fraction: number): StrokeReveal {
  const ribbon = ribbonFor(stroke);
  const clamped = Math.max(0, Math.min(1, fraction));
  if (clamped <= 0 || ribbon.samples.length < 2) return { path: '' };

  const cut = clamped * ribbon.length;
  const spine: Sample[] = [];
  for (const sample of ribbon.samples) {
    if (sample.at > cut) break;
    spine.push(sample);
  }
  // The leading edge, square across the stroke at exactly the pen's position.
  // Interpolated rather than snapped to the last whole sample, so the ink grows
  // smoothly instead of in steps at whatever the sampling rate happens to be.
  spine.push(sampleAt(ribbon, cut));

  /*
   * One quad per step, all wound the same way, in one path filled `nonzero`.
   *
   * The obvious construction — every left offset, then every right offset
   * reversed, as a single loop — is wrong for a closed stroke and wrong in a way
   * that only shows at the very end. Once ㅇ's ribbon comes back round to meet
   * itself, that loop *is* an annulus: an outer ring and an inner ring wound
   * opposite ways, so the hole in the middle counts as outside. The ring's own
   * inner edge lives in that hole, so a fifth of the stroke stayed grey until
   * the animation finished and the whole shape was painted at once — the snap
   * this reveal exists to avoid.
   *
   * Overlapping quads have no inside to lose. Each is given positive
   * orientation so that `nonzero` unions them rather than letting a quad that
   * turned a corner cancel its neighbour.
   */
  const quads: string[] = [];
  for (let i = 1; i < spine.length; i += 1) {
    const a = spine[i - 1]!;
    const b = spine[i]!;
    const corners = [offset(a, 1), offset(b, 1), offset(b, -1), offset(a, -1)];
    if (signedArea(corners) < 0) corners.reverse();
    quads.push(`M${corners.map((p) => `${round(p.x)} ${round(p.y)}`).join('L')}Z`);
  }

  return { path: quads.join('') };
}

function signedArea(points: ReadonlyArray<{ x: number; y: number }>): number {
  let total = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    total += (points[j]!.x - points[i]!.x) * (points[j]!.y + points[i]!.y);
  }
  return total / 2;
}

interface Sample {
  x: number;
  y: number;
  /** Distance along the centreline, in viewBox units. */
  at: number;
  /** Unit normal, pointing left of travel. */
  nx: number;
  ny: number;
  /** How far the outline reaches from here, perpendicular to travel. */
  reach: number;
}

interface Ribbon {
  samples: Sample[];
  length: number;
}

function offset(sample: Sample, side: number): { x: number; y: number } {
  return { x: sample.x + sample.nx * sample.reach * side, y: sample.y + sample.ny * sample.reach * side };
}

/** The centreline point and width at `at` units along, between samples. */
function sampleAt(ribbon: Ribbon, at: number): Sample {
  const { samples } = ribbon;
  if (at <= samples[0]!.at) return samples[0]!;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (at > b.at) continue;
    const span = b.at - a.at;
    const t = span === 0 ? 0 : (at - a.at) / span;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      at,
      nx: a.nx + (b.nx - a.nx) * t,
      ny: a.ny + (b.ny - a.ny) * t,
      reach: Math.max(a.reach, b.reach),
    };
  }
  return samples[samples.length - 1]!;
}

/**
 * How finely the centreline is cut, in viewBox units.
 *
 * Fine enough that the ribbon follows a curve without visible corners — ㅇ is
 * about 180 units round, so this is roughly a hundred and twenty samples — and
 * coarse enough that building the polygon every animation frame is nothing.
 */
const SAMPLE_STEP = 1.5;

/**
 * How far along the stroke a piece of outline may sit and still count towards
 * the width here, in viewBox units.
 *
 * A junction bump is claimed by the samples nearest it and widens the ribbon
 * there, which is the point. Too small a window and the bump is missed between
 * samples; too large and its width smears along the stroke and starts reaching
 * across holes again.
 */
const WIDTH_WINDOW = 4;

/** The smallest half-width a ribbon may have, so a hairline still uncovers. */
const MIN_REACH = 0.75;

const RIBBONS = new WeakMap<StrokeShape, Ribbon>();

function ribbonFor(stroke: StrokeShape): Ribbon {
  const cached = RIBBONS.get(stroke);
  if (cached) return cached;

  const spine = resample(drawPoints(stroke.draw), SAMPLE_STEP);
  const outline = outlinePoints(stroke.shape);

  const samples: Sample[] = spine.map((point, index) => {
    const before = spine[Math.max(0, index - 1)]!;
    const after = spine[Math.min(spine.length - 1, index + 1)]!;
    const tangent = direction(before, after);
    return { ...point, nx: -tangent.y, ny: tangent.x, reach: MIN_REACH };
  });

  /*
   * Each piece of outline widens the ribbon where it belongs.
   *
   * Assigned to its nearest sample rather than projected onto a tangent: on a
   * curve the two disagree badly, and a tangent-based measurement is what made
   * ㅇ's start read as twenty units of end cap.
   */
  for (const point of outline) {
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < samples.length; i += 1) {
      const distance = Math.hypot(point.x - samples[i]!.x, point.y - samples[i]!.y);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    }
    const span = Math.ceil(WIDTH_WINDOW / SAMPLE_STEP);
    for (let i = Math.max(0, nearest - span); i <= Math.min(samples.length - 1, nearest + span); i += 1) {
      const reach = Math.hypot(point.x - samples[i]!.x, point.y - samples[i]!.y);
      if (reach > samples[i]!.reach) samples[i]!.reach = reach;
    }
  }

  // The ends. A cap sits beyond the last sample, so the ribbon is carried past
  // each end by its own width there — enough to cover the cap, and far too
  // little to reach anything else.
  if (samples.length >= 2) {
    const head = samples[0]!;
    const tail = samples[samples.length - 1]!;
    const before = direction(samples[1]!, head);
    const after = direction(samples[samples.length - 2]!, tail);
    samples.unshift({
      x: head.x + before.x * head.reach,
      y: head.y + before.y * head.reach,
      at: 0,
      nx: head.nx,
      ny: head.ny,
      reach: head.reach,
    });
    samples.push({
      x: tail.x + after.x * tail.reach,
      y: tail.y + after.y * tail.reach,
      at: 0,
      nx: tail.nx,
      ny: tail.ny,
      reach: tail.reach,
    });
  }

  let along = 0;
  for (let i = 0; i < samples.length; i += 1) {
    if (i > 0) {
      along += Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.y - samples[i - 1]!.y);
    }
    samples[i]!.at = along;
  }

  const ribbon: Ribbon = { samples, length: along };
  RIBBONS.set(stroke, ribbon);
  return ribbon;
}

/** A polyline re-cut into even steps, keeping its ends. */
function resample(
  points: ReadonlyArray<{ x: number; y: number }>,
  step: number,
): Array<{ x: number; y: number; at: number }> {
  if (points.length === 0) return [];
  const out = [{ x: points[0]!.x, y: points[0]!.y, at: 0 }];
  let along = 0;
  let carry = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    if (span === 0) continue;
    let travelled = step - carry;
    while (travelled <= span) {
      const t = travelled / span;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, at: along + travelled });
      travelled += step;
    }
    carry = span - (travelled - step);
    along += span;
  }
  const last = points[points.length - 1]!;
  const tip = out[out.length - 1]!;
  if (Math.hypot(last.x - tip.x, last.y - tip.y) > step / 4) {
    out.push({ x: last.x, y: last.y, at: along });
  }
  return out;
}

function direction(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  // Duplicated points carry no direction. Falling back to horizontal keeps the
  // path valid; the alternative is a NaN that silently blanks the whole mask.
  return length === 0 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
}

/**
 * A filled outline as points along its edges, not merely at its corners.
 *
 * The densification is the whole point. A long bar is a rectangle — *four*
 * vertices, all of them at the two ends — so measuring a stroke's width from
 * its vertices alone gives every sample in the middle nothing to measure
 * against. The ribbon then collapsed to a hairline down the centre of the
 * stroke and uncovered a thread of ink instead of the stroke. Walking the edges
 * gives every part of the outline a say in the width beside it.
 *
 * Rings are honoured: a shape may contain several closed contours — the outer
 * and inner edges of ㅇ — and each is walked and closed on its own, so no edge
 * is invented between them.
 */
export function outlinePoints(shape: string, step = 1): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];

  for (const piece of shape.split('M').slice(1)) {
    const numbers = piece.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const ring: Array<{ x: number; y: number }> = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      ring.push({ x: numbers[i]!, y: numbers[i + 1]! });
    }
    if (ring.length === 0) continue;
    // Closed: the last edge runs back to the first point.
    ring.push(ring[0]!);

    for (let i = 1; i < ring.length; i += 1) {
      const a = ring[i - 1]!;
      const b = ring[i]!;
      out.push(a);
      const span = Math.hypot(b.x - a.x, b.y - a.y);
      const cuts = Math.floor(span / step);
      for (let k = 1; k <= cuts; k += 1) {
        const t = (k * step) / span;
        if (t >= 1) break;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
  }

  return out;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
