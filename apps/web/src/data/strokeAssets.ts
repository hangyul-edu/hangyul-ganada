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
  const points = drawPoints(draw);
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return total;
}
