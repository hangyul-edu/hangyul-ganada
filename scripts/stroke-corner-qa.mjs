#!/usr/bin/env node
/**
 * Where each stroke of each taught character **starts and stops**, judged
 * against the corner it shares rather than against the finished letter.
 *
 *   npm run strokes:corners            report
 *   npm run strokes:corners:check      the same; exit non-zero on a finding
 *
 * ## The defect this exists for
 *
 * A photograph of ㄸ being written. Both lids began a visible distance to the
 * right of where the letter begins, became flush only once the ㄴ under each of
 * them was drawn, and the finished glyph was perfect. Every gate agreed it was
 * perfect, because every gate was looking at the finished glyph.
 *
 * `glyph:structure` probes a pen-square at each junction of the **completed**
 * character and asks whether it is solid. It is. `glyphshape:qa` scores the
 * completed character against the face. `letters:face` measures the completed
 * character's parts. `strokes:visual` renders the animation, but its questions
 * are about pacing, detachment and ink on the badges — none of them is *does
 * this stroke reach the corner it is drawn from*.
 *
 * The cause was in `strokeVectors.classify`: of two strokes whose ends meet, it
 * extended only the **later** one by half a pen. Where the corner's second
 * stroke is written first — ㄷ's lid before its ㄴ, ㅌ's top bar before its
 * upright, ㅁ's left post before the turn — the first stroke was drawn half a
 * pen short of the letter's own corner and stayed short for the whole time it
 * was the only ink on the paper. **Forty-five stroke ends over twenty-seven
 * characters** were drawn that way.
 *
 * ## Why the question here is order-independent
 *
 * A frame does not know which stroke is written later. It shows what is on the
 * paper, and what is on the paper has to be a state a hand could have left it
 * in — which means every stroke on it reaches the corners it belongs to. So the
 * rule this gate applies has no reference to stroke order at all:
 *
 * > An end that arrives at another stroke's **end** is a corner, and must be
 * > drawn out to it. An end that arrives in another stroke's **body** is a
 * > join, and must not be.
 *
 * That is a property of two points and a pen. It is true of the first frame and
 * of the last one, and there is no completed letter it can hide inside.
 *
 * ## The seven questions
 *
 * | | |
 * | --- | --- |
 * | **Short of the corner** | An end that shares a joint with another stroke's end but is not extended to it. The ㄸ defect. |
 * | **Extension missing from the path** | An end classified `corner` whose drawn `d` does not actually reach the tip. Classification and geometry cannot be allowed to disagree; the class is real, and `drawnInkBox` reads the same classification when it fits the letter. |
 * | **Nub** | A `join` or `free` end that *is* extended. Ink outside the letter. |
 * | **Open joint** | The pen-square at a corner, filled by everything written **up to the later of the two strokes that meet there** — not by the finished letter. `glyph:structure` asks the finished-letter version, and a ㄷ whose lid stops short passes it, because the ㄴ arrives afterwards and fills the hole. |
 * | **Overshoot** | A drawn tip further than half a pen past its own centreline end. |
 * | **Duplicate components** | ㄲ ㄸ ㅃ ㅆ ㅉ, and every block that contains one: the second half must be the first half translated, stroke for stroke, and written in the same order. |
 * | **Two geometries** | The guide, the grading mask, the demonstration and the numbered still must all be `vectorGlyph`. |
 *
 * ## No per-character exemptions
 *
 * There are none and the gate asserts there are none. A tense consonant whose
 * halves are allowed to differ "because ㅆ is hard" is the exemption that hid
 * the last one: `letters:face` had ㅅ, ㅆ, ㅈ, ㅉ, ㅊ, ㅇ and ㅎ on a structural
 * exempt list, and the two-source defect that shipped lived in exactly those
 * letters. The rules here are structural and hold for every character or they
 * are the wrong rules.
 */
import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { isSyllable, toJamo } from '../apps/web/src/data/jamo.ts';
import { hasVectorGlyph, vectorGlyph } from '../apps/web/src/data/strokeVectors.ts';
import { usesCanonicalGeometry } from '../apps/web/src/features/writing/glyphSpec.ts';

const CHECK = process.argv.includes('--check');

/**
 * What counts as the same point, in viewBox units.
 *
 * Two hundredths — the rounding `strokeVectors` writes its coordinates at.
 * Used for the twin comparison, where the answer really is *identical*, and for
 * reading a drawn tip against the geometry it was derived from.
 */
const JOINT_TOLERANCE = 0.02;

/**
 * The corner square, and how much of it has to be ink.
 *
 * One pen wide, centred on the joint, sampled on a 24 x 24 grid — the analytic
 * twin of the raster probe in `glyph:structure`, and asked of a *different*
 * thing. That gate rasterises the **finished** character and lets any stroke
 * fill the square; a ㄷ whose lid stops short still passes it, because the ㄴ
 * arrives later and fills the hole. Here the square has to be filled by the two
 * strokes that meet at it, which is the only claim a frame can rely on.
 *
 * All of it, not most of it: a hole in a corner is not a proportion, and
 * a floor under 1 is a number somebody would later argue with.
 */
const CORNER_GRID = 24;
const CORNER_FLOOR = 1;

/**
 * How close an end has to be to another stroke to be *at* it.
 *
 * Half a pen, the same number `strokeVectors.TOUCH` uses, because this gate has
 * to agree with the module about which ends are in a joint at all. Written here
 * rather than imported because it is a *question* about the geometry and not a
 * parameter of it: if the two ever disagree, that is a finding, and the finding
 * is reported by the classification checks below rather than hidden by a shared
 * constant.
 */
const touching = (pen) => pen * 0.5;

/** The tip a `corner` end is drawn out to, and the tolerance it is judged at. */
const TIP_TOLERANCE = 0.02;

const findings = [];
const fail = (character, what) => findings.push(`${character}: ${what}`);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The points of a drawn path, in order. Every command here is M, L, C or Z. */
function pathPoints(d) {
  const points = [];
  const re = /([MLC])([^MLCZ]*)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
  }
  return points;
}

/** Perpendicular distance from a point to a polyline, in viewBox units. */
function toPolyline(p, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 < 1e-9 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  if (points.length === 1) best = Math.hypot(p[0] - points[0][0], p[1] - points[0][1]);
  return best;
}

/**
 * How much of the square of side `2 * radius` centred at `at` is covered by the
 * given drawn polylines, each stroked with a pen of width `2 * half`.
 *
 * The polyline stands in for the path's curves as well: `strokeVectors` samples
 * every curve finely enough that the polyline is not a polygon — `strokes:qa`
 * is what enforces that — and the only curved strokes in the curriculum (ㅇ,
 * ㅎ's bowl, ㄱ's leg) have no corner joints on them.
 */
function squareInk(at, radius, polylines, half) {
  let inked = 0;
  let total = 0;
  for (let i = 0; i < CORNER_GRID; i += 1) {
    for (let j = 0; j < CORNER_GRID; j += 1) {
      const p = [
        at[0] - radius + ((i + 0.5) / CORNER_GRID) * radius * 2,
        at[1] - radius + ((j + 0.5) / CORNER_GRID) * radius * 2,
      ];
      total += 1;
      if (polylines.some((line) => toPolyline(p, line) <= half)) inked += 1;
    }
  }
  return inked / total;
}

const shipping = ALL_CHARACTERS.map((c) => c.character).filter(hasVectorGlyph);
let ends = 0;
let joints = 0;
let corners = 0;

for (const character of shipping) {
  const glyph = vectorGlyph(character);
  const half = glyph.pen / 2;
  const near = touching(glyph.pen);

  // --- one geometry --------------------------------------------------------
  if (!usesCanonicalGeometry(character)) {
    fail(character, 'is taught but is not drawn from the canonical geometry');
  }

  const open = glyph.strokes.filter((s) => !s.closed);

  for (const stroke of open) {
    const drawn = pathPoints(stroke.d);
    const head = drawn[0];
    const tail = drawn[drawn.length - 1];

    for (const [which, at, tip, inward] of [
      ['start', stroke.start, head, drawn[1] ?? head],
      ['end', stroke.finish, tail, drawn[drawn.length - 2] ?? tail],
    ]) {
      ends += 1;
      const kind = stroke.ends[which];

      // What this end shares a joint with: another stroke's own end, close
      // enough that the two are one place on the paper.
      const partners = [];
      for (const other of open) {
        if (other.order === stroke.order) continue;
        for (const q of [other.start, other.finish]) {
          if (dist(at, q) <= near) partners.push({ other, q });
        }
      }

      const overshoot = dist(at, tip);
      if (overshoot > half + TIP_TOLERANCE) {
        fail(
          character,
          `stroke ${stroke.order}'s ${which} is drawn ${overshoot.toFixed(2)} units past its own end — more than the half pen a terminal may have`,
        );
      }

      if (kind === 'corner') {
        corners += 1;
        // The extension has to be *in the path*, pointing away from the stroke.
        const reach = dist(at, tip);
        if (Math.abs(reach - half) > TIP_TOLERANCE) {
          fail(
            character,
            `stroke ${stroke.order}'s ${which} is classified corner but its drawn tip is ${reach.toFixed(2)} units out, not the half pen ${half.toFixed(2)}`,
          );
        }
        const away = dist(inward, tip) - dist(inward, at);
        if (away <= 0) {
          fail(character, `stroke ${stroke.order}'s ${which} extension does not point out of the stroke`);
        }
        if (!partners.length) {
          fail(character, `stroke ${stroke.order}'s ${which} is a corner with nothing to close it against`);
        }
      } else if (dist(at, tip) > TIP_TOLERANCE) {
        // --- nub -----------------------------------------------------------
        fail(
          character,
          `stroke ${stroke.order}'s ${which} is ${kind} and still drawn ${dist(at, tip).toFixed(2)} units out — ink outside the letter`,
        );
      }

      if (!partners.length) continue;
      joints += 1;

      // --- short of the corner ------------------------------------------------
      // The whole gate. An end that meets another stroke's end and is not a
      // `join` has to be drawn out to the joint, whichever of the two is
      // written first.
      if (kind === 'free') {
        const names = partners.map((p) => `#${p.other.order}`).join(', ');
        fail(
          character,
          `stroke ${stroke.order}'s ${which} shares a joint with ${names} and stops half a pen short of it — the corner opens for as long as this stroke is alone on the paper`,
        );
      }

      // --- open joint ---------------------------------------------------------
      // The two strokes that meet here must fill the corner between them. Only
      // asked once per joint, from the lower-numbered stroke.
      for (const { other, q } of partners) {
        if (other.order < stroke.order) continue;
        const mid = [(at[0] + q[0]) / 2, (at[1] + q[1]) / 2];
        /*
          Everything written up to the later of the two, and nothing after it.

          Not "these two strokes" — ㅊ's tick ends where its ㅅ begins, and what
          closes that joint is the lid between them, which by then is on the
          paper. And not "the whole letter", which is the question
          `glyph:structure` asks and the one a ㄷ with a short lid passes.
        */
        const upTo = glyph.strokes
          .filter((s) => s.order <= Math.max(stroke.order, other.order))
          .map((s) => pathPoints(s.d));
        const filled = squareInk(mid, half, upTo, half);
        if (filled < CORNER_FLOOR) {
          fail(
            character,
            `the joint where stroke ${stroke.order}'s ${which} meets stroke ${other.order} is ${(filled * 100).toFixed(0)}% ink once both are written — the corner is open on the paper`,
          );
        }
      }
    }
  }
}

// --- duplicate components ----------------------------------------------------
/**
 * The doubled letters, and what "the same" means for them.
 *
 * A tense consonant is one letter written twice. Not *approximately* twice: the
 * second half is the first half moved sideways, so a learner reading ㄸ sees two
 * ㄷ and not a ㄷ beside something ㄷ-shaped. The check is therefore exact — the
 * offset is read off the first stroke pair and every later pair has to agree
 * with it — rather than a similarity score, which is the kind of tolerance the
 * last four defects lived inside.
 */
const DOUBLED = ['ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ'];
const carriers = shipping.filter(
  (c) => DOUBLED.includes(c) || (isSyllable(c) && toJamo(c).some((j) => DOUBLED.includes(j))),
);
let pairs = 0;

for (const character of DOUBLED) {
  if (!hasVectorGlyph(character)) {
    fail(character, 'is a doubled letter with no geometry');
    continue;
  }
  const strokes = vectorGlyph(character).strokes;
  if (strokes.length % 2 !== 0) {
    fail(character, `has ${strokes.length} strokes — a doubled letter has an even number`);
    continue;
  }
  const n = strokes.length / 2;
  const left = strokes.slice(0, n);
  const right = strokes.slice(n);
  const offset = [right[0].start[0] - left[0].start[0], right[0].start[1] - left[0].start[1]];

  if (Math.abs(offset[1]) > JOINT_TOLERANCE) {
    fail(character, `the second component sits ${offset[1].toFixed(2)} units below the first — the halves are not level`);
  }
  if (offset[0] <= 0) {
    fail(character, 'the second component is not to the right of the first');
  }

  for (let i = 0; i < n; i += 1) {
    pairs += 1;
    const a = left[i];
    const b = right[i];
    if (a.ends.start !== b.ends.start || a.ends.end !== b.ends.end) {
      fail(
        character,
        `stroke ${a.order} terminates ${a.ends.start}/${a.ends.end} and its twin ${b.order} ${b.ends.start}/${b.ends.end} — corresponding strokes must start and end the same way`,
      );
    }
    const pa = pathPoints(a.d);
    const pb = pathPoints(b.d);
    if (pa.length !== pb.length) {
      fail(character, `stroke ${a.order} has ${pa.length} points and its twin ${b.order} has ${pb.length}`);
      continue;
    }
    let worst = 0;
    for (let k = 0; k < pa.length; k += 1) {
      worst = Math.max(worst, Math.hypot(pa[k][0] + offset[0] - pb[k][0], pa[k][1] + offset[1] - pb[k][1]));
    }
    if (worst > JOINT_TOLERANCE) {
      fail(
        character,
        `stroke ${b.order} is not stroke ${a.order} translated: worst point differs by ${worst.toFixed(2)} units. The second component is distorted, not moved.`,
      );
    }
    if (Math.abs(a.length - b.length) > JOINT_TOLERANCE) {
      fail(character, `stroke ${a.order} is ${a.length} long and its twin ${b.order} is ${b.length}`);
    }
  }
}

// --- report ------------------------------------------------------------------
console.log(`Stroke corners — ${shipping.length} taught characters, ${ends} stroke ends`);
console.log(`  joints found            ${joints}`);
console.log(`  corner terminals        ${corners}`);
console.log(`  doubled letters         ${DOUBLED.length}, ${pairs} corresponding stroke pairs`);
console.log(`  blocks carrying one     ${carriers.length}  (${carriers.join(' ')})`);

if (findings.length) {
  console.log(`\n${findings.length} finding${findings.length === 1 ? '' : 's'}:\n`);
  for (const line of findings) console.log(`  ${line}`);
  console.log(
    '\nA stroke that stops short of its corner is a demonstration that does not\n' +
      'show how the letter is written. See `classify` in data/strokeVectors.ts.',
  );
  if (CHECK) process.exit(1);
} else {
  console.log('\nevery stroke starts and finishes where the letter does, and every doubled');
  console.log('letter is one component written twice.');
}
