#!/usr/bin/env node
/**
 * What the demonstration actually looks like, measured in pixels — and rendered
 * for a person to look at.
 *
 *   npm run strokes:visual            measure, and write the gallery
 *   npm run strokes:visual -- --check measure only; exit non-zero on a failure
 *
 * ## Why this exists next to `strokes:qa`
 *
 * `strokes:qa` checks the data. All of it passed — 73 items, 269 strokes —
 * through every round in which the demonstration was visibly broken on screen.
 * A test that is green while the product is wrong is not a weak test; it is a
 * test of the wrong thing.
 *
 * So this rasterises the frames a learner actually sees and asks questions about
 * the pixels. It draws them exactly as `ui/StrokeOrder` does — the same paths,
 * the same pen, the same butt caps and mitre limit, the same dash offset — so a
 * frame that passes here is a frame that shipped, not a second drawing of it.
 * The wedge at the corner of ㄱ that survived four rounds was in the QA sheet
 * and in the product, identical, and both said it was fine; they said so because
 * they were asking about the data.
 *
 * ## What is worth asserting now, and what stopped being
 *
 * The old model cut strokes out of one rasterised glyph, so the assertions were
 * about *ownership*: ink belonging to stroke three must not be black while
 * stroke three is grey. That is unreachable now — each stroke is its own path,
 * drawn only when its turn comes, and there is no shared ink to award. What
 * remains are the things a stroked, dash-revealed path can still get wrong:
 *
 * | | |
 * | --- | --- |
 * | **Invisible** | A stroke that draws nothing. A pen this thin on a path this short is not a defect the data can see. |
 * | **Unpaced** | Ink that does not arrive in step with the fraction. A dash offset scaled by the wrong length races or crawls, and lands early or late. |
 * | **Backwards** | Ink that shrinks as the fraction grows. |
 * | **Clipped** | Ink touching the edge of the box, which is a letter drawn off the paper. |
 * | **Detached** | A numbered marker whose anchor is not on its own stroke. |
 * | **Obscured** | A numbered badge standing on the letter's ink, at any size the product draws at. |
 * | **Adrift** | A finished frame that is not the union of the strokes. |
 *
 * ## And the gallery, which is the part that has actually caught things
 *
 * `--check` measures and says nothing more. Without it, every frame is written
 * to `.stroke-qa/` as one contact sheet per item plus an index, at both desktop
 * and phone size. Numbers are not what decides whether ㅅ looks like ㅅ.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { hasVectorGlyph, vectorGlyph } from '../apps/web/src/data/strokeVectors.ts';
import { layoutMarkers } from '../apps/web/src/ui/strokeMarkers.ts';
import { isSyllable } from '../apps/web/src/data/jamo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', '.stroke-qa');
const CHECK = process.argv.includes('--check');

/** Frames rendered per stroke. The middle three are what nobody was looking at. */
const STEPS = [0, 0.25, 0.5, 0.75, 1];

/** The raster the measurements are taken on, for a 0–100 viewBox. */
const R = 256;

/**
 * The sizes the demonstration is actually drawn at, plus one below all of them.
 *
 * This used to read `[160, 96]`, and **the product draws at neither**. 160 is
 * `StrokeOrder`'s own default and every caller overrides it: the introduction
 * card asks for 200, the help panel inside a lesson asks for 152, the developer
 * gallery asks for 150. So the gallery a person reviewed was a rendering nobody
 * would ever see, at a stroke width and a rounding nobody would ever get —
 * which is the same failure the whole file was written to catch, one level up.
 *
 * 96 is kept and is deliberately not a product size: it is a floor, well under
 * the smallest thing shipped, where a hairline stroke or a marker that has run
 * out of room shows up first. A defect visible at 96 and invisible at 152 is
 * still worth knowing about, because 152 is only one design decision away from
 * being smaller.
 *
 * The size does not vary with the viewport — every caller passes a constant, so
 * a 360 px phone and a 430 px phone get the same box. Layout at those widths is
 * a different question and not one pixels in an SVG can answer.
 */
const REVIEW_SIZES = [200, 152, 96];

/**
 * How far the ink may lag or lead the fraction it is drawn at.
 *
 * The dash offset is linear in path length and the ink is a pen swept along it,
 * so at fraction f the black should be about f of the finished stroke. It is not
 * exact: a butt cap squares off a growing end, a mitre adds a little at a
 * corner, and both are a larger share of a short stroke than a long one. A fifth
 * is loose enough not to fire on those and tight enough to catch a reveal paced
 * by the wrong number, which lands about a pen's width out on every stroke.
 */
const PACING_SLACK = 0.2;

/**
 * Shorter than this many pen-widths and a stroke is one mark, not a movement.
 *
 * ㅎ's dot is about half a pen long and ㅊ's tick is two; neither is something a
 * hand paces out, and asking "is a quarter of it black a quarter of the way
 * along" of a single dab is asking a question it has no way to answer.
 */
const PACEABLE_PENS = 2.5;

const failures = [];
const fail = (character, what) => failures.push(`${character}: ${what}`);

const shipping = ALL_CHARACTERS.map((c) => c.character).filter(hasVectorGlyph);

const browser = await chromium.launch();
const page = await browser.newPage();

/**
 * Draws frames in the page and returns their ink, as counts and a bitmap.
 *
 * One round trip per character rather than per frame: the whole schedule goes
 * in and every frame's measurements come back, which is the difference between
 * this taking seconds and taking minutes.
 */
async function measure(glyph, frames) {
  return page.evaluate(
    ({ strokes, pen, frames }) => {
      const R = 256;
      const canvas = new OffscreenCanvas(R, R);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const scale = R / 100;

      const paths = strokes.map((s) => new Path2D(s.d));

      /** Ink of one frame: the count, the bounding box, and the raw alpha. */
      const shoot = (draw) => {
        ctx.clearRect(0, 0, R, R);
        ctx.save();
        ctx.scale(scale, scale);
        ctx.lineWidth = pen;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 3;
        ctx.strokeStyle = '#000';
        draw(ctx);
        ctx.restore();
        const { data } = ctx.getImageData(0, 0, R, R);
        const bits = new Uint8Array(R * R);
        let count = 0;
        let x0 = R;
        let y0 = R;
        let x1 = -1;
        let y1 = -1;
        for (let i = 0; i < bits.length; i += 1) {
          if (data[i * 4 + 3] > 96) {
            bits[i] = 1;
            count += 1;
            const x = i % R;
            const y = (i - x) / R;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
        return { count, box: [x0, y0, x1, y1], bits: Array.from(bits) };
      };

      const out = {};

      // Each stroke on its own, whole.
      out.solo = strokes.map((_, i) => {
        const { count, box } = shoot((c) => c.stroke(paths[i]));
        return { count, box };
      });

      // Each stroke on its own, part-drawn — what the reveal actually uncovers.
      out.partial = frames.map(({ index, step }) => {
        const { count } = shoot((c) => {
          c.setLineDash([strokes[index].length, strokes[index].length]);
          c.lineDashOffset = strokes[index].length * (1 - step);
          c.stroke(paths[index]);
        });
        return { index, step, count };
      });

      // The finished character, and the union of the strokes drawn separately.
      const whole = shoot((c) => paths.forEach((p) => c.stroke(p)));
      const union = new Uint8Array(R * R);
      for (const stroke of paths) {
        const { bits } = shoot((c) => c.stroke(stroke));
        for (let i = 0; i < union.length; i += 1) if (bits[i]) union[i] = 1;
      }
      /*
        Where the two renders disagree, and whether the disagreement is a seam
        or a displacement.

        Compositing eight paths onto one canvas adds their coverage before the
        alpha threshold; painting each onto a cleared canvas and OR-ing the
        thresholded results rounds every edge on its own. Where two strokes meet
        flush — which, since corner terminals became symmetric, is both sides of
        every corner in the curriculum — each contributes about half a pixel of
        coverage to the boundary, and the composited pixel clears the threshold
        while neither of the separate ones does. Measured on this tree: ㅃ's
        alphas along those edges are 101 and 136 against a threshold of 96.

        That is a fact about antialiasing and not about the letter, so it is
        counted separately from the thing this check exists to catch. A frame
        that has genuinely drifted is displaced or missing ink, and displaced ink
        is not adjacent to the ink it should have been: `stray` is drift with no
        inked neighbour in either render, and one pixel of it is a failure.
      */
      let drift = 0;
      let stray = 0;
      const inked = (bits, x, y) => x >= 0 && y >= 0 && x < R && y < R && bits[y * R + x] === 1;
      for (let i = 0; i < union.length; i += 1) {
        if (union[i] === whole.bits[i]) continue;
        drift += 1;
        const x = i % R;
        const y = (i - x) / R;
        let touching = false;
        for (let dy = -1; dy <= 1 && !touching; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            if (inked(union, x + dx, y + dy) && inked(whole.bits, x + dx, y + dy)) {
              touching = true;
              break;
            }
          }
        }
        if (!touching) stray += 1;
      }
      out.whole = { count: whole.count, box: whole.box, drift, stray };

      return out;
    },
    { strokes: glyph.strokes, pen: glyph.pen, frames },
  );
}

const gallery = [];

for (const character of shipping) {
  const glyph = vectorGlyph(character);
  const frames = [];
  glyph.strokes.forEach((_, index) => {
    for (const step of STEPS) frames.push({ index, step });
  });

  const result = await measure(glyph, frames);

  // --- invisible ---------------------------------------------------------
  result.solo.forEach((solo, index) => {
    if (solo.count === 0) fail(character, `stroke ${index + 1} draws nothing`);
  });

  // --- clipped -----------------------------------------------------------
  const [x0, y0, x1, y1] = result.whole.box;
  if (x0 <= 0 || y0 <= 0 || x1 >= R - 1 || y1 >= R - 1) {
    fail(character, 'the finished character touches the edge of the box');
  }

  /*
   * --- adrift ------------------------------------------------------------
   *
   * The last frame has to be the character, not an approximation of it.
   *
   * Asked in two parts, because the comparison has a known artefact and a real
   * question inside it and a single tuned number cannot separate them. See the
   * note in `measure`: every drift pixel must lie against ink both renders
   * agree on — a seam — and none of it may be displaced. A tuned per-stroke
   * allowance was here before and it was the wrong instrument: it was set at
   * four pixels a stroke against ㅃ's measured twenty-four, and when corner
   * terminals became symmetric and put a flush edge on both sides of every
   * corner, the same artefact grew to a hundred and thirty-six and the gate
   * reported four broken letters that had not changed shape at all.
   *
   * The proportion is still bounded, because a letter whose every edge
   * disagreed would be one worth looking at even if all of it were seam.
   */
  if (result.whole.stray > 0) {
    fail(
      character,
      `the finished frame has ${result.whole.stray} pixels of ink away from where the strokes drew it`,
    );
  }
  if (result.whole.drift > result.whole.count * 0.03) {
    fail(
      character,
      `the finished frame differs from the union of its strokes along ${result.whole.drift} pixels — ${((result.whole.drift / result.whole.count) * 100).toFixed(1)}% of its ink`,
    );
  }

  // --- unpaced and backwards ---------------------------------------------
  for (const stroke of glyph.strokes) {
    const index = stroke.order - 1;
    const whole = result.solo[index].count;
    const series = result.partial.filter((f) => f.index === index).sort((a, b) => a.step - b.step);

    let previous = -1;
    for (const { step, count } of series) {
      if (count < previous - 4) {
        fail(character, `stroke ${stroke.order} loses ink between frames — ${previous} then ${count}`);
        break;
      }
      previous = count;
    }

    if (stroke.length < glyph.pen * PACEABLE_PENS) continue;
    for (const { step, count } of series) {
      const share = whole === 0 ? 0 : count / whole;
      if (Math.abs(share - step) > PACING_SLACK) {
        fail(
          character,
          `stroke ${stroke.order} is ${(share * 100).toFixed(0)}% drawn at the ${(step * 100).toFixed(0)}% mark`,
        );
        break;
      }
    }
  }

  // --- detached ----------------------------------------------------------
  const radius = isSyllable(character) ? 4 : 5.6;
  for (const marker of layoutMarkers(glyph.strokes, radius)) {
    const stroke = glyph.strokes[marker.order - 1];
    const off = Math.hypot(marker.anchor.x - stroke.start[0], marker.anchor.y - stroke.start[1]);
    if (off > 0.01) fail(character, `marker ${marker.order} is not on its stroke's start`);
  }

  // --- obscured ----------------------------------------------------------
  /*
   * The rule the ㅏ of 안 broke: a badge may not stand on the letter.
   *
   * Measured at every size the demonstration is drawn at, because a clearance
   * that survives in viewBox units can still vanish into a rounding at 96 px.
   * Any ink at all inside a disc is a failure — there is no allowance, because
   * the placement is free to move the badge and a leader line is free to cross
   * the glyph, so there is nothing a badge needs the letter's space *for*.
   */
  const markers = layoutMarkers(glyph.strokes, radius);
  for (const size of REVIEW_SIZES) {
    for (const { order, covered } of await markerInk(glyph, markers, radius, size)) {
      if (covered > 0) {
        fail(character, `badge ${order} covers ${covered} px of the letter at ${size} px`);
      }
    }
  }

  gallery.push({ character, glyph, markers, radius });
}

/**
 * How much of the finished letter each numbered badge is standing on, in pixels.
 *
 * ## Why this is rendered rather than computed
 *
 * `strokeMarkers.test.ts` already proves the badge clears the ink, in viewBox
 * units, over every taught character. That is the right place for the rule and
 * it is not the whole answer, because the learner is not looking at viewBox
 * units. They are looking at a 96-pixel box on a phone, where a nine-unit pen
 * is eight and a half pixels, the badge is four, and both are anti-aliased onto
 * a grid that rounds. A clearance of a tenth of a unit is a tenth of a pixel,
 * and a tenth of a pixel is a grey ring that reads as a touch.
 *
 * So this draws what ships — the same paths, the same pen, the same caps — at
 * each size the product actually renders at, and counts the letter's own ink
 * inside each disc. The leader line is deliberately not drawn: it is the one
 * mark permitted to cross the glyph, so counting it would fail the design
 * rather than test it.
 */
async function markerInk(glyph, markers, radius, size) {
  return page.evaluate(
    ({ strokes, pen, markers, radius, size }) => {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const scale = size / 100;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.scale(scale, scale);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = pen;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 3;
      for (const stroke of strokes) ctx.stroke(new Path2D(stroke.d));
      ctx.restore();
      const alpha = ctx.getImageData(0, 0, size, size).data;

      return markers.map((marker) => {
        const cx = marker.label.x * scale;
        const cy = marker.label.y * scale;
        const r = radius * scale;
        let covered = 0;
        const lo = Math.max(0, Math.floor(cy - r));
        const hi = Math.min(size - 1, Math.ceil(cy + r));
        for (let y = lo; y <= hi; y += 1) {
          for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(size - 1, Math.ceil(cx + r)); x += 1) {
            if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
            // Well past the anti-aliased fringe: a pixel this opaque is ink,
            // not the soft edge of a stroke passing nearby.
            if (alpha[(y * size + x) * 4 + 3] > 128) covered += 1;
          }
        }
        return { order: marker.order, covered };
      });
    },
    { strokes: glyph.strokes.map((s) => ({ d: s.d })), pen: glyph.pen, markers, radius, size },
  );
}

// --- the gallery --------------------------------------------------------------

if (!CHECK) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  for (const size of REVIEW_SIZES) {
    const rows = gallery
      .map(({ character, glyph, markers, radius }) => {
        const pen = (colour) =>
          `fill="none" stroke="${colour}" stroke-width="${glyph.pen}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="3"`;
        const frame = (upTo, step) => {
          const body = [
            ...glyph.strokes.map((s) => `<path d="${s.d}" ${pen('#dcd7ce')}/>`),
            ...glyph.strokes.slice(0, upTo).map((s) => `<path d="${s.d}" ${pen('#111')}/>`),
            step > 0 && glyph.strokes[upTo]
              ? `<path d="${glyph.strokes[upTo].d}" ${pen('#111')} stroke-dasharray="${glyph.strokes[upTo].length}" stroke-dashoffset="${glyph.strokes[upTo].length * (1 - step)}"/>`
              : '',
          ].join('');
          return `<svg viewBox="0 0 100 100" width="${size}" height="${size}">${body}</svg>`;
        };
        const numbered = markers
          .map(
            (m) =>
              `${m.tethered ? `<line x1="${m.anchor.x}" y1="${m.anchor.y}" x2="${m.label.x}" y2="${m.label.y}" stroke="#999" stroke-width="0.6"/>` : ''}<circle cx="${m.label.x}" cy="${m.label.y}" r="${radius}" fill="#fff" stroke="#999" stroke-width="0.9"/><text x="${m.label.x}" y="${m.label.y + radius * 0.36}" font-size="${radius * 1.05}" text-anchor="middle" font-weight="700" fill="#444">${m.order}</text>`,
          )
          .join('');

        const cells = [
          `<div class="c ref"><span>${character}</span></div>`,
          `<div class="c">${frame(glyph.strokes.length, 0)}</div>`,
          `<div class="c"><svg viewBox="0 0 100 100" width="${size}" height="${size}">${glyph.strokes.map((s) => `<path d="${s.d}" ${pen('#111')}/>`).join('')}${numbered}</svg></div>`,
          '<div class="gap"></div>',
          ...glyph.strokes.flatMap((_, index) =>
            STEPS.map((step) => `<div class="c">${frame(index, step)}</div>`),
          ),
        ].join('');
        return `<div class="row"><b>${character}</b>${cells}</div>`;
      })
      .join('');

    writeFileSync(
      join(OUT, `gallery-${size}.html`),
      `<!doctype html><meta charset="utf-8"><title>Stroke gallery · ${size} px</title><style>
body{margin:0;background:#fff;font:12px system-ui}
.row{display:flex;align-items:center;gap:4px;border-bottom:1px solid #eee;padding:4px}
.row b{width:30px;font-size:16px;text-align:center}
.c{width:${size}px;height:${size}px;background:#fdfcf9;flex:0 0 auto}
.gap{width:12px;flex:0 0 auto}
.ref{display:flex;align-items:center;justify-content:center;background:#eef4ff}
.ref span{font-family:'Pretendard Variable',Pretendard,sans-serif;font-weight:600;font-size:${size * 0.78}px;line-height:1}
</style>${rows}`,
    );
  }

  // One image per item at review size, plus a sheet, so a reviewer can scroll.
  await page.setViewportSize({ width: 1800, height: 900 });
  for (const size of REVIEW_SIZES) {
    await page.goto(`file://${join(OUT, `gallery-${size}.html`)}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `gallery-${size}.png`), fullPage: true });
  }
}

await browser.close();

// --- report -------------------------------------------------------------------

const strokes = gallery.reduce((n, g) => n + g.glyph.strokes.length, 0);
const frames = gallery.reduce((n, g) => n + g.glyph.strokes.length * STEPS.length, 0);
console.log(
  `Stroke visuals — ${gallery.length} items, ${strokes} strokes, ${frames} frames rendered at ${R}px`,
);

if (failures.length === 0) {
  console.log('  no measurable problem in any frame.');
  if (!CHECK) {
    console.log(
      `  gallery: ${REVIEW_SIZES.map((size) => join(OUT, `gallery-${size}.png`)).join(', ')}`,
    );
    console.log('  pixels cannot tell you whether ㅅ looks like ㅅ. Look at them.');
  }
} else {
  console.log(`\n  ${failures.length} problem(s):`);
  for (const line of failures) console.log(`    ${line}`);
}

if (CHECK && failures.length > 0) process.exit(1);
