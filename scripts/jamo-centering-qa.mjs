#!/usr/bin/env node
/**
 * Is the letter in the middle of the space it is given?
 *
 *   tsx scripts/jamo-centering-qa.mjs           print the measurements
 *   tsx scripts/jamo-centering-qa.mjs --check   fail the build
 *
 * ## Why font metrics are the wrong answer
 *
 * `text-align: center` centres a glyph's **advance width** — the horizontal
 * space the typeface reserves for it, which includes its side bearings. For
 * Latin that is close enough to the ink that nobody notices. For compatibility
 * jamo it is not: these codepoints are designed to be *readable in isolation*
 * rather than to fill their em, so Pretendard draws ㅏ well to the right of the
 * middle of its advance and ㅗ well below the middle of its line box. Centre by
 * metrics and the letter sits visibly off to one side of the card it is on,
 * every time, with nothing in the CSS that looks wrong.
 *
 * The learner is being asked to copy that letter into a square. If the model is
 * not in the middle of its box and the square is, they are copying a different
 * relationship from the one they are being graded on.
 *
 * ## What this measures
 *
 * The ink. Each letter is rendered at the size and weight the app uses, the
 * painted pixels are found, and the centre of that bounding box is compared
 * with the centre of the **line box** — which is what a centred element
 * actually occupies. The offset is reported as a percentage of the em, so it is
 * comparable across letters and independent of the size on any one screen.
 *
 * ## What this actually gates
 *
 * Not "is the face well behaved" — it is not, and that is not a defect anybody
 * can fix. What is checked is that **the correction the app ships cancels what
 * the face does**: the measured offset minus the recorded one, which should be
 * zero for every letter. A face update that moves a glyph and is not followed
 * by `npm run jamo:measure` fails here, which is the failure worth catching.
 *
 * ## What was found, and what turned out to be fine
 *
 * Five letters sit more than 3% of the em off centre — ㅜ and ㅠ by about 7.8%,
 * ㅏ by 6.8%, ㅑ by 4.0%, ㅗ by 3.8% — and every composed syllable measured is
 * within 2.5%, because a syllable block is designed to fill its em.
 *
 * Of the four surfaces §10 lists, only one was wrong. The handwriting guide,
 * the stroke-order animation and the "Watch it written" preview are drawn from
 * `strokeVectors.ts`, which fits authored strokes to the *ink bounds* of the
 * measured box and centres those on the canvas — ink-centred by construction,
 * and they always were. The reference character is the one rendered as text,
 * and text is the thing that gets centred on its advance width.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONT = path.join(
  ROOT,
  'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
);
const CHECK = process.argv.includes('--check');

/** Every letter the curriculum teaches on its own, plus the compound vowels. */
const JAMO = [
  'ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ',
  'ㅑ', 'ㅕ', 'ㅛ', 'ㅠ',
  'ㅐ', 'ㅔ', 'ㅒ', 'ㅖ',
  'ㅘ', 'ㅝ', 'ㅚ', 'ㅟ', 'ㅙ', 'ㅞ', 'ㅢ',
  'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅎ',
  'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ',
  'ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ',
];
/** And a few composed syllables, which §10 asks for after the letters. */
const SYLLABLES = ['가', '고', '구', '글', '밥', '한', '국', '어'];

const WEIGHT = 600;
const SIZE = 200;
const BOX = 600;
const LIMIT = 0.03;

const font = readFileSync(FONT).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: BOX, height: BOX } });
const text = [...JAMO, ...SYLLABLES].join('');
await page.setContent(
  `<meta charset="utf-8"><style>
   @font-face{font-family:P;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
   body{margin:0}</style><canvas id="c" width="${BOX}" height="${BOX}"></canvas>
   <div id="probe" style="position:fixed;left:-9999px;font:${WEIGHT} 40px P">${text}</div>`,
);
// The face, for these characters — a `fonts.ready` on a canvas-only page
// resolves without loading anything and measures a fallback. Same trap, and the
// same guard, as `measure-jamo.mjs`.
await page.evaluate(
  async ({ probe, weight }) => {
    await document.fonts.load(`${weight} 40px P`, probe);
    await document.fonts.ready;
  },
  { probe: text, weight: WEIGHT },
);
if (
  !(await page.evaluate(
    ({ probe, weight }) => document.fonts.check(`${weight} 40px P`, probe),
    { probe: text, weight: WEIGHT },
  ))
) {
  await browser.close();
  throw new Error('the reference face did not load; every offset would be measured off a fallback');
}

const measured = await page.evaluate(
  ({ chars, size, weight, box }) => {
    const canvas = document.getElementById('c');
    const context = canvas.getContext('2d');
    const out = [];
    for (const character of chars) {
      context.clearRect(0, 0, box, box);
      context.fillStyle = '#000';
      context.font = `${weight} ${size}px P`;
      context.textBaseline = 'alphabetic';
      const origin = { x: box / 2, y: box / 2 };
      context.fillText(character, origin.x, origin.y);

      const metrics = context.measureText(character);
      const data = context.getImageData(0, 0, box, box).data;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < box; y += 1) {
        for (let x = 0; x < box; x += 1) {
          if (data[(y * box + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) continue;

      /*
       * The box a centred element occupies.
       *
       * Horizontally that is the advance width, which is what `text-align`
       * works on. Vertically it is the font's ascent-to-descent band, which is
       * what a line box is — not the ink, and not the em square.
       */
      const advance = metrics.width;
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;
      out.push({
        character,
        dx: (x0 + x1) / 2 - (origin.x + advance / 2),
        dy: (y0 + y1) / 2 - (origin.y - ascent + (ascent + descent) / 2),
        em: size,
        inkWidth: x1 - x0 + 1,
        inkHeight: y1 - y0 + 1,
      });
    }
    return out;
  },
  { chars: [...JAMO, ...SYLLABLES], size: SIZE, weight: WEIGHT, box: BOX },
);
await browser.close();

const RECORDED = JSON.parse(
  readFileSync(path.join(ROOT, 'apps/web/src/data/generated/jamoMetrics.json'), 'utf8'),
).inkOffset;

console.log('Jamo centring — ink against the box a centred element occupies\n');
console.log('  letter   dx        dy       correction    residual');
const off = [];
const stale = [];
for (const row of measured) {
  const dx = row.dx / row.em;
  const dy = row.dy / row.em;
  const fix = RECORDED[row.character];
  const bad = Math.abs(dx) > LIMIT || Math.abs(dy) > LIMIT;
  if (bad) off.push({ ...row, dx, dy });

  // The residual is what a learner sees: the face's offset, less the shift the
  // app applies for it. A syllable has no correction and needs none.
  const rx = fix ? dx - fix.dx : dx;
  const ry = fix ? dy - fix.dy : dy;
  if (Math.abs(rx) > LIMIT || Math.abs(ry) > LIMIT) {
    stale.push({ character: row.character, rx, ry, corrected: Boolean(fix) });
  }
  console.log(
    `  ${row.character}        ${(dx * 100).toFixed(1).padStart(6)}%   ${(dy * 100).toFixed(1).padStart(6)}%   ` +
      `${fix ? 'yes' : ' — '}           ${(Math.max(Math.abs(rx), Math.abs(ry)) * 100).toFixed(1)}%`,
  );
}

const worst = [...measured]
  .map((row) => ({ ...row, m: Math.max(Math.abs(row.dx / row.em), Math.abs(row.dy / row.em)) }))
  .sort((a, b) => b.m - a.m)
  .slice(0, 5);
console.log('\n  furthest from centre:');
for (const row of worst) console.log(`    ${row.character}  ${(row.m * 100).toFixed(1)}% of the em`);

console.log(
  `\n  ${off.length} of ${measured.length} glyph(s) are drawn off centre by the face;` +
    ` all of them carry a measured correction.`,
);

if (stale.length > 0) {
  console.error(`\n${stale.length} glyph(s) still sit off centre after the correction:`);
  for (const row of stale) {
    console.error(
      `  ! ${row.character}  residual dx ${(row.rx * 100).toFixed(1)}%  dy ${(row.ry * 100).toFixed(1)}%` +
        `${row.corrected ? '' : ' — no correction recorded'}`,
    );
  }
  console.error('  run `npm run jamo:measure` so the shipped offsets match the face.');
  process.exit(CHECK ? 1 : 0);
}
console.log(
  `\nevery glyph lands within ${(LIMIT * 100).toFixed(0)}% of centre once the shipped correction is applied.`,
);
