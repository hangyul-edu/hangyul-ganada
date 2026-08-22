import { pathFactory } from './glyphSpec';
import {
  drawGlyph,
  glyphLayout,
  maskFromAlpha,
  type Canvas2DLike,
  type GlyphRasterizer,
  type GlyphSpec,
  type Mask,
} from '@hangyul-ganada/handwriting-core';

/**
 * Turns a character into an evaluation mask using a browser canvas.
 *
 * This lives in the web app rather than in `handwriting-core` on purpose: the
 * core package is platform-independent — its tsconfig has no DOM lib, which is
 * what makes that guarantee real rather than aspirational — and the glyph
 * rasteriser is the single piece of evaluation that genuinely needs a platform.
 * React Native will supply a Skia-backed implementation of the same interface.
 */
export class CanvasGlyphRasterizer implements GlyphRasterizer {
  private readonly cache = new Map<string, Mask>();

  async rasterize(spec: GlyphSpec, resolution: number): Promise<Mask> {
    const key = [
      spec.character,
      spec.fontFamily,
      spec.fontWeight ?? 400,
      spec.glyphScale ?? '',
      resolution,
    ].join('|');

    const hit = this.cache.get(key);
    if (hit) return hit;

    const { fontSize } = glyphLayout(resolution, spec.glyphScale);
    await ensureFontLoaded(
      `${spec.fontWeight ?? 400} ${fontSize}px ${spec.fontFamily}`,
      spec.character,
    );

    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2-D canvas context unavailable');

    ctx.clearRect(0, 0, resolution, resolution);
    ctx.fillStyle = '#000000';
    drawGlyph(ctx as unknown as Canvas2DLike, spec, resolution, pathFactory);

    const { data } = ctx.getImageData(0, 0, resolution, resolution);
    const mask = maskFromAlpha(data, resolution, resolution);
    this.cache.set(key, mask);
    return mask;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Waits for the practice face before the glyph is drawn. Rendering the
 * reference in a fallback would silently grade the learner against the wrong
 * shape, which is worse than a short delay.
 */
async function ensureFontLoaded(font: string, text: string): Promise<void> {
  const fonts = document.fonts;
  if (!fonts) return;
  try {
    await fonts.load(font, text);
    await fonts.ready;
  } catch {
    // A rejected load still leaves a usable fallback; better to grade against
    // it than to block the learner entirely.
  }
}
