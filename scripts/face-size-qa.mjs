#!/usr/bin/env node
/**
 * How big each practice typeface *looks*, at one font size.
 *
 *   npm run face:size            print the comparison
 *   npm run face:size -- --check fail when a face is visibly out of step
 *
 * ## Why this is separate from `glyph_scale`
 *
 * There are two size questions about Gaegu and they have different answers.
 *
 * The first is the **reference glyph a learner traces**. That one is settled:
 * `glyph_scale` lifted Gaegu from 0.78 to 1.00, mean ink extent 0.524 → 0.610,
 * and the sweep in `data/fonts.ts` shows a false-rejection cliff at 1.04. It
 * cannot go further without telling honest attempts they are wrong, and §51
 * says not to damage recognition, so it stops there.
 *
 * The second is **every other letter on screen**. A learner who picks 손글씨체
 * reads the whole app in it — word cards, letter tiles, example sentences — and
 * that text is not graded by anything. Nothing was stopping it from being set
 * larger; nothing had measured it either. §51 asks for a real rendered
 * comparison rather than a closing argument from the geometry, so this renders.
 *
 * ## The measurement
 *
 * The same string in each face at the same `font-size`, on a canvas, with the
 * ink bounding box found in pixels. Two numbers come out per face: the height
 * of the ink band as a fraction of the em, and its width. A face whose ink band
 * is nine tenths the height of another's at the same font size *is* visibly
 * smaller, whatever its metrics claim, because the em is the only thing the CSS
 * makes equal.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/** Each face, and the file the app actually serves for Korean. */
const FACES = [
  ['pretendard', 'pretendard/dist/web/variable/woff2/PretendardVariable.woff2'],
  ['nanum-gothic', '@fontsource/nanum-gothic/files/nanum-gothic-korean-400-normal.woff2'],
  ['nanum-myeongjo', '@fontsource/nanum-myeongjo/files/nanum-myeongjo-korean-400-normal.woff2'],
  ['gowun-batang', '@fontsource/gowun-batang/files/gowun-batang-korean-400-normal.woff2'],
  ['gaegu', '@fontsource/gaegu/files/gaegu-korean-400-normal.woff2'],
  ['gowun-dodum', '@fontsource/gowun-dodum/files/gowun-dodum-korean-400-normal.woff2'],
];

/*
 * Syllables, not compatibility jamo.
 *
 * The jamo are what the practice screen shows and they are already measured.
 * This is about running text — a word card, a category list, an example — so
 * the sample is the kind of syllable a learner reads, with ascenders,
 * descenders and a final consonant between them.
 */
const SAMPLE = '가나다먹밥한글학교사랑읽음짧값';

const SIZE = 200;
const CANVAS = 420;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: CANVAS, height: CANVAS } });

const faces = FACES.map(([id, file]) => ({
  id,
  data: readFileSync(path.join(ROOT, 'node_modules', file)).toString('base64'),
}));

await page.setContent(
  `<meta charset="utf-8"><style>${faces
    .map((f) => `@font-face{font-family:F-${f.id};src:url(data:font/woff2;base64,${f.data}) format('woff2')}`)
    .join('')}
   body{margin:0}</style>
   <canvas id="c" width="${CANVAS}" height="${CANVAS}"></canvas>
   ${faces.map((f) => `<div style="position:fixed;left:-9999px;font:40px F-${f.id}">${SAMPLE}</div>`).join('')}`,
);

// The same trap `measure-jamo.mjs` documents: a canvas alone loads nothing, and
// a system CJK fallback draws perfectly good, wrong letters.
for (const face of faces) {
  await page.evaluate(
    async ({ id, text }) => {
      await document.fonts.load(`40px F-${id}`, text);
    },
    { id: face.id, text: SAMPLE },
  );
  const loaded = await page.evaluate(
    ({ id, text }) => document.fonts.check(`40px F-${id}`, text),
    { id: face.id, text: SAMPLE },
  );
  if (!loaded) {
    await browser.close();
    throw new Error(`${face.id} did not load; every extent would be measured off a fallback`);
  }
}

const measured = await page.evaluate(
  ({ ids, sample, size, canvas }) => {
    const element = document.getElementById('c');
    const context = element.getContext('2d');
    const out = {};
    for (const id of ids) {
      let heights = 0;
      let widths = 0;
      for (const character of sample) {
        context.clearRect(0, 0, canvas, canvas);
        context.fillStyle = '#000';
        context.font = `${size}px F-${id}`;
        context.textBaseline = 'alphabetic';
        context.fillText(character, canvas * 0.1, canvas * 0.8);
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
        heights += (y1 - y0 + 1) / size;
        widths += (x1 - x0 + 1) / size;
      }
      out[id] = { height: heights / sample.length, width: widths / sample.length };
    }
    return out;
  },
  { ids: faces.map((f) => f.id), sample: SAMPLE, size: SIZE, canvas: CANVAS },
);
await browser.close();

/*
 * What the app already does about it.
 *
 * A face whose reading text needs adjusting gets a second `@font-face` in
 * `styles/faceSize.css` with a `size-adjust`, and names it in `text_family`.
 * Reading that percentage back here is what makes this a check on the shipped
 * product rather than on the font file: the numbers above are what the face
 * draws, the numbers below are what a learner sees.
 */
const css = readFileSync(path.join(ROOT, 'apps/web/src/styles/faceSize.css'), 'utf8');
const source = readFileSync(path.join(ROOT, 'apps/web/src/data/fonts.ts'), 'utf8');
const shipped = {};
for (const block of source.split(/\n    id: '/).slice(1)) {
  const id = block.slice(0, block.indexOf("'"));
  const family = block.match(/text_family: "'([^']+)'/);
  if (!family) {
    shipped[id] = 1;
    continue;
  }
  // The `size-adjust` on the block that declares that family.
  const declaration = css
    .split('@font-face')
    .find((rule) => rule.includes(`font-family: '${family[1]}'`));
  const adjust = declaration?.match(/size-adjust:\s*([\d.]+)%/);
  shipped[id] = adjust ? Number(adjust[1]) / 100 : 1;
}

const rows = Object.entries(measured).map(([id, m]) => ({
  id,
  raw: m.height,
  scale: shipped[id] ?? 1,
  shown: m.height * (shipped[id] ?? 1),
  width: m.width * (shipped[id] ?? 1),
}));
const median = [...rows].map((r) => r.shown).sort((a, b) => a - b)[Math.floor(rows.length / 2)];

console.log(`Practice typefaces — ink height as a fraction of the em, ${SAMPLE.length} syllables\n`);
console.log('  face              raw    size-adjust   as shown   vs median');
for (const row of rows.sort((a, b) => a.shown - b.shown)) {
  const delta = ((row.shown / median - 1) * 100).toFixed(1).padStart(6);
  console.log(
    `  ${row.id.padEnd(16)}${row.raw.toFixed(3)}       ${row.scale.toFixed(2)}       ${row.shown.toFixed(3)}      ${delta}%`,
  );
}

/*
 * Eight per cent.
 *
 * Below that the difference is inside what the faces themselves vary by — the
 * five that were never in question span six points between them — and a
 * threshold tighter than the natural spread would demand a correction on a
 * face nobody thinks is wrong.
 */
const TOLERANCE = 0.08;
const off = rows.filter((row) => Math.abs(row.shown / median - 1) > TOLERANCE);
if (off.length > 0) {
  console.log(`\n${off.length} face(s) visibly out of step with the rest:`);
  for (const row of off) {
    console.log(
      `  ! ${row.id} shows at ${((row.shown / median - 1) * 100).toFixed(1)}% of the median — ` +
        `set its size-adjust to ${((row.scale * (median / row.shown)) * 100).toFixed(0)}%`,
    );
  }
  process.exit(CHECK ? 1 : 0);
}
console.log('\nevery face reads at the same size on the page.');
