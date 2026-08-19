#!/usr/bin/env node
/**
 * Stroke-asset QA, for the whole shipping curriculum.
 *
 *   npm run strokes:qa            validate, and build the gallery to look at
 *   npm run strokes:qa -- --check validate only; exit non-zero on any failure
 *
 * ## Why this exists
 *
 * The demonstration was fixed five times by looking at one screenshot, and five
 * times something else in the curriculum was still broken — because a screenshot
 * is one character at one instant, and the thing being judged is seventy-odd
 * characters through every instant of being written.
 *
 * So this checks *all* of them, and not only their finished frames: every stroke
 * of every taught item at 0 / 25 / 50 / 75 / 100 per cent, which is the part a
 * learner actually watches and the part every previous round got wrong. The
 * gallery is written to `.stroke-qa/` and is for looking at; nothing ships it and
 * nothing in the app imports it.
 *
 * ## What it can and cannot decide
 *
 * A machine check cannot see an ugly stroke. It can see the failures that
 * *produce* one — a NaN in a path, a shape outside the box, a marker off the
 * paper, a stroke that claims no ink, a curriculum item with no asset at all —
 * and those are what fail `--check`, in `verify:quick`, before anything is
 * built. Whether the result is a shape a Korean reader recognises is decided by
 * opening the gallery, and there is no substitute for that.
 *
 * The one thing here that *is* decided rather than eyeballed is the union: every
 * asset's strokes are cut from the reference glyph, so their union has to be
 * that glyph. That is checked at build time, in `build-stroke-assets.mjs`, by
 * construction — assets only ever contain pixels the font drew.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { isSyllable } from '../apps/web/src/data/jamo.ts';
import {
  STROKE_ASSETS,
  STROKE_ASSET_FACE,
  drawLength,
  drawPoints,
  hasStrokeAsset,
  outlinePoints,
  strokeReveal,
} from '../apps/web/src/data/strokeAssets.ts';
import { layoutMarkers } from '../apps/web/src/ui/strokeMarkers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', '.stroke-qa');
const CHECK = process.argv.includes('--check');

/** Frames rendered per stroke. The middle three are what nobody was looking at. */
const STEPS = [0, 0.25, 0.5, 0.75, 1];

/**
 * Shorter than this many pen-widths and a stroke is one mark, not a movement.
 *
 * ㅎ's dot is half a pen long and ㅊ's tick is two; neither is something a hand
 * paces out, and asking "is a quarter of it black a quarter of the way along"
 * of a single dab is asking a question it has no way to answer. Everything
 * longer is a stroke a learner watches being drawn, and is held to the pacing
 * bound below.
 */
const PACEABLE_PENS = 2.5;


const failures = [];
const fail = (character, what) => failures.push(`${character}: ${what}`);

// --- 1. every shipping item has an asset, and nothing else does --------------

const shipping = ALL_CHARACTERS.map((c) => c.character);
const missing = shipping.filter((character) => !hasStrokeAsset(character));
for (const character of missing) {
  fail(character, 'the curriculum teaches it and there is no stroke asset — run `npm run strokes:build`');
}
const orphans = Object.keys(STROKE_ASSETS).filter((character) => !shipping.includes(character));
for (const character of orphans) {
  fail(character, 'an asset exists for a character the curriculum does not teach');
}

// --- 2. every asset is well formed -------------------------------------------

const NUMBER = /-?\d+(\.\d+)?/g;

function numbersIn(path) {
  return (path.match(NUMBER) ?? []).map(Number);
}

for (const character of shipping) {
  if (!hasStrokeAsset(character)) continue;
  const asset = STROKE_ASSETS[character];
  const expected = ALL_CHARACTERS.find((c) => c.character === character);

  if (asset.viewBox !== '0 0 100 100') fail(character, `viewBox is "${asset.viewBox}"`);
  if (!(asset.pen > 0) || !Number.isFinite(asset.pen)) fail(character, `pen is ${asset.pen}`);
  if (asset.strokes.length === 0) fail(character, 'has no strokes');

  // The stroke count is what the lesson tells the learner, so the two data sets
  // may not disagree about it.
  if (asset.strokes.length !== expected.strokes.length) {
    fail(
      character,
      `${asset.strokes.length} strokes in the asset, ${expected.strokes.length} in the curriculum`,
    );
  }

  const orders = asset.strokes.map((s) => s.order);
  const wanted = asset.strokes.map((_, i) => i + 1);
  if (orders.join() !== wanted.join()) {
    fail(character, `stroke order is [${orders.join(', ')}], not 1…${asset.strokes.length}`);
  }

  for (const stroke of asset.strokes) {
    const where = `stroke ${stroke.order}`;

    for (const [name, path] of [['shape', stroke.shape], ['draw', stroke.draw]]) {
      if (!path || path.length === 0) {
        fail(character, `${where} has an empty ${name}`);
        continue;
      }
      if (/NaN|Infinity|undefined|null/.test(path)) {
        fail(character, `${where} ${name} contains ${path.match(/NaN|Infinity|undefined|null/)[0]}`);
        continue;
      }
      const values = numbersIn(path);
      if (values.length === 0 || !values.every(Number.isFinite)) {
        fail(character, `${where} ${name} has a coordinate that is not a number`);
        continue;
      }
      // Everything is drawn in the box; nothing may be outside it. A hair of
      // slack, because a contour traced on a pixel grid can land on the edge.
      const out = values.filter((v) => v < -0.5 || v > 100.5);
      if (out.length) fail(character, `${where} ${name} leaves the viewBox at ${out[0]}`);
    }

    // A filled outline needs at least one closed ring, and a ring needs area.
    if (!stroke.shape.startsWith('M') || !stroke.shape.includes('Z')) {
      fail(character, `${where} shape is not a closed outline`);
    }
    if (area(stroke.shape) < 1) {
      fail(character, `${where} claims almost no ink (${area(stroke.shape).toFixed(2)} sq units)`);
    }

    const points = drawPoints(stroke.draw);
    if (points.length < 2) fail(character, `${where} draw has fewer than two points`);

    /*
     * The last frame of a stroke has to be the whole stroke.
     *
     * The animation uncovers a stroke by sweeping a brush `reveal` wide along
     * its centreline. If any part of the outline lies further from that line
     * than the brush reaches, the stroke is still partly hidden when it is
     * supposed to be finished and snaps into place a moment later. That flick
     * is invisible in a still and obvious in motion, which is exactly the kind
     * of defect a screenshot review keeps missing, so it is measured here.
     */
    if (!(stroke.reveal > 0)) {
      fail(character, `${where} has no reveal width`);
    } else if (points.length >= 2) {
      const uncovered = furthestFromPath(stroke.shape, points) - stroke.reveal / 2;
      if (uncovered > 0.01) {
        fail(
          character,
          `${where} is ${uncovered.toFixed(1)} units wider than its reveal — part of it would still be hidden at 100%`,
        );
      }
    }

    /*
     * …and no frame before the last may show ink the pen has not reached yet.
     *
     * This is the check the wedge got past. The reveal brush has to be wide —
     * on ㅂ it is 25 units against a pen of 9, because it must cover the bumps
     * where one stroke meets another — and with a **round** cap that width
     * became a semicircle twelve units *ahead* of the pen. Every junction bump
     * inside that radius turned black early: the triangle at the corner of ㄱ,
     * the nub on the stem of ㅂ, the spike off the top bar of ㄹ.
     *
     * Nothing in this file objected, because every check here was about the
     * finished stroke. So this one is about the unfinished ones: at each frame,
     * how far along the stroke is the furthest black pixel, compared with how
     * far the pen has actually travelled?
     */
    /*
     * A stroke may only be as black as the pen has travelled.
     *
     * The bound is 0.2, and it is set where it is because of what it has to
     * catch. The round-capped brush this replaced blacked 49% of ㅂ's stem with
     * the pen a quarter of the way down it — a deviation of 0.24 — and the
     * brush that reached across ㅎ's ring managed the same. The ribbon that
     * ships stays within 0.16 on every stroke long enough to have a pace, so
     * the bound sits between the two with room on both sides.
     *
     * Strokes shorter than `PACEABLE_PENS` are exempt — the dot on ㅎ, the tick
     * on ㅊ, the short branch of ㅐ. Each is a couple of pen-widths long, which
     * is one mark of the pen, and "a quarter of it black a quarter of the way
     * along" is not a thing a dab can do.
     */
    if (points.length >= 2 && drawLength(stroke.draw) >= asset.pen * PACEABLE_PENS) {
      for (const fraction of STEPS) {
        if (fraction <= 0) continue;
        const share = revealedShare(stroke, fraction);
        if (Math.abs(share - fraction) > 0.2) {
          fail(
            character,
            `${where} is ${(share * 100).toFixed(0)}% black when the pen is ` +
              `${(fraction * 100).toFixed(0)}% along — ink is arriving ` +
              `${share > fraction ? 'ahead of' : 'behind'} the pen`,
          );
          break;
        }
      }
    }

    // The marker's anchor is the pen landing. If it is not on the stroke's own
    // first point, the demonstration is telling the learner to start elsewhere.
    const [sx, sy] = stroke.start;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
      fail(character, `${where} start point is not a number`);
    } else if (Math.hypot(sx - points[0].x, sy - points[0].y) > 0.01) {
      fail(character, `${where} start point is not where its path begins`);
    } else if (sx < 0 || sx > 100 || sy < 0 || sy > 100) {
      fail(character, `${where} starts outside the viewBox`);
    }
  }

  // --- 3. the markers are legible ---------------------------------------------
  const radius = isSyllable(character) ? 4 : 5.6;
  const markers = layoutMarkers(asset.strokes, radius);
  for (const marker of markers) {
    const { x, y } = marker.label;
    if (x < radius || y < radius || x > 100 - radius || y > 100 - radius) {
      fail(character, `marker ${marker.order} is off the paper at ${x.toFixed(1)}, ${y.toFixed(1)}`);
    }
  }
  for (let a = 0; a < markers.length; a += 1) {
    for (let b = a + 1; b < markers.length; b += 1) {
      const gap = Math.hypot(
        markers[a].label.x - markers[b].label.x,
        markers[a].label.y - markers[b].label.y,
      );
      // Any overlap at all. Two numbered discs that intersect read as one
      // smudge, which is exactly what 글 used to show, and a learner cannot
      // recover the stroke order from a smudge.
      if (gap < radius * 1.95) {
        fail(
          character,
          `markers ${markers[a].order} and ${markers[b].order} overlap (${gap.toFixed(1)} apart, radius ${radius})`,
        );
      }
    }
  }
}

/**
 * How much of a stroke is uncovered at a given progress, as a share of it.
 *
 * ## Why this rather than "how far ahead of the pen is the furthest ink"
 *
 * That was the first version, and on a closed stroke it cannot be made to mean
 * anything. ㅇ's centreline returns to where it began, so ink beside the start
 * of the ring is equally well described as being at the very beginning or the
 * very end of the stroke, and no tie-break makes that ambiguity go away — it is
 * a property of the shape, not of the measurement. Every ㅇ in the curriculum
 * reported half a lap of overshoot while rendering perfectly.
 *
 * This asks a question that has one answer: **is more of the stroke black than
 * the pen has travelled over?** Sampled on the outline, which is dense, cheap
 * and where the artefacts live.
 *
 * It catches every artefact this pass was opened for. A round cap that put a
 * sixth of the glyph ahead of the pen turned junction bumps black early, so the
 * share ran ahead. A brush wide enough to reach across ㅎ's ring blacked the far
 * side at once, so the share ran far ahead. A ribbon that collapsed to a
 * hairline uncovered a thread instead of the stroke, so the share fell behind.
 */
function revealedShare(stroke, fraction) {
  const outline = outlinePoints(stroke.shape, 2);
  if (outline.length === 0) return fraction;
  const revealed = polygonOf(strokeReveal(stroke, fraction).path);
  if (revealed.length === 0) return 0;

  let inked = 0;
  for (const point of outline) if (inside(point, revealed)) inked += 1;
  return inked / outline.length;
}

/** The quads of a reveal path, each a closed `M …L…Z` subpath. */
function polygonOf(path) {
  return path
    .split('M')
    .filter(Boolean)
    .map((piece) => {
      const values = numbersIn(piece);
      const points = [];
      for (let i = 0; i + 1 < values.length; i += 2) points.push({ x: values[i], y: values[i + 1] });
      return points;
    })
    .filter((points) => points.length >= 3);
}

/** Inside any of the quads. Ray casting; they are convex and closed. */
function inside(point, quads) {
  return quads.some((polygon) => {
    let within = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const a = polygon[i];
      const b = polygon[j];
      if (a.y > point.y === b.y > point.y) continue;
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) within = !within;
    }
    return within;
  });
}

/** The furthest any point of a filled outline lies from a centreline. */
function furthestFromPath(shape, line) {
  const values = numbersIn(shape);
  let furthest = 0;
  for (let i = 0; i + 1 < values.length; i += 2) {
    let nearest = Infinity;
    for (let j = 1; j < line.length; j += 1) {
      const ax = line[j - 1].x;
      const ay = line[j - 1].y;
      const dx = line[j].x - ax;
      const dy = line[j].y - ay;
      const length = dx * dx + dy * dy;
      let t = length === 0 ? 0 : ((values[i] - ax) * dx + (values[i + 1] - ay) * dy) / length;
      t = Math.max(0, Math.min(1, t));
      nearest = Math.min(nearest, Math.hypot(values[i] - (ax + t * dx), values[i + 1] - (ay + t * dy)));
    }
    if (nearest > furthest) furthest = nearest;
  }
  return furthest;
}

/** A polygon's area by the shoelace formula, summed over a shape's rings. */
function area(shape) {
  let total = 0;
  for (const ring of shape.split('M').filter(Boolean)) {
    const values = numbersIn(ring);
    let sum = 0;
    for (let i = 0; i + 3 < values.length; i += 2) {
      sum += values[i] * values[i + 3] - values[i + 2] * values[i + 1];
    }
    total += Math.abs(sum) / 2;
  }
  return total;
}

// --- 4. the gallery ----------------------------------------------------------

function frame(asset, upTo, fraction, size) {
  const shown = asset.strokes.slice(0, upTo);
  const active = fraction > 0 ? asset.strokes[upTo] : undefined;
  const id = `m${asset.character.codePointAt(0)}-${upTo}-${Math.round(fraction * 100)}`;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
    ${asset.strokes.map((s) => `<path d="${s.shape}" fill="#d9d9d9" fill-rule="evenodd"/>`).join('')}
    ${shown.map((s) => `<path d="${s.shape}" fill="#111" fill-rule="evenodd"/>`).join('')}
    ${
      active
        ? (() => {
            // The same brush the app draws, from the same function. A gallery
            // rendered with its own copy of this markup is a gallery that can
            // pass while the product is broken, which is what happened.
            const brush = strokeReveal(active, fraction);
            return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><path d="${brush.path}" fill="#fff"/></mask><path d="${active.shape}" fill="#111" fill-rule="evenodd" mask="url(#${id})"/>`;
          })()
        : ''
    }
  </svg>`;
}

function markerLayer(asset) {
  const radius = isSyllable(asset.character) ? 4 : 5.6;
  return layoutMarkers(asset.strokes, radius)
    .map(
      (m) =>
        `${m.tethered ? `<line x1="${m.anchor.x}" y1="${m.anchor.y}" x2="${m.label.x}" y2="${m.label.y}" stroke="#999" stroke-width="0.6"/>` : ''}<circle cx="${m.label.x}" cy="${m.label.y}" r="${radius}" fill="#fff" stroke="#999" stroke-width="0.9"/><text x="${m.label.x}" y="${m.label.y + radius * 0.36}" font-size="${radius * 1.05}" text-anchor="middle" font-family="system-ui" font-weight="700" fill="#444">${m.order}</text>`,
    )
    .join('');
}

const cards = shipping
  .filter(hasStrokeAsset)
  .map((character) => {
    const asset = STROKE_ASSETS[character];
    const strip = asset.strokes
      .map((_, index) =>
        STEPS.map(
          (step) =>
            `<div class="f">${frame(asset, index, step, 92)}<span>${index + 1} · ${Math.round(step * 100)}%</span></div>`,
        ).join(''),
      )
      .join('');
    return `<section class="card">
    <h2>${character} <small>${asset.group} · ${asset.strokes.length} strokes · ${asset.segmentation ?? '—'}</small></h2>
    <div class="pair">
      <figure><div class="ref">${asset.strokes.map((s) => `<path d="${s.shape}"/>`).join('') && `<svg viewBox="0 0 100 100" width="150" height="150">${asset.strokes.map((s) => `<path d="${s.shape}" fill="#111" fill-rule="evenodd"/>`).join('')}</svg>`}</div><figcaption>REFERENCE — union of all strokes</figcaption></figure>
      <figure><div class="ref">${frame(asset, asset.strokes.length, 0, 150)}</div><figcaption>FINAL STROKE FRAME</figcaption></figure>
      <figure><div class="ref"><svg viewBox="0 0 100 100" width="150" height="150">${asset.strokes.map((s) => `<path d="${s.shape}" fill="#111" fill-rule="evenodd"/>`).join('')}${markerLayer(asset)}</svg></div><figcaption>with markers</figcaption></figure>
    </div>
    <div class="strip">${strip}</div>
  </section>`;
  })
  .join('\n');

const strokes = shipping.filter(hasStrokeAsset).reduce((n, c) => n + STROKE_ASSETS[c].strokes.length, 0);
const frames = strokes * STEPS.length;

if (!CHECK) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Stroke QA — ${shipping.length} items</title>
<style>
  body { font: 14px/1.5 system-ui; margin: 0; padding: 24px; background: #f6f6f6; color: #111; }
  h1 { font-size: 20px; }
  .card { background: #fff; border: 1px solid #e4e4e4; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
  h2 { margin: 0 0 12px; font-size: 26px; }
  h2 small { font-size: 13px; font-weight: 400; color: #777; }
  .pair { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 14px; }
  .pair figure { margin: 0; }
  .pair figcaption { font-size: 11px; color: #777; text-align: center; margin-top: 4px; letter-spacing: .04em; }
  .ref { background: #fcfcfc; border: 1px solid #eee; border-radius: 8px; }
  .strip { display: flex; flex-wrap: wrap; gap: 6px; }
  .f { text-align: center; }
  .f svg { background: #fcfcfc; border: 1px solid #eee; border-radius: 6px; display: block; }
  .f span { font-size: 10px; color: #888; }
  .overlay .ref svg, .overlay .f svg { opacity: .5; }
  label { position: sticky; top: 0; display: block; background: #fff; padding: 8px 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #e4e4e4; }
</style>
<h1>Stroke QA — ${shipping.length} items, ${strokes} strokes, ${frames} frames</h1>
<p>Cut from <code>${STROKE_ASSET_FACE}</code>. Every stroke is an outline taken from the reference glyph, so the union of a character's strokes is that glyph.</p>
<label><input type="checkbox" onchange="document.body.classList.toggle('overlay', this.checked)"> Overlay mode — draw everything at 50% opacity</label>
${cards}
`,
  );
}

if (failures.length) {
  console.error(`Stroke QA: ${failures.length} failure(s)\n`);
  for (const line of failures) console.error(`  ✗ ${line}`);
  console.error('\nFix the assets — see scripts/build-stroke-assets.mjs. There is no fallback renderer.');
  process.exit(1);
}

console.log(
  `Stroke QA: ${shipping.length} items, ${strokes} strokes, ${frames} frames — every check passed.`,
);
if (!CHECK) console.log(`Gallery: ${join(OUT, 'index.html')}`);
