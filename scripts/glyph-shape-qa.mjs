#!/usr/bin/env node
/**
 * Does the completed Korean character look right — as opposed to being drawn
 * in the right order?
 *
 *   npm run glyphshape:qa            measure, and write the comparison sheet
 *   npm run glyphshape:qa -- --check measure only; exit non-zero on a failure
 *
 * ## Why this is not `strokes:visual`
 *
 * `strokes:qa` asks whether the data is well formed. `strokes:visual` asks
 * whether the ink behaves — nothing invisible, nothing arriving early, nothing
 * detached, nothing off the paper. Both were passing, on all 73 items, while
 * 가 and 거 were being taught with a ㄱ whose leg stopped a third of the way
 * short of where the face puts it. Every stroke was in the right order, drawn
 * cleanly, and the wrong shape.
 *
 * **Stroke integrity and glyph-shape quality are different claims and this file
 * exists so they stop being reported as one.** A learner is not learning a
 * stroke order; they are learning what the letter looks like.
 *
 * ## What a learner actually sees, and what is compared
 *
 * One geometry reaches every instructional surface. The guide under the pen,
 * the mask the ink is graded against, the demonstration and the numbered still
 * are all `data/strokeVectors` — see `usesCanonicalGeometry` in
 * `features/writing/glyphSpec.ts` for the ㅆ/ㅉ defect that closed the last
 * gap between them. They cannot disagree with each other any more, so that is
 * no longer the question worth asking.
 *
 * What is asked here instead is whether the **canonical form agrees with the
 * face** — the practice typeface the product does not control, and therefore
 * the one reference in this comparison that cannot be quietly bent to make the
 * app look right. A learner who leaves this app has to recognise the letters
 * they were taught in ordinary Korean type.
 *
 * ## Declared deviations
 *
 * Eight letters are *meant* to differ, and they are listed with their reasons
 * in `CANONICAL_DEVIATIONS`. Six compound vowels, because Pretendard slants the
 * ㅗ or ㅜ bar as an optical adjustment and nobody writes a slanted ㅗ; ㅆ and
 * ㅉ, because the face closes each pair into a single island of ink and the
 * letter being taught is two ㅅ.
 *
 * They are reported with their score and their reason rather than hidden. An
 * undeclared letter that drifts from the face fails; a declared one that stops
 * deviating is worth knowing about too.
 *
 * ## What it measures, and what it refuses to conclude
 *
 * Intersection over union of the two ink masks, and for composed syllables the
 * position and size of each jamo's ink against the region `composition.json`
 * measured off the face. Neither is a proof of quality: two letters can score
 * well and still look wrong to a reader, which is why this also writes a sheet
 * of all 73 for somebody to look at. The numbers exist to make a *regression*
 * impossible to miss, not to replace the looking.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { hasVectorGlyph, vectorGlyph } from '../apps/web/src/data/strokeVectors.ts';
import { isSyllable } from '../apps/web/src/data/jamo.ts';
import {
  CANONICAL_COMPONENT_DEVIATIONS,
  CANONICAL_DEVIATIONS,
} from '../apps/web/src/features/writing/glyphSpec.ts';
import { blockLetterForms } from '../apps/web/src/data/compose.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '.glyph-qa');
const CHECK = process.argv.includes('--check');

/** The raster everything is measured on. */
const R = 320;
/** `GLYPH_INK_EXTENT` — how much of the box the guide's ink fills. */
const EXTENT = 0.72;

/**
 * How much of each letter's ink must be explained by the other's.
 *
 * **Not** intersection over union, which was tried first and is the wrong
 * instrument. One of these is a typeface with modulated strokes and the other
 * is a constant-width pen following a skeleton, so two renderings of
 * unmistakably the same letter overlap by only about half their area — every
 * item in the corpus scored between 0.18 and 0.75 and the ranking was dominated
 * by how well the pen width happened to match, not by shape.
 *
 * ## The floor was 0.9, and 0.9 could not see the defect it was there for
 *
 * ㅅ scored **92%** while it was being reported as malformed — its legs
 * splayed from a fork a third of the way down, where the face forks at a
 * fifth — so the gate passed the exact letter the release was blocked on. A
 * floor a learner's eye beats is not a floor.
 *
 * With the fork and flare corrected (see `SIOT_FAR` and `branch` in
 * `data/strokes.ts`) the whole curriculum measures 95% or better and ㅅ, ㅈ and
 * ㅊ measure 99, 100 and 99. 0.93 sits two points under the worst item and
 * above the shape that was shipped, so the previous ㅅ fails here rather than
 * passing — which is what `npm run glyphshape:qa` is for.
 *
 * What is asked instead is the question the handwriting grader already asks:
 * is every part of one letter *near* some part of the other? Ink is explained
 * if the other letter has ink within `TOLERANCE_PX`, and the score is the worse
 * of the two directions — so a stroke the demonstration adds and a stroke it
 * leaves out both count against it, while a uniformly heavier pen does not.
 */
const MIN_EXPLAINED = 0.93;

/**
 * How far apart the two may be and still count as the same mark.
 *
 * A little over half the demonstration's pen, in raster pixels. Wide enough
 * that a thick stroke centred on a thin one is fully explained; narrow enough
 * that the ㄱ this file was written for — whose toe sat 0.6 of the letter's
 * width from the face's — is not.
 */
const TOLERANCE_PX = Math.round(R * 0.045);

/** How far a jamo's ink may sit from where the face puts it, as a fraction of the glyph. */
const MAX_COMPONENT_DRIFT = 0.12;

/**
 * Letters whose canonical form is meant to depart from the face.
 *
 * Imported from the app, with its reasons, so the list cannot drift from what
 * the product draws or become a place to quietly park a regression. A letter
 * on it is scored and reported like any other; what it is exempt from is
 * *failing*.
 */

const composition = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/data/generated/composition.json'), 'utf8'),
).syllables;

/**
 * `--only ㅅㅈㅊ` narrows the run to a few letters.
 *
 * Tuning a shared primitive — the ㅅ legs that ㅈ, ㅊ, ㅆ and ㅉ all borrow —
 * means re-measuring after every change, and measuring seventy-three items to
 * read three of them is the difference between iterating and waiting. The gate
 * and `verify:*` always run the whole set; this only exists for the person
 * holding the letter.
 */
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg === -1 ? null : new Set([...(process.argv[onlyArg + 1] ?? '')]);
const items = ALL_CHARACTERS.map((c) => c.character)
  .filter(hasVectorGlyph)
  .filter((c) => !ONLY || ONLY.has(c));
/** How many strokes each jamo of a syllable contributes, in writing order. */
const jamoStrokes = Object.fromEntries(
  items
    .filter((c) => isSyllable(c))
    .map((c) => [c, blockLetterForms(c).map((f) => f.strokes.length)]),
);

const glyphs = items.map((character) => {
  const g = vectorGlyph(character);
  return {
    character,
    paths: g.strokes.map((s) => s.d),
    pen: g.pen,
    /*
      Whether the guide is set in the face or stroked from the same centrelines
      the demonstration reveals. For the six the product draws by hand, the two
      are the same ink by construction — there is nothing left to disagree — and
      this reports that rather than scoring a comparison of a thing with itself.
    */
    handwritten: CANONICAL_DEVIATIONS.has(character),
  };
});

/**
 * The face, embedded, rather than fetched from a running app.
 *
 * The first version of this pointed at the dev server, on the reasoning that
 * the app's own page is the most faithful place to measure. It is also the
 * place where Pretendard is delivered as a **dynamic subset**, and a subset
 * fetched for the text a page happens to contain does not necessarily include
 * the letter being measured. That failure is silent — the canvas falls back to
 * another CJK face and draws a perfectly good, different letter — and it
 * produced eight confident, wrong findings about compound vowels before the
 * numbers were checked against the font file itself.
 *
 * A guard that only proves "not the monospace fallback" does not catch it,
 * because the fallback here is another Korean face. So the file is embedded and
 * the family is one nothing else can supply, which removes the possibility
 * rather than testing for it.
 *
 * The **variable** file at weight 500, which is what `main.tsx` imports and so
 * what the learner is actually shown. `render-fixtures.py` reads the static
 * Medium instead; the two were compared letter by letter and agree to within a
 * pixel, so that is a naming inconsistency rather than a second face, but this
 * one is the one on screen.
 */
const FACE = readFileSync(
  join(ROOT, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'),
).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<meta charset="utf-8"><style>@font-face{font-family:HGFACE;` +
    `src:url(data:font/woff2;base64,${FACE}) format('woff2');font-weight:100 900}</style>` +
    `<div style="font:500 40px HGFACE">${items.join('')}</div>`,
);
await page.evaluate(async (text) => {
  await document.fonts.load(`500 40px HGFACE`, text);
  await document.fonts.ready;
}, items.join(''));

/*
  Prove it is loaded before anything is measured. `HGFACE` is defined only by
  the @font-face above, so a pass here cannot be another face standing in.
*/
if (!(await page.evaluate((t) => document.fonts.check('500 40px HGFACE', t), items.join('')))) {
  await browser.close();
  console.error('The practice face did not load; every measurement would be of a fallback.');
  process.exit(1);
}

const results = await page.evaluate(
  async ({ glyphs, R, EXTENT, composition, TOLERANCE, jamoStrokes }) => {
    await document.fonts.ready;
    const ctxOf = () => new OffscreenCanvas(R, R).getContext('2d', { willReadFrequently: true });
    const boxOf = (ctx) => {
      const { data } = ctx.getImageData(0, 0, R, R);
      let x0 = R, y0 = R, x1 = -1, y1 = -1;
      for (let i = 0; i < R * R; i += 1) {
        if (data[i * 4 + 3] > 96) {
          const x = i % R, y = (i - x) / R;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return x1 < 0 ? null : { x0, y0, x1, y1 };
    };
    const maskOf = (ctx) => {
      const { data } = ctx.getImageData(0, 0, R, R);
      const m = new Uint8Array(R * R);
      for (let i = 0; i < R * R; i += 1) m[i] = data[i * 4 + 3] > 96 ? 1 : 0;
      return m;
    };

    const out = [];
    for (const g of glyphs) {
      // --- the guide, drawn the way the app draws it -------------------------
      const rc = ctxOf();
      const paintRef = (size, cx, cy) => {
        rc.clearRect(0, 0, R, R);
        rc.font = `500 ${size}px HGFACE`;
        rc.textAlign = 'center';
        rc.textBaseline = 'middle';
        rc.fillStyle = '#000';
        rc.fillText(g.character, cx, cy);
      };
      if (false) {
        // Stroked from the authored centrelines, exactly as `paint` does when a
        // spec carries them. Identical to the demonstration by construction.
        const paintHand = (fontSize, cx, cy) => {
          rc.clearRect(0, 0, R, R);
          const scale = fontSize / 100;
          rc.save();
          rc.translate(cx - (scale * 100) / 2, cy - (scale * 100) / 2);
          rc.scale(scale, scale);
          rc.lineWidth = g.pen;
          rc.lineCap = 'butt';
          rc.lineJoin = 'miter';
          rc.miterLimit = 3;
          rc.strokeStyle = '#000';
          for (const d of g.paths) rc.stroke(new Path2D(d));
          rc.restore();
        };
        paintHand(R * 0.78, R / 2, R / 2);
        const hb = boxOf(rc);
        const hk = (EXTENT * R) / (Math.max(hb.x1 - hb.x0, hb.y1 - hb.y0) + 1);
        paintHand(
          R * 0.78 * hk,
          R / 2 - hk * ((hb.x0 + hb.x1 + 1) / 2 - R / 2),
          R / 2 - hk * ((hb.y0 + hb.y1 + 1) / 2 - R / 2),
        );
      } else {
        paintRef(R * 0.78, R / 2, R / 2);
        const b0 = boxOf(rc);
        if (!b0) { out.push({ character: g.character, error: 'the face drew nothing' }); continue; }
        const k0 = (EXTENT * R) / (Math.max(b0.x1 - b0.x0, b0.y1 - b0.y0) + 1);
        paintRef(
          R * 0.78 * k0,
          R / 2 - k0 * ((b0.x0 + b0.x1 + 1) / 2 - R / 2),
          R / 2 - k0 * ((b0.y0 + b0.y1 + 1) / 2 - R / 2),
        );
      }
      let b = boxOf(rc);
      if (!b) { out.push({ character: g.character, error: 'the guide drew nothing' }); continue; }
      const refMask = maskOf(rc);
      const refBox = boxOf(rc);

      // --- the demonstration: the authored vector, fitted the same way ------
      const vc = ctxOf();
      const paths = g.paths.map((d) => new Path2D(d));
      const paintVec = (scale, dx, dy, only) => {
        vc.clearRect(0, 0, R, R);
        vc.save();
        vc.translate(dx, dy);
        vc.scale(scale, scale);
        vc.lineWidth = g.pen;
        vc.lineCap = 'butt';
        vc.lineJoin = 'miter';
        vc.miterLimit = 3;
        vc.strokeStyle = '#000';
        (only === undefined ? paths : only.map((i) => paths[i])).forEach((p) => vc.stroke(p));
        vc.restore();
      };
      paintVec(R / 100, 0, 0);
      b = boxOf(vc);
      const vk = (EXTENT * R) / (Math.max(b.x1 - b.x0, b.y1 - b.y0) + 1);
      const dx = R / 2 - vk * ((b.x0 + b.x1 + 1) / 2);
      const dy = R / 2 - vk * ((b.y0 + b.y1 + 1) / 2);
      paintVec((R / 100) * vk, dx, dy);
      const vecMask = maskOf(vc);
      const vecBox = boxOf(vc);

      /*
        Chamfer distance transform: for every pixel, how far to the nearest ink.
        Two passes over the raster rather than a search per pixel, which is the
        difference between this running in a second and running in a minute.
      */
      const distanceTo = (mask) => {
        const BIG = 1e6;
        const d = new Float32Array(R * R);
        for (let i = 0; i < d.length; i += 1) d[i] = mask[i] ? 0 : BIG;
        const D1 = 1, D2 = Math.SQRT2;
        for (let y = 0; y < R; y += 1) {
          for (let x = 0; x < R; x += 1) {
            const i = y * R + x;
            if (y > 0) {
              if (d[i - R] + D1 < d[i]) d[i] = d[i - R] + D1;
              if (x > 0 && d[i - R - 1] + D2 < d[i]) d[i] = d[i - R - 1] + D2;
              if (x + 1 < R && d[i - R + 1] + D2 < d[i]) d[i] = d[i - R + 1] + D2;
            }
            if (x > 0 && d[i - 1] + D1 < d[i]) d[i] = d[i - 1] + D1;
          }
        }
        for (let y = R - 1; y >= 0; y -= 1) {
          for (let x = R - 1; x >= 0; x -= 1) {
            const i = y * R + x;
            if (y + 1 < R) {
              if (d[i + R] + D1 < d[i]) d[i] = d[i + R] + D1;
              if (x + 1 < R && d[i + R + 1] + D2 < d[i]) d[i] = d[i + R + 1] + D2;
              if (x > 0 && d[i + R - 1] + D2 < d[i]) d[i] = d[i + R - 1] + D2;
            }
            if (x + 1 < R && d[i + 1] + D1 < d[i]) d[i] = d[i + 1] + D1;
          }
        }
        return d;
      };
      const dRef = distanceTo(refMask);
      const dVec = distanceTo(vecMask);
      let refInk = 0, refNear = 0, vecInk = 0, vecNear = 0;
      for (let i = 0; i < refMask.length; i += 1) {
        if (refMask[i]) { refInk += 1; if (dVec[i] <= TOLERANCE) refNear += 1; }
        if (vecMask[i]) { vecInk += 1; if (dRef[i] <= TOLERANCE) vecNear += 1; }
      }
      const guideExplained = refNear / refInk;
      const demoExplained = vecNear / vecInk;

      // --- each jamo, against the region the face puts it in ----------------
      const parts = composition[g.character]?.parts ?? null;
      const counts = jamoStrokes[g.character];
      const components = [];
      if (parts && counts && counts.length === parts.length) {
        const W = vecBox.x1 - vecBox.x0 + 1, H = vecBox.y1 - vecBox.y0 + 1;
        /*
          Strokes belong to the jamo that wrote them, which the composer already
          knows — grouping them by whichever measured region their centre landed
          nearest was a guess, and it guessed wrong on exactly the letters that
          matter: 고's ㅗ has a stem that descends into the ㄱ's region, so the
          stem was filed under the consonant and both components then read as
          badly misplaced when neither was.
        */
        const groups = [];
        let at = 0;
        for (const n of counts) { groups.push(Array.from({ length: n }, (_, i) => at + i)); at += n; }
        parts.forEach((p, j) => {
          if (!groups[j].length) { components.push({ part: j, missing: true }); return; }
          paintVec((R / 100) * vk, dx, dy, groups[j]);
          const gb = boxOf(vc);
          const n = [
            (gb.x0 - vecBox.x0) / W, (gb.y0 - vecBox.y0) / H,
            (gb.x1 + 1 - vecBox.x0) / W, (gb.y1 + 1 - vecBox.y0) / H,
          ];
          components.push({
            part: j,
            drift: Math.max(...n.map((v, i2) => Math.abs(v - p[i2]))),
            vector: n.map((v) => +v.toFixed(3)),
            face: p,
          });
        });
        paintVec((R / 100) * vk, dx, dy);
      }

      // --- the picture, for a person -----------------------------------------
      const sheet = new OffscreenCanvas(R * 3, R);
      const sx = sheet.getContext('2d');
      sx.fillStyle = '#fff';
      sx.fillRect(0, 0, R * 3, R);
      const put = (mask, colour, ox) => {
        const img = sx.createImageData(R, R);
        for (let i = 0; i < mask.length; i += 1) {
          if (mask[i]) {
            img.data[i * 4] = colour[0]; img.data[i * 4 + 1] = colour[1];
            img.data[i * 4 + 2] = colour[2]; img.data[i * 4 + 3] = colour[3];
          }
        }
        const t = new OffscreenCanvas(R, R);
        t.getContext('2d').putImageData(img, 0, 0);
        sx.drawImage(t, ox, 0);
      };
      put(refMask, [17, 17, 17, 255], 0);
      put(vecMask, [17, 17, 17, 255], R);
      put(refMask, [190, 185, 175, 255], R * 2);
      put(vecMask, [194, 65, 12, 190], R * 2);
      const blob = await sheet.convertToBlob();
      const url = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(blob);
      });

      out.push({
        character: g.character,
        handwritten: g.handwritten,
        refBox, vecBox,
        guideExplained,
        demoExplained,
        score: Math.min(guideExplained, demoExplained),
        components,
        image: url,
      });
    }
    return out;
  },
  { glyphs, R, EXTENT, composition, TOLERANCE: TOLERANCE_PX, jamoStrokes },
);

await browser.close();

// --- Report ---------------------------------------------------------------

const problems = [];
const componentDeviations = [];
for (const r of results) {
  if (r.error) { problems.push(`${r.character}: ${r.error}`); continue; }
  if (r.handwritten) continue;
  if (r.score < MIN_EXPLAINED) {
    const which = r.guideExplained < r.demoExplained
      ? `${((1 - r.guideExplained) * 100).toFixed(0)}% of the tracing guide's ink has nothing near it in the demonstration`
      : `${((1 - r.demoExplained) * 100).toFixed(0)}% of the demonstration's ink has nothing near it in the guide`;
    problems.push(`${r.character}: ${which} — they are teaching different shapes`);
  }
  for (const c of r.components ?? []) {
    if (c.missing) { problems.push(`${r.character}: nothing is drawn in the face's region ${c.part}`); continue; }
    if (c.drift <= MAX_COMPONENT_DRIFT) continue;
    /*
      A component may be placed away from the face on purpose, and if it is, the
      reason is written down against that block and that component — never
      against a class of letters. See `CANONICAL_COMPONENT_DEVIATIONS`.
    */
    const declared = CANONICAL_COMPONENT_DEVIATIONS.get(`${r.character}:${c.part}`);
    if (declared) {
      componentDeviations.push(
        `${r.character} jamo ${c.part} — ${(c.drift * 100).toFixed(0)}% from the face: ${declared}`,
      );
      continue;
    }
    problems.push(
      `${r.character}: jamo ${c.part} sits ${(c.drift * 100).toFixed(0)}% of the glyph from ` +
        `where the face puts it — vector ${JSON.stringify(c.vector)}, face ${JSON.stringify(c.face)}`,
    );
  }
}

/*
  The declared deviations are scored and printed like everything else; what they
  are exempt from is failing. See `CANONICAL_DEVIATIONS` for each one's reason.
*/
const deferred = results.filter((r) => !r.error && r.handwritten);
const scored = results
  .filter((r) => !r.error && !r.handwritten)
  .sort((a, b) => a.score - b.score);
console.log(
  `Glyph shape — ${results.length} taught items, ${scored.length} scored: ` +
    'canonical geometry against the face\n',
);
console.log('  worst ten, by the less well explained of the two directions:');
console.log('    item   face explained   canonical explained   worst jamo drift');
for (const r of scored.slice(0, 10)) {
  const worst = Math.max(0, ...(r.components ?? []).filter((c) => !c.missing).map((c) => c.drift));
  const dim = (b) => `${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}`;
  console.log(
    `    ${r.character}          ${(r.guideExplained * 100).toFixed(0)}%              ` +
      `${(r.demoExplained * 100).toFixed(0)}%             ${(worst * 100).toFixed(0)}%` +
      `      face ${dim(r.refBox)}  canonical ${dim(r.vecBox)}`,
  );
}
const mean = scored.reduce((n, r) => n + r.score, 0) / scored.length;
console.log(
  `\n  mean ${(mean * 100).toFixed(1)}%, floor ${(MIN_EXPLAINED * 100).toFixed(0)}%, ` +
    `tolerance ${TOLERANCE_PX}px of a ${R}px raster`,
);
console.log(
  `  ${deferred.length} declared deviations, reported not failed — ${deferred
    .map((r) => r.character)
    .join(' ')} depart from the face on purpose` +
    ' — see CANONICAL_DEVIATIONS for each reason',
);
if (componentDeviations.length > 0) {
  console.log(
    `  ${componentDeviations.length} declared component deviation` +
      `${componentDeviations.length === 1 ? '' : 's'}, reported not failed:`,
  );
  for (const line of componentDeviations) console.log(`    ${line}`);
}

if (!CHECK) {
  mkdirSync(OUT, { recursive: true });
  const rows = results
    .map((r) => r.error
      ? `<div class="r"><b>${r.character}</b> ${r.error}</div>`
      : `<div class="r"><span class="n">${r.character} — face ${(r.guideExplained * 100).toFixed(0)}% explained, canonical ${(r.demoExplained * 100).toFixed(0)}%</span><img src="${r.image}"></div>`)
    .join('');
  writeFileSync(join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Glyph shape</title><style>
      body{font:13px system-ui;margin:16px;background:#fff}
      .r{margin-bottom:6px}.n{display:block;color:#666;margin-bottom:2px}
      img{display:block;border:1px solid #eee}
      </style><h1>Face · canonical geometry · overlaid</h1>${rows}`);
  console.log(`\n  sheet: ${join(OUT, 'index.html')}`);
  console.log('  numbers cannot tell you whether it looks like the letter. Look at them.');
}

console.log('  0 stated exceptions.');

if (problems.length === 0) {
  console.log('\nevery undeclared item matches the face; the guide, the mask and the demonstration are one geometry.');
} else {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ${p}`);
}
if (CHECK && problems.length > 0) process.exit(1);
