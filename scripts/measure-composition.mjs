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
 * ## Stacked blocks are cut at the vowel's own bar
 *
 * Islands answer the vertical-vowel blocks — 가, 안, 밥 — because in those the
 * letters really are separate. They do not answer 국, 구, 그, 글 or 옷, where
 * the whole block is one island, and the version of this script that fell back
 * to "the quietest row somewhere in this window" measured all five wrong: 국's
 * ㄱ came out as the top quarter of the block, 글's ㄹ as the bottom fifth, and
 * 꽃's ㅗ swallowed the tick of the ㅊ below it. Those numbers went straight into
 * the layout, so the demonstration drew a ㄱ stretched to nearly three times its
 * width and a ㄹ crushed to a smudge. A quiet row is not a landmark; it is
 * wherever the ink happens to thin out, and in a ㄹ that is between two of its
 * own bars.
 *
 * There *is* a landmark. Every vowel that makes a stacked block — ㅗ ㅛ ㅜ ㅠ ㅡ —
 * is built on one horizontal bar that runs the full width of the block, and no
 * consonant does: initials and 받침 are inset on both sides, and the wide ones
 * that are not solid (ㅅ's two legs) fail the same test. So the bar is found by
 * asking which rows are a single solid run across essentially the whole block,
 * and everything else follows from it:
 *
 * ```
 *        ┌───────────┐   initial: the ink above the vowel's stem,
 *        │    ㄱ     │            plus anything beside the stem
 *        ├─────┬─────┤
 *        │═════╪═════│   medial:  the stem, and the bar it stands on
 *        │     │     │
 *        ├─────┴─────┤
 *        │    ㅇ     │   final:   the ink below the stem
 *        └───────────┘
 * ```
 *
 * The stem is followed up (ㅗ) or down (ㅜ) from the bar along its own column
 * until the ink there stops being a stem — either it runs out, or the run
 * through that column widens, which is the letter above or below touching it.
 * Ink beside the stem belongs to the consonant, which is how 공's ㄱ keeps its
 * leg while the ㅗ underneath keeps its full stem: the two boxes overlap,
 * exactly as they do in the face.
 *
 * ## What is written out
 *
 * `composition.json`: per syllable, one box per letter, in fractions of that
 * syllable's own ink. `data/compose.ts` reads it and falls back to its general
 * layout for anything not in the table — a syllable the curriculum adds later
 * still composes, it just composes from the average until this is re-run.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

/**
 * Which side of its bar a stacked vowel's stem is on.
 *
 * ㅗ stands on its bar and ㅜ hangs under it; ㅡ is the bar and nothing else.
 * That is all the segmentation below needs to know about the vowel, and it is a
 * fact about the letter rather than about this face.
 */
const STEM_SIDE = { ㅗ: 'above', ㅛ: 'above', ㅜ: 'below', ㅠ: 'below', ㅡ: 'none' };

const syllables = ALL_CHARACTERS.filter((c) => c.group === 'syllable').map((c) => c.character);
const structures = Object.fromEntries(
  syllables.map((syllable) => {
    const jamo = toJamo(syllable);
    return [
      syllable,
      {
        jamo,
        form: medialForm(jamo[1]) ?? 'vertical',
        stem: STEM_SIDE[jamo[1]] ?? 'none',
      },
    ];
  }),
);

/**
 * A preview server, if nothing is already listening.
 *
 * This script measures the *shipped* face by rendering it in a browser, so it
 * needs the built app served — and for two cycles that requirement is the only
 * reason it was not on the release gate. Every other check runs from a bare
 * checkout; this one printed a connection error unless somebody had remembered
 * to start `vite preview` on this exact port first, so it was left out of
 * `verify:release` and the composition table went unguarded.
 *
 * A check that cannot be run unattended is a check that does not run. It now
 * starts its own server when the port is free, and reuses one when it is not,
 * so an interactive run against an already-open preview costs nothing.
 */
async function listening() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/`, { method: 'HEAD' });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

let preview = null;
if (!(await listening())) {
  const dist = join(here, '..', 'apps', 'web', 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    throw new Error(
      `nothing is serving :${PORT} and apps/web/dist is not built. Run \`npm run build\` first.`,
    );
  }
  preview = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: join(here, '..', 'apps', 'web'), stdio: 'ignore', detached: false },
  );
  const deadline = Date.now() + 30_000;
  while (!(await listening())) {
    if (Date.now() > deadline) {
      preview.kill();
      throw new Error(`vite preview did not come up on :${PORT} within 30s`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });

const measured = await page.evaluate(
  async ({ face, structures }) => {
    /*
     * The face has to be loaded *for the text being measured*.
     *
     * The app ships Pretendard as a dynamic subset — ninety-odd @font-face
     * rules, each with its own unicode-range, each fetched only when something
     * on the page needs a character in it. `document.fonts.load(font)` with no
     * text asks for the Latin sample string, so the Korean ranges stayed
     * `unloaded` and `fillText` quietly drew the *fallback* face instead. The
     * numbers that came out were a sans-serif's, not Pretendard's — 어 measured
     * 0.852 wide over tall where Pretendard sets it at 0.806 — and whether it
     * happened at all depended on which subsets the app's own first screen had
     * warmed, which is why the table went stale without anybody editing it.
     */
    await document.fonts.load(
      `400 300px ${face}`,
      Object.keys(structures).join(''),
    );
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

    /**
     * A stacked block, cut at the vowel's own bar. Null if the bar is not there.
     *
     * `on`, and the block's ink box; `stem` says which side of the bar the
     * vowel's stem is on. Returns one box per letter in block fractions, or
     * null, in which case the caller falls back to islands.
     */
    function stacked(on, X0, Y0, X1, Y1, stem, closed) {
      const W = X1 - X0;
      const H = Y1 - Y0;
      /** Per row: the ink's left and right edge, and how much of it there is. */
      const rows = [];
      for (let y = Y0; y <= Y1; y += 1) {
        let lo = -1;
        let hi = -1;
        let ink = 0;
        for (let x = X0; x <= X1; x += 1) {
          if (!on(x, y)) continue;
          if (lo < 0) lo = x;
          hi = x;
          ink += 1;
        }
        rows.push({ lo, hi, ink });
      }

      /*
       * A bar row: one solid run across essentially the whole block.
       *
       * Both halves matter. "Full width" alone would take ㅅ, whose legs reach
       * the same two edges with nothing between them; "solid" alone would take
       * any bar of a ㄹ or a ㅂ. Together they pick out exactly the vowel's bar
       * in every block the curriculum stacks.
       */
      const isBar = (i) => {
        const row = rows[i];
        if (row.lo < 0) return false;
        const span = row.hi - row.lo + 1;
        return span >= W * 0.94 && row.ink >= span * 0.92;
      };
      let barTop = -1;
      let barBottom = -1;
      for (let i = 0; i < rows.length; i += 1) {
        if (!isBar(i)) continue;
        let j = i;
        while (j + 1 < rows.length && isBar(j + 1)) j += 1;
        if (j - i > barBottom - barTop) {
          barTop = i;
          barBottom = j;
        }
        i = j;
      }
      if (barTop < 0) return null;

      /** The runs of ink in a row, as `[lo, hi]` pairs in absolute pixels. */
      const runsIn = (i) => {
        const y = Y0 + i;
        const found = [];
        let start = -1;
        for (let x = X0; x <= X1; x += 1) {
          if (on(x, y)) {
            if (start < 0) start = x;
          } else if (start >= 0) {
            found.push([start, x - 1]);
            start = -1;
          }
        }
        if (start >= 0) found.push([start, X1]);
        return found;
      };

      /*
       * How far the stem reaches away from its bar.
       *
       * Followed along its own column rather than by looking for quiet rows, so
       * a consonant standing beside it — 공's ㄱ, whose leg comes down past the
       * top of the ㅗ's stem — does not shorten it. The walk stops when the ink
       * in that column runs out, or when the run through it widens past a stem's
       * width, which is the letter above or below *touching* the stem: 옷's ㅇ
       * sits on it, and that is where the ㅇ ends and the ㅗ begins.
       */
      const followStem = (from, step) => {
        const seed = runsIn(from).filter(([lo, hi]) => hi - lo + 1 <= W * 0.4);
        if (!seed.length) return from - step;
        const inSeed = (x) => seed.some(([lo, hi]) => x >= lo && x <= hi);
        let at = from;
        while (at >= 0 && at < rows.length) {
          const runs = runsIn(at).filter(([lo, hi]) => {
            for (let x = lo; x <= hi; x += 1) if (inSeed(x)) return true;
            return false;
          });
          if (!runs.length) break;
          const widest = Math.max(...runs.map(([lo, hi]) => hi - lo + 1));
          if (widest > W * 0.4) break;
          at += step;
        }
        return at - step;
      };

      const medialTop = stem === 'above' ? Math.min(barTop, followStem(barTop - 1, -1)) : barTop;
      const medialBottom =
        stem === 'below' ? Math.max(barBottom, followStem(barBottom + 1, 1)) : barBottom;

      /**
       * The ink in a band of rows, optionally only the part beside the stem.
       *
       * "Beside the stem" is what lets the consonant's box overlap the vowel's,
       * which is what the face does: 고's ㄱ has a leg running down past the top
       * of the ㅗ under it, and cutting the ㄱ off at the ㅗ's stem would report
       * a letter the face does not draw.
       */
      const boxOf = (from, to, besideOnly) => {
        let x0 = 1e9;
        let y0 = 1e9;
        let x1 = -1;
        let y1 = -1;
        for (let i = Math.max(0, from); i <= Math.min(rows.length - 1, to); i += 1) {
          const y = Y0 + i;
          for (const [lo, hi] of runsIn(i)) {
            if (besideOnly && hi - lo + 1 <= W * 0.4 && overlapsStem(lo, hi)) continue;
            if (lo < x0) x0 = lo;
            if (hi > x1) x1 = hi;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
        return x1 < 0 ? null : { x0, y0, x1, y1 };
      };

      /** The stem's own columns, taken from the row just outside the bar. */
      const stemRuns =
        stem === 'above'
          ? runsIn(Math.max(0, barTop - 1)).filter(([lo, hi]) => hi - lo + 1 <= W * 0.4)
          : stem === 'below'
            ? runsIn(Math.min(rows.length - 1, barBottom + 1)).filter(
                ([lo, hi]) => hi - lo + 1 <= W * 0.4,
              )
            : [];
      function overlapsStem(lo, hi) {
        return stemRuns.some(([a, b]) => lo <= b && hi >= a);
      }

      const merge = (a, b) => {
        if (!a) return b;
        if (!b) return a;
        return {
          x0: Math.min(a.x0, b.x0),
          y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1),
          y1: Math.max(a.y1, b.y1),
        };
      };

      const initial = merge(boxOf(0, medialTop - 1, false), boxOf(medialTop, barTop - 1, true));
      const medial = boxOf(medialTop, medialBottom, false);
      const final = closed
        ? merge(boxOf(barBottom + 1, medialBottom, true), boxOf(medialBottom + 1, rows.length - 1, false))
        : null;
      if (!initial || !medial || (closed && !final)) return null;

      const asFraction = (box) => ({
        x0: (box.x0 - X0) / W,
        y0: (box.y0 - Y0) / H,
        x1: (box.x1 - X0) / W,
        y1: (box.y1 - Y0) / H,
      });
      return closed
        ? [asFraction(initial), asFraction(medial), asFraction(final)]
        : [asFraction(initial), asFraction(medial)];
    }

    const out = {};
    for (const [syllable, { jamo, form, stem }] of Object.entries(structures)) {
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

      const closedBlock = jamo.length > 2;
      /*
       * A stacked block is cut at its vowel's bar, whether or not the letters
       * happen to be separate islands.
       *
       * Not "only when islands fail": 꽃's letters *are* five islands, and
       * grouping them by where they sit puts the tick of the ㅊ with the ㅗ
       * above it, because the tick is nearer the middle of the block than it is
       * to the body of its own letter. The bar does not have that problem — the
       * tick is below the bar, so it is part of the 받침, which is what it is.
       */
      if (form === 'horizontal') {
        const boxes = stacked(on, X0, Y0, X1, Y1, stem, closedBlock);
        if (boxes) {
          out[syllable] = {
            aspect: +(W / H).toFixed(4),
            cut: 'bar',
            parts: boxes.map((box) => [
              +box.x0.toFixed(4),
              +box.y0.toFixed(4),
              +box.x1.toFixed(4),
              +box.y1.toFixed(4),
            ]),
          };
          continue;
        }
      }

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
        cut: 'islands',
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
preview?.kill();

const missing = syllables.filter((syllable) => !measured[syllable]);
/**
 * How each syllable was segmented, said out loud.
 *
 * A stacked block that falls back to islands has not failed — it may simply
 * have separate letters — but a *rise* in that number is the sign that the bar
 * is no longer being found, which is how the previous version got 국 and 글
 * wrong without saying anything.
 */
const byCut = (how) => Object.values(measured).filter((m) => m.cut === how).length;
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
  console.log(`  ${byCut('bar')} cut at the vowel's bar, ${byCut('islands')} split into islands.`);
}

if (missing.length) {
  console.log(`  could not segment: ${missing.join(' ')} — these fall back to the general layout.`);
}
