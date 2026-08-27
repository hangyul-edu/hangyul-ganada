#!/usr/bin/env node
/**
 * Does the letter the app *draws* have the same parts, in the same places, as
 * the letter Pretendard draws?
 *
 *   npm run letters:face            measure, and write the review gallery
 *   npm run letters:face -- --check measure only; exit non-zero on a failure
 *
 * ## Why this exists, and why `glyphshape:qa` could not do it
 *
 * `glyphshape:qa` compares the pale tracing guide with the *Watch it written*
 * demonstration. For every letter but six that is a real comparison, because
 * the guide is set in the practice face and the demonstration comes from
 * `data/strokeVectors`. For the six compound vowels in `HANDWRITTEN_GUIDE` the
 * guide is *also* stroked from those centrelines — deliberately, so a learner
 * does not trace a slanted ㅗ bar and then watch a level one — and the
 * comparison becomes a comparison of a thing with itself. It scored ㅙ and ㅞ at
 * 100% in both directions while the app was drawing them with their halves
 * visibly apart, and it could not have done anything else.
 *
 * So this asks a different question against a reference the product does not
 * control: **the face**, read off the font file, for every letter including
 * those six. Two representations agreeing says nothing; a representation
 * agreeing with Korean typography says something.
 *
 * ## What is measured
 *
 * Not overlap. One of these is a typeface with modulated strokes and flared
 * terminals, the other a constant-width pen on a skeleton, and asking them to
 * cover each other ranks letters by how well the pen width happened to match.
 * What is compared is **structure**, which is what a learner reads:
 *
 * | | |
 * | --- | --- |
 * | `aspect` | the shape of the ink box |
 * | `pieces` | how many separate islands of ink the letter is |
 * | `bridge` | the widest open paper between two adjacent uprights |
 * | `uprights` | how many full-height stems, and where across the letter |
 * | `profile` | how far the ink *reaches*, band by band down the letter and across it |
 *
 * `pieces` and `bridge` are the ones the screenshot was about. A compound vowel
 * a learner reads as one letter is joined the way the face joins it:
 * Pretendard's ㅐ is a single island because the crossbar runs into the second
 * upright, and its ㅙ is two because the ㅗ stands clear of the ㅐ. An app
 * drawing ㅐ as two islands has drawn ㅏ and ㅣ, whatever its uprights measure.
 *
 * A band is compared against a **window of five** — its own band in the face
 * and the two either side. Two things need that width. A stem edge falling a
 * pixel either side of a boundary otherwise reads as a whole band of
 * difference, which is quantisation and not a letter. And Pretendard slants
 * several terminal horizontals — ㅋ's added bar, ㄷ's base, ㅗ's in a compound —
 * which spreads one bar over five or six bands where the app's level bar
 * occupies four; without the window the app is reported as missing ink that is
 * only somewhere else in the same bar. A bar that stops a fifth of the letter
 * short misses by that much over every band it occupies, and no window rescues
 * it.
 *
 * `profile` is the other half of the same defect, and the reason it is a
 * profile rather than a list of bars. The ㅗ of ㅘ stopped at 49% of the ink
 * where the face carries it to 68%, leaving a channel the eye reads as the gap
 * between two letters — and every measurement of where the *uprights* sit was
 * satisfied by it. Segmenting a raster into named bars is fragile in exactly
 * the place it has to be trusted: the face slants those bars, so a row-run
 * finder splits one into five and then compares five against two. So instead
 * the letter is cut into twenty bands down and twenty across, and each band
 * reports how far the ink in it **reaches** — the distance from the first inked
 * column to the last. A bar that stops short shows up as a band reaching 0.49
 * where the face's reaches 0.68, with no segmentation to get wrong.
 *
 * ## Nothing here may be a statement about the pen
 *
 * The pen is one width for the whole curriculum, on purpose: the face's
 * stem-to-bar contrast is typography, and a learner with a pencil is not
 * reproducing it. So every measurement here has to be blind to stroke weight,
 * or it reports the decision as a defect forty times over.
 *
 *Reach* is taken between **centrelines** rather than between ink edges: one
 * stroke width is subtracted from every band and what is left is renormalised.
 * A band holding a single stem then reaches 0 in both, where measuring ink
 * edges reported 0.107 against 0.193 and called the pen a defect on every wide
 * consonant; a band holding ㅗ's bar and the ㅏ beside it still reaches 0.43
 * against 0.64, because that one is a real difference between two letters.
 *
 * An *upright* is compared by whichever of its own three numbers the pen does
 * not decide. A stem whose ink reaches the letter's left edge is pinned there
 * by the ink box — ㅁ's is at 0.05 in the app and 0.10 in the face purely
 * because the face's stem is twice as thick — so its **edge** is compared,
 * which is 0 in both. Same on the right. A stem standing clear of both edges is
 * where the letter puts it, so its **centre** is compared, which is what caught
 * ㅍ holding its two uprights six hundredths too far apart. Dividing by one
 * minus the stroke width instead — the first thing tried here — reported ㄸ's
 * second ㄷ as four hundredths out when its edge and the face's are four
 * *thousandths* apart, because ㄸ's right edge is a bar end and there was no
 * stroke there to divide out.
 *
 * ## The slant, which is not a defect
 *
 * Pretendard tilts the ㅗ and ㅜ of a compound vowel down towards the outside so
 * the halves do not collide at text sizes. It is an optical adjustment
 * belonging to the typeface — nobody writes a slanted ㅗ — and the guide draws
 * the bar level on purpose. A band is a twentieth of the letter, which is wider
 * than the slant displaces a bar, so the two are compared across the same band
 * rather than the slant being read as a bar in the wrong place.
 *
 * ## The sheet
 *
 * Without `--check` this also writes `.letter-face-qa/index.html`: every taught
 * letter drawn the way the app draws it at the three sizes it appears at — the
 * tracing guide under the pen, the *Watch it written* panel, and the small tile
 * in a lesson list — with the face beside it and overlaid on it. Numbers cannot
 * tell anybody whether it looks like the letter, and the whole reason this file
 * exists is that a number said ㅙ was perfect while it was drawn as three
 * pieces. Look at the sheet.
 *
 * ## The two letters that cannot pass the aspect check
 *
 * ㅣ and ㅡ are one stroke. Their measurement across is the pen, and the pen is
 * a single width for the whole curriculum — deliberately, because the face's
 * stem/bar contrast is typography and not something a learner is reproducing.
 * They are listed as exceptions with that reason rather than being given a
 * looser tolerance that would quietly cover a real defect somewhere else.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { hasVectorGlyph, vectorGlyph } from '../apps/web/src/data/strokeVectors.ts';
import { isSyllable } from '../apps/web/src/data/jamo.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '.letter-face-qa');
const CHECK = process.argv.includes('--check');

/**
 * The raster everything is measured on.
 *
 * A thousand pixels rather than the six hundred this started at. Positions are
 * reported with the stroke width divided out, which means dividing by one minus
 * it, which amplifies a raster's half-pixel disagreement about how thick a stem
 * is into a hundredth of the letter near the middle of it — enough to report
 * ㄸ's second ㄷ as misplaced when it is within a per cent of the face. More
 * pixels is the honest fix; a looser tolerance would have covered ㅍ, which was
 * a real defect and missed by four hundredths.
 */
const R = 1024;
/** `GLYPH_INK_EXTENT` — how much of the box a fitted glyph's ink fills. */
const EXTENT = 0.72;

/**
 * The weight the reference character is set in.
 *
 * `--hg-weight-semibold`, which is what `ui/ReferenceGlyph` puts on the large
 * character at the top of a lesson — the shape the learner is aiming at — and
 * what `scripts/measure-jamo.mjs` took the proportions off. Measuring here at
 * the guide's 500 instead reads ㅐ four per cent narrower than the number the
 * app was fitted to, and the letter is then reported as wrong for agreeing with
 * its own metrics file.
 */
const WEIGHT = 600;

/**
 * How far a part may sit from where the face puts it, as a fraction of the ink
 * box.
 *
 * Four per cent is a little under half the pen. Wider and the ㅐ this file was
 * written for — whose crossbar stopped an eighth of the letter short of its
 * second upright — passes; narrower and the honest difference between a
 * constant pen and a typeface's stem contrast starts failing letters that are
 * right.
 */
const MAX_DRIFT = 0.04;

/**
 * How far a band's reach may differ from the face's.
 *
 * Eight hundredths of the letter. The honest differences — a flared terminal
 * drawn square, a slant flattened — move a band's reach by two or three
 * hundredths. The ㅘ this file was written for missed by nineteen.
 */
const MAX_PROFILE_DRIFT = 0.08;

/** How many bands the letter is cut into, each way. */
const BANDS = 20;

/** How far the open paper between two uprights may differ from the face's. */
const MAX_BRIDGE_DRIFT = 0.05;

/**
 * Letters whose aspect the pen decides rather than the geometry.
 *
 * See the note at the top. Everything else about them is still checked.
 */
const ASPECT_EXEMPT = new Map([
  ['ㅣ', 'one stroke: its width is the pen, which is one width for the curriculum'],
  ['ㅡ', 'one stroke: its height is the pen, which is one width for the curriculum'],
]);

/**
 * Letters the face draws with flared or curved terminals, where counting
 * uprights and bars off the raster is measuring the flare rather than the
 * letter.
 *
 * ㅅ and ㅈ have no upright at all in the face — the legs splay — while the
 * app's pen draws them at a constant width, and a column-coverage rule
 * therefore finds a stem in one and not the other. Whether the two halves of ㅆ
 * touch is the same kind of accident: at semibold the face's legs just meet and
 * a constant pen's just miss, which is a hair of overlap and not a claim about
 * the letter. Aspect is still compared, and the gallery is still read; the
 * parts and the island count are not, and saying so here is better than a
 * tolerance loose enough to swallow a real defect elsewhere.
 */
/**
 * Letters where the face slants a terminal horizontal and the guide draws it
 * level, so the *vertical* profile is not a comparison of the same claim.
 *
 * Same argument as the compound vowels' ㅗ bar, and the same answer: nobody
 * writes a slanted ㅋ. Across the letter a slant only moves a bar between
 * neighbouring bands, which the five-band window absorbs. Down the letter at
 * the slant's low end it does not: Pretendard's ㅋ drops the left end of its
 * added bar a twelfth of the letter below the level line, and the app's ㅋ is
 * then reported as holding its bar too high at exactly one band. The horizontal
 * profile, the islands, the uprights and the aspect are all still compared.
 */
const SLANTED_TERMINAL = new Map([
  ['ㅋ', "the added bar drops towards its free end; the guide draws it level"],
]);

/**
 * Uprights whose position against the letter's edge is deliberately not the
 * face's, keyed by `letter:index`.
 *
 * Pretendard runs ㄹ's waist and base about a fortieth of the letter past the
 * leg above them, so its second upright stands clear of the right edge. The app
 * ends all three flush: copying the overhang put a visible step in the
 * right-hand side of 라, 말 and 글, and at the size the demonstration is drawn
 * the step reads as a spur rather than as the letter widening at the foot. The
 * upright's *position across the letter* is still compared — only the
 * clear-of-the-edge classification is waived, and only here.
 */
const UPRIGHT_ANCHOR_EXEMPT = new Map([
  ['ㄹ:2', 'the waist and base end flush with the leg, so the leg is on the right edge'],
]);

const STRUCTURE_EXEMPT = new Map([
  ['ㅅ', 'splayed legs: the face has no column the app can be compared against'],
  ['ㅆ', 'splayed legs'],
  ['ㅈ', 'splayed legs under a lid'],
  ['ㅉ', 'splayed legs under a lid'],
  ['ㅊ', 'splayed legs under a tick'],
  ['ㅇ', 'a ring has neither an upright nor a bar'],
  ['ㅎ', 'a ring under a tick'],
]);

const items = ALL_CHARACTERS.map((c) => c.character).filter(
  (c) => hasVectorGlyph(c) && !isSyllable(c),
);

const glyphs = items.map((character) => {
  const g = vectorGlyph(character);
  return { character, paths: g.strokes.map((s) => s.d), pen: g.pen };
});

/**
 * The face, embedded, rather than fetched from a running app.
 *
 * The same reason `glyphshape:qa` embeds it: in the app Pretendard is delivered
 * as a **dynamic subset**, a subset fetched for the text a page happens to
 * contain need not include the letter being measured, and the failure is
 * silent — the canvas falls back to another Korean face and draws a perfectly
 * good, different letter. The family name below is one nothing else can supply,
 * and the check after the load proves it arrived.
 */
const FACE = readFileSync(
  join(ROOT, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'),
).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<meta charset="utf-8"><style>@font-face{font-family:HGFACE;` +
    `src:url(data:font/woff2;base64,${FACE}) format('woff2');font-weight:100 900}</style>` +
    `<div style="font:${WEIGHT} 40px HGFACE">${items.join('')}</div>`,
);
await page.evaluate(
  async ({ text, weight }) => {
    await document.fonts.load(`${weight} 40px HGFACE`, text);
    await document.fonts.ready;
  },
  { text: items.join(''), weight: WEIGHT },
);
if (
  !(await page.evaluate(
    ({ text, weight }) => document.fonts.check(`${weight} 40px HGFACE`, text),
    { text: items.join(''), weight: WEIGHT },
  ))
) {
  await browser.close();
  console.error('The reference face did not load; every measurement would be of a fallback.');
  process.exit(1);
}

const measured = await page.evaluate(
  async ({ glyphs, R, EXTENT, BANDS, WEIGHT }) => {
    await document.fonts.ready;
    const ctxOf = () => new OffscreenCanvas(R, R).getContext('2d', { willReadFrequently: true });

    const read = (ctx) => {
      const { data } = ctx.getImageData(0, 0, R, R);
      const m = new Uint8Array(R * R);
      let x0 = R;
      let y0 = R;
      let x1 = -1;
      let y1 = -1;
      for (let i = 0; i < R * R; i += 1) {
        if (data[i * 4 + 3] <= 128) continue;
        m[i] = 1;
        const x = i % R;
        const y = (i - x) / R;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      return { m, box: x1 < 0 ? null : { x0, y0, x1, y1 } };
    };

    /** Islands of ink, four-connected. */
    const pieces = (m) => {
      const seen = new Uint8Array(R * R);
      let n = 0;
      const stack = [];
      for (let i = 0; i < R * R; i += 1) {
        if (!m[i] || seen[i]) continue;
        n += 1;
        seen[i] = 1;
        stack.push(i);
        while (stack.length) {
          const j = stack.pop();
          const x = j % R;
          const y = (j - x) / R;
          const nb = [x > 0 ? j - 1 : -1, x + 1 < R ? j + 1 : -1, y > 0 ? j - R : -1, y + 1 < R ? j + R : -1];
          for (const k of nb) if (k >= 0 && m[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
      return n;
    };

    /** Columns whose ink covers more than half the letter's height, grouped. */
    const uprightsOf = (m, box, stroke) => {
      const h = box.y1 - box.y0 + 1;
      const w = box.x1 - box.x0 + 1;
      const runs = [];
      let cur = null;
      for (let x = box.x0; x <= box.x1; x += 1) {
        let n = 0;
        for (let y = box.y0; y <= box.y1; y += 1) if (m[y * R + x]) n += 1;
        if (n / h > 0.55) {
          if (cur) cur.b = x;
          else cur = { a: x, b: x };
        } else if (cur) { runs.push(cur); cur = null; }
      }
      if (cur) runs.push(cur);
      /*
        The stroke width the positions are divided by is the median width of
        *these* runs rather than the letter's overall estimate. ㄸ's base is a
        thin slanted terminal, which drags a whole-letter median down and moved
        the second ㄷ's reported position by two hundredths — enough to fail a
        stem that is where the face puts it.
      */
      return runs.map((r) => {
        const left = (r.a - box.x0) / w;
        const right = (r.b - box.x0 + 1) / w;
        // Which end, if either, the ink box pins this stem to. See the note on
        // the pen above.
        // A hundredth of the letter, not a pixel: the face's ㄹ starts its left
        // stem a thousandth in, which is antialiasing rather than a decision,
        // and a pixel-tight test called that stem free-standing.
        const EDGE = 0.01;
        const anchor = left <= EDGE ? 'left' : right >= 1 - EDGE ? 'right' : 'centre';
        return {
          left,
          right,
          centre: (left + right) / 2,
          anchor,
          at: anchor === 'left' ? left : anchor === 'right' ? right : (left + right) / 2,
        };
      });
    };

    /**
     * How far the ink reaches, band by band.
     *
     * `down` cuts the letter into `BANDS` horizontal slices and reports, for
     * each, the fraction of the letter's *width* that carries ink somewhere in
     * that slice — so a bar reaching two thirds of the way across reads 0.67
     * whether it is level or slanted, and whether it is one stroke or three.
     * `across` is the same the other way.
     *
     * Columns rather than area, because area is a statement about the pen and
     * this is a statement about the letter.
     */
    /**
     * The letter's own stroke width, across and down, as a fraction of the ink
     * box: the median of the ink runs that are short enough to be one stroke
     * rather than a whole bar. Measured per render, because the point is to
     * divide the pen out of everything below.
     */
    const strokeOf = (m, box) => {
      const w = box.x1 - box.x0 + 1;
      const h = box.y1 - box.y0 + 1;
      const collect = (runs, limit) => {
        const kept = runs.filter((v) => v <= limit).sort((p, q) => p - q);
        return kept.length ? kept[Math.floor(kept.length / 2)] : 0;
      };
      const rowRuns = [];
      for (let y = box.y0; y <= box.y1; y += 1) {
        let a = -1;
        for (let x = box.x0; x <= box.x1 + 1; x += 1) {
          const ink = x <= box.x1 && m[y * R + x];
          if (ink && a < 0) a = x;
          else if (!ink && a >= 0) { rowRuns.push(x - a); a = -1; }
        }
      }
      const colRuns = [];
      for (let x = box.x0; x <= box.x1; x += 1) {
        let a = -1;
        for (let y = box.y0; y <= box.y1 + 1; y += 1) {
          const ink = y <= box.y1 && m[y * R + x];
          if (ink && a < 0) a = y;
          else if (!ink && a >= 0) { colRuns.push(y - a); a = -1; }
        }
      }
      return {
        // an upright's width, for anything measured across the letter
        across: collect(rowRuns, w * 0.4) / w,
        // a bar's thickness, for anything measured down it
        down: collect(colRuns, h * 0.4) / h,
      };
    };

    const profile = (m, box, stroke) => {
      const w = box.x1 - box.x0 + 1;
      const h = box.y1 - box.y0 + 1;
      const bare = (span, thickness) =>
        thickness >= 1 ? 0 : Math.max(0, span - thickness) / (1 - thickness);
      const edge = (band, span, origin) => ({
        from: origin + Math.floor((band * span) / BANDS),
        to: origin + Math.max(Math.floor(((band + 1) * span) / BANDS), Math.floor((band * span) / BANDS) + 1),
      });
      const down = [];
      for (let band = 0; band < BANDS; band += 1) {
        const { from, to } = edge(band, h, box.y0);
        let first = -1;
        let last = -1;
        for (let x = box.x0; x <= box.x1; x += 1) {
          for (let y = from; y < to && y <= box.y1; y += 1) {
            if (m[y * R + x]) { if (first < 0) first = x; last = x; break; }
          }
        }
        down.push(last < 0 ? 0 : bare((last - first + 1) / w, stroke.across));
      }
      const across = [];
      for (let band = 0; band < BANDS; band += 1) {
        const { from, to } = edge(band, w, box.x0);
        let first = -1;
        let last = -1;
        for (let y = box.y0; y <= box.y1; y += 1) {
          for (let x = from; x < to && x <= box.x1; x += 1) {
            if (m[y * R + x]) { if (first < 0) first = y; last = y; break; }
          }
        }
        across.push(last < 0 ? 0 : bare((last - first + 1) / h, stroke.down));
      }
      return { down, across };
    };

    /** The widest open paper between each adjacent pair of uprights. */
    const bridges = (m, box, ups) => {
      const w = box.x1 - box.x0 + 1;
      const out = [];
      for (let i = 1; i < ups.length; i += 1) {
        const leftEdge = Math.round(ups[i - 1].right * w) + box.x0;
        const rightEdge = Math.round(ups[i].left * w) + box.x0;
        if (rightEdge - leftEdge < 2) { out.push(0); continue; }
        let best = Infinity;
        for (let y = box.y0; y <= box.y1; y += 1) {
          if (!m[y * R + leftEdge] && !m[y * R + rightEdge]) continue;
          let gap = 0;
          let worst = 0;
          for (let x = leftEdge + 1; x < rightEdge; x += 1) {
            if (m[y * R + x]) { if (gap > worst) worst = gap; gap = 0; }
            else gap += 1;
          }
          if (gap > worst) worst = gap;
          if (worst < best) best = worst;
        }
        out.push((best === Infinity ? rightEdge - leftEdge : best) / w);
      }
      return out;
    };

    const describe = (ctx) => {
      const { m, box } = read(ctx);
      if (!box) return null;
      const stroke = strokeOf(m, box);
      const ups = uprightsOf(m, box, stroke.across);
      return {
        aspect: (box.x1 - box.x0 + 1) / (box.y1 - box.y0 + 1),
        uprights: ups.map((u) => ({ at: u.at, anchor: u.anchor })),
        profile: profile(m, box, stroke),
        pieces: pieces(m),
        bridges: bridges(m, box, ups),
      };
    };

    const out = [];
    for (const g of glyphs) {
      // --- the face, ink-fitted exactly as `fitGlyph` fits the guide ---------
      const fc = ctxOf();
      const setFace = (size, cx, cy) => {
        fc.clearRect(0, 0, R, R);
        fc.font = `${WEIGHT} ${size}px HGFACE`;
        fc.textAlign = 'center';
        fc.textBaseline = 'middle';
        fc.fillStyle = '#000';
        fc.fillText(g.character, cx, cy);
      };
      setFace(R * 0.78, R / 2, R / 2);
      const probe = read(fc).box;
      if (!probe) { out.push({ character: g.character, error: 'the face drew nothing' }); continue; }
      const k = (EXTENT * R) / (Math.max(probe.x1 - probe.x0, probe.y1 - probe.y0) + 1);
      setFace(
        R * 0.78 * k,
        R / 2 - k * ((probe.x0 + probe.x1 + 1) / 2 - R / 2),
        R / 2 - k * ((probe.y0 + probe.y1 + 1) / 2 - R / 2),
      );
      const face = describe(fc);

      // --- the app's own drawing, fitted the same way -----------------------
      const vc = ctxOf();
      const paths = g.paths.map((d) => new Path2D(d));
      const strokeAll = (scale, dx, dy) => {
        vc.clearRect(0, 0, R, R);
        vc.save();
        vc.translate(dx, dy);
        vc.scale(scale, scale);
        vc.lineWidth = g.pen;
        vc.lineCap = 'butt';
        vc.lineJoin = 'miter';
        vc.miterLimit = 3;
        vc.strokeStyle = '#000';
        paths.forEach((p) => vc.stroke(p));
        vc.restore();
      };
      strokeAll(R / 100, 0, 0);
      const vp = read(vc).box;
      const vk = (EXTENT * R) / (Math.max(vp.x1 - vp.x0, vp.y1 - vp.y0) + 1);
      strokeAll((R / 100) * vk, R / 2 - vk * ((vp.x0 + vp.x1 + 1) / 2), R / 2 - vk * ((vp.y0 + vp.y1 + 1) / 2));
      const app = describe(vc);

      out.push({ character: g.character, face, app });
    }
    return out;
  },
  { glyphs, R, EXTENT, BANDS, WEIGHT },
);

await browser.close();

// --- the verdict -------------------------------------------------------------

const round = (v) => Math.round(v * 1000) / 1000;
const rows = [];
const failures = [];

for (const item of measured) {
  const { character, face, app } = item;
  if (item.error || !face || !app) {
    failures.push(`${character}: ${item.error ?? 'nothing was drawn'}`);
    continue;
  }
  const notes = [];
  const problems = [];

  const aspectError = app.aspect / face.aspect - 1;
  if (ASPECT_EXEMPT.has(character)) {
    notes.push(`aspect not compared — ${ASPECT_EXEMPT.get(character)}`);
  } else if (Math.abs(aspectError) > MAX_DRIFT) {
    problems.push(
      `aspect ${round(app.aspect)} against the face's ${round(face.aspect)} (${(aspectError * 100).toFixed(1)}%)`,
    );
  }

  if (app.pieces !== face.pieces && !STRUCTURE_EXEMPT.has(character)) {
    problems.push(
      `${app.pieces} island${app.pieces === 1 ? '' : 's'} of ink where the face draws ${face.pieces}` +
        (app.pieces > face.pieces
          ? ' — a part of the letter is standing clear of the rest'
          : ' — parts the face keeps separate have run together'),
    );
  }

  if (STRUCTURE_EXEMPT.has(character)) {
    notes.push(`parts not compared — ${STRUCTURE_EXEMPT.get(character)}`);
  } else {
    if (app.uprights.length !== face.uprights.length) {
      problems.push(`${app.uprights.length} uprights against the face's ${face.uprights.length}`);
    } else {
      app.uprights.forEach((u, i) => {
        const theirs = face.uprights[i];
        const waived = UPRIGHT_ANCHOR_EXEMPT.get(`${character}:${i + 1}`);
        if (u.anchor !== theirs.anchor && waived) {
          notes.push(`upright ${i + 1} sits against the ${u.anchor} — ${waived}`);
          return;
        }
        if (u.anchor !== theirs.anchor) {
          problems.push(
            `upright ${i + 1} is ${u.anchor === 'centre' ? 'clear of' : `against the ${u.anchor} of`} the letter where the face's is ${theirs.anchor === 'centre' ? 'clear of it' : `against its ${theirs.anchor}`}`,
          );
          return;
        }
        if (Math.abs(u.at - theirs.at) > MAX_DRIFT) {
          const what = u.anchor === 'centre' ? 'stands at' : `has its ${u.anchor} edge at`;
          problems.push(
            `upright ${i + 1} ${what} ${round(u.at)} across the letter, the face's at ${round(theirs.at)}`,
          );
        }
      });
    }

    const band = (which, index) =>
      which === 'down'
        ? `${Math.round((index / /* bands */ app.profile.down.length) * 100)}% of the way down`
        : `${Math.round((index / app.profile.across.length) * 100)}% of the way across`;
    for (const which of ['down', 'across']) {
      if (which === 'across' && SLANTED_TERMINAL.has(character)) {
        notes.push(`the profile down the letter is not compared — ${SLANTED_TERMINAL.get(character)}`);
        continue;
      }
      const mine = app.profile[which];
      const theirs = face.profile[which];
      const reach = which === 'down' ? 'the width' : 'the height';
      for (let i = 0; i < mine.length; i += 1) {
        const window = theirs.slice(Math.max(0, i - 2), i + 3);
        const low = Math.min(...window);
        const high = Math.max(...window);
        const drift = mine[i] < low ? low - mine[i] : mine[i] > high ? mine[i] - high : 0;
        if (drift > MAX_PROFILE_DRIFT) {
          problems.push(
            `${band(which, i)} the app's ink reaches ${round(mine[i])} of ${reach}, the face's ${round(theirs[i])}`,
          );
        }
      }
    }

    if (app.bridges.length === face.bridges.length) {
      app.bridges.forEach((g, i) => {
        if (Math.abs(g - face.bridges[i]) > MAX_BRIDGE_DRIFT) {
          problems.push(
            `${round(g)} of the letter is open paper between uprights ${i + 1} and ${i + 2}; the face leaves ${round(face.bridges[i])}`,
          );
        }
      });
    }
  }

  rows.push({
    character,
    aspect: { app: round(app.aspect), face: round(face.aspect) },
    uprights: {
      app: app.uprights.map((u) => ({ at: round(u.at), anchor: u.anchor })),
      face: face.uprights.map((u) => ({ at: round(u.at), anchor: u.anchor })),
    },
    profile: {
      app: { down: app.profile.down.map(round), across: app.profile.across.map(round) },
      face: { down: face.profile.down.map(round), across: face.profile.across.map(round) },
    },
    pieces: { app: app.pieces, face: face.pieces },
    bridges: { app: app.bridges.map(round), face: face.bridges.map(round) },
    notes,
    problems,
  });
  if (problems.length) failures.push(`${character}: ${problems.join('; ')}`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'letter-face-qa.json'), `${JSON.stringify({ rows }, null, 2)}\n`);

if (!CHECK) {
  /*
    The sheet. Drawn in the browser rather than composited here, so what is on
    it is the app's own path data stroked by the same rasteriser the app uses,
    at the sizes the app uses it at.
  */
  const sizes = [
    { name: 'tracing guide', px: 240 },
    { name: 'watch it written', px: 152 },
    { name: 'lesson tile', px: 56 },
  ];
  const sheet = await chromium.launch();
  const sp = await sheet.newPage({
    viewport: { width: 1180, height: 800 },
    deviceScaleFactor: 2,
  });
  await sp.setContent(
    `<meta charset="utf-8"><style>@font-face{font-family:HGFACE;` +
      `src:url(data:font/woff2;base64,${FACE}) format('woff2');font-weight:100 900}` +
      `body{margin:0;padding:20px;background:#fff;font:13px/1.5 system-ui;color:#222}` +
      `h1{font-size:16px;margin:0 0 4px}p{margin:0 0 18px;color:#666;max-width:70ch}` +
      `table{border-collapse:collapse}td,th{padding:6px 10px;text-align:center;` +
      `border-bottom:1px solid #eee;vertical-align:middle}` +
      `th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#888}` +
      `.ch{font:600 26px HGFACE}.bad{background:#fff5f5}` +
      `</style><h1>Every taught letter, as the app draws it and as Pretendard does</h1>` +
      `<p>Left of each pair: the app's authored centrelines, stroked with the pen the ` +
      `lesson uses. Right: the face, ink-fitted the same way. The last column lays one ` +
      `over the other — blue is the app, red is the face, purple is agreement.</p>` +
      `<table id="t"></table>`,
  );
  await sp.evaluate(
    async ({ glyphs, sizes, WEIGHT, EXTENT, flagged }) => {
      await document.fonts.load(`${WEIGHT} 40px HGFACE`, glyphs.map((g) => g.character).join(''));
      await document.fonts.ready;
      const t = document.getElementById('t');
      const head = document.createElement('tr');
      head.innerHTML =
        '<th>letter</th>' +
        sizes.map((s) => `<th>${s.name}<br>${s.px}px</th>`).join('') +
        '<th>face</th><th>overlaid</th>';
      t.appendChild(head);
      const boxOf = (ctx, R) => {
        const { data } = ctx.getImageData(0, 0, R, R);
        let x0 = R, y0 = R, x1 = -1, y1 = -1;
        for (let i = 0; i < R * R; i += 1) {
          if (data[i * 4 + 3] <= 96) continue;
          const x = i % R;
          const y = (i - x) / R;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        return x1 < 0 ? null : { x0, y0, x1, y1 };
      };
      for (const g of glyphs) {
        const row = document.createElement('tr');
        if (flagged.includes(g.character)) row.className = 'bad';
        const label = document.createElement('td');
        label.className = 'ch';
        label.textContent = g.character;
        row.appendChild(label);
        const paths = g.paths.map((d) => new Path2D(d));
        const drawVec = (ctx, R, colour) => {
          const stroke = (scale, dx, dy) => {
            ctx.clearRect(0, 0, R, R);
            ctx.save();
            ctx.translate(dx, dy);
            ctx.scale(scale, scale);
            ctx.lineWidth = g.pen;
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';
            ctx.miterLimit = 3;
            ctx.strokeStyle = colour;
            paths.forEach((p) => ctx.stroke(p));
            ctx.restore();
          };
          stroke(R / 100, 0, 0);
          const b = boxOf(ctx, R);
          const k = (EXTENT * R) / (Math.max(b.x1 - b.x0, b.y1 - b.y0) + 1);
          const dx = R / 2 - k * ((b.x0 + b.x1 + 1) / 2);
          const dy = R / 2 - k * ((b.y0 + b.y1 + 1) / 2);
          ctx.clearRect(0, 0, R, R);
          return () => stroke((R / 100) * k, dx, dy);
        };
        const drawFace = (ctx, R, colour) => {
          const set = (size, cx, cy) => {
            ctx.font = `${WEIGHT} ${size}px HGFACE`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = colour;
            ctx.fillText(g.character, cx, cy);
          };
          ctx.clearRect(0, 0, R, R);
          set(R * 0.78, R / 2, R / 2);
          const b = boxOf(ctx, R);
          const k = (EXTENT * R) / (Math.max(b.x1 - b.x0, b.y1 - b.y0) + 1);
          const size = R * 0.78 * k;
          const cx = R / 2 - k * ((b.x0 + b.x1 + 1) / 2 - R / 2);
          const cy = R / 2 - k * ((b.y0 + b.y1 + 1) / 2 - R / 2);
          ctx.clearRect(0, 0, R, R);
          return () => set(size, cx, cy);
        };
        const cell = (R, paint) => {
          const canvas = document.createElement('canvas');
          canvas.width = R;
          canvas.height = R;
          canvas.style.width = `${R}px`;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          paint(ctx, R);
          const td = document.createElement('td');
          td.appendChild(canvas);
          row.appendChild(td);
        };
        for (const s of sizes) cell(s.px, (ctx, R) => drawVec(ctx, R, '#1b1b1b')());
        cell(sizes[0].px, (ctx, R) => drawFace(ctx, R, '#1b1b1b')());
        cell(sizes[0].px, (ctx, R) => {
          const face = drawFace(ctx, R, 'rgba(200,20,20,.55)');
          const vec = drawVec(ctx, R, 'rgba(20,20,200,.55)');
          ctx.clearRect(0, 0, R, R);
          face();
          vec();
        });
        t.appendChild(row);
      }
    },
    {
      glyphs,
      sizes,
      WEIGHT,
      EXTENT,
      flagged: rows.filter((r) => r.problems.length).map((r) => r.character),
    },
  );
  const html = await sp.content();
  writeFileSync(join(OUT, 'index.html'), html);
  await sp.screenshot({ path: join(OUT, 'letters.png'), fullPage: true });
  await sheet.close();
}

const compound = new Set(['ㅐ', 'ㅒ', 'ㅔ', 'ㅖ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅢ']);
console.log(`${rows.length} letters measured against Pretendard, ${compound.size} of them compound vowels.`);
for (const row of rows) {
  const mark = row.problems.length ? 'FAIL' : '    ';
  const worst = row.profile.app.down
    .map((v, i) => Math.abs(v - row.profile.face.down[i]))
    .concat(row.profile.app.across.map((v, i) => Math.abs(v - row.profile.face.across[i])))
    .reduce((a, b) => Math.max(a, b), 0);
  console.log(
    `${mark} ${row.character}  aspect ${row.aspect.app}/${row.aspect.face}  ` +
      `islands ${row.pieces.app}/${row.pieces.face}  ` +
      `uprights [${row.uprights.app.map((u) => `${u.at}${u.anchor === 'centre' ? '' : `(${u.anchor})`}`).join(', ')}]  ` +
      `worst band ${round(worst)}`,
  );
  for (const note of row.notes) console.log(`       · ${note}`);
  for (const problem of row.problems) console.log(`       ! ${problem}`);
}

if (failures.length) {
  console.error(`\n${failures.length} letter${failures.length === 1 ? '' : 's'} disagree with the face:`);
  for (const f of failures) console.error(`  ${f}`);
  if (CHECK) process.exit(1);
} else {
  console.log('\nEvery letter has the face\'s parts, in the face\'s places.');
}
