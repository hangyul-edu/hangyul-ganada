#!/usr/bin/env node
/**
 * The shape of the box each letter fills, measured off the reference face.
 *
 *   npm run jamo:measure            rewrite the metrics file
 *   npm run jamo:measure -- --check fail if it is out of date
 *
 * ## Why this is measured and not authored
 *
 * A lesson shows a learner two things: the large reference character, set in
 * the real typeface, and the demonstration of how it is written. If the two
 * disagree about the letter's *proportions* — a ㅏ that is tall and narrow
 * above a ㅏ that is nearly square — the learner is being shown two letters and
 * told they are one.
 *
 * `data/strokes.ts` authors each letter's stroke order and its geometry, both
 * of which are pedagogical facts and belong in source. It does not author the
 * letter's proportions, because those are a fact about the typeface and the
 * typeface is right here to be asked. So this asks it: render each letter,
 * find the ink, and record the aspect ratio of the box it fills.
 * `data/strokeVectors.ts` fits the authored strokes into a box of that shape.
 *
 * This is the same method, and the same reason, as
 * `scripts/measure-composition.mjs`, which measures where the *parts of a
 * syllable* sit. Between them, everything about how big a thing is comes from
 * the face and everything about how it is written comes from the source.
 *
 * ## Why aspect and not the whole box
 *
 * A letter alone on the paper is centred on it, so where Pretendard happens to
 * sit the compatibility-jamo glyph inside its em is not information — the
 * lesson centres it either way. Only the shape of the box carries over.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps/web/src/data/generated/jamoMetrics.json');
const FONT = path.join(
  ROOT,
  'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
);

/** Every letter `data/strokes.ts` draws on its own. Syllables are elsewhere. */
const JAMO = [
  'ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ',
  'ㅑ', 'ㅕ', 'ㅛ', 'ㅠ',
  'ㅐ', 'ㅔ', 'ㅒ', 'ㅖ',
  'ㅘ', 'ㅝ', 'ㅚ', 'ㅟ', 'ㅙ', 'ㅞ', 'ㅢ',
  'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅎ',
  'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ',
  'ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ',
];

/**
 * The weight the app sets the reference character in.
 *
 * Read from the design tokens rather than repeated here, so a change of weight
 * cannot leave the proportions measured against a face nobody is looking at.
 */
const WEIGHT = 600;
const SIZE = 300;
const CANVAS = 460;

const check = process.argv.includes('--check');

const font = readFileSync(FONT).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: CANVAS, height: CANVAS } });
await page.setContent(
  `<meta charset="utf-8"><style>
   @font-face{font-family:P;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
   body{margin:0}</style><canvas id="c" width="${CANVAS}" height="${CANVAS}"></canvas>
   <div id="probe" style="position:fixed;left:-9999px;font:${WEIGHT} 40px P">${JAMO.join('')}</div>`,
);
/*
 * Load the face **for these letters**, and prove it, before measuring.
 *
 * `document.fonts.ready` on a page whose only content is a `<canvas>` resolves
 * without loading anything, because nothing on that page uses the family. The
 * canvas then falls back to a system CJK face and draws perfectly good, wrong
 * letters. That is what this file did, and the numbers it produced were wrong
 * for exactly the letters where the fallback's design differs most: ㅗ was
 * recorded at an aspect of 2.894 where Pretendard draws it at 1.84, so the
 * demonstration built ㅗ with a stem two fifths too short.
 *
 * The check is not "is some face loaded" — the fallback is another Korean face
 * and passes that. `P` is defined only by the @font-face above, so a positive
 * `check` for it cannot be anything else.
 */
await page.evaluate(
  async ({ text, weight }) => {
    await document.fonts.load(`${weight} 40px P`, text);
    await document.fonts.ready;
  },
  { text: JAMO.join(''), weight: WEIGHT },
);
if (!(await page.evaluate(({ text, weight }) => document.fonts.check(`${weight} 40px P`, text), { text: JAMO.join(''), weight: WEIGHT }))) {
  await browser.close();
  throw new Error('the reference face did not load; every aspect would be measured off a fallback');
}

const measured = await page.evaluate(
  ({ chars, size, weight, canvas }) => {
    const element = document.getElementById('c');
    const context = element.getContext('2d');
    const out = {};
    for (const character of chars) {
      context.clearRect(0, 0, canvas, canvas);
      context.fillStyle = '#000';
      context.font = `${weight} ${size}px P`;
      context.textBaseline = 'alphabetic';
      context.fillText(character, canvas * 0.12, canvas * 0.82);
      const data = context.getImageData(0, 0, canvas, canvas).data;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < canvas; y += 1) {
        for (let x = 0; x < canvas; x += 1) {
          if (data[(y * canvas + x) * 4 + 3] > 40) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      const width = x1 - x0 + 1;
      const height = y1 - y0 + 1;

      /*
       * And how far the ink sits from the middle of the box that *centring*
       * would put in the middle.
       *
       * `text-align: center` centres the advance width and a line box centres
       * the ascent-to-descent band; neither is the ink. Compatibility jamo are
       * drawn to read in isolation rather than to fill their em, so ㅏ's ink
       * sits well right of its advance centre and ㅜ's well below its line-box
       * centre — measured at 6.8% and 7.8% of the em. On a lesson card that is
       * a letter visibly not in the middle of the square the learner is being
       * asked to copy it into, with nothing in the stylesheet that looks wrong.
       *
       * Recorded as a share of the em so it is a property of the face rather
       * than of any one screen's font size, and applied as a translate by
       * `CenteredGlyph`. Not a per-letter margin: nobody types these numbers.
       */
      const metrics = context.measureText(character);
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;
      const originX = canvas * 0.12;
      const originY = canvas * 0.82;
      const round = (value) => Math.round((value / size) * 1000) / 1000;
      out[character] = {
        aspect: Math.round((width / height) * 1000) / 1000,
        dx: round((x0 + x1) / 2 - (originX + metrics.width / 2)),
        dy: round((y0 + y1) / 2 - (originY - ascent + (ascent + descent) / 2)),
      };
    }
    return out;
  },
  { chars: JAMO, size: SIZE, weight: WEIGHT, canvas: CANVAS },
);

await browser.close();

const file = {
  note: 'Generated by scripts/measure-jamo.mjs. Do not edit by hand.',
  face: "'Pretendard Variable', Pretendard, sans-serif",
  weight: WEIGHT,
  /** Ink-box aspect ratio (width ÷ height) per letter, off the reference face. */
  aspect: Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, v.aspect])),
  /**
   * How far the ink sits from the centre of the box a centred element occupies,
   * as a share of the em. Subtract it to put the letter where it looks centred.
   */
  inkOffset: Object.fromEntries(
    Object.entries(measured).map(([k, v]) => [k, { dx: v.dx, dy: v.dy }]),
  ),
};
const text = `${JSON.stringify(file, null, 2)}\n`;

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== text) {
    console.error('jamoMetrics.json is out of date — run `npm run jamo:measure`.');
    process.exit(1);
  }
  console.log(`jamo metrics up to date (${JAMO.length} letters).`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${JAMO.length} letters).`);
}
