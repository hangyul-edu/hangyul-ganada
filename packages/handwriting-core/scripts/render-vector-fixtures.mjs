#!/usr/bin/env node
/**
 * Re-renders the fixtures for the letters the product draws by hand.
 *
 *   node packages/handwriting-core/scripts/render-vector-fixtures.mjs
 *   … --check   fail if the committed fixtures are stale
 *
 * ## Why there are two fixture generators
 *
 * `render-fixtures.py` sets every character in the practice face, which is what
 * the product does for 67 of the 73. For the six compound vowels in
 * `HANDWRITTEN_GUIDE` the product does not: Pretendard slants the ㅗ bar in ㅘ
 * and its family, nobody writes a slanted ㅗ, so the guide and the grading mask
 * are stroked from the same authored centrelines the demonstration reveals.
 *
 * A grading corpus rendered from the face for those six would be measuring a
 * shape the product stopped drawing — which is the failure mode this repository
 * keeps finding, one level away from what the customer sees. So this runs after
 * the Python and replaces exactly those six entries.
 *
 * It draws through the browser rather than through Pillow because the app draws
 * through the browser: the same `Path2D`, the same butt caps, the same mitre
 * limit, and the same probe-measure-refit that `fitGlyph` performs. A polyline
 * approximation in Pillow would be a third rendering of the same letters and a
 * third thing to drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { vectorGlyph } from '../../../apps/web/src/data/strokeVectors.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const OUT = join(ROOT, 'packages/handwriting-core/src/__tests__/glyph-fixtures.json');
const CHECK = process.argv.includes('--check');

/** Kept in step with `HANDWRITTEN_GUIDE` in `features/writing/glyphSpec.ts`. */
const HANDWRITTEN = ['ㅘ', 'ㅝ', 'ㅚ', 'ㅟ', 'ㅙ', 'ㅞ'];

const fixtures = JSON.parse(readFileSync(OUT, 'utf8'));
const { resolution: R, glyphScale: SCALE, inkExtent: EXTENT, maxFitScale: MAX_FIT } = fixtures;

const glyphs = HANDWRITTEN.map((character) => {
  const g = vectorGlyph(character);
  return { character, paths: g.strokes.map((s) => s.d), pen: g.pen };
});

const browser = await chromium.launch();
const page = await browser.newPage();
const rendered = await page.evaluate(
  ({ glyphs, R, SCALE, EXTENT, MAX_FIT }) => {
    const canvas = new OffscreenCanvas(R, R);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    /** One paint of the authored centrelines, at a given em and centre. */
    const paint = (paths, pen, fontSize, cx, cy) => {
      ctx.clearRect(0, 0, R, R);
      const scale = fontSize / 100;
      ctx.save();
      ctx.translate(cx - (scale * 100) / 2, cy - (scale * 100) / 2);
      ctx.scale(scale, scale);
      ctx.lineWidth = pen;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 3;
      ctx.strokeStyle = '#000';
      for (const d of paths) ctx.stroke(new Path2D(d));
      ctx.restore();
    };

    const bits = () => {
      const { data } = ctx.getImageData(0, 0, R, R);
      const out = new Uint8Array(R * R);
      let x0 = R, y0 = R, x1 = -1, y1 = -1;
      for (let i = 0; i < out.length; i += 1) {
        // 128, matching ALPHA_THRESHOLD in glyph.ts and render-fixtures.py.
        if (data[i * 4 + 3] >= 128) {
          out[i] = 1;
          const x = i % R, y = (i - x) / R;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return { out, box: x1 < 0 ? null : { x0, y0, x1, y1 } };
    };

    const result = {};
    for (const g of glyphs) {
      // Probe, measure, solve, redraw — `fitGlyph`, exactly.
      const probe = R * SCALE;
      paint(g.paths, g.pen, probe, R / 2, R / 2);
      const first = bits();
      const b = first.box;
      const longest = Math.max(b.x1 - b.x0, b.y1 - b.y0) + 1;
      const k = Math.min((EXTENT * R) / longest, MAX_FIT);
      const icx = (b.x0 + b.x1 + 1) / 2, icy = (b.y0 + b.y1 + 1) / 2;
      paint(g.paths, g.pen, probe * k, R / 2 - k * (icx - R / 2), R / 2 - k * (icy - R / 2));
      const { out } = bits();
      result[g.character] = Array.from(out);
    }
    return result;
  },
  { glyphs, R, SCALE, EXTENT, MAX_FIT },
);
await browser.close();

/** Alternating run lengths, starting with a run of zeros. Matches the Python. */
function encodeRle(data) {
  const runs = [];
  let expected = 0;
  let count = 0;
  for (const value of data) {
    if (value === expected) count += 1;
    else { runs.push(count); expected = 1 - expected; count = 1; }
  }
  runs.push(count);
  return runs;
}

let changed = 0;
for (const character of HANDWRITTEN) {
  const data = rendered[character];
  const ink = data.reduce((n, v) => n + v, 0);
  if (ink === 0) throw new Error(`${character} rendered empty`);
  const next = { ink, rle: encodeRle(data) };
  for (const face of Object.values(fixtures.fonts)) {
    const before = JSON.stringify(face.glyphs[character]);
    if (before !== JSON.stringify(next)) changed += 1;
    /*
      The same mask for every practice face, and that is correct rather than
      lazy: these six are no longer set in a typeface at all. The learner traces
      authored centrelines whichever face they picked, so there is one shape to
      grade against and the face only decides the letters around it.
    */
    face.glyphs[character] = next;
  }
}

const rendered_json = `${JSON.stringify(fixtures)}\n`;
const current = readFileSync(OUT, 'utf8');
if (rendered_json === current) {
  console.log(`hand-drawn fixtures up to date (${HANDWRITTEN.length} letters).`);
} else if (CHECK) {
  console.error('hand-drawn fixtures are stale — run `npm run strokes:fixtures`.');
  process.exit(1);
} else {
  writeFileSync(OUT, rendered_json);
  console.log(`wrote ${HANDWRITTEN.length} hand-drawn letters into glyph-fixtures.json (${changed} face-entries changed).`);
}
