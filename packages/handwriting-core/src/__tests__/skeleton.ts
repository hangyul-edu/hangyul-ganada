import { createMask } from '../mask.js';
import type { Mask, Point } from '../types.js';

/**
 * The line a learner draws when they trace a printed letter.
 *
 * ## Why the corpus needs this
 *
 * A genuine attempt has to come from somewhere that is *not* the reference, or
 * the measurement is circular — perturb the reference mask, feed it back, and
 * you have measured your own perturbation. The first version used the app's
 * authored stroke paths, which are honest but are a teaching diagram: they get
 * the order and topology of every letter right and the proportions of no
 * typeface in particular, so they disagreed with the font on ㅅ's splay and on
 * where the two halves of ㅘ sit. That disagreement is real and worth knowing
 * about, but it is a fact about a diagram, not about the grader.
 *
 * What a person actually does is put their pen down the middle of the printed
 * stroke and follow it. That line is the glyph's *skeleton*, and this module
 * computes it — so a genuine attempt is derived from the same face the learner
 * is looking at, in the same way for every face, and still differs from the
 * reference in exactly the way a real attempt does: a thin line where the font
 * has a thick stroke.
 *
 * ## The algorithm
 *
 * Zhang–Suen thinning: repeatedly delete boundary pixels that are not needed to
 * keep the shape connected, until nothing more can go. It is the standard
 * choice, it preserves topology — a ㅇ stays a closed ring, a ㅂ keeps both of
 * its holes — and it is about forty lines. The result is walked into ordered
 * polylines, because the perturbations that matter (stopping short of the end,
 * overshooting a corner) need to know which end is which.
 */

/** Zhang–Suen thinning. Returns a new mask one pixel wide everywhere. */
export function thin(mask: Mask): Mask {
  const out = createMask(mask.width, mask.height);
  out.data.set(mask.data);
  const { width: w, height: h } = out;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : out.data[y * w + x]!);

  let changed = true;
  let guard = 0;
  while (changed && guard < 200) {
    changed = false;
    guard += 1;
    for (const step of [0, 1]) {
      const doomed: number[] = [];
      for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
          if (!at(x, y)) continue;
          // The eight neighbours, clockwise from north.
          const p = [
            at(x, y - 1),
            at(x + 1, y - 1),
            at(x + 1, y),
            at(x + 1, y + 1),
            at(x, y + 1),
            at(x - 1, y + 1),
            at(x - 1, y),
            at(x - 1, y - 1),
          ];
          const filled = p.reduce((a, b) => a + b, 0);
          if (filled < 2 || filled > 6) continue;
          // Transitions from 0 to 1 going round the ring. Exactly one means the
          // pixel is on a simple boundary and can go without breaking anything.
          let transitions = 0;
          for (let i = 0; i < 8; i += 1) {
            if (p[i] === 0 && p[(i + 1) % 8] === 1) transitions += 1;
          }
          if (transitions !== 1) continue;
          const [n, ne, e, se, s, sw, west, nw] = p as [
            number, number, number, number, number, number, number, number,
          ];
          void ne;
          void sw;
          void nw;
          if (step === 0) {
            if (n * e * s !== 0) continue;
            if (e * s * west !== 0) continue;
          } else {
            if (n * e * west !== 0) continue;
            if (n * s * west !== 0) continue;
          }
          void se;
          doomed.push(y * w + x);
        }
      }
      if (doomed.length) {
        changed = true;
        for (const index of doomed) out.data[index] = 0;
      }
    }
  }
  return out;
}

const NEIGHBOURS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Walks a thinned mask into ordered polylines, normalised to 0..1.
 *
 * One polyline per connected run of skeleton, started from an endpoint where
 * there is one — a stroke traced from its tip reads as a stroke, and one
 * started in the middle would have a perturbation eat into it from the wrong
 * side. Rings (ㅇ) have no endpoint, so they start anywhere and come back.
 *
 * `minLength` drops the stubs thinning leaves at junctions: a three-pixel spur
 * off the corner of ㄱ is an artefact of the algorithm, not part of the letter,
 * and treating it as a stroke would make every attempt look like it had an
 * extra one.
 */
export function skeletonPaths(mask: Mask, minLength = 6): Point[][] {
  const thinned = thin(mask);
  const { width: w, height: h, data } = thinned;
  const visited = new Uint8Array(w * h);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[y * w + x]!);
  const degree = (x: number, y: number) =>
    NEIGHBOURS.reduce((count, [dx, dy]) => count + at(x + dx, y + dy), 0);

  const paths: Point[][] = [];

  const walkFrom = (startX: number, startY: number) => {
    const path: Point[] = [];
    let x = startX;
    let y = startY;
    for (;;) {
      visited[y * w + x] = 1;
      path.push({ x: (x + 0.5) / w, y: (y + 0.5) / h });
      let next: [number, number] | null = null;
      // Straight neighbours before diagonal ones, so a path prefers the
      // orthogonal step and does not cut corners it should follow.
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!at(nx, ny) || visited[ny * w + nx]) continue;
        next = [nx, ny];
        break;
      }
      if (!next) break;
      [x, y] = next;
    }
    if (path.length >= minLength) paths.push(path);
  };

  // Endpoints first: every path that has a tip is started from it.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!at(x, y) || visited[y * w + x]) continue;
      if (degree(x, y) === 1) walkFrom(x, y);
    }
  }
  // Then anything left, which is rings and whatever a junction split off.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!at(x, y) || visited[y * w + x]) continue;
      walkFrom(x, y);
    }
  }
  return paths;
}
