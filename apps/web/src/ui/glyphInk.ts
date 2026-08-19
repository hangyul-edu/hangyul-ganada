/**
 * Where a character's ink actually falls inside its em, for the face it is
 * drawn in.
 *
 * ## Why the demonstration needs this
 *
 * The stroke-order demonstration draws the *real glyph* — the same character in
 * the same typeface as the large reference at the top of the lesson — and
 * uncovers it stroke by stroke. For that to work, the polylines in
 * `data/strokes.ts` have to be laid over the glyph they are uncovering, and a
 * font does not say where its ink is. So it gets measured: one `measureText`
 * call per character per face, cached, using the tight ink box the browser
 * reports rather than the em box, which is mostly padding.
 *
 * ## And why the stroke weight is measured too
 *
 * The mask that uncovers the glyph runs along those polylines, and it has to be
 * wide enough to clear the glyph's own strokes — with room for the fact that a
 * polyline is an approximation of where a stroke runs, not a tracing of it. How
 * wide that is depends on the face: Nanum Myeongjo's horizontals are a fraction
 * of the weight of Gowun Dodum's. ㅡ is one horizontal stroke and nothing else,
 * so the height of its ink *is* the face's horizontal stroke weight, and it
 * comes from the same place as everything else here rather than being a number
 * somebody guessed once.
 */

/** A character's ink box and the face's stroke weight, in units of 1 em. */
export interface GlyphInk {
  /** Ink box relative to the text origin, in em units. `top` is negative. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** The face's horizontal stroke weight, in em units. */
  weight: number;
}

/**
 * What to assume when the browser will not measure — a server render, a test
 * environment with no canvas, a face that reported nothing.
 *
 * A Hangul syllable block fills most of its em and sits above the baseline.
 * Drawn from these numbers the demonstration is still right; it is only placed
 * by a rule of thumb rather than by measurement.
 */
const ASSUMED: GlyphInk = {
  left: 0.06,
  right: 0.94,
  top: -0.86,
  bottom: 0.06,
  weight: 0.085,
};

/** Measured once per face and character; there are a few dozen of each. */
const cache = new Map<string, GlyphInk>();

/** The size everything is measured at, then scaled. Large enough to be exact. */
const MEASURE_AT = 200;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function measureOne(
  context: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
): Box | null {
  context.font = `400 ${MEASURE_AT}px ${fontFamily}`;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  const m = context.measureText(text);
  // `actualBoundingBox*` is the tight ink box. Everything else a browser will
  // say about a run of text describes the em, which is mostly air.
  const left = -(m.actualBoundingBoxLeft ?? NaN);
  const right = m.actualBoundingBoxRight ?? NaN;
  const top = -(m.actualBoundingBoxAscent ?? NaN);
  const bottom = m.actualBoundingBoxDescent ?? NaN;
  if (![left, right, top, bottom].every((v) => Number.isFinite(v))) return null;
  if (right - left <= 0 || bottom - top <= 0) return null;
  return {
    left: left / MEASURE_AT,
    right: right / MEASURE_AT,
    top: top / MEASURE_AT,
    bottom: bottom / MEASURE_AT,
  };
}

/**
 * The ink box of `character` in `fontFamily`, or the assumed one.
 *
 * Never throws and never returns nothing: a demonstration that could not
 * measure its glyph still has to draw it.
 */
export function glyphInk(character: string, fontFamily: string): GlyphInk {
  const key = `${fontFamily} ${character}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return ASSUMED;

  let measured: GlyphInk = ASSUMED;
  try {
    const context = document.createElement('canvas').getContext('2d');
    if (context) {
      const box = measureOne(context, character, fontFamily);
      const bar = measureOne(context, 'ㅡ', fontFamily);
      if (box) {
        measured = { ...box, weight: bar ? bar.bottom - bar.top : ASSUMED.weight };
      }
    }
  } catch {
    // A context that will not measure is the same as not having one.
  }
  cache.set(key, measured);
  return measured;
}

/** Faces confirmed present, so a late arrival invalidates the cache only once. */
const confirmed = new Set<string>();

/**
 * Waits for `fontFamily` to actually be available, then forgets what was
 * measured with whatever the browser had been substituting.
 *
 * This matters more than it sounds. `document.fonts.status` reads `loaded`
 * whenever nothing is *pending*, which is true before a web font has been asked
 * for at all — so measuring on that signal measures the fallback face and
 * places the whole demonstration by its metrics. The symptom is a mask and a
 * row of numbers sitting a tenth of the box away from the strokes they belong
 * to, on a glyph that looks perfectly correct, which is a confusing thing to
 * debug and an easy thing to check for.
 *
 * Resolves `true` only when something was invalidated and a re-measure is
 * therefore worth a re-render.
 */
export async function whenFaceReady(character: string, fontFamily: string): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return false;
  if (confirmed.has(fontFamily)) return false;
  try {
    await document.fonts.load(`400 100px ${fontFamily}`, character);
    await document.fonts.ready;
  } catch {
    return false;
  }
  if (confirmed.has(fontFamily)) return false;
  confirmed.add(fontFamily);
  cache.clear();
  return true;
}

/** Forgets everything measured. For tests, and for a face that changed. */
export function forgetGlyphInk(): void {
  cache.clear();
  confirmed.clear();
}
