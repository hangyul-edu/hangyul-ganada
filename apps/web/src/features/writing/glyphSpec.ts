import type { GlyphSpec, PathLike } from '@hangyul-ganada/handwriting-core';

import { hasVectorGlyph, vectorGlyph } from '../../data/strokeVectors';

/**
 * The one description of the reference glyph, for everything that draws it.
 *
 * The writing screen draws the same glyph twice: once as the grey guide the
 * learner traces, and once — invisibly, at evaluation resolution — as the mask
 * their ink is scored against. Those two are the same drawing on purpose. If
 * they differ at all, a learner traces exactly what is on the screen and is told
 * they got it wrong, which is unarguable from their side and impossible to
 * explain.
 *
 * `useReferenceGlyph` and the rasteriser already share `drawGlyph` for that
 * reason. What they did not share was the *spec* handed to it: the guide's was
 * built in `WritingCanvas`, the mask's in `PracticeCanvasCard`, and the two
 * object literals sat four files apart, holding only for as long as nobody gave
 * one of them a field the other did not have. Somebody did, and for one commit
 * the guide filled the box while the mask stayed where it was. One function
 * now, and both call it.
 *
 * ## The glyph is fitted, and the grader was recalibrated for it
 *
 * It used to be drawn at a fixed **em** size, which is a typographic container
 * and not the marks inside it. Pretendard sets an isolated ㄱ at about half its
 * em and sits it high; ㅏ at a fifth of its em and slightly right of centre. So
 * every letter landed at a different size in a different place inside the
 * square, and differently again for each of the six practice faces. Measured on
 * the running app, the ㅏ a learner traced filled 0.228 x 0.672 of the writing
 * box and sat 5.6% right and 4% above the crosshair drawn through the middle of
 * it, while the demonstration of the same letter two inches below filled 0.251
 * x 0.840 and was dead centre.
 *
 * `fitGlyph` now measures the drawn ink and solves for the size and origin that
 * centre it and bring its long edge to `GLYPH_INK_EXTENT`, capped at
 * `MAX_FIT_SCALE`. Both the visible guide and the invisible evaluation mask go
 * through `drawGlyph`, so they move together and a learner is still graded
 * against exactly the shape they traced.
 *
 * ## What made this hard, and what changed
 *
 * A font's stroke width is not independent of its size. Scaling a compact
 * letter up thickens its strokes past the learner's fixed 0.062 pen, and the
 * evaluator then reads a perfectly traced stroke as one with a hollow down the
 * middle. The first attempt at this took false rejection from 0.21% to 21% and
 * was reverted, and this file recorded that the real fix was "a grading model
 * that does not measure coverage against a stroke the pen cannot fill".
 *
 * That is what `GAP_EROSION_RATIO` is. The uncovered rim along a too-wide
 * stroke is connected and letter-long, so the structural gap term counted it as
 * one enormous missing piece; eroding it away before that term runs is the same
 * argument the *blot* term had already made in the other direction, and it was
 * simply missing on this side. Measured across 2,880 genuine attempts and 2,172
 * wrong ones on all six faces, the pair together move the product from
 *
 *     0.21% false reject / 0.78% false accept   (fixed em, no gap erosion)
 *
 * to
 *
 *     0.28% false reject / 0.28% false accept   (fitted glyph, 0.75 erosion)
 *
 * with Pretendard — the default face, and the one almost every learner writes
 * against — improving on both: 1.04% / 0.55% to 0.42% / 0.00%. The full sweep
 * is in the note on `GAP_EROSION_RATIO`.
 *
 * The guide and the demonstration are still not pixel-identical, and they
 * should not be: one is a typeface and one is authored instructional geometry.
 * They are now the same size and in the same place, which is the part a learner
 * could see.
 */
/**
 * Letters the guide is drawn by hand rather than set in the face.
 *
 * In a compound vowel Pretendard **slants** the ㅗ or ㅜ bar, tilting it down
 * towards the outside so the two halves do not collide at text sizes. It is an
 * optical adjustment belonging to the typeface: nobody writes a slanted ㅗ.
 *
 * For a while the demonstration drew the level form and the guide underneath it
 * drew the tilted one, and `glyphshape:qa` carried the six as stated
 * exceptions. That was the wrong resolution. A learner tracing a slanted bar
 * and then watching a level one is being taught two shapes, and "we wrote the
 * difference down" does not undo that.
 *
 * The reference *typography* elsewhere in the product is still the face — a
 * word on a card is set, not drawn. What must agree is the pair a learner
 * copies: the guide under the pen and the stroke demonstration. So for these
 * six the guide is stroked from the same authored centrelines the animation
 * reveals, and the grading mask with it, because both come out of `drawGlyph`.
 *
 * Six, and no more. Every other letter agrees with the face to within the
 * tolerance `glyphshape:qa` measures, and setting a letter in the face is the
 * better default: it is what the learner will meet in the wild.
 */
export const HANDWRITTEN_GUIDE = new Set(['ㅘ', 'ㅝ', 'ㅚ', 'ㅟ', 'ㅙ', 'ㅞ']);

/** The browser's path object, for the letters drawn from centrelines. */
export const pathFactory = (d: string) => new Path2D(d) as unknown as PathLike;

export function glyphSpecFor(
  character: string,
  fontFamily: string,
  fontWeight?: number,
  /**
   * The face's own probe em, where it has one — `glyph_scale` in `fonts.ts`.
   *
   * Threaded through rather than looked up here, because this module is given
   * a font *family string* and not a font: the caller knows which face it
   * selected and this only knows what CSS to write. Undefined on five of the
   * six faces, and then `glyphLayout` uses the shared default.
   */
  glyphScale?: number,
): GlyphSpec {
  if (HANDWRITTEN_GUIDE.has(character) && hasVectorGlyph(character)) {
    const glyph = vectorGlyph(character);
    return {
      character,
      fontFamily,
      fontWeight,
      glyphScale,
      strokes: glyph.strokes.map((stroke) => stroke.d),
      pen: glyph.pen,
    };
  }
  return { character, fontFamily, fontWeight, glyphScale };
}
