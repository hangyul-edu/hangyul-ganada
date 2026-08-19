/**
 * Loads the real glyph masks in `glyph-fixtures.json` — one set per practice
 * typeface the app bundles — and provides mask perturbations for building
 * synthetic learner attempts.
 *
 * Regenerate the fixtures with `python3 scripts/render-fixtures.py`.
 */
import { createMask, dilate, squaredDistanceTransform } from '../mask.js';
import type { Mask } from '../types.js';
import fixtures from './glyph-fixtures.json' with { type: 'json' };

export const FIXTURE_RESOLUTION = fixtures.resolution;

/**
 * The face the evaluator's default thresholds were calibrated against.
 *
 * Tests that are about the *algorithm* rather than about typefaces use this one
 * and say nothing about fonts, which is how they read before there was more
 * than one.
 */
export const BASELINE_FONT = fixtures.baseline;

/** Every bundled practice face, by the id the app knows it as. */
export const FIXTURE_FONTS = Object.keys(fixtures.fonts);

type FontKey = keyof typeof fixtures.fonts;

/**
 * Decodes the run-length encoded fixture for `character` in `fontId`.
 *
 * Defaults to the baseline face, so the existing calibration tests read exactly
 * as they did when there was only one.
 */
export function glyphMask(character: string, fontId: string = BASELINE_FONT): Mask {
  const font = fixtures.fonts[fontId as FontKey];
  if (!font) throw new Error(`no fixtures for font ${fontId} — add it to render-fixtures.py`);
  const entry = (font.glyphs as Record<string, { ink: number; rle: number[] }>)[character];
  if (!entry) {
    throw new Error(`no fixture for ${character} in ${fontId} — add it to render-fixtures.py`);
  }
  const size = fixtures.resolution;
  const mask = createMask(size);
  let i = 0;
  let value = 0;
  for (const run of entry.rle) {
    if (value) mask.data.fill(1, i, i + run);
    i += run;
    value = 1 - value;
  }
  return mask;
}

/** Translates ink by whole pixels; ink pushed off the edge is lost. */
export function shiftMask(mask: Mask, dx: number, dy: number): Mask {
  const out = createMask(mask.width, mask.height);
  for (let y = 0; y < mask.height; y += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= mask.height) continue;
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.data[y * mask.width + x]) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= mask.width) continue;
      out.data[ny * mask.width + nx] = 1;
    }
  }
  return out;
}

/** Scales ink about the box centre by nearest-neighbour sampling. */
export function scaleMask(mask: Mask, factor: number): Mask {
  const out = createMask(mask.width, mask.height);
  const cx = mask.width / 2;
  const cy = mask.height / 2;
  for (let y = 0; y < mask.height; y += 1) {
    const sy = Math.round(cy + (y - cy) / factor);
    if (sy < 0 || sy >= mask.height) continue;
    for (let x = 0; x < mask.width; x += 1) {
      const sx = Math.round(cx + (x - cx) / factor);
      if (sx < 0 || sx >= mask.width) continue;
      out.data[y * mask.width + x] = mask.data[sy * mask.width + sx]!;
    }
  }
  return out;
}

export interface Rect {
  /** All in 0..1 of the box. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Removes ink inside `rect` — simulates a stroke or jamo the learner skipped. */
export function eraseRegion(mask: Mask, rect: Rect): Mask {
  const out = createMask(mask.width, mask.height);
  out.data.set(mask.data);
  const x0 = Math.floor(rect.x0 * mask.width);
  const x1 = Math.ceil(rect.x1 * mask.width);
  const y0 = Math.floor(rect.y0 * mask.height);
  const y1 = Math.ceil(rect.y1 * mask.height);
  for (let y = Math.max(0, y0); y < Math.min(mask.height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(mask.width, x1); x += 1) {
      out.data[y * mask.width + x] = 0;
    }
  }
  return out;
}

/** Thins or thickens ink, standing in for a lighter or heavier pen. */
export function erodeOrDilateMask(mask: Mask, radius: number): Mask {
  const out = createMask(mask.width, mask.height);
  const r2 = radius * radius;
  const want = radius >= 0 ? 1 : 0;
  const r = Math.ceil(Math.abs(radius));
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const self = mask.data[y * mask.width + x]!;
      let hit = false;
      for (let dy = -r; dy <= r && !hit; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (dx * dx + dy * dy > r2) continue;
          const ny = y + dy;
          const nx = x + dx;
          const v =
            ny < 0 || ny >= mask.height || nx < 0 || nx >= mask.width
              ? 0
              : mask.data[ny * mask.width + nx]!;
          if (v === want) {
            hit = true;
            break;
          }
        }
      }
      out.data[y * mask.width + x] = radius >= 0 ? (hit ? 1 : self) : hit ? 0 : self;
    }
  }
  return out;
}

/**
 * The same shapes, written with the learner's pen instead of the font's.
 *
 * This is the perturbation that matters once the app offers more than one
 * typeface. A learner's pen has one width — 0.062 of the box, whatever face is
 * selected — while the reference glyph's stroke width is whatever the designer
 * chose: Jua draws at roughly twice the pen and Nanum Pen Script at about half
 * it. Grading "did you cover the reference ink" without accounting for that
 * measures the *typeface's weight*, not the learner's writing.
 *
 * The glyph is reduced to its ridge — the local maxima of the distance to the
 * background, which is a serviceable medial axis for shapes this simple — and
 * re-inked at the pen's radius. What survives is the skeleton the learner
 * actually traces; what is discarded is stroke weight and the decorative
 * thick-to-thin modulation that goes with it.
 */
export function rewriteWithPen(mask: Mask, penRadiusPx: number): Mask {
  const { width, height, data } = mask;

  // Distance to the nearest *background* pixel: the transform measures distance
  // to ink, so it is run over the inverse.
  const inverse = createMask(width, height);
  for (let i = 0; i < data.length; i += 1) inverse.data[i] = data[i] ? 0 : 1;
  const depth = squaredDistanceTransform(inverse);

  const ridge = createMask(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!data[i]) continue;
      const here = depth[i]!;
      let peak = true;
      for (let dy = -1; dy <= 1 && peak; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
          if (depth[ny * width + nx]! > here) {
            peak = false;
            break;
          }
        }
      }
      if (peak) ridge.data[i] = 1;
    }
  }

  return dilate(ridge, penRadiusPx);
}
