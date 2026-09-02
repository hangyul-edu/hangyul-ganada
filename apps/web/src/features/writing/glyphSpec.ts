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
 * The guide and the demonstration are now the same geometry as well as the
 * same size and place — see `usesCanonicalGeometry` below for the defect that
 * closed the last gap between them. The calibration above was measured while
 * the guide was still set in the face; `npm run handwriting:robustness`
 * re-measures it against the canonical reference, and the numbers it prints
 * are the ones `docs/report.md` quotes.
 */
/**
 * Every taught character is guided, graded and demonstrated from one geometry.
 *
 * ## What this replaced, and the defect that forced it
 *
 * This used to be a set of six compound vowels — the only letters where the
 * face and the taught hand were known to disagree — and everything else was
 * *set in the practice typeface* for the guide and the grading mask while the
 * demonstration was *stroked from `data/strokeVectors`*. Two sources, by
 * design, held together by a tolerance in `glyphshape:qa`.
 *
 * A tolerance is not an invariant. Measured on this tree, before the change:
 *
 * | | face | canonical vector |
 * | --- | --- | --- |
 * | ㅆ | **one** island of ink | **two** — a clear ㅅ, then another |
 * | ㅉ | **one** island of ink | **two** |
 *
 * So a learner tracing ㅆ was given a single merged mass to follow and then
 * watched two separate ㅅ being written underneath it, and `letters:face`
 * could not report it because ㅅ, ㅆ, ㅈ, ㅉ, ㅊ, ㅇ and ㅎ were all on its
 * `STRUCTURE_EXEMPT` list — the letters the defect lived in were exactly the
 * letters the structural check was switched off for. `glyphshape:qa` scored
 * ㅅ at 92% and passed, because its 14-px tolerance on a 320-px raster is
 * wider than the disagreement.
 *
 * The two-source design cannot be made safe by tightening either number. A
 * typeface and a pedagogical skeleton are different objects: the face closes
 * ㅆ's two halves because at text sizes they would otherwise fight, and the
 * teaching form must keep them apart because *two ㅅ* is the thing being
 * taught. Both are right for their own purpose, and neither can be the other's
 * reference.
 *
 * ## The resolution
 *
 * The instructional surfaces — the guide under the pen, the mask the ink is
 * graded against, the demonstration, the numbered still — are now one
 * geometry: `data/strokeVectors`, the canonical centrelines. They agree by
 * construction rather than by tolerance, so §4's invariant is structural.
 *
 * The face has not stopped mattering. It is still the *quality target* and,
 * because the product does not control it, still the independent oracle: every
 * canonical letter is measured against the font file itself by
 * `npm run letters:face`. What has changed is that it is no longer a second
 * thing on screen for the canonical form to disagree with.
 *
 * Reading Korean is untouched. A word on a card, a headword, a sentence — all
 * still set in the learner's chosen face, because there the glyph is
 * typography rather than instruction.
 */
export function usesCanonicalGeometry(character: string): boolean {
  return hasVectorGlyph(character);
}

/**
 * The letters whose canonical form deliberately departs from the face.
 *
 * Kept as data, and each one carries its reason, because "the teaching form is
 * not the typeface here" is a claim that has to be reviewable. Everything not
 * on this list is expected to agree with the face within the tolerance
 * `letters:face` measures.
 */
export const CANONICAL_DEVIATIONS = new Map<string, string>([
  [
    'ㅘ',
    'Pretendard slants the ㅗ bar so the two halves clear each other at text size. Nobody writes a slanted ㅗ.',
  ],
  ['ㅝ', 'As ㅘ: the face tilts the ㅜ bar as an optical adjustment.'],
  ['ㅚ', 'As ㅘ.'],
  ['ㅟ', 'As ㅝ.'],
  ['ㅙ', 'As ㅘ.'],
  ['ㅞ', 'As ㅝ.'],
  [
    'ㅆ',
    'The face closes the two ㅅ into one island of ink. The letter is two ㅅ and is written as two, so the canonical form keeps them separate.',
  ],
  [
    'ㅉ',
    'As ㅆ: the face merges the pair, the canonical form keeps two legible ㅈ.',
  ],
]);

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
  if (usesCanonicalGeometry(character)) {
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
