#!/usr/bin/env node
/**
 * Builds one validated stroke asset for every item the curriculum teaches.
 *
 *   npm run strokes:build            rewrite the asset file
 *   npm run strokes:build -- --check fail if it is out of date
 *
 * ## Why this exists
 *
 * The demonstration used to compose each syllable at runtime: take the jamo,
 * put them in layout slots, transform their polylines, draw. It was rebuilt six
 * times and broke somewhere new each time — a chamfered ㅂ, a polygonal ㅇ, a ㄱ
 * leaning the wrong way, a 글 whose ㄹ collapsed into overlapping lines. The
 * method has one irreducible flaw: it *invents* the finished shape, so it can
 * always invent a wrong one, and the only way to find out is to look at it.
 *
 * The curriculum is 73 items. That is small enough to stop inventing.
 *
 * ## What an asset is
 *
 * Each stroke is a filled outline cut from the *reference glyph itself*, so
 *
 *     union(stroke shapes) === the reference glyph
 *
 * by construction rather than by resemblance. There is no second geometry that
 * could disagree with the first, because there is no second geometry: the big
 * glyph on the lesson screen, the grey guide, the growing ink and the finished
 * frame are all these same paths.
 *
 * ## How the glyph is cut up
 *
 * The polylines in `data/strokes.ts` still decide *which* ink belongs to which
 * stroke and in what order — that is what they are good at, and it is a
 * different job from deciding what the letter looks like. Each is rasterised
 * onto the glyph and grown outwards by a distance transform; a stroke claims the
 * ink within reach of its centreline. The reaches overlap exactly where two
 * strokes genuinely meet, which is what stops a junction showing a seam. Ink no
 * reach touched goes to whichever stroke is nearest, so every pixel is claimed
 * and the union is the whole glyph.
 *
 * Each claimed region is then traced back to a contour and simplified, giving a
 * clean filled path per stroke.
 *
 * ## Why the cut is made three times
 *
 * Both halves of "within reach of its centreline" start out wrong, and they
 * make each other worse. The centreline is *placed* by mapping a polyline onto
 * the letter's ink box in proportion, which finds the right ink and does not
 * divide it — Pretendard's ㅏ puts its crossbar at 46 and the proportional
 * placement lands nearer 50. And the reach was one number for the whole letter,
 * `weight * 0.62`, which is wider than some strokes: a stroke reached past its
 * own edge, took ink from the block beside it, and the centreline re-read from
 * that ink drifted towards it, letting the next pass reach further still.
 *
 * The visible result was a spike on every T-junction in the curriculum. ㅏ's
 * stem grew a triangular wedge out of its right-hand side and wore it through
 * the whole of stroke one — a piece of the crossbar, on the paper, before the
 * crossbar had been written. ㅂ, ㅁ, ㄹ, ㅐ, ㅓ and every syllable containing
 * them had the same thing at a different angle.
 *
 * So each pass re-reads both: where the stroke is, and how wide it is. The
 * width is measured across the ink no other stroke wants, so a junction cannot
 * inflate it, and it becomes the next pass's reach. Three passes is where every
 * item in the set stops changing.
 *
 * ## And why a stroke may only bleed backwards
 *
 * Regions are traced and simplified independently, so two neighbours can each
 * pull back from their shared boundary and leave a hairline of paper between
 * them — a white slash across the corner of every ㅂ. Growing each region by a
 * couple of pixels closes it. Growing it in *every* direction reopens the spike
 * problem from the other end, so the growth is directional: a stroke may bleed
 * into ink an **earlier** stroke owns, where it is hidden under ink already on
 * the paper, and never into a later one's.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { isSyllable, medialForm, toJamo } from '../apps/web/src/data/jamo.ts';
import { STROKE_ORDER } from '../apps/web/src/data/strokes.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'apps/web/src/data/generated/strokeAssets.json');
const CHECK = process.argv.includes('--check');

/**
 * The face every asset is cut from.
 *
 * One face, deliberately. A learner may practise in any of the six the app
 * offers, but a stroke-order lesson teaches one shape, and the shape it teaches
 * is the one the interface itself is set in.
 */
const FACE = "'Pretendard Variable', Pretendard, sans-serif";
const PORT = 4477;

/** The glyph fills this much of the 0–100 viewBox; the rest is margin. */
const INK_SPAN = 76;

/**
 * Each item, broken into the letters the block is made of.
 *
 * The cut happens one letter at a time, not one syllable at a time. Fitting a
 * whole composed syllable's polylines onto the glyph was the first thing tried
 * and it failed the same way the runtime composer fails: the composer's idea of
 * where ㅏ sits inside 가 is not the font's idea, so every centreline landed
 * beside its own ink and the bands grabbed their neighbours' pixels. A letter's
 * *own* shape, though, does match the font's — a ㄹ is a ㄹ — so each letter is
 * fitted to the ink the font actually gave it, and only that ink.
 */
/**
 * The letters a compound is made of.
 *
 * A syllable decomposes with `toJamo`, but ㅘ and ㅃ are single characters that
 * are nonetheless two letters written side by side, and cutting them as one
 * shape failed the same way syllables did: ㅘ's ㅗ came out as a jagged wedge
 * with a detached speck under it, because the ㅘ polyline's idea of where its ㅗ
 * sits is not Pretendard's. Every compound here divides left from right, which
 * is how Hangul builds all of them.
 */
const COMPOUND_LETTERS = {
  ㅐ: ['ㅏ', 'ㅣ'], ㅒ: ['ㅑ', 'ㅣ'], ㅔ: ['ㅓ', 'ㅣ'], ㅖ: ['ㅕ', 'ㅣ'],
  ㅘ: ['ㅗ', 'ㅏ'], ㅙ: ['ㅗ', 'ㅐ'], ㅚ: ['ㅗ', 'ㅣ'],
  ㅝ: ['ㅜ', 'ㅓ'], ㅞ: ['ㅜ', 'ㅔ'], ㅟ: ['ㅜ', 'ㅣ'], ㅢ: ['ㅡ', 'ㅣ'],
  ㄲ: ['ㄱ', 'ㄱ'], ㄸ: ['ㄷ', 'ㄷ'], ㅃ: ['ㅂ', 'ㅂ'], ㅆ: ['ㅅ', 'ㅅ'], ㅉ: ['ㅈ', 'ㅈ'],
};

const items = ALL_CHARACTERS.map((character) => {
  const letters = isSyllable(character.character)
    ? toJamo(character.character)
    : (COMPOUND_LETTERS[character.character] ?? [character.character]);
  const units = letters.map((letter) => ({
    letter,
    strokes: (STROKE_ORDER[letter] ?? []).map((stroke) => stroke.points.map((p) => [p.x, p.y])),
  }));
  const counted = units.reduce((n, unit) => n + unit.strokes.length, 0);
  if (counted !== character.strokes.length) {
    throw new Error(
      `${character.character}: ${counted} strokes from its letters, ${character.strokes.length} on the character`,
    );
  }
  return {
    character: character.character,
    group: character.group,
    // A syllable stacks or sits side by side depending on its vowel; every
    // compound letter is side by side.
    form: isSyllable(character.character) ? medialForm(letters[1]) ?? 'vertical' : 'vertical',
    closed: letters.length > 2,
    units,
  };
});

/**
 * Everything below runs inside the page, once per item.
 *
 * Per item rather than all at once: the first version did the lot in one
 * `evaluate` and crashed the tab with nothing to say about where. One call per
 * character costs a few seconds in round trips and buys a name for any failure.
 */
const cut = async ({ face, item, inkSpan }) => {
  /*
   * Refuse to measure a face the browser has not got yet.
   *
   * `document.fonts.ready` resolves when nothing is *pending*, which on a cold
   * page can be before the face has been requested at all — and a canvas asked
   * to draw in a face it does not have will quietly draw in a fallback instead.
   * That is the worst possible failure here, because it does not look like a
   * failure: it produces a complete, plausible, wrong set of assets, cut from
   * whichever sans-serif the system happened to substitute. One build did
   * exactly that, and the only reason it was noticed is that the shapes moved
   * between two runs of the same script.
   *
   * So the face is checked, waited for, and checked again, and if it is still
   * not there the build stops rather than guessing.
   */
  const wanted = `400 400px ${face}`;
  if (!document.fonts.check(wanted)) {
    await document.fonts.load(wanted);
    await document.fonts.ready;
  }
  if (!document.fonts.check(wanted)) {
    return { error: `the reference face is not loaded — refusing to measure a fallback` };
  }

  /** Rendered big, so the traced contour stays smooth when scaled down. */
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const draw = (text) => {
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#000';
    ctx.font = `400 ${Math.round(S * 0.62)}px ${face}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, S / 2, S / 2);
    return ctx.getImageData(0, 0, S, S).data;
  };

  // --- the glyph, and its ink box ------------------------------------------
  const pixels = draw(item.character);
  const ink = new Uint8Array(S * S);
  let X0 = S, Y0 = S, X1 = -1, Y1 = -1;
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      if (pixels[(y * S + x) * 4 + 3] <= 110) continue;
      ink[y * S + x] = 1;
      if (x < X0) X0 = x;
      if (x > X1) X1 = x;
      if (y < Y0) Y0 = y;
      if (y > Y1) Y1 = y;
    }
  }
  if (X1 < 0) return { error: 'glyph rendered no ink' };
  const W = X1 - X0 + 1;
  const H = Y1 - Y0 + 1;

  /** The face's own stroke weight, from ㅡ drawn at the same size. */
  const bar = draw('ㅡ');
  let bt = S, bb = -1;
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      if (bar[(y * S + x) * 4 + 3] <= 110) continue;
      if (y < bt) bt = y;
      if (y > bb) bb = y;
    }
  }
  const weight = Math.max(4, bb - bt + 1);

  // --- which ink belongs to which letter -----------------------------------
  /*
   * Three ways of telling the letters of a block apart, tried in order, each one
   * used only where the one before it is demonstrably not trustworthy.
   *
   *   1. islands   — the letters are separate runs of ink, which in this face
   *                  they usually are. Nothing is assumed about where they sit.
   *   2. floor     — a 받침 always spans the bottom of the block, so when
   *                  grouping leaves it holding a scrap the floor is cut by
   *                  position instead and the letters above are regrouped.
   *   3. cut       — two letters the font joins are separated at the thinnest
   *                  part of the join.
   *
   * Each fallback exists because a specific block broke without it, and each is
   * checked rather than trusted: what decides is whether the result looks like
   * the block a reader sees, not whether the method sounds right.
   */
  const N = W * H;
  const glyph = (x, y) => ink[(y + Y0) * S + (x + X0)];
  const unitOf = new Int8Array(N).fill(-1);
  const notes = [];
  const U = item.units.length;
  const across = item.form === 'horizontal' ? 1 : 0;

  /** Islands of ink above `limit`, 4-connected, with their centroids. */
  const islandsAbove = (limit) => {
    const label = new Int32Array(N).fill(-1);
    const list = [];
    const stack = [];
    for (let y = 0; y < limit; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const seed = y * W + x;
        if (label[seed] !== -1 || !glyph(x, y)) continue;
        const id = list.length;
        let sx = 0;
        let sy = 0;
        let count = 0;
        label[seed] = id;
        stack.push(seed);
        while (stack.length) {
          const at = stack.pop();
          const ax = at % W;
          const ay = (at - ax) / W;
          sx += ax;
          sy += ay;
          count += 1;
          const around = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (const [dx, dy] of around) {
            const bx = ax + dx;
            const by = ay + dy;
            if (bx < 0 || by < 0 || bx >= W || by >= limit) continue;
            const next = by * W + bx;
            if (label[next] !== -1 || !glyph(bx, by)) continue;
            label[next] = id;
            stack.push(next);
          }
        }
        list.push({ id, cx: sx / count, cy: sy / count, count });
      }
    }
    // A stray antialiased speck is not a letter.
    return { label, list: list.filter((p) => p.count > (W * limit) / 900) };
  };

  /**
   * Groups islands onto the letters, and says whether to believe the result.
   *
   * The anchors are a structural prior and nothing more: they decide which
   * island belongs to which letter, never where any ink ends up. What comes back
   * is trusted only if every letter got ink and the letters came out in the
   * order the block puts them — and, for a 받침, only if it is as wide as a
   * letter written under a block actually is. That last check is what catches
   * 국, whose batchim ㄱ runs into the stem of the ㅜ above it and is left
   * holding its own short leg: a real letter, ink of its own, and completely
   * wrong.
   */
  const groupOnto = (limit, anchors, into) => {
    const { label, list } = islandsAbove(limit);
    const owner = new Map();
    const mass = anchors.map(() => null);
    for (const island of list) {
      const u = (island.cx + 0.5) / W;
      const v = (island.cy + 0.5) / limit;
      let best = 0;
      let nearest = Infinity;
      for (let a = 0; a < anchors.length; a += 1) {
        const d = (u - anchors[a][0]) ** 2 + (v - anchors[a][1]) ** 2;
        if (d < nearest) {
          nearest = d;
          best = a;
        }
      }
      owner.set(island.id, best);
      const held = mass[best];
      mass[best] = held
        ? [held[0] + u * island.count, held[1] + v * island.count, held[2] + island.count]
        : [u * island.count, v * island.count, island.count];
    }
    const centres = mass.map((m) => (m ? [m[0] / m[2], m[1] / m[2]] : null));
    if (centres.some((c) => c === null)) return false;
    if (centres[1][across] - centres[0][across] < 0.1) return false;
    if (anchors.length === 3) {
      let x0 = W;
      let x1 = -1;
      for (let i = 0; i < N; i += 1) {
        if (label[i] === -1 || owner.get(label[i]) !== 2) continue;
        const x = i % W;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
      if (x1 - x0 < W * 0.4) return false;
      if (Math.min(centres[0][1], centres[1][1]) > centres[2][1] - 0.12) return false;
    }
    for (let i = 0; i < N; i += 1) {
      if (label[i] === -1) continue;
      const u = owner.get(label[i]);
      if (u !== undefined) unitOf[i] = into[u];
    }
    return true;
  };

  /**
   * The path the pen actually travels, taken from the ink rather than assumed.
   *
   * The polylines in `data/strokes.ts` know the *order and direction* of the
   * strokes, which is the thing they are authoritative about and the thing no
   * amount of looking at a glyph will tell you. What they do not know is the
   * route. Pretendard draws the ㄱ of 가 with a leg that sweeps a long way left;
   * the polyline's leg barely leans. Both describe the same stroke, but only one
   * of them lies along the ink, and the reveal has to sweep along the ink or it
   * uncovers the shape in the wrong order and leaves the far end of the leg
   * still hidden when the stroke is supposedly finished.
   *
   * So the polyline is used only as a *ruler*: every pixel of the stroke is
   * given the distance along the polyline of its nearest point, the pixels are
   * grouped into bands by that distance, and the centre of each band is a point
   * on the real path. Direction and order survive — they came from the ruler —
   * and the route is the font's.
   */
  const centreline = (mask, line) => {
    const runs = [];
    let total = 0;
    for (let i = 1; i < line.length; i += 1) {
      const [ax, ay] = line[i - 1];
      const [bx, by] = line[i];
      const length = Math.hypot(bx - ax, by - ay);
      if (length < 1e-6) continue;
      runs.push({ ax, ay, dx: bx - ax, dy: by - ay, length, from: total });
      total += length;
    }
    if (runs.length === 0 || total < 1e-6) return line;

    /*
     * Bands a little over a stroke-width apart.
     *
     * The path is a guide for a sweep, not an outline: it has to follow the ink,
     * not describe it. Sampling it finer than this made the shipped file a third
     * larger and the animation no better, and it let one noisy row of pixels put
     * a visible kink in an otherwise straight stroke.
     */
    const bands = Math.max(2, Math.min(12, Math.round(total / (weight * 1.25))));
    const sumX = new Float64Array(bands);
    const sumY = new Float64Array(bands);
    const count = new Float64Array(bands);

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (!mask[y * W + x]) continue;
        let nearest = Infinity;
        let along = 0;
        for (const run of runs) {
          let t = ((x - run.ax) * run.dx + (y - run.ay) * run.dy) / (run.length * run.length);
          t = Math.max(0, Math.min(1, t));
          const d = Math.hypot(x - (run.ax + t * run.dx), y - (run.ay + t * run.dy));
          if (d < nearest) {
            nearest = d;
            along = run.from + t * run.length;
          }
        }
        const band = Math.max(0, Math.min(bands - 1, Math.floor((along / total) * bands)));
        sumX[band] += x;
        sumY[band] += y;
        count[band] += 1;
      }
    }

    const path = [];
    for (let b = 0; b < bands; b += 1) {
      if (count[b] > 0) path.push([sumX[b] / count[b], sumY[b] / count[b]]);
    }
    return path.length >= 2 ? path : line;
  };

  /** Grows a mask by `times` pixels, eight-connected. */
  const dilate = (mask, times) => {
    let current = mask;
    for (let pass = 0; pass < times; pass += 1) {
      const next = new Uint8Array(N);
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const at = y * W + x;
          if (current[at]) {
            next[at] = 1;
            continue;
          }
          for (let dy = -1; dy <= 1 && !next[at]; dy += 1) {
            for (let dx = -1; dx <= 1 && !next[at]; dx += 1) {
              const bx = x + dx;
              const by = y + dy;
              if (bx < 0 || by < 0 || bx >= W || by >= H) continue;
              if (current[by * W + bx]) next[at] = 1;
            }
          }
        }
      }
      current = next;
    }
    return current;
  };

  /** Nothing the font did not draw. This is what keeps union(strokes) = glyph. */
  const clipToInk = (mask) => {
    const out = new Uint8Array(N);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const at = y * W + x;
        if (mask[at] && glyph(x, y)) out[at] = 1;
      }
    }
    return out;
  };

  /** How far every pixel is from a set of placed polylines. */
  const distanceField = (lines) => {
    const d = new Float32Array(N).fill(1e9);
    for (const line of lines) {
      for (let i = 1; i < line.length; i += 1) {
        const [ax, ay] = line[i - 1];
        const [bx, by] = line[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
        for (let t = 0; t <= steps; t += 1) {
          const x = Math.round(ax + ((bx - ax) * t) / steps);
          const y = Math.round(ay + ((by - ay) * t) / steps);
          if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = 0;
        }
      }
    }
    const A = 1;
    const B = Math.SQRT2;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const at = y * W + x;
        let v = d[at];
        if (y > 0) {
          if (x > 0) v = Math.min(v, d[at - W - 1] + B);
          v = Math.min(v, d[at - W] + A);
          if (x + 1 < W) v = Math.min(v, d[at - W + 1] + B);
        }
        if (x > 0) v = Math.min(v, d[at - 1] + A);
        d[at] = v;
      }
    }
    for (let y = H - 1; y >= 0; y -= 1) {
      for (let x = W - 1; x >= 0; x -= 1) {
        const at = y * W + x;
        let v = d[at];
        if (y + 1 < H) {
          if (x + 1 < W) v = Math.min(v, d[at + W + 1] + B);
          v = Math.min(v, d[at + W] + A);
          if (x > 0) v = Math.min(v, d[at + W - 1] + B);
        }
        if (x + 1 < W) v = Math.min(v, d[at + 1] + A);
        d[at] = v;
      }
    }
    return d;
  };

  /** The box of the ink a predicate selects. */
  const boxOf = (inside) => {
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (!glyph(x, y) || !inside(x, y)) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : [x0, y0, x1, y1];
  };

  /**
   * A letter's polylines fitted to a box of ink.
   *
   * They are centrelines, so they map onto the box pulled in by half a stroke: a
   * polyline's edge point belongs half a pen inside the ink's edge, not on it.
   */
  const fitInto = (strokes, [bx0, by0, bx1, by1]) => {
    const all = strokes.flat();
    const px0 = Math.min(...all.map((q) => q[0]));
    const px1 = Math.max(...all.map((q) => q[0]));
    const py0 = Math.min(...all.map((q) => q[1]));
    const py1 = Math.max(...all.map((q) => q[1]));
    const spanX = px1 - px0;
    const spanY = py1 - py0;
    const bw = bx1 - bx0 + 1;
    const bh = by1 - by0 + 1;
    const runX = Math.max(0, bw - weight);
    const runY = Math.max(0, bh - weight);
    return strokes.map((stroke) =>
      stroke.map(([x, y]) => [
        spanX > 1e-6 ? bx0 + (bw - runX) / 2 + ((x - px0) / spanX) * runX : bx0 + bw / 2,
        spanY > 1e-6 ? by0 + (bh - runY) / 2 + ((y - py0) / spanY) * runY : by0 + bh / 2,
      ]),
    );
  };

  /** How much of a region's ink a letter, fitted to that region, accounts for. */
  const explains = (strokes, inside) => {
    const box = boxOf(inside);
    if (!box || strokes.length === 0) return 0;
    const field = distanceField(fitInto(strokes, box));
    let count = 0;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (!glyph(x, y) || !inside(x, y)) continue;
        if (field[y * W + x] <= weight * 0.7) count += 1;
      }
    }
    return count;
  };

  /**
   * Where to separate two letters the font has drawn as one run of ink.
   *
   * Quietness alone cannot answer this, and two versions of this file tried. The
   * thin part between 글's ㄱ and its ㅡ is the ㄱ's own descending leg, so the
   * boundary belongs at the *end* of it; the thin part between 어's ㅇ and its ㅓ
   * is the ㅓ's arm reaching back, so the boundary belongs at the *start*. No
   * rule about which end of a quiet run to take can be right for both, because
   * the answer is a fact about the two letters, not about the gap.
   *
   * So the letters are asked. Each candidate line is scored by how much of the
   * ink on either side of it the letter that should be there actually accounts
   * for — its own strokes, fitted to what that side would contain — and the line
   * that explains the most ink wins. A boundary that hands 어's arm to the ㅇ
   * loses, because the ㅇ has nothing shaped like an arm; one that cuts 글's leg
   * off its bar loses for the same reason.
   */
  const splitBetween = (axis, lo, hi, within, first, second) => {
    const step = Math.max(1, Math.round((hi - lo) / 44));
    let best = Math.round((lo + hi) / 2);
    let most = -1;
    for (let at = Math.round(lo + (hi - lo) * 0.1); at <= Math.round(lo + (hi - lo) * 0.9); at += step) {
      const before = (x, y) => within(x, y) && (axis === 'y' ? y : x) < at;
      const after = (x, y) => within(x, y) && (axis === 'y' ? y : x) >= at;
      const score = explains(first, before) + explains(second, after);
      if (score > most) {
        most = score;
        best = at;
      }
    }
    return best;
  };

  /**
   * The line to cut on: the end of the longest quiet run across a region.
   *
   * Between two letters there is usually a *band* of equally quiet lines rather
   * than one, and picking the wrong end of it is how both of the last two
   * versions of this went wrong. Taking the first line of the band handed 글's
   * ㄱ — whose leg descends alone for most of the block, so every row it crosses
   * ties for quietest — entirely to the ㅡ underneath. Taking the last line then
   * broke 국, where the ㅜ's stem above the 받침 and the 받침's own leg below it
   * tie at exactly the same count, so the cut fell *under* the batchim's bar and
   * left it holding a 25-pixel scrap.
   *
   * What separates those two cases is not which end but which run: the stem
   * above 국's batchim is 85 rows of quiet, its leg only 5. So the longest run of
   * quietest lines is found first, and the cut goes at the end of that.
   */
  const quietest = (axis, lo, hi, within) => {
    const from = Math.max(0, lo);
    const to = Math.min(axis === 'y' ? H - 1 : W - 1, hi);
    const counts = [];
    for (let at = from; at <= to; at += 1) {
      let count = 0;
      if (axis === 'y') {
        for (let x = 0; x < W; x += 1) if (glyph(x, at) && within(x, at)) count += 1;
      } else {
        for (let y = 0; y < H; y += 1) if (glyph(at, y) && within(at, y)) count += 1;
      }
      counts.push(count);
    }
    if (counts.length === 0) return to;
    /*
     * "As quiet as the quietest" has to allow a pixel or two of slack. A leg
     * that curves as it descends crosses a row in 21 pixels where it is upright
     * and 30 where it leans, so an exact-equality run fragments into pieces and
     * the longest of them is no longer the one that means anything. 글 came apart
     * exactly there.
     */
    const least = Math.min(...counts) + Math.max(1, Math.round(weight * 0.2));
    let best = to;
    let longest = 0;
    let at = 0;
    while (at < counts.length) {
      if (counts[at] > least) {
        at += 1;
        continue;
      }
      let end = at;
      while (end + 1 < counts.length && counts[end + 1] <= least) end += 1;
      if (end - at + 1 >= longest) {
        longest = end - at + 1;
        best = from + end;
      }
      at = end + 1;
    }
    return best;
  };

  /** How far the ink actually reaches, so a cut is never placed past it. */
  const reach = (axis, within) => {
    let lo = axis === 'y' ? H : W;
    let hi = -1;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (!glyph(x, y) || !within(x, y)) continue;
        const at = axis === 'y' ? y : x;
        if (at < lo) lo = at;
        if (at > hi) hi = at;
      }
    }
    return [lo, hi];
  };

  let how;
  if (U === 1) {
    how = 'whole';
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) if (glyph(x, y)) unitOf[y * W + x] = 0;
    }
  } else if (
    groupOnto(
      H,
      U === 3
        ? item.form === 'horizontal'
          ? [[0.5, 0.18], [0.5, 0.48], [0.5, 0.85]]
          : [[0.25, 0.3], [0.85, 0.3], [0.5, 0.85]]
        : item.form === 'horizontal'
          ? [[0.5, 0.28], [0.5, 0.78]]
          : [[0.22, 0.5], [0.85, 0.5]],
      [0, 1, 2],
    )
  ) {
    how = 'islands';
  } else {
    // Cut the floor off first when there is a 받침, then group what is above it.
    let foot = H;
    if (U === 3) {
      foot = quietest('y', Math.round(H * 0.42), Math.round(H * 0.88), () => true) + 1;
      for (let y = foot; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) if (glyph(x, y)) unitOf[y * W + x] = 2;
      }
    }
    const above = (x, y) => y < foot;
    const anchors = item.form === 'horizontal' ? [[0.5, 0.28], [0.5, 0.78]] : [[0.22, 0.5], [0.85, 0.5]];
    if (groupOnto(foot, anchors, [0, 1])) {
      how = U === 3 ? 'floor, islands' : 'islands';
    } else {
      how = U === 3 ? 'floor, fitted' : 'fitted';
      const axis = item.form === 'horizontal' ? 'y' : 'x';
      const [lo, hi] = reach(axis, above);
      const split = splitBetween(axis, lo, hi, above, item.units[0].strokes, item.units[1].strokes);
      for (let y = 0; y < foot; y += 1) {
        for (let x = 0; x < W; x += 1) {
          if (!glyph(x, y)) continue;
          unitOf[y * W + x] = (axis === 'y' ? y : x) < split ? 0 : 1;
        }
      }
    }
  }

  // --- each letter's own strokes, cut from its own ink ----------------------
  /*
   * Now the part that failed before works: a letter's polyline is fitted to the
   * ink the font drew for *that letter*, so the centreline lies along the ink
   * instead of beside it. Each stroke is grown outwards by a distance transform
   * and claims the ink within a band a little wider than the face's own stroke
   * weight. Two strokes claim the same pixels only where they genuinely cross,
   * which is what keeps a junction from showing a seam; ink no band reached goes
   * to whichever stroke is nearest, so every pixel the font drew is claimed.
   */
  const band = weight * 0.62;
  const owners = [];
  const placed = [];
  const boxes = [];

  for (let u = 0; u < U; u += 1) {
    let ux0 = W, uy0 = H, ux1 = -1, uy1 = -1;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (unitOf[y * W + x] !== u) continue;
        if (x < ux0) ux0 = x;
        if (x > ux1) ux1 = x;
        if (y < uy0) uy0 = y;
        if (y > uy1) uy1 = y;
      }
    }
    const strokes = item.units[u].strokes;
    if (ux1 < 0) {
      notes.push(`letter ${u + 1} (${item.units[u].letter}) got no ink`);
      for (const stroke of strokes) {
        owners.push(new Uint8Array(N));
        placed.push(stroke.map(() => [W / 2, H / 2]));
      }
      continue;
    }
    const uw = ux1 - ux0 + 1;
    const uh = uy1 - uy0 + 1;
    boxes.push({ letter: item.units[u].letter, box: [ux0, uy0, ux1, uy1], w: uw, h: uh });

    // The polylines are centrelines, so they map onto the letter's ink box
    // pulled in by half a stroke: a polyline's edge point belongs half a pen
    // inside the ink's edge, not on it.
    const all = strokes.flat();
    const px0 = Math.min(...all.map((p) => p[0]));
    const px1 = Math.max(...all.map((p) => p[0]));
    const py0 = Math.min(...all.map((p) => p[1]));
    const py1 = Math.max(...all.map((p) => p[1]));
    const spanX = px1 - px0;
    const spanY = py1 - py0;
    const runX = Math.max(0, uw - weight);
    const runY = Math.max(0, uh - weight);
    const place = ([x, y]) => [
      spanX > 1e-6 ? ux0 + (uw - runX) / 2 + ((x - px0) / spanX) * runX : ux0 + uw / 2,
      spanY > 1e-6 ? uy0 + (uh - runY) / 2 + ((y - py0) / spanY) * runY : uy0 + uh / 2,
    ];
    const here = strokes.map((stroke) => stroke.map(place));

    /**
     * Hands every pixel of this letter's ink to one or more of `lines`.
     *
     * Two answers come back, and the difference between them matters:
     *
     * * `full` — every pixel, so the union is the whole letter. Pixels no band
     *   reached are given to the nearest line, which is a Voronoi split and is
     *   the right *last resort* and a bad way to decide anything else.
     * * `core` — only the pixels a band actually reached. This is the ink that
     *   is genuinely under the stroke rather than merely closest to it, and it
     *   is what the centreline is re-read from below. Reading the centreline
     *   from `full` feeds the Voronoi leftovers back into it: a wedge of a
     *   neighbouring stroke drags the averaged centre sideways, the next pass
     *   claims a little more of the neighbour, and the error sustains itself.
     */
    const claim = (lines, reach) => {
      const fields = lines.map((stroke) => distanceField([stroke]));
      const full = fields.map(() => new Uint8Array(N));
      const core = fields.map(() => new Uint8Array(N));
      for (let i = 0; i < N; i += 1) {
        if (unitOf[i] !== u) continue;
        let claimed = false;
        let nearest = 0;
        let best = Infinity;
        for (let f = 0; f < fields.length; f += 1) {
          const d = fields[f][i];
          if (d <= reach[f]) {
            full[f][i] = 1;
            core[f][i] = 1;
            claimed = true;
          }
          if (d < best) {
            best = d;
            nearest = f;
          }
        }
        if (!claimed) full[nearest][i] = 1;
      }
      return { full, core, fields };
    };

    /**
     * How wide a stroke's own ink is, measured across the part of it nothing
     * else wants.
     *
     * Across a bar of half-width h the distances to the centreline are spread
     * evenly over 0…h, so twice the median is the width. The *maximum* is not:
     * `centreline` returns band centres, so the route stops short of both tips
     * and the pixels at the very end of a stroke are measured to the end of the
     * route rather than across it. Junction ink is left out for the same
     * reason — measuring across a junction reports the junction's width.
     */
    const widthOf = (fields, core, f) => {
      const distances = [];
      for (let i = 0; i < N; i += 1) {
        if (!core[f][i]) continue;
        if (core.some((other, g) => g !== f && other[i])) continue;
        distances.push(fields[f][i]);
      }
      if (distances.length === 0) return band;
      distances.sort((a, b) => a - b);
      return Math.max(2 * distances[Math.floor(distances.length / 2)], 2);
    };

    /*
     * Claim twice, with the centrelines re-read from the ink in between.
     *
     * This is what removes the spikes, and the reason they were there is worth
     * writing down because it is not where anyone looked. `place` maps a
     * polyline onto the *letter's* ink box by proportion. That is close enough
     * to find the right ink and not close enough to divide it: ㅏ's crossbar
     * sits at 46 in Pretendard and the proportionally-placed polyline for it
     * lands nearer 50, four units low. Ink is then split by whichever centreline
     * is nearest, so the top of the crossbar — genuinely closer to the vertical
     * than to a crossbar centreline four units below it — was handed to the
     * vertical. A Voronoi boundary between two lines is straight, the crossbar
     * is not, and what fell out was a triangle: the wedge that has been sitting
     * on the right-hand side of ㅏ's stem through the whole of stroke one.
     *
     * The first pass is only ever used to find each stroke's ink. `centreline`
     * then re-reads the route from that ink — the same function that already
     * produced the drawn route, which is why the *animation* always followed the
     * font while the *cut* did not — and the second pass divides the ink with
     * centrelines that lie along it. The boundary lands where the two strokes
     * actually meet, and it lands there for every T, cross and corner in the
     * curriculum rather than for the one in the screenshot.
     */
    /*
     * Settle the centrelines and the widths together, then cut.
     *
     * The single pass this replaced had two faults that fed each other, and
     * both are why every T-junction in the curriculum wore a spike.
     *
     * **The centreline was in the wrong place.** `place` maps a polyline onto
     * the letter's ink box by proportion, which is close enough to find the
     * right ink and not close enough to divide it: ㅏ's crossbar sits at 46 in
     * Pretendard and the proportionally-placed polyline for it lands nearer 50.
     * Ink then went to whichever centreline was nearest, so the top of the
     * crossbar — genuinely nearer the stem than a crossbar centreline four
     * units below it — was handed to the stem. A Voronoi boundary between two
     * lines is straight and a crossbar is not, so what fell out was a triangle:
     * the wedge that sat on the right of ㅏ's stem through the whole of stroke
     * one, before the stroke that ink belongs to had been written.
     *
     * **The reach was one number for the whole letter.** `weight * 0.62` is
     * wider than some strokes, so a stroke reached past its own edge into the
     * block beside it, took the ink there, and the centreline re-read from that
     * ink drifted towards it — which let the next pass reach further still.
     *
     * So each pass re-reads both: where the stroke is, and how wide it is. The
     * width comes from the ink no other stroke wants, so a junction cannot
     * inflate it, and it becomes the next pass's reach. Three passes is where
     * ㅏ, ㅂ, ㅁ, ㄹ and 가 all stop changing.
     */
    let lines = here;
    let reach = here.map(() => band);
    let fields;
    let mine;
    for (let pass = 0; pass < 3; pass += 1) {
      const claimed = claim(lines, reach);
      fields = claimed.fields;
      mine = claimed.full;
      if (pass === 2) break;
      reach = lines.map((_, index) => widthOf(claimed.fields, claimed.core, index));
      lines = lines.map((stroke, index) =>
        // The core where there is one — see `claim`. A stroke narrower than its
        // reach has no exclusive core, and then the full region is all there is.
        centreline(
          claimed.core[index].some((v) => v) ? claimed.core[index] : claimed.full[index],
          stroke,
        ),
      );
    }
    /*
     * Grow each region a little, then clip it back to the glyph — but only
     * *backwards*, into ink an earlier stroke already owns.
     *
     * The growth is there for a real reason. Two neighbouring regions share a
     * boundary, and each is traced and then simplified independently, so both
     * can pull back from it by up to the simplification tolerance and leave a
     * hairline of paper between them. On screen that is a white slash across
     * the corner of every ㅂ, which is precisely the seam this whole approach
     * exists to make impossible.
     *
     * Growing in *every* direction is what put the spikes on the demonstration.
     * At a T-junction the two regions meet inside a block of ink that belongs
     * to the crossing stroke, and an undirected dilation pushes the earlier
     * stroke two pixels into it. Trace that, simplify it, and ㅏ's vertical
     * grows a triangular wedge out of its right-hand side — sitting there on
     * screen through the whole of stroke one, before the stroke that ink
     * actually belongs to has been written. Every T and every crossing in the
     * curriculum had one: ㅂ's verticals, ㅁ's corners, 가's ㅏ, ㅓ, ㅐ, ㄹ.
     *
     * Direction fixes it and costs nothing, because a seam only needs *one*
     * side to close it:
     *
     * ```
     * stroke 2 may bleed into stroke 1's ink   →  the seam closes, and it is
     *                                             hidden under ink already on
     *                                             the paper
     * stroke 1 may NOT bleed into stroke 2's   →  no ink appears before the
     *                                             stroke that owns it
     * ```
     *
     * Clipping to the glyph is what keeps the whole thing honest either way:
     * no pixel outside the reference glyph survives the intersection, so the
     * union is still exactly that glyph.
     */
    const owned = mine.map((mask) => mask);
    for (let f = 0; f < mine.length; f += 1) {
      // Ink that a *later* stroke of this letter owns and this one does not.
      const later = new Uint8Array(N);
      for (let g = f + 1; g < owned.length; g += 1) {
        for (let i = 0; i < N; i += 1) {
          if (owned[g][i] && !owned[f][i]) later[i] = 1;
        }
      }
      const grown = dilate(owned[f], 2);
      const region = new Uint8Array(N);
      for (let i = 0; i < N; i += 1) {
        // Stay inside this letter, too: a stroke of ㄱ has no business growing
        // into the ㅏ beside it just because the two are two pixels apart.
        if (grown[i] && !later[i] && unitOf[i] === u) region[i] = 1;
      }
      owners.push(clipToInk(region));
    }
    // The route comes from the ink the *second* pass settled on, so the drawn
    // path and the cut agree about where the stroke is.
    lines.forEach((stroke, index) => placed.push(centreline(mine[index], stroke)));
  }

  // --- contours -------------------------------------------------------------
  /**
   * Crack following: walk the boundary between filled and empty cells.
   *
   * Every filled cell contributes one directed unit edge per side that faces
   * empty space, wound so the fill is consistently on one hand. Chaining those
   * edges start-to-end gives one closed loop per region and one per hole, and
   * because each edge is consumed exactly once the walk cannot revisit or run
   * away — which the marching-squares version this replaced could, and did.
   */
  function contours(mask) {
    const outgoing = new Map();
    const push = (ax, ay, bx, by) => {
      const key = ax * 4096 + ay;
      const held = outgoing.get(key);
      if (held) held.push([ax, ay, bx, by]);
      else outgoing.set(key, [[ax, ay, bx, by]]);
    };
    const on = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : mask[y * W + x]);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (!mask[y * W + x]) continue;
        if (!on(x, y - 1)) push(x, y, x + 1, y);
        if (!on(x + 1, y)) push(x + 1, y, x + 1, y + 1);
        if (!on(x, y + 1)) push(x + 1, y + 1, x, y + 1);
        if (!on(x - 1, y)) push(x, y + 1, x, y);
      }
    }
    const rings = [];
    for (const [, edges] of outgoing) {
      while (edges.length) {
        const first = edges.pop();
        const ring = [[first[0], first[1]]];
        let cx = first[2];
        let cy = first[3];
        let guard = 0;
        while ((cx !== first[0] || cy !== first[1]) && guard < 400000) {
          const next = outgoing.get(cx * 4096 + cy);
          if (!next || next.length === 0) break;
          const edge = next.pop();
          ring.push([edge[0], edge[1]]);
          cx = edge[2];
          cy = edge[3];
          guard += 1;
        }
        if (ring.length > 7) rings.push(ring);
      }
    }
    return rings;
  }

  /** Rounding to a tenth leaves neighbours sitting on the same point. */
  const dedupe = (points) =>
    points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);

  /** Ramer–Douglas–Peucker, iterative so a long contour cannot blow the stack. */
  function simplify(points, epsilon) {
    if (points.length < 3) return points;
    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [lo, hi] = stack.pop();
      const ax = points[lo][0];
      const ay = points[lo][1];
      const dx = points[hi][0] - ax;
      const dy = points[hi][1] - ay;
      const length = Math.hypot(dx, dy);
      let worst = 0;
      let at = -1;
      for (let i = lo + 1; i < hi; i += 1) {
        const x = points[i][0];
        const y = points[i][1];
        const d = length === 0
          ? Math.hypot(x - ax, y - ay)
          : Math.abs((x - ax) * dy - (y - ay) * dx) / length;
        if (d > worst) {
          worst = d;
          at = i;
        }
      }
      if (at !== -1 && worst > epsilon) {
        keep[at] = 1;
        stack.push([lo, at], [at, hi]);
      }
    }
    return points.filter((_, i) => keep[i]);
  }

  // --- into the viewBox -----------------------------------------------------
  const scale = inkSpan / Math.max(W, H);
  const offX = 50 - (W / 2) * scale;
  const offY = 50 - (H / 2) * scale;
  /*
   * One decimal place, deliberately.
   *
   * The viewBox is 100 units and the demonstration is drawn at about 200 px, so
   * a tenth of a unit is a fifth of a pixel — below anything a screen can show.
   * Two places doubled the size of the shipped file to encode noise.
   */
  const box = (x, y) => [
    Math.round((x * scale + offX) * 10) / 10,
    Math.round((y * scale + offY) * 10) / 10,
  ];

  const strokes = [];
  const union = new Uint8Array(N);
  for (let s = 0; s < owners.length; s += 1) {
    const rings = contours(owners[s])
      .map((ring) => simplify(ring, 1.1).map((p) => box(p[0], p[1])))
      .filter((ring) => ring.length > 3);
    if (rings.length === 0) {
      notes.push('stroke ' + (s + 1) + ' claimed no ink');
      continue;
    }
    // `placed` is already in ink-box pixels — the letter was fitted there.
    const line = placed[s].map((p) => box(p[0], p[1]));
    const shape = rings
      .map((r) => 'M' + dedupe(r).map((p) => p[0] + ' ' + p[1]).join('L') + 'Z')
      .join('');

    /*
     * How wide the brush that uncovers this stroke has to be.
     *
     * The demonstration reveals a stroke by sweeping a thick line along its
     * centreline and showing the outline through it. If that line is thinner
     * than the stroke is wide, the stroke is still partly hidden at the moment
     * it is supposed to be finished, and then snaps into place when the next one
     * starts — a flick at the end of every stroke, worst on the short wide ones
     * like the tick of ㅊ, whose path is a fraction of the length of its own bar.
     *
     * A fixed multiple of the pen cannot cover every case, so the width is
     * measured instead: the furthest any point of the outline lies from the
     * path, doubled, plus a little. `strokes:qa` re-checks it, which turns "the
     * last frame is the finished shape" from something to look at into something
     * that fails the build.
     */
    let furthest = 0;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[(i + 1) % ring.length];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
        for (let t = 0; t <= steps; t += 1) {
          const x = ax + ((bx - ax) * t) / steps;
          const y = ay + ((by - ay) * t) / steps;
          let nearest = Infinity;
          for (let j = 1; j < line.length; j += 1) {
            const [px, py] = line[j - 1];
            const [qx, qy] = line[j];
            const dx = qx - px;
            const dy = qy - py;
            const len = dx * dx + dy * dy;
            let u = len === 0 ? 0 : ((x - px) * dx + (y - py) * dy) / len;
            u = Math.max(0, Math.min(1, u));
            nearest = Math.min(nearest, Math.hypot(x - (px + u * dx), y - (py + u * dy)));
          }
          if (nearest > furthest) furthest = nearest;
        }
      }
    }
    const penWidth = weight * scale;

    strokes.push({
      order: s + 1,
      shape,
      draw: line.map((p) => p[0] + ' ' + p[1]).join('L'),
      start: line[0],
      reveal: Math.round(Math.max(penWidth * 1.9, furthest * 2 * 1.08) * 10) / 10,
    });
    for (let i = 0; i < N; i += 1) if (owners[s][i]) union[i] = 1;
  }

  let inked = 0;
  let covered = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (!ink[(y + Y0) * S + (x + X0)]) continue;
      inked += 1;
      if (union[y * W + x]) covered += 1;
    }
  }

  return {
    asset: {
      character: item.character,
      group: item.group,
      viewBox: '0 0 100 100',
      pen: Math.round(weight * scale * 10) / 10,
      strokes,
    },
    coverage: Math.round((covered / inked) * 10000) / 10000,
    how,
    debug: { weight, W, H, boxes, claimed: owners.map((m) => m.reduce((n, v) => n + v, 0)) },
    notes,
  };
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.error('  page:', m.text());
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });

const out = {};
const coverage = {};
const problems = [];
const segmented = {};

for (const item of items) {
  let result;
  try {
    result = await page.evaluate(cut, { face: FACE, item, inkSpan: INK_SPAN });
  } catch (error) {
    problems.push(`${item.character}: ${String(error).split('\n')[0]}`);
    continue;
  }
  if (result.error) {
    console.error(`${item.character}: ${result.error}`);
    await browser.close();
    process.exit(1);
  }
  for (const note of result.notes) problems.push(`${item.character}: ${note}`);
  if (process.env.STROKE_DEBUG && process.env.STROKE_DEBUG.includes(item.character)) {
    console.log(item.character, result.how, JSON.stringify(result.debug));
  }
  out[item.character] = result.asset;
  coverage[item.character] = result.coverage;
  segmented[result.how] = (segmented[result.how] ?? 0) + 1;
  result.asset.segmentation = result.how;
}

await browser.close();

for (const line of problems) console.log(`  ! ${line}`);
console.log('segmentation:', JSON.stringify(segmented));

const body = `${JSON.stringify(
  {
    _comment:
      'Generated by scripts/build-stroke-assets.mjs. Do not edit by hand. Each stroke is a filled outline cut from the reference glyph, so the union of an item’s strokes is that glyph.',
    face: FACE,
    items: out,
  },
  null,
  0,
)}\n`;

if (CHECK) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    current = '';
  }
  if (current !== body) {
    console.error('strokeAssets.json is out of date — run `npm run strokes:build`.');
    process.exit(1);
  }
  console.log(`stroke assets up to date (${Object.keys(out).length} items).`);
} else {
  writeFileSync(OUT, body);
  const strokes = Object.values(out).reduce((n, a) => n + a.strokes.length, 0);
  console.log(
    `Built ${Object.keys(out).length} assets, ${strokes} strokes, ${Math.round(body.length / 1024)} kB → ${OUT}`,
  );
  const worst = Object.entries(coverage).sort((a, b) => a[1] - b[1]).slice(0, 6);
  console.log('lowest glyph coverage:');
  for (const [character, value] of worst) {
    console.log(`  ${character}  ${(value * 100).toFixed(2)}%`);
  }
}
