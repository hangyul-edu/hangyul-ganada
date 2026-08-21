import type { Mask } from './types.js';

/** Everything needed to draw one reference character. */
export interface GlyphSpec {
  character: string;
  /** CSS font-family stack of the learner's selected practice typeface. */
  fontFamily: string;
  fontWeight?: number;
  /** Glyph em size as a fraction of the writing-box edge. */
  glyphScale?: number;
}

/** How large the glyph is drawn, and where. */
export interface GlyphLayout {
  fontSize: number;
  centerX: number;
  centerY: number;
}

/**
 * Default em size relative to the writing box. Hangul syllable blocks fill most
 * of their em, so 0.78 lands the glyph comfortably inside the guides without
 * touching them.
 *
 * This is the size the glyph is *probed* at before it is fitted. See `fitGlyph`.
 */
export const DEFAULT_GLYPH_SCALE = 0.78;

/**
 * How much of the writing box the glyph's **ink** should occupy on its long
 * edge, once fitted.
 *
 * Not the em — the ink. An em is a typographic container and its relationship
 * to the marks inside it is the face designer's business: Pretendard sets an
 * isolated ㄱ at roughly half its em and sits it high, and ㅏ at a fifth of its
 * em and slightly right of centre. Drawn at a fixed em size, as this used to
 * be, every letter therefore landed at a different size and in a different
 * place inside the square, and both were wrong by a different amount for every
 * one of the six practice faces.
 *
 * 0.72 rather than the 0.84 the demonstration uses, and the gap is the whole of
 * the compromise. See `MAX_FIT_SCALE`.
 */
export const GLYPH_INK_EXTENT = 0.72;

/**
 * The most the fit is allowed to magnify a glyph.
 *
 * This is the constraint the previous attempt at fitting ran into and reverted
 * over, and it is worth stating exactly, because it is not obvious.
 *
 * The learner's pen is one fixed width — 0.062 of the box — whatever face is
 * selected. A font's stroke width is not independent of its size: scale the
 * glyph up by k and its strokes get k times thicker. Push a compact letter like
 * ㄱ from its natural 0.53 of the box out to 0.84 and k is 1.58, which takes its
 * stroke from 0.057 of the box to 0.090 — half again as wide as the pen that
 * has to fill it. The evaluator then reads an honest attempt as a letter with a
 * hollow down the middle of every stroke.
 *
 * So the fit magnifies, and it stops. The cap was chosen by sweeping it against
 * the whole corpus jointly with `GAP_EROSION_RATIO`, which is the term that
 * forgives the rim a too-wide stroke leaves:
 *
 * ```
 * MAX_FIT_SCALE   FRR      FAR     worst-face FRR   (at gapErosion 0.75)
 * 1.00           0.03%    1.01%     0.21%
 * 1.15           0.28%    0.55%     1.46%
 * 1.30           0.28%    0.28%     1.04%   <- chosen
 * 1.50           0.52%    0.28%     1.67%
 * ```
 *
 * A larger fit lowers false acceptance — a bigger reference is a harder target
 * for the wrong letter to land on — and raises false rejection, for the stroke
 * width reason above. 1.30 is where false acceptance stops improving: 1.50 buys
 * nothing on that column and costs most of a point of false rejection.
 *
 * ## A more principled cap was tried, measured, and is not here
 *
 * A fixed *scale* cap is a blunt instrument: it binds hardest on a light
 * handwriting face that draws small letters and could safely be magnified most.
 * So the obvious refinement is to cap on the thing that actually matters — the
 * resulting stroke width — by estimating each glyph's stroke from its own mask
 * and allowing it to grow until that reaches some multiple of the pen. It was
 * implemented and swept:
 *
 * ```
 * stroke cap   FRR      FAR     mean extent   below target
 * 1.0 pens    0.14%    0.78%      0.632          47%
 * 1.1 pens    0.63%    0.46%      0.655          36%
 * 1.2 pens    0.35%    0.41%      0.670          27%
 * 1.35 pens   1.04%    0.28%      0.686          23%
 * ```
 *
 * It does what it was meant to — a quarter fewer glyphs held below the target,
 * and far more consistent sizing on four of the six faces — and it measures
 * *worse* on both error rates than the fixed cap at every setting, while adding
 * a per-render median-run-length pass to a function the on-screen guide calls
 * on every resize. The extent difference is 0.647 against 0.670, which nobody
 * can see; the accuracy difference is a learner being told they wrote it wrong.
 * Recorded rather than kept, so the idea is not had a third time.
 *
 * Shrinking is not capped. A glyph wider than the box is a glyph the learner
 * cannot finish, and no grading term objects to a thinner stroke.
 */
export const MAX_FIT_SCALE = 1.3;

/**
 * Shared by the on-screen reference glyph and the evaluation mask, so the two
 * can never drift apart. If they did, learners would be graded against a glyph
 * in a different position from the one they traced.
 *
 * This is the **probe** layout — the glyph at its nominal em, centred on the
 * box's centre by its em rather than by its ink. `fitGlyph` refines it, and
 * `drawGlyph` is what both callers actually use.
 */
export function glyphLayout(boxSize: number, glyphScale = DEFAULT_GLYPH_SCALE): GlyphLayout {
  return {
    fontSize: boxSize * glyphScale,
    centerX: boxSize / 2,
    centerY: boxSize / 2,
  };
}

/** Where a glyph's drawn ink actually landed, in pixels. */
interface InkBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The ink bounding box in an RGBA buffer. */
function boundsOf(data: Uint8ClampedArray, boxSize: number): InkBox | null {
  let minX = boxSize;
  let minY = boxSize;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < boxSize; y += 1) {
    for (let x = 0; x < boxSize; x += 1) {
      // Alpha only. The guide is painted grey and the mask black; both are
      // opaque where there is ink and transparent where there is not.
      if (data[(y * boxSize + x) * 4 + 3]! < ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/**
 * Matches `maskFromAlpha`'s own cut, so "ink" means the same thing here as it
 * does to the evaluator — and so the Python that renders the test fixtures can
 * fit a glyph the same way without a second definition of the word.
 */
const ALPHA_THRESHOLD = 128;

/**
 * The font size and origin that put this glyph's ink in the middle of the box
 * at a consistent size.
 *
 * ## Why this is measured and not computed
 *
 * There is no way to ask a font "how big is the ink in this glyph". `measureText`
 * reports advance width and font-wide ascent and descent — properties of the em
 * and of the face, not of the marks in one character. Two letters at the same
 * font size, in the same face, occupy wildly different fractions of it, and the
 * fraction changes again with the face. The only reliable answer is to draw the
 * glyph and look at the pixels, which is what this does.
 *
 * ## How
 *
 * Draw once at the nominal em, measure the ink, then solve for the size and
 * origin that land it where it should be. `fillText` with `textAlign: center`
 * and `textBaseline: middle` scales linearly about its origin, so a point at
 * offset *d* from the origin moves to *k · d* when the size is multiplied by
 * *k* — which makes the corrected origin exact rather than iterative.
 *
 * Hinting means the second draw is not a perfect scaling of the first at small
 * sizes, so the caller may verify and this may be run again; one pass is within
 * a pixel at every size the app uses.
 */
export function fitGlyph(
  ctx: Canvas2DLike,
  spec: GlyphSpec,
  boxSize: number,
): GlyphLayout {
  const probe = glyphLayout(boxSize, spec.glyphScale);
  paint(ctx, spec, probe, boxSize);
  const { data } = ctx.getImageData(0, 0, boxSize, boxSize);
  const ink = boundsOf(data, boxSize);
  // A face with no glyph for this character draws nothing. Leave the probe
  // layout alone and let the evaluator's own empty-reference guard report it,
  // rather than dividing by zero here.
  if (!ink) return probe;

  const inkWidth = ink.maxX - ink.minX + 1;
  const inkHeight = ink.maxY - ink.minY + 1;
  const longest = Math.max(inkWidth, inkHeight);

  // The target extent is what the fit is for; the cap is what stops a compact
  // letter's strokes outgrowing the pen. See `MAX_FIT_SCALE`.
  const scale = Math.min((GLYPH_INK_EXTENT * boxSize) / longest, MAX_FIT_SCALE);

  const inkCenterX = (ink.minX + ink.maxX + 1) / 2;
  const inkCenterY = (ink.minY + ink.maxY + 1) / 2;
  const center = boxSize / 2;

  return {
    fontSize: probe.fontSize * scale,
    centerX: center - scale * (inkCenterX - probe.centerX),
    centerY: center - scale * (inkCenterY - probe.centerY),
  };
}

/** One `fillText` at a given layout. */
function paint(
  ctx: Canvas2DLike,
  spec: GlyphSpec,
  layout: GlyphLayout,
  boxSize: number,
): void {
  ctx.clearRect(0, 0, boxSize, boxSize);
  ctx.font = `${spec.fontWeight ?? 400} ${layout.fontSize}px ${spec.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.character, layout.centerX, layout.centerY);
}

/**
 * Turns a character into an ink mask.
 *
 * Abstracted because the glyph is the one part of evaluation that needs a
 * platform: the browser has canvas, React Native will need Skia, and a server
 * would need a font rasteriser. Swapping this out — or replacing the whole
 * evaluator with OCR — should not touch the learning flow.
 */
export interface GlyphRasterizer {
  rasterize(spec: GlyphSpec, resolution: number): Promise<Mask>;
}

/** Minimal surface of a 2-D context this module needs, so tests can fake it. */
export interface Canvas2DLike {
  canvas: { width: number; height: number };
  font: string;
  textAlign: string;
  textBaseline: string;
  fillStyle: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
}

/**
 * Draws the reference glyph into a 2-D context, fitted to the box.
 *
 * The one function both the visible guide and the invisible evaluation mask go
 * through, which is what guarantees a learner is graded against exactly the
 * shape they traced. It leaves the fitted glyph on the context: the probe pass
 * inside `fitGlyph` is cleared before the real one is drawn.
 */
export function drawGlyph(ctx: Canvas2DLike, spec: GlyphSpec, boxSize: number): void {
  paint(ctx, spec, fitGlyph(ctx, spec, boxSize), boxSize);
}
