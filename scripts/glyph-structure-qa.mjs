#!/usr/bin/env node
/**
 * Is the letter *well formed* — as opposed to well proportioned?
 *
 *   npm run glyph:structure            measure, and write the audit sheets
 *   npm run glyph:structure -- --check measure only; exit non-zero on a finding
 *
 * ## Why this exists next to the three gates that already look at glyphs
 *
 * `strokes:qa` asks whether the data is well formed. `strokes:visual` asks
 * whether the ink behaves as the animation runs. `glyphshape:qa` asks whether
 * the finished letter agrees with the reference face, and scores it as
 * intersection over union.
 *
 * All three were green on a ㅌ with a square bite out of its upper-left corner
 * and on a 꽃 whose ㄲ was bridged through the middle by the ㅗ's stem. The
 * reason is the same in each case and it is worth stating plainly:
 *
 * **A similarity percentage cannot see a defect smaller than its own
 * tolerance.** ㅌ's notch is 4.5 × 2 units of a 100-unit box — about 0.1% of the
 * glyph's ink. Against a floor of 93% explained ink it is invisible; on screen
 * at 200 px it is a chip out of the corner of the letter, and it is the first
 * thing a person notices. 꽃 scored 97% while its tense consonant read as one
 * shape with a spur in the middle instead of two ㄱ.
 *
 * So this file asks *structural* questions, which have yes/no answers and no
 * tolerance to hide inside:
 *
 * | | |
 * | --- | --- |
 * | **Junction continuity** | Where two strokes meet end to end, is the corner solid? |
 * | **Predicted islands** | Does the ink separate into exactly the pieces the geometry says it should? |
 * | **Tense-pair separation** | Are the two halves of ㄲ ㄸ ㅃ ㅆ ㅉ two pieces of ink, everywhere they appear? |
 * | **Part collision** | In a block, do any two letters share ink? |
 * | **Clipping** | Does any ink reach the edge of the box it is drawn in? |
 * | **One geometry** | Is the last frame of the animation the finished glyph, and is the guide the same paths as the mask? |
 *
 * ## The inventory is discovered, not listed
 *
 * Every character `data/characters.ts` teaches, filtered to the ones that have
 * instructional geometry — which is all of them, and the gate says so rather
 * than assuming it. Nothing here names 73, and nothing here names a letter
 * except in a *declared* exception with a reason attached. A syllable added to
 * the curriculum tomorrow is audited tomorrow.
 *
 * ## Junction continuity, measured
 *
 * At every point where one stroke's end meets another stroke's end, the square
 * of one pen centred on that point must be solid ink. That is what a flush
 * corner *is*: the two strokes between them fill their shared corner, and any
 * hole in it is a notch, a chip or a seam.
 *
 * It is measured at both ends of the junction, and that matters. When this was
 * written `strokeVectors` classified only the *later* stroke's end as a
 * `corner`, so probing the classification alone looked at the one end that is
 * always covered by its own extension. ㅌ passed that way. The junction is a
 * place, not a property of one stroke, so both ends that arrive at it are
 * probed — and that is still true now the extension is symmetric, because a
 * junction can be broken by geometry that is nothing to do with terminals.
 *
 * The square is inset by one and a half pixels. At a correct corner the ink
 * boundary lies exactly on the square's edge, and half-covered edge pixels fall
 * under the alpha threshold — a uniform 4% deficit that has nothing to do with
 * the letter. The inset removes it and does not hide a notch, which is an order
 * of magnitude larger: ㅌ measured 91%, ㄷ 90%, ㄹ 52%.
 *
 * ## Predicted islands
 *
 * The strokes are a graph: two strokes are connected when their centrelines
 * come within a pen of each other, which is exactly when their ink touches.
 * The number of connected components in that graph is how many separate pieces
 * of ink the *geometry* says the letter has. The raster is then counted.
 *
 * Disagreement is a defect in either direction and neither needs a table of
 * expected counts per letter. Fewer islands than predicted means two pieces
 * that should be apart are bridged — ㄲ closing up into one mark. More means a
 * stroke that should join has come adrift — a gap where a corner should be.
 *
 * ## What this file cannot see, and which gate does
 *
 * Every question here is asked of the canonical geometry and its own raster, so
 * a defect that is *consistent* — a stroke that was never authored, an extra
 * one that was — is invisible to it. Deleting the base of ㄴ leaves a letter
 * whose islands, junctions and parts all agree perfectly with a geometry that
 * is simply wrong, and this file passes it. Measured: it does.
 *
 * That is `glyphshape:qa`'s job, and it is why the reference typeface has to
 * stay in the pipeline as an **independent oracle**. Run against the same
 * mutation it reports ㄴ, 나, 다, 안, 산 and 한 — a missing segment, in the six
 * places it appears. The two gates are not alternatives:
 *
 * | | |
 * | --- | --- |
 * | `glyphshape:qa` | is it the right letter? — canonical against the face |
 * | `glyph:structure` | is it a well-formed drawing? — canonical against itself |
 *
 * The one structural claim here that is *about* the app rather than about the
 * geometry is the last: that every taught character actually uses the canonical
 * geometry. Nothing else could notice a character quietly dropped back to being
 * guided in the typeface, because every other gate reads `vectorGlyph` directly
 * and would be comparing the canonical form with itself.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { blockLetterForms } from '../apps/web/src/data/compose.ts';
import { isSyllable, toJamo } from '../apps/web/src/data/jamo.ts';
import { hasVectorGlyph, vectorGlyph } from '../apps/web/src/data/strokeVectors.ts';
import { usesCanonicalGeometry } from '../apps/web/src/features/writing/glyphSpec.ts';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const OUT = join(ROOT, 'docs/glyph-audit');
const CHECK = process.argv.includes('--check');

/** The raster every measurement is taken on, for a 0–100 viewBox. */
const R = 512;

/** Ink coverage a junction square must reach. */
const JUNCTION_FLOOR = 0.995;

/**
 * How close two ends have to be to count as arriving at the same junction.
 *
 * Three quarters of a pen. `strokeVectors` uses half a pen to *classify* a
 * corner; this is deliberately wider, because an end that is nearly-but-not-
 * quite at another end is the defect being looked for, and a probe that only
 * looked where the classifier already looked would miss it.
 */
const JUNCTION_REACH = 0.75;

/**
 * Letters that are one letter written twice, and the base they double.
 *
 * Not a list of exceptions — a list of *claims*. Each of these must come out as
 * two separate pieces of ink wherever it appears, standalone or inside a block,
 * because being two of something is the entire difference between ㄱ and ㄲ.
 */
const TENSE_PAIRS = new Map([
  ['ㄲ', 'ㄱ'],
  ['ㄸ', 'ㄷ'],
  ['ㅃ', 'ㅂ'],
  ['ㅆ', 'ㅅ'],
  ['ㅉ', 'ㅈ'],
]);

/**
 * Structural exceptions, one line each, with the reason.
 *
 * Empty, and it should stay that way. A letter that cannot pass a structural
 * check is a letter that is drawn wrongly; the only entries that ever belong
 * here are ones where the *educational* form genuinely differs from what the
 * check assumes, and each has to say which letter, which check, and why.
 */
const STRUCTURAL_EXCEPTIONS = new Map([]);

/**
 * The two named regressions this gate was written for.
 *
 * Pinned by hand, in addition to the general checks, because a general check
 * that stops covering the case it was written for is the failure mode gates
 * have. If either of these ever passes for the wrong reason — the letter
 * removed from the curriculum, the geometry replaced — the fixture fails on the
 * absence rather than passing silently.
 */
const REGRESSIONS = [
  {
    character: 'ㅌ',
    what: 'the upper-left corner is solid',
    // The junction between the top bar's start and the upright's start. Before
    // the fix the upright began two units under the bar and its outer half was
    // uncovered: a 4.5 × 2 unit bite, 91% of the junction square.
    check: (m) => m.junctions.every((j) => j.ratio >= JUNCTION_FLOOR),
  },
  {
    character: '꽃',
    what: 'the two ㄱ of ㄲ are separate pieces of ink',
    check: (m) => m.islands >= 3 && m.collisions.length === 0,
  },
];

// --- inventory ---------------------------------------------------------------

const inventory = ALL_CHARACTERS.map((c) => c.character);
const missing = inventory.filter((c) => !hasVectorGlyph(c));
const items = inventory.filter(hasVectorGlyph);

/** Strokes grouped by the letter of the block they belong to. */
function partsOf(character) {
  if (!isSyllable(character)) return null;
  const jamo = toJamo(character).filter(Boolean);
  const [written, , writtenFinal] = blockLetterForms(character);
  const counts = [written.strokes.length, vectorGlyph(jamo[1]).strokes.length];
  if (jamo[2]) counts.push(writtenFinal.strokes.length);
  const glyph = vectorGlyph(character);
  if (counts.reduce((a, b) => a + b, 0) !== glyph.strokes.length) return null;
  const groups = [];
  let at = 0;
  for (let i = 0; i < counts.length; i += 1) {
    groups.push({ letter: jamo[i], strokes: glyph.strokes.slice(at, at + counts[i]) });
    at += counts[i];
  }
  return groups;
}

/**
 * The halves of a tense letter, wherever it sits.
 *
 * A tense letter is authored as its base letter twice, in stroke order left
 * then right, so the halves are the first and second halves of its stroke list.
 */
function tenseHalves(letter, strokes) {
  if (!TENSE_PAIRS.has(letter)) return null;
  if (strokes.length % 2 !== 0) return null;
  const half = strokes.length / 2;
  return [strokes.slice(0, half), strokes.slice(half)];
}

// --- geometry helpers (the predicted side) -----------------------------------

function pointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segmentDistance(p1, p2, q1, q2) {
  return Math.min(
    pointToSegment(p1, q1, q2),
    pointToSegment(p2, q1, q2),
    pointToSegment(q1, p1, p2),
    pointToSegment(q2, p1, p2),
  );
}

/** A stroke's path, sampled as a polyline in viewBox units. */
function polyline(stroke) {
  const points = [];
  const numbers = stroke.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const commands = stroke.d.match(/[MLCZ]/g) ?? [];
  let at = 0;
  let cursor = { x: 0, y: 0 };
  for (const command of commands) {
    if (command === 'Z') continue;
    if (command === 'C') {
      const [c1x, c1y, c2x, c2y, x, y] = numbers.slice(at, at + 6);
      at += 6;
      const from = cursor;
      for (let i = 1; i <= 8; i += 1) {
        const t = i / 8;
        const m = 1 - t;
        points.push({
          x: m * m * m * from.x + 3 * m * m * t * c1x + 3 * m * t * t * c2x + t * t * t * x,
          y: m * m * m * from.y + 3 * m * m * t * c1y + 3 * m * t * t * c2y + t * t * t * y,
        });
      }
      cursor = { x, y };
      continue;
    }
    const [x, y] = numbers.slice(at, at + 2);
    at += 2;
    cursor = { x, y };
    points.push(cursor);
  }
  return points;
}

/**
 * Whether two stroked segments' *ink* overlaps.
 *
 * Not "are the centrelines within a pen of each other", which is the test this
 * started as and which is right only for strokes that cross. Two **collinear**
 * strokes six units apart, end to end, have centrelines well inside a nine-unit
 * pen and six units of clear paper between them — which is exactly the gap
 * between the two ㅂ of ㅃ, and the reason the predictor claimed the letter was
 * one island when the raster plainly draws two.
 *
 * A butt-capped stroke's ink is a rectangle: the segment, widened by half a pen
 * either side, with square ends. So the question is whether two rectangles
 * overlap, and that is the separating-axis theorem over their four edge
 * normals. Exact for every straight stroke, and conservative in the right
 * direction for a curve — a mitre at a join only adds ink, and adjacent samples
 * of one curve belong to the same stroke anyway.
 */
function rectangleOf(p1, p2, pen) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const nx = (-dy / len) * (pen / 2);
  const ny = (dx / len) * (pen / 2);
  return [
    { x: p1.x + nx, y: p1.y + ny },
    { x: p2.x + nx, y: p2.y + ny },
    { x: p2.x - nx, y: p2.y - ny },
    { x: p1.x - nx, y: p1.y - ny },
  ];
}

function overlaps(a, b) {
  for (const corners of [a, b]) {
    for (let i = 0; i < corners.length; i += 1) {
      const p = corners[i];
      const q = corners[(i + 1) % corners.length];
      const axis = { x: -(q.y - p.y), y: q.x - p.x };
      let aMin = Infinity;
      let aMax = -Infinity;
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const c of a) {
        const v = c.x * axis.x + c.y * axis.y;
        if (v < aMin) aMin = v;
        if (v > aMax) aMax = v;
      }
      for (const c of b) {
        const v = c.x * axis.x + c.y * axis.y;
        if (v < bMin) bMin = v;
        if (v > bMax) bMax = v;
      }
      if (aMax < bMin || bMax < aMin) return false;
    }
  }
  return true;
}

function touches(a, b, pen) {
  for (let i = 1; i < a.length; i += 1) {
    const one = rectangleOf(a[i - 1], a[i], pen);
    if (!one) continue;
    for (let j = 1; j < b.length; j += 1) {
      const other = rectangleOf(b[j - 1], b[j], pen);
      if (!other) continue;
      if (overlaps(one, other)) return true;
    }
  }
  return false;
}

/** How many separate pieces of ink the geometry says this letter has. */
function predictedIslands(glyph) {
  const lines = glyph.strokes.map(polyline);
  const parent = lines.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      if (touches(lines[i], lines[j], glyph.pen)) parent[find(i)] = find(j);
    }
  }
  return new Set(lines.map((_, i) => find(i))).size;
}

// --- rendering ---------------------------------------------------------------

const browser = await chromium.launch();
const page = await browser.newPage();

await page.setContent('<canvas id="c"></canvas>');
/*
 * Every pixel question is answered *in the page*.
 *
 * The first version shipped each 512² mask back over the debugging protocol as
 * a 262,144-element array and did the counting in Node — 365 of those for
 * seventy-three items, and the gate did not finish in two minutes. Nothing
 * needs the bitmap on this side: the answers are a handful of numbers per
 * character, so the masks are built, compared and discarded where they are
 * drawn, and what crosses the boundary is the report.
 */
await page.addScriptTag({
  content: `
    const R = ${R};
    const draw = (paths, pen) => {
      const canvas = new OffscreenCanvas(R, R);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, R, R);
      ctx.save();
      ctx.scale(R / 100, R / 100);
      ctx.lineWidth = pen;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 3;
      ctx.strokeStyle = '#000';
      for (const d of paths) ctx.stroke(new Path2D(d));
      ctx.restore();
      const data = ctx.getImageData(0, 0, R, R).data;
      const m = new Uint8Array(R * R);
      for (let i = 0; i < R * R; i += 1) m[i] = data[i * 4 + 3] > 96 ? 1 : 0;
      return m;
    };
    /*
      Pieces of ink, ignoring specks.

      A curve's tip lands on a pixel whose coverage is right at the alpha
      threshold, and one such pixel can end up isolated from the stroke it
      belongs to: 강's ㄱ produced a one-pixel island at the toe of its leg, and
      the count said the block had four pieces where it has three. A speck is a
      rasterisation artefact of the boundary, not a piece of a letter. The floor
      is 32 px of a 512² raster — a thousandth of a jamo's ink, far under any
      real fragment and far over any anti-aliased tip.
    */
    const SPECK = 32;
    const islandsOf = (m) => {
      const seen = new Uint8Array(R * R);
      const stack = new Int32Array(R * R);
      let count = 0;
      for (let i = 0; i < R * R; i += 1) {
        if (!m[i] || seen[i]) continue;
        let area = 0;
        let top = 0;
        stack[top++] = i;
        seen[i] = 1;
        while (top > 0) {
          const j = stack[--top];
          area += 1;
          const x = j % R;
          const y = (j / R) | 0;
          if (x + 1 < R && m[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; stack[top++] = j + 1; }
          if (x > 0 && m[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; stack[top++] = j - 1; }
          if (y + 1 < R && m[j + R] && !seen[j + R]) { seen[j + R] = 1; stack[top++] = j + R; }
          if (y > 0 && m[j - R] && !seen[j - R]) { seen[j - R] = 1; stack[top++] = j - R; }
        }
        if (area >= SPECK) count += 1;
      }
      return count;
    };
    const shared = (a, b) => { let n = 0; for (let i = 0; i < R * R; i += 1) if (a[i] && b[i]) n += 1; return n; };

    window.__measure = ({ paths, pen, probes, half, groups, tense }) => {
      const ink = draw(paths, pen);
      const unit = R / 100;
      const junctions = probes.map((p) => {
        const cx = p.at[0] * unit;
        const cy = p.at[1] * unit;
        let inked = 0;
        let total = 0;
        for (let y = Math.round(cy - half); y <= Math.round(cy + half); y += 1) {
          for (let x = Math.round(cx - half); x <= Math.round(cx + half); x += 1) {
            if (x < 0 || y < 0 || x >= R || y >= R) continue;
            total += 1;
            if (ink[y * R + x]) inked += 1;
          }
        }
        return { order: p.order, which: p.which, ratio: total ? inked / total : 1 };
      });
      let clipped = 0;
      for (let i = 0; i < R; i += 1) {
        if (ink[i]) clipped += 1;
        if (ink[(R - 1) * R + i]) clipped += 1;
        if (ink[i * R]) clipped += 1;
        if (ink[i * R + R - 1]) clipped += 1;
      }
      const masks = groups.map((g) => draw(g.paths, pen));
      const collisions = [];
      for (let i = 0; i < masks.length; i += 1) {
        for (let j = i + 1; j < masks.length; j += 1) {
          const n = shared(masks[i], masks[j]);
          if (n > 0) collisions.push({ i, j, shared: n });
        }
      }
      const tenseShared = tense.map((t) => ({
        letter: t.letter,
        shared: shared(draw(t.left, pen), draw(t.right, pen)),
      }));
      // The animation's last frame is the same paths at full length: drawing
      // them again and comparing is the check that nothing in the reveal path
      // leaves the finished glyph different from the still.
      const again = draw(paths, pen);
      let same = true;
      for (let i = 0; i < R * R; i += 1) if (again[i] !== ink[i]) { same = false; break; }
      return { junctions, islands: islandsOf(ink), clipped, collisions, tenseShared, same };
    };
  `,
});

// --- measure -----------------------------------------------------------------

const findings = [];
const fail = (what) => findings.push(what);
const measured = [];

for (const character of items) {
  const glyph = vectorGlyph(character);
  const paths = glyph.strokes.map((s) => s.d);

  // Junctions: every end that meets another stroke's end.
  const ends = [];
  for (const stroke of glyph.strokes) {
    if (stroke.closed) continue;
    ends.push({ at: stroke.start, order: stroke.order, which: 'start' });
    ends.push({ at: stroke.finish, order: stroke.order, which: 'end' });
  }
  const reach = glyph.pen * JUNCTION_REACH;
  const probes = ends.filter((e) =>
    ends.some(
      (o) => o.order !== e.order && Math.hypot(o.at[0] - e.at[0], o.at[1] - e.at[1]) <= reach,
    ),
  );

  const parts = partsOf(character);
  const groups = (parts ?? []).map((g) => ({ letter: g.letter, paths: g.strokes.map((s) => s.d) }));
  const tense = [];
  for (const group of parts ?? [{ letter: character, strokes: glyph.strokes }]) {
    const halves = tenseHalves(group.letter, group.strokes);
    if (!halves) continue;
    tense.push({
      letter: group.letter,
      left: halves[0].map((s) => s.d),
      right: halves[1].map((s) => s.d),
    });
  }

  const result = await page.evaluate((a) => window.__measure(a), {
    paths,
    pen: glyph.pen,
    probes,
    half: (glyph.pen / 2) * (R / 100) - 1.5,
    groups,
    tense,
  });

  for (const junction of result.junctions) {
    if (junction.ratio >= JUNCTION_FLOOR) continue;
    fail(
      `${character}: the junction at stroke ${junction.order}'s ${junction.which} is ` +
        `${(junction.ratio * 100).toFixed(0)}% ink — a notch, chip or seam where two strokes meet`,
    );
  }

  const predicted = predictedIslands(glyph);
  if (result.islands !== predicted) {
    fail(
      `${character}: drawn as ${result.islands} piece${result.islands === 1 ? '' : 's'} of ink, ` +
        `the geometry says ${predicted} — ` +
        (result.islands < predicted ? 'two pieces are bridged' : 'a join has come adrift'),
    );
  }

  if (result.clipped > 0) {
    fail(`${character}: ${result.clipped}px of ink on the edge of the box — it is clipped`);
  }

  for (const pair of result.tenseShared) {
    if (pair.shared === 0) continue;
    fail(
      `${character}: the two halves of ${pair.letter} share ${pair.shared}px of ink — ` +
        'a doubled consonant has to read as two letters',
    );
  }

  for (const collision of result.collisions) {
    fail(
      `${character}: ${groups[collision.i].letter} and ${groups[collision.j].letter} share ` +
        `${collision.shared}px of ink — two letters of one block may not run into each other`,
    );
  }

  if (!result.same) fail(`${character}: the animation's last frame is not the finished glyph`);

  measured.push({
    character,
    junctions: result.junctions,
    islands: result.islands,
    predicted,
    collisions: result.collisions,
    tenseShared: result.tenseShared,
    pen: glyph.pen,
    paths,
  });
}

for (const regression of REGRESSIONS) {
  const m = measured.find((r) => r.character === regression.character);
  if (!m) {
    fail(`the ${regression.character} regression fixture has no glyph to measure`);
    continue;
  }
  if (!regression.check(m)) fail(`${regression.character}: ${regression.what} — no longer true`);
}

if (missing.length > 0) fail(`no instructional geometry for ${missing.join(' ')}`);

/*
 * One geometry, asserted rather than assumed.
 *
 * The guide under the pen, the grading mask, the numbered still and the
 * animation all read `vectorGlyph` — but only for a character `glyphSpec`
 * says uses it. That switch is one function, and a character taken out of it
 * silently goes back to being *guided in the typeface* while it is still
 * *demonstrated from the centrelines*: two sources again, which is the defect
 * that closed the ㅆ/ㅉ gap. Nothing downstream can see the difference, because
 * every gate that measures geometry reads `vectorGlyph` directly and would be
 * comparing the canonical form with itself.
 *
 * So the switch is checked here, where the inventory is: every taught character
 * that *has* canonical geometry must be declared as using it.
 */
for (const character of items) {
  if (usesCanonicalGeometry(character)) continue;
  fail(
    `${character}: has canonical geometry but glyphSpec does not use it — its guide and ` +
      'grading mask would be set in the typeface while its demonstration is stroked from ' +
      'the centrelines, which is two sources for one letter',
  );
}

// --- the sheets --------------------------------------------------------------

const GROUPS = [
  { name: 'jamo', title: 'Standalone letters', of: (c) => !isSyllable(c) && !TENSE_PAIRS.has(c) },
  { name: 'tense', title: 'Doubled and compound letters', of: (c) => !isSyllable(c) && TENSE_PAIRS.has(c) },
  { name: 'syllables', title: 'Syllable blocks', of: (c) => isSyllable(c) },
];

if (!CHECK) {
  mkdirSync(OUT, { recursive: true });
  const CELL = 190;
  for (const group of GROUPS) {
    const list = measured.filter((m) => group.of(m.character));
    if (list.length === 0) continue;
    const cols = Math.min(6, list.length);
    const rows = Math.ceil(list.length / cols);
    const png = await page.evaluate(
      ({ list, CELL, cols, rows }) => {
        const canvas = document.createElement('canvas');
        canvas.width = cols * CELL;
        canvas.height = rows * CELL;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        list.forEach((item, i) => {
          const ox = (i % cols) * CELL;
          const oy = Math.floor(i / cols) * CELL;
          ctx.save();
          ctx.strokeStyle = '#e6e6e6';
          ctx.lineWidth = 1;
          ctx.strokeRect(ox + 0.5, oy + 0.5, CELL - 1, CELL - 1);
          ctx.translate(ox, oy + 18);
          ctx.scale((CELL - 18) / 100, (CELL - 18) / 100);
          ctx.lineWidth = item.pen;
          ctx.lineCap = 'butt';
          ctx.lineJoin = 'miter';
          ctx.miterLimit = 3;
          ctx.strokeStyle = '#111';
          for (const d of item.paths) ctx.stroke(new Path2D(d));
          ctx.restore();
          ctx.fillStyle = '#888';
          ctx.font = '11px sans-serif';
          ctx.fillText(
            `${item.character}  ${item.islands}/${item.predicted}`,
            ox + 6,
            oy + 14,
          );
        });
        return canvas.toDataURL('image/png');
      },
      { list: list.map((m) => ({ character: m.character, pen: m.pen, paths: m.paths, islands: m.islands, predicted: m.predicted })), CELL, cols, rows },
    );
    writeFileSync(join(OUT, `${group.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
  }
  writeFileSync(
    join(OUT, 'README.md'),
    [
      '# Glyph structure audit',
      '',
      'Generated by `npm run glyph:structure`. One sheet per group; the caption',
      'under each item is `character  drawn/predicted islands`.',
      '',
      'The reference-face comparison lives beside this, in `.glyph-qa/index.html`,',
      'written by `npm run glyphshape:qa` — that is the sheet that answers *does it',
      'look like the letter*. This one answers *is it well formed*.',
      '',
      ...GROUPS.filter((g) => measured.some((m) => g.of(m.character))).map(
        (g) => `- **${g.title}** — \`${g.name}.png\` (${measured.filter((m) => g.of(m.character)).length} items)`,
      ),
      '',
    ].join('\n'),
  );
}

await browser.close();

// --- report ------------------------------------------------------------------

const junctionCount = measured.reduce((n, m) => n + m.junctions.length, 0);
const worst = measured
  .flatMap((m) => m.junctions.map((j) => ({ ...j, character: m.character })))
  .sort((a, b) => a.ratio - b.ratio)[0];

console.log(`Glyph structure — ${items.length} taught items discovered, all with geometry\n`);
console.log(`  junctions probed        ${junctionCount}`);
console.log(
  `  weakest junction        ${worst ? `${(worst.ratio * 100).toFixed(1)}% — ${worst.character} stroke ${worst.order} ${worst.which}` : '—'}`,
);
console.log(`  islands, drawn = predicted  ${measured.filter((m) => m.islands === m.predicted).length}/${measured.length}`);
console.log(`  doubled letters checked ${measured.filter((m) => TENSE_PAIRS.has(m.character) || (partsOf(m.character) ?? []).some((p) => TENSE_PAIRS.has(p.letter))).length}`);
console.log(`  blocks checked for part collision  ${measured.filter((m) => partsOf(m.character)).length}`);
console.log(`  ${STRUCTURAL_EXCEPTIONS.size} structural exceptions`);
if (!CHECK) console.log(`\n  sheets: ${OUT}`);

if (findings.length === 0) {
  console.log('\nevery taught glyph is structurally sound: solid junctions, the pieces the');
  console.log('geometry predicts, doubled letters legible as two, no letter running into another.');
} else {
  console.log(`\n${findings.length} finding${findings.length === 1 ? '' : 's'}:`);
  for (const finding of findings) console.log(`  - ${finding}`);
}
if (CHECK && findings.length > 0) process.exit(1);
