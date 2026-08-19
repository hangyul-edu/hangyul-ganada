#!/usr/bin/env node
/**
 * Where the reference face puts each letter of each syllable.
 *
 *   npm run strokes:measure          rewrite the table
 *   npm run strokes:measure -- --check  fail if the table is stale
 *
 * ## Why measured per syllable and not per class
 *
 * The composition used to come from medians: all vertical-vowel blocks placed
 * their consonant the same way, all horizontal ones theirs. A median is nobody,
 * and it showed — 어's ㅇ and ㅓ stood apart with a gap the face does not have,
 * because the number was an average over ten syllables whose consonants are
 * different widths. The reference glyph for *this* syllable is right there and
 * can be measured, so it is.
 *
 * ## How the letters are told apart
 *
 * By connected component. In every face here the letters of a block are
 * separate islands of ink, which makes "where does ㅇ end and ㅓ begin" a fact
 * about the picture rather than a guess: no thresholds, no profile scanning, no
 * splitting a ㅅ down the middle because its legs spread past the column a
 * median said to cut at.
 *
 * Some letters *are* two islands — ㅎ's tick sits off its bar, ㄲ is two ㄱ, ㅊ
 * has a mark above it. So islands are grouped by which third of the block they
 * fall in, and the group's union is the letter's box. The structural prior only
 * decides grouping; the numbers all come from the ink.
 *
 * ## What is written out
 *
 * `composition.json`: per syllable, one box per letter, in fractions of that
 * syllable's own ink. `data/compose.ts` reads it and falls back to its general
 * layout for anything not in the table — a syllable the curriculum adds later
 * still composes, it just composes from the average until this is re-run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { medialForm, toJamo } from '../apps/web/src/data/jamo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'apps/web/src/data/generated/composition.json');
const CHECK = process.argv.includes('--check');

/** The face the composition is measured in. See the note in `data/fonts.ts`. */
const FACE = "'Pretendard Variable', Pretendard, sans-serif";
const PORT = 4477;

const syllables = ALL_CHARACTERS.filter((c) => c.group === 'syllable').map((c) => c.character);
const structures = Object.fromEntries(
  syllables.map((syllable) => {
    const jamo = toJamo(syllable);
    return [syllable, { jamo, form: medialForm(jamo[1]) ?? 'vertical' }];
  }),
);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });

const measured = await page.evaluate(
  async ({ face, structures }) => {
    await document.fonts.load(`400 300px ${face}`);
    await document.fonts.ready;

    const S = 300;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    /** Islands of ink, 4-connected, as boxes plus their centroids. */
    function islands(on, X0, Y0, X1, Y1) {
      const seen = new Uint8Array(S * S);
      const found = [];
      const stack = [];
      for (let y = Y0; y <= Y1; y += 1) {
        for (let x = X0; x <= X1; x += 1) {
          const start = y * S + x;
          if (seen[start] || !on(x, y)) continue;
          let x0 = x;
          let x1 = x;
          let y0 = y;
          let y1 = y;
          let sumX = 0;
          let sumY = 0;
          let count = 0;
          stack.push(start);
          seen[start] = 1;
          while (stack.length) {
            const at = stack.pop();
            const ax = at % S;
            const ay = (at - ax) / S;
            if (ax < x0) x0 = ax;
            if (ax > x1) x1 = ax;
            if (ay < y0) y0 = ay;
            if (ay > y1) y1 = ay;
            sumX += ax;
            sumY += ay;
            count += 1;
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]) {
              const bx = ax + dx;
              const by = ay + dy;
              if (bx < X0 || bx > X1 || by < Y0 || by > Y1) continue;
              const next = by * S + bx;
              if (seen[next] || !on(bx, by)) continue;
              seen[next] = 1;
              stack.push(next);
            }
          }
          found.push({ x0, y0, x1, y1, cx: sumX / count, cy: sumY / count, count });
        }
      }
      return found;
    }

    const out = {};
    for (const [syllable, { jamo, form }] of Object.entries(structures)) {
      context.clearRect(0, 0, S, S);
      context.fillStyle = '#000';
      context.font = `400 220px ${face}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(syllable, S / 2, S / 2);
      const data = context.getImageData(0, 0, S, S).data;
      const on = (x, y) => data[(y * S + x) * 4 + 3] > 40;

      let X0 = 1e9;
      let Y0 = 1e9;
      let X1 = -1;
      let Y1 = -1;
      for (let y = 0; y < S; y += 1) {
        for (let x = 0; x < S; x += 1) {
          if (!on(x, y)) continue;
          if (x < X0) X0 = x;
          if (x > X1) X1 = x;
          if (y < Y0) Y0 = y;
          if (y > Y1) Y1 = y;
        }
      }
      if (X1 < 0) continue;
      const W = X1 - X0;
      const H = Y1 - Y0;

      const parts = islands(on, X0, Y0, X1, Y1);
      // Ignore specks: a stray antialiased pixel is not a letter.
      const real = parts.filter((p) => p.count > (W * H) / 800);
      if (real.length === 0) continue;

      /*
       * Where each letter is expected, roughly, so islands can be grouped.
       *
       * Only the grouping depends on this. Every number that ends up in the
       * table is read off the ink.
       */
      const closed = jamo.length > 2;
      const anchors =
        form === 'vertical'
          ? [
              { at: 0, x: 0.25, y: closed ? 0.3 : 0.45 },
              { at: 1, x: 0.85, y: closed ? 0.3 : 0.45 },
              ...(closed ? [{ at: 2, x: 0.5, y: 0.85 }] : []),
            ]
          : [
              { at: 0, x: 0.5, y: closed ? 0.18 : 0.25 },
              { at: 1, x: 0.5, y: closed ? 0.48 : 0.75 },
              ...(closed ? [{ at: 2, x: 0.5, y: 0.85 }] : []),
            ];

      const boxes = jamo.map(() => null);
      for (const part of real) {
        const cx = (part.cx - X0) / W;
        const cy = (part.cy - Y0) / H;
        let best = anchors[0];
        let nearest = Infinity;
        for (const anchor of anchors) {
          const distance = (cx - anchor.x) ** 2 + (cy - anchor.y) ** 2;
          if (distance < nearest) {
            nearest = distance;
            best = anchor;
          }
        }
        const box = {
          x0: (part.x0 - X0) / W,
          y0: (part.y0 - Y0) / H,
          x1: (part.x1 - X0) / W,
          y1: (part.y1 - Y0) / H,
        };
        const held = boxes[best.at];
        boxes[best.at] = held
          ? {
              x0: Math.min(held.x0, box.x0),
              y0: Math.min(held.y0, box.y0),
              x1: Math.max(held.x1, box.x1),
              y1: Math.max(held.y1, box.y1),
            }
          : box;
      }

      /*
       * Letters that touch come back as one island, so a group ends up empty.
       *
       * That is not a failure to measure — it is the measurement: in this face
       * the ㅇ of 어 runs into its ㅓ, and 오, 구, 국, 글 and 옷 are the same.
       * Those are exactly the syllables that looked wrong with a gap between
       * them. So the merged island is cut at its quietest line instead, and the
       * two boxes meet there: what the face joins, the demonstration joins.
       */
      if (boxes.some((box) => box === null)) {
        const quietest = (axis, lo, hi) => {
          let best = lo;
          let least = Infinity;
          for (let at = lo; at <= hi; at += 1) {
            let ink = 0;
            if (axis === 'x') {
              for (let y = Y0; y <= Y1; y += 1) if (on(at, y)) ink += 1;
            } else {
              for (let x = X0; x <= X1; x += 1) if (on(x, at)) ink += 1;
            }
            if (ink < least) {
              least = ink;
              best = at;
            }
          }
          return best;
        };
        /** The ink actually inside a slice of the block, as a box. */
        const inkIn = (u0, v0, u1, v1) => {
          const ax = X0 + Math.round(W * u0);
          const bx = X0 + Math.round(W * u1);
          const ay = Y0 + Math.round(H * v0);
          const by = Y0 + Math.round(H * v1);
          let x0 = 1e9;
          let y0 = 1e9;
          let x1 = -1;
          let y1 = -1;
          for (let y = ay; y <= by; y += 1) {
            for (let x = ax; x <= bx; x += 1) {
              if (!on(x, y)) continue;
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
          return x1 < 0
            ? { x0: u0, y0: v0, x1: u1, y1: v1 }
            : { x0: (x0 - X0) / W, y0: (y0 - Y0) / H, x1: (x1 - X0) / W, y1: (y1 - Y0) / H };
        };
        const foot = closed
          ? (quietest('y', Y0 + Math.round(H * 0.55), Y0 + Math.round(H * 0.8)) - Y0) / H
          : 1;
        if (form === 'vertical') {
          const cut = (quietest('x', X0 + Math.round(W * 0.35), X0 + Math.round(W * 0.8)) - X0) / W;
          boxes[0] = inkIn(0, 0, cut, foot);
          boxes[1] = inkIn(cut, 0, 1, foot);
        } else {
          const cut =
            (quietest('y', Y0 + Math.round(H * 0.25), Y0 + Math.round(H * (closed ? 0.45 : 0.7))) -
              Y0) /
            H;
          boxes[0] = inkIn(0, 0, 1, cut);
          boxes[1] = inkIn(0, cut, 1, foot);
        }
        if (closed) boxes[2] = inkIn(0, foot, 1, 1);
      }
      out[syllable] = {
        aspect: +(W / H).toFixed(4),
        parts: boxes.map((box) => [
          +box.x0.toFixed(4),
          +box.y0.toFixed(4),
          +box.x1.toFixed(4),
          +box.y1.toFixed(4),
        ]),
      };
    }
    return out;
  },
  { face: FACE, structures },
);

await browser.close();

const missing = syllables.filter((syllable) => !measured[syllable]);
const body = `${JSON.stringify(
  {
    face: FACE,
    note: 'Generated by scripts/measure-composition.mjs. Do not edit by hand.',
    syllables: measured,
  },
  null,
  2,
)}\n`;

if (CHECK) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    current = '';
  }
  if (current !== body) {
    console.error('composition.json is out of date — run `npm run strokes:measure`.');
    process.exit(1);
  }
  console.log(`composition table up to date (${Object.keys(measured).length} syllables).`);
} else {
  writeFileSync(OUT, body);
  console.log(`Measured ${Object.keys(measured).length} syllables into ${OUT}`);
}

if (missing.length) {
  console.log(`  could not segment: ${missing.join(' ')} — these fall back to the general layout.`);
}
