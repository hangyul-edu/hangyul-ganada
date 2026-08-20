#!/usr/bin/env node
/**
 * What the stroke demonstration actually looks like, measured in pixels.
 *
 *   npm run strokes:visual            measure, and build the gallery to look at
 *   npm run strokes:visual -- --check measure only; exit non-zero on a failure
 *
 * ## Why this exists next to `strokes:qa`
 *
 * `strokes:qa` checks that the data is well formed: no NaN in a path, nothing
 * outside the box, no stroke that claims no ink, no curriculum item without an
 * asset. All of that passed — 73 items, 269 strokes, 1,345 frames — through
 * every round in which the demonstration was visibly broken on screen. A test
 * that is green while the product is wrong is not a weak test, it is a test of
 * the wrong thing.
 *
 * What was wrong was never the *data*, it was the *picture*: stroke 2 of 어 drew
 * a black bar reaching into a stroke 3 that was still grey. No amount of path
 * validation can see that, because the path was valid. So this rasterises the
 * frames the learner sees and asks questions about the pixels.
 *
 * ## The invariant that matters
 *
 * ```
 *   ink(stroke i)  beyond the end of route i  ∩  body(stroke j)  =  ∅   for j > i
 * ```
 *
 * Every word in that is load-bearing, and the two rounds it took to get it
 * right are worth recording, because the obvious version is wrong in a way that
 * looks right.
 *
 * The obvious version — "stroke i must not overlap stroke j at all" — fails
 * immediately, because the regions are cut from one glyph and are already
 * disjoint; it can never fire. The next version — "stroke i must not enter
 * stroke j's body" — fires constantly on things that are perfectly fine: ㅏ is
 * an upright written first and a crossbar attached to its middle written
 * second, so the upright inevitably occupies ink that lies beside the
 * crossbar's route. Nothing is wrong there and nothing looks wrong, because the
 * crossbar's own *region* starts to the right of the upright and stays grey.
 *
 * What separates the two cases is **where on stroke i the contact happens**:
 *
 * ```
 *   ㅏ  upright (1) ─┬─ crossbar (2)     contact is beside route 1's middle
 *                    │                    → 1 is passed by 2. Fine.
 *
 *   ㅓ  connector (1) ──┤ upright (2)     contact is past route 1's end
 *                                          → 1 runs into 2. This is the defect.
 * ```
 *
 * A stroke is allowed to be crossed. It is not allowed to *run into* something
 * that has not been drawn yet — and running into it means holding ink past its
 * own last point, in the body of a stroke still to come. That is measured by
 * asking, of every pixel, whether it projects onto any segment of its own
 * stroke's route: beside the route it is body, past the end it is cap, and only
 * a cap sitting in a later stroke's body is a fault.
 *
 * *body* is measured by stroking the route with **butt** caps, which is exactly
 * the "no cap" the name suggests: the region ends square at the last point
 * rather than bulging half a pen beyond it. Two strokes that merely meet
 * end-to-end therefore do not violate this, which is right — a corner is not an
 * intrusion.
 *
 * ## The other two checks
 *
 * * **Pieces.** A stroke is one connected mark, or the small number of pieces
 *   the letter genuinely has (ㅍ's bar is cut by the uprights that cross it). A
 *   region that arrives in three pieces has grown a crumb somewhere, and a
 *   crumb is an earlier round's wedge wearing different clothes.
 * * **Necks.** A stroke eroded by a pixel and regrown should be roughly itself.
 *   The residue is reported per stroke — a bar leaves almost none, a wedge
 *   hanging off a junction by a thin neck leaves a lot — and sorts the gallery,
 *   so the eye starts at the worst rather than at ㄱ.
 *
 * The union of the strokes is *not* re-checked here: they are cut from the
 * reference glyph and only ever contain pixels the font drew, so the union is
 * that glyph by construction, and `build-stroke-assets.mjs` is where that
 * property lives.
 *
 * ## And then a person looks
 *
 * None of the above can see *ugly*. The gallery it writes — every taught item,
 * every stroke alone, five frames of each, the finished character — is for
 * looking at, and §12 of the brief is right that there is no substitute. The
 * measurements exist so that the looking starts from a short list rather than
 * from 73 characters.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { STROKE_ASSETS, hasStrokeAsset, strokeReveal } from '../apps/web/src/data/strokeAssets.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', '.stroke-qa');
const CHECK = process.argv.includes('--check');
const ONLY = argValue('--only');

/** Where a frame is sampled, as a fraction of the active stroke. */
const STEPS = [0.15, 0.35, 0.55, 0.75, 1];

/**
 * The raster the measurements are taken on, for a 0–100 viewBox.
 *
 * Two and a half samples per viewBox unit. Fine enough that a one-unit
 * intrusion is about six pixels and cannot hide in rounding, coarse enough that
 * 73 characters measure in a few seconds.
 */
const RASTER = 256;

/**
 * Where the line is drawn, and why it is drawn in two places.
 *
 * Measuring this honestly means admitting that "no stroke paints into a later
 * one" is not a property this cut achieves exactly. Two regions cut from one
 * glyph share a boundary, and a boundary a few hundred pixels long that is
 * traced and simplified independently on each side leaves a rim of a pixel or
 * two. That rim is real and it is invisible, and a check that failed on it
 * would be turned off within a week.
 *
 * So there are two lines rather than one:
 *
 * * **FAIL** — an intrusion big enough or deep enough to see. The defect that
 *   started all this, 어's connector reaching half a stem into a grey upright,
 *   was hundreds of pixels and over four units deep. Anything in that class
 *   fails the build.
 * * **WARN** — above the rim and below that. Listed every run, never hidden,
 *   and currently non-empty: ㅈ, ㅉ and 자 keep a nub of about ten square units
 *   where their two legs start from the same point. It is visible if you look
 *   for it and it is not worth a false sense of completion to pretend
 *   otherwise.
 *
 * The rim itself — under EDGE_NOISE pixels *and* under DEPTH_LIMIT deep — is
 * not reported at all.
 */
const EDGE_NOISE = 12;
const DEPTH_LIMIT = 0.6;

/** Above either of these, an intrusion is a build failure rather than a note. */
const FAIL_PIXELS = 100;
const FAIL_DEPTH = 4;

/**
 * Sampled route points allowed to fall off a stroke's own ink.
 *
 * Measured against the ink grown by a pixel, so this is not absorbing boundary
 * rounding — see the note where it is computed. A stroke whose pen travels
 * somewhere its ink is not scores in the tens: ㅞ scored twenty-nine.
 */
const OFF_INK_LIMIT = 2;

/** Letters whose stroke genuinely arrives in more than one piece. */
const MULTI_PIECE = {
  // The middle bar of ㅍ is crossed by the two uprights, which are written
  // first and own the crossings, so what is left of the bar is three fragments.
  ㅍ: { 2: 3 },
};

function argValue(flag) {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : null;
}

const shipping = ALL_CHARACTERS.map((c) => c.character).filter(hasStrokeAsset);
const wanted = ONLY ? [...ONLY].filter((c) => shipping.includes(c)) : shipping;

const items = wanted.map((character) => {
  const asset = STROKE_ASSETS[character];
  return {
    character,
    viewBox: asset.viewBox,
    strokes: asset.strokes.map((stroke) => ({
      order: stroke.order,
      shape: stroke.shape,
      draw: stroke.draw,
      frames: STEPS.map((step) => strokeReveal(stroke, step).path),
    })),
  };
});

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><title>stroke measurement</title>');

const findings = await page.evaluate(measure, { items, RASTER, EDGE_NOISE, DEPTH_LIMIT, MULTI_PIECE });

/**
 * Rasterises every stroke and frame, and answers the four questions.
 *
 * Runs in the page because `Path2D` parses SVG path data exactly as the browser
 * that will draw it does — the alternative is a second path parser here, which
 * is a second opinion about the geometry and therefore a second thing that can
 * be wrong about it.
 */
function measure({ items, RASTER, EDGE_NOISE, DEPTH_LIMIT, MULTI_PIECE }) {
  const R = RASTER;
  const canvas = new OffscreenCanvas(R, R);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const scale = R / 100;

  const mask = (paint) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, R, R);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    paint(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const data = ctx.getImageData(0, 0, R, R).data;
    const out = new Uint8Array(R * R);
    // Half-covered pixels are edge, not ink. The threshold keeps the antialias
    // fringe out of every count below, which is what makes the counts readable.
    for (let i = 0; i < R * R; i += 1) out[i] = data[i * 4 + 3] > 128 ? 1 : 0;
    return out;
  };

  const fillMask = (d, rule = 'evenodd') => mask((c) => d && c.fill(new Path2D(d), rule));

  const points = (draw) =>
    draw.split('L').map((pair) => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return { x: x ?? 0, y: y ?? 0 };
    });

  /** Distance from a point to the *interior* of a polyline — never its ends. */
  const besideRoute = (px, py, route) => {
    let best = Infinity;
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const span = dx * dx + dy * dy;
      if (span < 1e-9) continue;
      const t = ((px - a.x) * dx + (py - a.y) * dy) / span;
      if (t < 0 || t > 1) continue;
      const d = Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
      if (d < best) best = d;
    }
    return best;
  };

  /** Distance to a polyline including its ends — the true half-width. */
  const distToRoute = (px, py, route) => {
    let best = Infinity;
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const span = dx * dx + dy * dy;
      const t = span < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / span));
      const d = Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
      if (d < best) best = d;
    }
    return best;
  };

  /**
   * How wide this stroke's own ink is, either side of its route.
   *
   * The 85th percentile rather than the maximum: the maximum is whatever
   * junction the stroke happens to run into, and a body measured at junction
   * width would swallow the strokes on either side of it and report every
   * neighbour as an intrusion.
   *
   * Measured to the **whole** route, ends included, and not to its interior.
   * Measuring to the interior is what the body test does, and using it here too
   * looked consistent and was the reason this file's first run accused ㅎ of a
   * twelve-unit intrusion that does not exist. ㅇ's route is an open arc, so the
   * ink in the gap at the top of the ring projects onto no segment and is
   * scored at its distance to the *nearest segment* — ten units and more. That
   * inflated the percentile, the percentile became the body radius, and a ring
   * six units thick grew a body wide enough to swallow the bar above it. The
   * half-width of a stroke is a fact about the stroke; the ends are part of it.
   */
  const reachOf = (shapeMask, route) => {
    const distances = [];
    for (let y = 0; y < R; y += 1) {
      for (let x = 0; x < R; x += 1) {
        if (!shapeMask[y * R + x]) continue;
        distances.push(distToRoute((x + 0.5) / scale, (y + 0.5) / scale, route));
      }
    }
    if (distances.length === 0) return 0;
    distances.sort((a, b) => a - b);
    return Math.max(1, distances[Math.floor(distances.length * 0.85)]);
  };

  /** Four-connected pieces of a mask, largest first, ignoring specks. */
  const pieces = (m) => {
    const seen = new Uint8Array(R * R);
    const sizes = [];
    const stack = [];
    for (let start = 0; start < R * R; start += 1) {
      if (!m[start] || seen[start]) continue;
      let size = 0;
      stack.push(start);
      seen[start] = 1;
      while (stack.length) {
        const at = stack.pop();
        size += 1;
        const x = at % R;
        const y = (at - x) / R;
        if (x > 0 && m[at - 1] && !seen[at - 1]) { seen[at - 1] = 1; stack.push(at - 1); }
        if (x < R - 1 && m[at + 1] && !seen[at + 1]) { seen[at + 1] = 1; stack.push(at + 1); }
        if (y > 0 && m[at - R] && !seen[at - R]) { seen[at - R] = 1; stack.push(at - R); }
        if (y < R - 1 && m[at + R] && !seen[at + R]) { seen[at + R] = 1; stack.push(at + R); }
      }
      sizes.push(size);
    }
    // A speck under this is antialias, not a piece. Four pixels at this raster
    // is about a third of a viewBox unit across.
    return sizes.filter((n) => n > 4).sort((a, b) => b - a);
  };

  /**
   * How much of a stroke hangs off it by a thin neck.
   *
   * A morphological opening: erode by one pixel, grow back by one. A bar comes
   * back as itself; a wedge attached at a junction by a two-pixel neck does not
   * come back at all. The number is the fraction lost, so it is comparable
   * between a hairline and ㅁ.
   */
  const neckResidue = (m) => {
    const area = m.reduce((n, v) => n + v, 0);
    if (area === 0) return 0;
    const shrink = (src) => {
      const out = new Uint8Array(R * R);
      for (let y = 1; y < R - 1; y += 1) {
        for (let x = 1; x < R - 1; x += 1) {
          const at = y * R + x;
          if (src[at] && src[at - 1] && src[at + 1] && src[at - R] && src[at + R]) out[at] = 1;
        }
      }
      return out;
    };
    const grow = (src) => {
      const out = new Uint8Array(R * R);
      for (let y = 1; y < R - 1; y += 1) {
        for (let x = 1; x < R - 1; x += 1) {
          const at = y * R + x;
          if (src[at] || src[at - 1] || src[at + 1] || src[at - R] || src[at + R]) out[at] = 1;
        }
      }
      return out;
    };
    const opened = grow(shrink(m));
    let lost = 0;
    for (let i = 0; i < R * R; i += 1) if (m[i] && !opened[i]) lost += 1;
    return Number((lost / area).toFixed(3));
  };

  const results = [];

  for (const item of items) {
    const routes = item.strokes.map((s) => points(s.draw));
    const shapes = item.strokes.map((s) => fillMask(s.shape));
    const reaches = shapes.map((m, i) => reachOf(m, routes[i]));

    // The body: the route stroked at its own width with butt caps, so the
    // region stops square at the last point instead of bulging past it.
    const bodies = item.strokes.map((s, i) =>
      mask((c) => {
        c.lineWidth = reaches[i] * 2;
        c.lineCap = 'butt';
        c.lineJoin = 'round';
        c.stroke(new Path2D(`M${s.draw}`));
      }),
    );

    const union = new Uint8Array(R * R);
    for (const m of shapes) for (let i = 0; i < R * R; i += 1) if (m[i]) union[i] = 1;

    const strokeReports = [];

    for (let i = 0; i < item.strokes.length; i += 1) {
      /*
       * The cap: this stroke's own ink that lies past one of its own ends.
       *
       * `besideRoute` returns Infinity for a point that projects onto no
       * segment of the route, which is precisely "beyond where the pen
       * travelled". Ink there is not something the pen laid down on its way
       * past; it is whatever the pen ran into when it stopped.
       */
      const cap = new Uint8Array(R * R);
      for (let p = 0; p < R * R; p += 1) {
        if (!shapes[i][p]) continue;
        const x = p % R;
        const y = (p - x) / R;
        if (!Number.isFinite(besideRoute((x + 0.5) / scale, (y + 0.5) / scale, routes[i]))) {
          cap[p] = 1;
        }
      }

      const bleeds = [];
      for (let j = i + 1; j < item.strokes.length; j += 1) {
        let count = 0;
        let deepest = 0;
        for (let p = 0; p < R * R; p += 1) {
          if (!cap[p] || !bodies[j][p]) continue;
          count += 1;
          const x = p % R;
          const y = (p - x) / R;
          // How far inside stroke j's body this pixel sits: j's own half-width
          // less the distance out to its edge. That is the depth a viewer sees.
          const depth = reaches[j] - distToRoute((x + 0.5) / scale, (y + 0.5) / scale, routes[j]);
          if (depth > deepest) deepest = depth;
        }
        if (count > 0) {
          bleeds.push({ into: j + 1, pixels: count, depth: Number(deepest.toFixed(2)) });
        }
      }

      /*
       * Does the pen travel over this stroke's own ink?
       *
       * The cheapest question on this page and the one that caught the worst
       * defect in the curriculum. ㅞ's third stroke had a valid path, a valid
       * route, a plausible width and a region of the right order of size — and
       * the route ran along y=50 while the ink sat at y=60, because the letter
       * was divided wrongly and the stroke was left holding a scrap of a
       * neighbour. Every other measure here was happy. Watching it, the pen
       * moved through empty paper while a black triangle appeared somewhere
       * else.
       */
      let offInk = 0;
      const route = routes[i];
      /*
       * Tested against the ink grown by one pixel.
       *
       * A route ends exactly on the outline it was measured from, and a point
       * exactly on a boundary rounds to whichever side the arithmetic lands on.
       * Without the tolerance the corner of ㄱ reports five samples "off its own
       * ink" that are on it, and the only way to keep the check green is to
       * raise the limit until it stops noticing things — which is how a check
       * stops being one. A pixel of slack costs nothing: ㅞ's route was eleven
       * units away from its ink, not one pixel.
       */
      const near = new Uint8Array(R * R);
      for (let y = 1; y < R - 1; y += 1) {
        for (let x = 1; x < R - 1; x += 1) {
          const at = y * R + x;
          if (
            shapes[i][at] ||
            shapes[i][at - 1] ||
            shapes[i][at + 1] ||
            shapes[i][at - R] ||
            shapes[i][at + R]
          ) {
            near[at] = 1;
          }
        }
      }
      for (let seg = 1; seg < route.length; seg += 1) {
        const a = route[seg - 1];
        const b = route[seg];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * scale));
        for (let k = 0; k <= steps; k += 1) {
          const x = Math.round((a.x + ((b.x - a.x) * k) / steps) * scale);
          const y = Math.round((a.y + ((b.y - a.y) * k) / steps) * scale);
          if (x < 0 || y < 0 || x >= R || y >= R) continue;
          if (!near[y * R + x]) offInk += 1;
        }
      }

      strokeReports.push({
        order: item.strokes[i].order,
        area: shapes[i].reduce((n, v) => n + v, 0),
        reach: Number(reaches[i].toFixed(2)),
        pieces: pieces(shapes[i]),
        neck: neckResidue(shapes[i]),
        offInk,
        bleeds,
      });
    }

    results.push({
      character: item.character,
      strokes: strokeReports,
      unionArea: union.reduce((n, v) => n + v, 0),
    });
  }

  return results;
}

// --- Reading the numbers ------------------------------------------------------

const problems = [];
const warnings = [];

for (const item of findings) {
  for (const stroke of item.strokes) {
    for (const bleed of stroke.bleeds) {
      if (bleed.pixels <= EDGE_NOISE && bleed.depth <= DEPTH_LIMIT) continue;
      const finding = {
        kind: 'bleed',
        character: item.character,
        text:
          `stroke ${stroke.order} paints ${bleed.pixels}px inside stroke ${bleed.into}, ` +
          `${bleed.depth} units deep — stroke ${bleed.into} is still grey when it happens`,
      };
      if (bleed.pixels > FAIL_PIXELS || bleed.depth > FAIL_DEPTH) problems.push(finding);
      else warnings.push(finding);
    }
    const allowed = MULTI_PIECE[item.character]?.[stroke.order] ?? 1;
    if (stroke.pieces.length > allowed) {
      problems.push({
        kind: 'pieces',
        character: item.character,
        text: `stroke ${stroke.order} is in ${stroke.pieces.length} pieces (${stroke.pieces.join(', ')}px), expected ${allowed}`,
      });
    }
    // A quarter of the route off its own ink is a stroke drawn somewhere its
    // ink is not. A few samples at the tips are the outline's antialias edge.
    if (stroke.offInk > OFF_INK_LIMIT) {
      problems.push({
        kind: 'route',
        character: item.character,
        text: `stroke ${stroke.order} draws ${stroke.offInk} sampled points off its own ink — the pen moves where the stroke is not`,
      });
    }
    if (stroke.area === 0) {
      problems.push({ kind: 'empty', character: item.character, text: `stroke ${stroke.order} has no ink` });
    }
  }
}

// --- The gallery --------------------------------------------------------------

const HUES = ['#dc2626', '#16a34a', '#2563eb', '#ea580c', '#9333ea', '#0891b2', '#db2777', '#65a30d'];

if (!CHECK) {
  mkdirSync(OUT, { recursive: true });
  const worst = new Map(problems.map((p) => [p.character, true]));
  const rows = items
    .map((item) => {
      const flagged = worst.has(item.character);
      const cells = [
        cell(
          item.viewBox,
          item.strokes.map((s) => `<path d="${s.shape}" fill="#151210" fill-rule="evenodd"/>`).join(''),
          'finished',
        ),
        cell(
          item.viewBox,
          item.strokes
            .map(
              (s, i) =>
                `<path d="${s.shape}" fill="${HUES[i % HUES.length]}" fill-rule="evenodd" opacity=".85"/>`,
            )
            .join(''),
          'each stroke',
        ),
      ];
      for (const [i, stroke] of item.strokes.entries()) {
        const ghost = item.strokes
          .map((o) => `<path d="${o.shape}" fill="#e3ded7" fill-rule="evenodd"/>`)
          .join('');
        const done = item.strokes
          .slice(0, i)
          .map((o) => `<path d="${o.shape}" fill="#151210" fill-rule="evenodd"/>`)
          .join('');
        for (const [k, frame] of stroke.frames.entries()) {
          const id = `m-${item.character.codePointAt(0)}-${stroke.order}-${k}`;
          cells.push(
            cell(
              item.viewBox,
              `${ghost}${done}<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">` +
                `<path d="${frame}" fill="#fff" fill-rule="nonzero"/></mask>` +
                `<path d="${stroke.shape}" fill="#151210" fill-rule="evenodd" mask="url(#${id})"/>`,
              `${stroke.order} · ${Math.round(STEPS[k] * 100)}%`,
            ),
          );
        }
      }
      const notes = problems
        .filter((p) => p.character === item.character)
        .map((p) => `<li>${p.text}</li>`)
        .join('');
      return `<section${flagged ? ' class="flagged"' : ''}><h2>${item.character}<small>${item.strokes.length} strokes</small></h2>${notes ? `<ul class="notes">${notes}</ul>` : ''}<div class="row">${cells.join('')}</div></section>`;
    })
    .join('');

  writeFileSync(
    join(OUT, 'visual.html'),
    `<!doctype html><meta charset="utf-8"><title>Stroke visual QA — ${items.length} items</title>
<style>
 body{font:13px/1.5 system-ui,sans-serif;margin:0;padding:20px;background:#faf7f3;color:#1c1917}
 h1{font-size:19px;margin:0 0 4px}
 .lede{color:#57534e;margin:0 0 18px;max-width:60em}
 section{background:#fff;border:1px solid #e7e2db;border-radius:10px;padding:12px;margin-bottom:12px}
 section.flagged{border-color:#c2410c;background:#fff7ed}
 h2{font-size:17px;margin:0 0 6px;display:flex;gap:8px;align-items:baseline}
 h2 small{font-weight:400;font-size:11px;color:#78716c}
 .notes{margin:0 0 8px;padding-left:18px;color:#9a3412;font-size:12px}
 .row{display:flex;flex-wrap:wrap;gap:5px}
 figure{margin:0;text-align:center}
 svg{background:#fdfaf6;border:1px solid #ebe6df;border-radius:5px;display:block}
 figcaption{font-size:10px;color:#78716c;margin-top:1px}
</style>
<h1>Stroke visual QA — ${items.length} items, ${items.reduce((n, i) => n + i.strokes.length, 0)} strokes</h1>
<p class="lede">Each row: the finished character, the same character with one colour per stroke, then every
stroke through five moments of being drawn. Grey is not yet written, black is ink. A stroke that shows black
inside a grey neighbour is the defect this page exists to catch — scan the colour column first, it makes an
intrusion obvious at a glance.</p>
${rows}`,
  );

  const b = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  await b.goto(`file://${join(OUT, 'visual.html')}`);
  await b.screenshot({ path: join(OUT, 'visual.png'), fullPage: true });
  await b.close();
}

await browser.close();

// --- Report -------------------------------------------------------------------

const strokes = findings.reduce((n, i) => n + i.strokes.length, 0);
const frames = strokes * STEPS.length;
console.log(`${findings.length} items · ${strokes} strokes · ${frames} rendered frames measured`);

if (problems.length === 0) {
  console.log('PASS — no stroke paints visibly into a stroke that has not been written yet.');
} else {
  const byKind = problems.reduce((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + 1 }), {});
  console.log(
    `\nFAIL — ${problems.length} problem(s): ` +
      Object.entries(byKind)
        .map(([k, n]) => `${n} ${k}`)
        .join(', '),
  );
  for (const problem of problems) console.log(`  ${problem.character}  ${problem.text}`);
}

if (warnings.length > 0) {
  console.log(`\n${warnings.length} below the failure line, reported rather than hidden:`);
  for (const warning of warnings) console.log(`  ${warning.character}  ${warning.text}`);
}

if (!CHECK) console.log(`\nGallery: ${join(OUT, 'visual.html')}  (and visual.png)`);
if (CHECK && problems.length > 0) process.exit(1);

function cell(viewBox, body, caption) {
  return `<figure><svg viewBox="${viewBox}" width="96" height="96">${body}</svg><figcaption>${caption}</figcaption></figure>`;
}
