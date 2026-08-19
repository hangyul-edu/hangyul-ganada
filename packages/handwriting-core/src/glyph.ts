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
 */
export const DEFAULT_GLYPH_SCALE = 0.78;

/**
 * Shared by the on-screen reference glyph and the evaluation mask, so the two
 * can never drift apart. If they did, learners would be graded against a glyph
 * in a different position from the one they traced.
 */
export function glyphLayout(boxSize: number, glyphScale = DEFAULT_GLYPH_SCALE): GlyphLayout {
  return {
    fontSize: boxSize * glyphScale,
    centerX: boxSize / 2,
    centerY: boxSize / 2,
  };
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

/** Draws the reference glyph into a 2-D context at the shared layout. */
export function drawGlyph(ctx: Canvas2DLike, spec: GlyphSpec, boxSize: number): void {
  const { fontSize, centerX, centerY } = glyphLayout(boxSize, spec.glyphScale);
  ctx.font = `${spec.fontWeight ?? 400} ${fontSize}px ${spec.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.character, centerX, centerY);
}
