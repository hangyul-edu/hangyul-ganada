import type { GlyphSpec } from '@hangyul-ganada/handwriting-core';

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
 * ## Why the glyph is not resized to match the demonstration
 *
 * It is tempting, and it was tried. `data/strokeVectors` draws a single letter
 * filling 0.84 of its box; Pretendard sets an isolated ㄱ at about half its em
 * and sits it high, so the guide draws the same letter at roughly 0.53 × 0.42,
 * eight per cent above centre. Two sizes of one letter on one screen.
 *
 * Scaling the glyph up to 0.84 fixes the look and breaks the grading, because
 * it scales the glyph's *stroke* too. The learner's pen is one fixed width —
 * 0.062 of the box, whatever face is selected — and at the face's own em size
 * the reference stroke lands near 0.057, which is why the coverage terms in
 * `config.ts` calibrate as well as they do. Enlarged, the reference stroke
 * becomes about 0.090: half again as wide as the pen, so an honest attempt no
 * longer covers its target. Measured on the robustness corpus, false rejections
 * went from 0.21% to 21% — one correct letter in five told it was wrong.
 *
 * The two therefore still differ in size, and the fix is not a bigger glyph but
 * a grading model that does not measure coverage against a stroke the pen
 * cannot fill. That is its own piece of work with its own calibration, and it
 * is recorded as an open issue rather than half-done here.
 */
export function glyphSpecFor(
  character: string,
  fontFamily: string,
  fontWeight?: number,
): GlyphSpec {
  return { character, fontFamily, fontWeight };
}
