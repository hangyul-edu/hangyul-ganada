#!/usr/bin/env node
/**
 * The instructional stroke geometry, checked.
 *
 *   npm run strokes:qa            report
 *   npm run strokes:qa -- --check exit non-zero on a failure
 *
 * ## What this can and cannot decide
 *
 * It decides whether the *data* is sound: every taught character has geometry,
 * the stroke counts agree with what the lesson tells the learner, nothing falls
 * outside the box, an end marked `join` really does land on another stroke, and
 * a curve is sampled finely enough that the polyline standing in for it is not
 * a polygon.
 *
 * It cannot decide whether a letter looks like the letter. Every one of these
 * assertions passed — 73 items, 269 strokes — through every round in which the
 * demonstration was visibly broken on screen, because what was wrong was never
 * the data. `npm run strokes:visual` renders the frames and puts them in front
 * of a person, and that is the check that has actually caught things.
 *
 * ## Why there is less here than there used to be
 *
 * The previous stroke model cut each stroke out of a rasterised glyph, and most
 * of this file was defending against what that cut could produce: a stroke with
 * no ink in it, a region traced into two islands, a reveal ribbon that did not
 * match the outline it was uncovering, ink awarded to a stroke that had not been
 * written. None of those are reachable now. A stroke is one authored path drawn
 * with one pen; there is no cut to go wrong, no second geometry to disagree with
 * the first, and no ownership to get wrong. Checks that can no longer fail were
 * removed rather than left in to look thorough.
 */

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { STROKE_VIEWBOX, hasVectorGlyph, vectorGlyph } from '../apps/web/src/data/strokeVectors.ts';
import { layoutMarkers } from '../apps/web/src/ui/strokeMarkers.ts';
import { isSyllable } from '../apps/web/src/data/jamo.ts';

const CHECK = process.argv.includes('--check');
const failures = [];
const fail = (character, what) => failures.push(`${character}: ${what}`);

const shipping = ALL_CHARACTERS.map((c) => c.character);

// --- 1. every shipping item has geometry, and nothing else does --------------

for (const character of shipping) {
  if (!hasVectorGlyph(character)) {
    fail(character, 'the curriculum teaches it and there is no stroke geometry — see data/strokes.ts');
  }
}

// --- 2. every glyph is well formed -------------------------------------------

const NUMBER = /-?\d+(?:\.\d+)?/g;

/** A path flattened to points, cubics sampled. Mirrors the renderer's own. */
function flatten(d) {
  const out = [];
  let current = { x: 0, y: 0 };
  let first = { x: 0, y: 0 };
  for (const command of d.match(/[MLCZ][^MLCZ]*/g) ?? []) {
    const n = (command.slice(1).match(NUMBER) ?? []).map(Number);
    if (command[0] === 'M') {
      current = { x: n[0], y: n[1] };
      first = current;
      out.push(current);
    } else if (command[0] === 'L') {
      current = { x: n[0], y: n[1] };
      out.push(current);
    } else if (command[0] === 'C') {
      const [c1x, c1y, c2x, c2y, x, y] = n;
      for (let step = 1; step <= 12; step += 1) {
        const t = step / 12;
        const u = 1 - t;
        out.push({
          x: u ** 3 * current.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t ** 3 * x,
          y: u ** 3 * current.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t ** 3 * y,
        });
      }
      current = { x, y };
    } else {
      out.push(first);
      current = first;
    }
  }
  return out;
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const distanceToPath = (p, points) =>
  points.slice(1).reduce((best, _, i) => Math.min(best, distanceToSegment(p, points[i], points[i + 1])), Infinity);

/**
 * The sharpest corner a stroke turns through, in degrees.
 *
 * A curve is drawn from cubics but *sampled* into a polyline for the grader and
 * the marker layout, and the sample is only as good as its resolution. ㅇ used
 * to be authored as a twelve-point polygon and read on screen as a dodecagon;
 * what says it no longer does is the angle between consecutive samples.
 */
function sharpestTurn(points) {
  // A closed path's `Z` repeats the point it started from, and a segment of no
  // length has no direction — measuring a turn across one reports about 180°
  // for every ring in the curriculum, which is a bug in the ruler rather than a
  // polygon on the screen.
  const real = points.filter(
    (p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-6,
  );
  let worst = 0;
  for (let i = 2; i < real.length; i += 1) {
    const [a, b, c] = [real[i - 2], real[i - 1], real[i]];
    const turn = Math.abs(
      Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x),
    );
    worst = Math.max(worst, Math.min(turn, Math.PI * 2 - turn));
  }
  return (worst * 180) / Math.PI;
}

let strokeCount = 0;

for (const character of shipping) {
  if (!hasVectorGlyph(character)) continue;
  const glyph = vectorGlyph(character);
  const expected = ALL_CHARACTERS.find((c) => c.character === character);

  if (glyph.viewBox !== STROKE_VIEWBOX) fail(character, `viewBox is "${glyph.viewBox}"`);
  if (!(glyph.pen > 0) || !Number.isFinite(glyph.pen)) fail(character, `pen is ${glyph.pen}`);
  if (glyph.strokes.length === 0) fail(character, 'has no strokes');

  // The stroke count is what the lesson tells the learner, so the two data sets
  // may not disagree about it.
  if (glyph.strokes.length !== expected.strokes.length) {
    fail(
      character,
      `${glyph.strokes.length} strokes drawn, ${expected.strokes.length} in the curriculum`,
    );
  }

  const orders = glyph.strokes.map((s) => s.order).join();
  const wanted = glyph.strokes.map((_, i) => i + 1).join();
  if (orders !== wanted) fail(character, `stroke order is [${orders}], not 1…${glyph.strokes.length}`);

  const half = glyph.pen / 2;
  const flattened = glyph.strokes.map((s) => flatten(s.d));

  glyph.strokes.forEach((stroke, index) => {
    strokeCount += 1;
    const where = `stroke ${stroke.order}`;
    const points = flattened[index];

    if (points.length < 2) fail(character, `${where} has no path`);
    for (const value of stroke.d.match(NUMBER) ?? []) {
      if (!Number.isFinite(Number(value))) fail(character, `${where} has a non-finite coordinate`);
    }

    // The ink is the path plus half a pen either side, and all of it has to be
    // on the paper — a stroke clipped by the viewBox edge is a stroke a learner
    // sees cut off.
    for (const p of points) {
      if (p.x - half < -0.01 || p.y - half < -0.01 || p.x + half > 100.01 || p.y + half > 100.01) {
        fail(character, `${where} reaches (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), outside the box`);
        break;
      }
    }

    if (!(stroke.length > 0)) fail(character, `${where} has zero length`);

    // Sampled finely enough to stand in for its own curve. Fifteen degrees is
    // about where a turn stops reading as a curve and starts reading as a
    // corner at the size a lesson draws these.
    const turn = sharpestTurn(points);
    if (stroke.closed && turn > 15) {
      fail(character, `${where} is a ring whose sample turns ${turn.toFixed(1)}° — it will read as a polygon`);
    }

    // An end that claims to land on another stroke has to actually land on one,
    // because that claim is what suppresses its terminal: if it is wrong, the
    // stroke stops in open paper with a squared-off end and nothing to hide it.
    const ends = [
      ['start', stroke.ends.start, { x: stroke.start[0], y: stroke.start[1] }],
      ['end', stroke.ends.end, { x: stroke.finish[0], y: stroke.finish[1] }],
    ];
    for (const [side, kind, point] of ends) {
      if (kind === 'free' || stroke.closed) continue;
      const nearest = Math.min(
        ...flattened.filter((_, other) => other !== index).map((other) => distanceToPath(point, other)),
      );
      if (!(nearest <= half + 0.01)) {
        fail(
          character,
          `${where}'s ${side} is marked "${kind}" but the nearest other stroke is ${nearest.toFixed(1)} away, more than half a pen`,
        );
      }
    }
  });

  // --- 3. the numbered markers -----------------------------------------------
  const radius = isSyllable(character) ? 4 : 5.6;
  const markers = layoutMarkers(glyph.strokes, radius);
  if (markers.length !== glyph.strokes.length) {
    fail(character, `${markers.length} markers for ${glyph.strokes.length} strokes`);
  }
  for (let a = 0; a < markers.length; a += 1) {
    for (let b = a + 1; b < markers.length; b += 1) {
      const gap = Math.hypot(
        markers[a].label.x - markers[b].label.x,
        markers[a].label.y - markers[b].label.y,
      );
      if (gap < radius * 2) {
        fail(character, `markers ${markers[a].order} and ${markers[b].order} overlap`);
      }
    }
  }
}

// --- report -------------------------------------------------------------------

const counted = shipping.filter(hasVectorGlyph).length;
console.log(`Stroke geometry — ${counted} items, ${strokeCount} strokes`);

if (failures.length === 0) {
  console.log('  no problems found in the data.');
  console.log('  this says nothing about how it looks — run `npm run strokes:visual`.');
} else {
  console.log(`\n  ${failures.length} problem(s):`);
  for (const line of failures) console.log(`    ${line}`);
}

if (CHECK && failures.length > 0) process.exit(1);
