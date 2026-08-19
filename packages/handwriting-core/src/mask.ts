import type { Mask } from './types.js';

export function createMask(width: number, height = width): Mask {
  return { width, height, data: new Uint8Array(width * height) };
}

export function countInk(mask: Mask): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i += 1) if (mask.data[i]) n += 1;
  return n;
}

/**
 * Squared Euclidean distance transform (Felzenszwalb & Huttenlocher, 2012).
 * Returns, for every cell, the squared distance to the nearest ink pixel.
 * Exact and O(n) — a chamfer approximation distorts the tolerance band into a
 * diamond, which visibly changes grading on diagonal strokes like ㅅ and ㅈ.
 */
export function squaredDistanceTransform(mask: Mask): Float64Array {
  const { width: w, height: h, data } = mask;
  const INF = 1e20;
  const grid = new Float64Array(w * h);
  for (let i = 0; i < grid.length; i += 1) grid[i] = data[i] ? 0 : INF;

  const maxDim = Math.max(w, h);
  const f = new Float64Array(maxDim);
  const d = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  /** 1-D transform of `f[0..n)` into `d[0..n)`. */
  const transform1d = (n: number): void => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q += 1) {
      let s = 0;
      // Walk back over parabolas this one now dominates.
      for (;;) {
        const vk = v[k]!;
        s = (f[q]! + q * q - (f[vk]! + vk * vk)) / (2 * q - 2 * vk);
        if (s > z[k]!) break;
        k -= 1;
      }
      k += 1;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q += 1) {
      while (z[k + 1]! < q) k += 1;
      const vk = v[k]!;
      d[q] = (q - vk) * (q - vk) + f[vk]!;
    }
  };

  // Columns, then rows.
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) f[y] = grid[y * w + x]!;
    transform1d(h);
    for (let y = 0; y < h; y += 1) grid[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) f[x] = grid[row + x]!;
    transform1d(w);
    for (let x = 0; x < w; x += 1) grid[row + x] = d[x]!;
  }

  return grid;
}

/**
 * Grows `mask` by `radiusPx` in every direction — the tolerance band. Uses the
 * exact distance transform, so the band is a true disc around every ink pixel.
 */
export function dilate(mask: Mask, radiusPx: number): Mask {
  const out = createMask(mask.width, mask.height);
  if (radiusPx <= 0) {
    out.data.set(mask.data);
    return out;
  }
  const dist = squaredDistanceTransform(mask);
  const r2 = radiusPx * radiusPx;
  for (let i = 0; i < dist.length; i += 1) out.data[i] = dist[i]! <= r2 ? 1 : 0;
  return out;
}

/** Ink present in `a` but not in `b`. */
export function countDifference(a: Mask, b: Mask): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 1) if (a.data[i] && !b.data[i]) n += 1;
  return n;
}

/**
 * Size, in pixels, of the largest 8-connected blob of ink in `mask`.
 *
 * Applied to the *unwritten* part of a reference glyph, this separates "a whole
 * stroke is missing" — one big blob — from "the pen was a little thin all over"
 * — many tiny ones. The two have similar total area but are completely
 * different mistakes.
 */
/**
 * Shrinks a mask inwards by `radiusPx`, dropping anything thinner than that.
 *
 * The complement of `dilate`, and used for one specific job: telling a stray
 * *stroke* apart from a rim of overhang. A character written slightly small and
 * slightly off leaves ink outside the reference along the edge of every stroke,
 * a couple of pixels wide; an added stroke is as thick as the learner's pen.
 * Eroding by half a pen width erases the first and leaves the second, which no
 * measure of area or position can do.
 */
export function erode(mask: Mask, radiusPx: number): Mask {
  if (radiusPx <= 0) return mask;
  const inverted = createMask(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i += 1) inverted.data[i] = mask.data[i] ? 0 : 1;
  const distances = squaredDistanceTransform(inverted);
  const out = createMask(mask.width, mask.height);
  const limit = radiusPx * radiusPx;
  for (let i = 0; i < out.data.length; i += 1) {
    // Distance here is to the nearest *empty* pixel, so ink survives only where
    // there is at least `radiusPx` of ink in every direction.
    if (mask.data[i] && distances[i]! > limit) out.data[i] = 1;
  }
  return out;
}

/**
 * The size of the largest connected piece of `mask` that is at least
 * `minRadiusPx` thick somewhere.
 *
 * Size is measured on the piece itself, not on what survives the thickness
 * test — the question is "how much ink is in this stroke", and eroding first
 * and counting after would answer "how much ink is in the middle of it", which
 * shrinks with the pen and would make the measure depend on how thin the
 * learner writes.
 *
 * Thin pieces are skipped entirely. That is the point: it separates a stray
 * *stroke* from the rim of overhang a slightly displaced character leaves along
 * the edge of every stroke it does have.
 */
export function largestThickComponentSize(mask: Mask, minRadiusPx: number): number {
  const thick = minRadiusPx > 0 ? erode(mask, minRadiusPx) : mask;
  const { width: w, height: h, data } = mask;
  const seen = new Uint8Array(data.length);
  const stack: number[] = [];
  let best = 0;

  for (let start = 0; start < data.length; start += 1) {
    if (!data[start] || seen[start]) continue;
    let size = 0;
    let isThick = false;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      size += 1;
      if (thick.data[i]) isThick = true;
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const n = ny * w + nx;
          if (!data[n] || seen[n]) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (isThick && size > best) best = size;
  }
  return best;
}

export function largestComponentSize(mask: Mask): number {
  const { width: w, height: h, data } = mask;
  const seen = new Uint8Array(data.length);
  const stack: number[] = [];
  let best = 0;

  for (let start = 0; start < data.length; start += 1) {
    if (!data[start] || seen[start]) continue;
    let size = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      size += 1;
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const n = ny * w + nx;
          if (!data[n] || seen[n]) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (size > best) best = size;
  }
  return best;
}

/** Tight ink bounds, or `null` when the mask is empty. */
export function inkBounds(
  mask: Mask,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const { width: w, height: h, data } = mask;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      if (!data[row + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/**
 * Builds a mask from an RGBA buffer by thresholding alpha. This is how a glyph
 * rendered to a canvas becomes comparable ink.
 */
export function maskFromAlpha(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  alphaThreshold = 128,
): Mask {
  const mask = createMask(width, height);
  for (let i = 0, p = 3; i < mask.data.length; i += 1, p += 4) {
    mask.data[i] = (rgba[p] ?? 0) >= alphaThreshold ? 1 : 0;
  }
  return mask;
}
