#!/usr/bin/env node
/**
 * The numbered stroke-order badges: every one of them, on every character the
 * curriculum teaches.
 *
 *   npm run strokes:markers            measure and report
 *   npm run strokes:markers:check      the same; exit non-zero on a finding
 *
 * ## The defect this exists for
 *
 * `ㅌ`'s third badge was drawn with its left-hand side cut off flat. So were
 * twenty more, over twenty characters, and nothing said so: `strokes:qa`
 * checked that badges did not overlap each other, `strokeMarkers.test.ts`
 * checked that `label.x >= radius`, and `strokes:visual` checked that no badge
 * stood on the ink. All three passed. All three were measuring the disc's
 * **fill**.
 *
 * A badge is not its fill. `.marker circle` carries a `stroke-width` of 0.9,
 * and an SVG ring straddles the circumference — half of it outside — so a disc
 * whose centre sits at exactly `radius` paints 0.45 units past the edge of the
 * box, and the outermost `<svg>` clips at its viewport. `ㅌ` #3 was at
 * (5.6, 5.73) with a radius of 5.6. `ㄷ` #2 was at (5.6, 5.6) and lost ring on
 * two sides at once, inside a `border-radius` that took more.
 *
 * So this gate measures the **painted** badge against the **sheet**, and it
 * measures the other four things a badge can get wrong at the same time,
 * because they are one question — *can a learner read this number, and does it
 * tell them the truth about where the pen goes?*
 *
 * | | |
 * | --- | --- |
 * | **Clipped** | Painted ring outside the sheet, straight side or rounded corner. |
 * | **Obscuring** | A badge standing on any stroke's ink, its own included. |
 * | **Colliding** | Two badges close enough to read as one smudge. |
 * | **Misleading** | A leader that does not end on the stroke it names, or that runs under another badge on the way. |
 * | **Unreadable** | A badge whose disc or digit falls below a legible size at the smallest viewport the app supports. |
 * | **Out of order** | A badge numbered differently from the stroke the animation draws at that index. |
 *
 * ## Why it shares its arithmetic with the product
 *
 * `ontoPaper`, `paintedRadius`, `MARKER_RING`, `PAPER_CORNER` and `inkDistance`
 * are all imported from `apps/web/src/ui/strokeMarkers.ts` — the module the
 * screen uses. A second copy of "where the paper is" in this file would be a
 * second opinion, and the day the two disagreed the gate would certify a rule
 * the product does not follow. That is exactly how the old bound survived: the
 * test wrote `radius` and the stylesheet wrote `0.9`, and neither knew about the
 * other.
 *
 * ## No per-glyph overrides
 *
 * There are none, and the gate asserts there are none. Placement is a
 * deterministic search — turn away from the stroke, step outwards, take the
 * first rung that clears the ink, the badges already placed and the sheet — and
 * a hand-tuned coordinate for `ㅌ` would have fixed `ㅌ` and left the other
 * twenty. If one is ever genuinely needed it goes in `OVERRIDES` below with a
 * reason, and this gate prints it in the report so it cannot be quiet.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { isSyllable } from '../apps/web/src/data/jamo.ts';
import { hasVectorGlyph, vectorGlyph } from '../apps/web/src/data/strokeVectors.ts';
import {
  MARKER_RING,
  PAPER_CORNER,
  distanceToStroke,
  inkDistance,
  layoutMarkers,
  ontoPaper,
  paintedRadius,
} from '../apps/web/src/ui/strokeMarkers.ts';

const CHECK = process.argv.includes('--check');

/**
 * Documented per-glyph placements, for the day the search genuinely cannot.
 *
 * Empty, and the report says so. See the note above: a hand-placed `ㅌ` is a
 * fix for `ㅌ`, and the defect was twenty-one badges.
 */
const OVERRIDES = Object.freeze({});

/** The radius the product draws at, by kind of character. See `StrokeOrder`. */
const radiusFor = (character) => (isSyllable(character) ? 4 : 5.6);

/**
 * The smallest box the demonstration is drawn in, in CSS pixels.
 *
 * 152 is the help panel inside a writing lesson, which is the smallest of the
 * three sizes the product asks for (200 on the introduction card, 150 in the
 * developer gallery) and does not shrink with the viewport — every caller
 * passes a constant. So this is the worst case on a 320 px phone as much as on
 * a 430 px one.
 */
const SMALLEST_BOX = 152;

/**
 * The floor for a badge at that size.
 *
 * A digit under 6 px is not a digit, it is a smudge with a number's outline; a
 * disc under 10 px across cannot hold one. Both are measured at `SMALLEST_BOX`,
 * where a syllable's 4-unit radius is 6.1 px and its 4.2-unit digit is 6.4 px —
 * the tightest thing that ships, and the reason the floor is where it is rather
 * than somewhere more comfortable.
 */
const MIN_DIGIT_PX = 6;
const MIN_DISC_PX = 10;

/** The digit's font size, as `StrokeOrder` sets it. */
const digitUnits = (radius) => radius * 1.05;

const findings = [];
const fail = (character, what) => findings.push(`${character}: ${what}`);

const shipping = ALL_CHARACTERS.map((c) => c.character).filter(hasVectorGlyph);
let badges = 0;

for (const character of shipping) {
  const glyph = vectorGlyph(character);
  const radius = radiusFor(character);
  const outer = paintedRadius(radius);
  const markers = layoutMarkers(glyph.strokes, radius);
  badges += markers.length;

  if (markers.length !== glyph.strokes.length) {
    fail(character, `${markers.length} badges for ${glyph.strokes.length} strokes`);
  }

  // --- out of order ----------------------------------------------------------
  // The animation lights badge `i` while it draws stroke `i`; both lists are
  // indexed, so both have to be in the same order.
  markers.forEach((marker, index) => {
    const stroke = glyph.strokes[index];
    if (!stroke || marker.order !== stroke.order || marker.order !== index + 1) {
      fail(character, `badge at index ${index} is numbered ${marker.order}`);
    }
  });

  for (const marker of markers) {
    const { x, y } = marker.label;
    const where = `badge ${marker.order}`;

    // --- clipped: the straight sides ----------------------------------------
    const room = Math.min(x, y, 100 - x, 100 - y) - outer;
    if (room < 0) {
      fail(
        character,
        `${where} paints ${Math.abs(room).toFixed(2)} units outside the sheet at (${x.toFixed(2)}, ${y.toFixed(2)})`,
      );
    }

    // --- clipped: the rounded corners ---------------------------------------
    for (const cx of [PAPER_CORNER, 100 - PAPER_CORNER]) {
      for (const cy of [PAPER_CORNER, 100 - PAPER_CORNER]) {
        const outX = cx < 50 ? x < cx : x > cx;
        const outY = cy < 50 ? y < cy : y > cy;
        if (!outX || !outY) continue;
        const over = Math.hypot(x - cx, y - cy) - (PAPER_CORNER - outer);
        if (over > 1e-9) {
          fail(
            character,
            `${where} is ${over.toFixed(2)} units into the sheet's corner at (${cx}, ${cy})`,
          );
        }
      }
    }

    // The bound the product applies, applied again. A position it would move is
    // a position the search let out of the safe region.
    const safe = ontoPaper(marker.label, radius);
    if (Math.hypot(safe.x - x, safe.y - y) > 1e-9) {
      fail(character, `${where} is outside the placement's own paper bound`);
    }

    // --- obscuring ----------------------------------------------------------
    for (const stroke of glyph.strokes) {
      const gap = inkDistance(stroke, marker.label, glyph.pen) - radius;
      if (gap < 0) {
        fail(
          character,
          `${where} sits ${Math.abs(gap).toFixed(2)} units into stroke ${stroke.order}'s ink`,
        );
      }
    }

    // --- misleading ---------------------------------------------------------
    const own = glyph.strokes.find((stroke) => stroke.order === marker.order);
    if (!own) {
      fail(character, `${where} names a stroke that does not exist`);
    } else {
      if (Math.hypot(marker.anchor.x - own.start[0], marker.anchor.y - own.start[1]) > 0.01) {
        fail(character, `${where}'s leader does not end where stroke ${own.order} begins`);
      }
      if (distanceToStroke(own, marker.anchor, glyph.pen) > 0) {
        fail(character, `${where}'s leader ends off stroke ${own.order}'s ink`);
      }
      const moved = Math.hypot(marker.label.x - marker.anchor.x, marker.label.y - marker.anchor.y);
      if (!marker.tethered) {
        fail(character, `${where} has no leader back to stroke ${own.order}`);
      } else if (moved <= radius) {
        fail(character, `${where}'s leader is shorter than the badge that draws it`);
      }
    }

    // A leader that runs under a *different* badge on its way points at two
    // things at once, which is the ambiguity the leader exists to remove.
    for (const other of markers) {
      if (other.order === marker.order) continue;
      if (segmentDistance(marker.anchor, marker.label, other.label) < outer) {
        fail(character, `${where}'s leader runs under badge ${other.order}`);
      }
    }

    // --- unreadable ---------------------------------------------------------
    const scale = SMALLEST_BOX / 100;
    if (radius * 2 * scale < MIN_DISC_PX) {
      fail(character, `${where} is ${(radius * 2 * scale).toFixed(1)} px across at ${SMALLEST_BOX} px`);
    }
    if (digitUnits(radius) * scale < MIN_DIGIT_PX) {
      fail(
        character,
        `${where}'s digit is ${(digitUnits(radius) * scale).toFixed(1)} px at ${SMALLEST_BOX} px`,
      );
    }
  }

  // --- colliding -------------------------------------------------------------
  // Painted edge to painted edge, not fill to fill: two rings a hair apart merge
  // into one shape at a phone size even though their fills do not touch.
  for (let a = 0; a < markers.length; a += 1) {
    for (let b = a + 1; b < markers.length; b += 1) {
      const gap = Math.hypot(
        markers[a].label.x - markers[b].label.x,
        markers[a].label.y - markers[b].label.y,
      );
      if (gap < radius * 2) {
        fail(character, `badges ${markers[a].order} and ${markers[b].order} overlap`);
      } else if (gap < outer * 2) {
        fail(
          character,
          `badges ${markers[a].order} and ${markers[b].order} have touching rings`,
        );
      }
    }
  }
}

/** Distance from a point to a line segment, in viewBox units. */
function segmentDistance(a, b, p) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// --- nothing may clip -----------------------------------------------------------
/*
 * The other half of the defect, which no amount of geometry can see.
 *
 * A badge can be placed perfectly and still be cut, because the *element* it is
 * drawn in clips: an outermost `<svg>` clips at its viewport by default, and a
 * `border-radius` on an element whose overflow is hidden clips at the curve.
 * `.paper` carried a `background`, a `border` and a `border-radius: 20px`, and
 * all three were doing it — the corner one at a radius nothing in viewBox units
 * could even name, since 20 px is 13.3 units at 150 px and 10 at 200 px.
 *
 * The paper is a `<rect>` inside the SVG now and the element clips nothing. This
 * reads the source back, because the geometry above would go on passing the day
 * somebody put the rounded background back on the element.
 */
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../apps/web/src/ui/StrokeOrder.module.css'), 'utf8');
const tsx = readFileSync(join(here, '../apps/web/src/ui/StrokeOrder.tsx'), 'utf8');

const paperRule = css.match(/\n\.paper \{([^}]*)\}/);
if (!paperRule) {
  findings.push('StrokeOrder.module.css: no `.paper` rule — the demonstration box is gone');
} else {
  const body = paperRule[1];
  if (!/overflow:\s*visible/.test(body)) {
    findings.push('StrokeOrder.module.css: `.paper` does not declare `overflow: visible`, so the SVG viewport clips its badges');
  }
  for (const property of ['border-radius', 'background', 'border', 'clip-path']) {
    if (new RegExp(`(^|;|\\s)${property}\\s*:`).test(body)) {
      findings.push(`StrokeOrder.module.css: \`.paper\` sets \`${property}\`, which clips the badges — it belongs on the in-SVG sheet`);
    }
  }
}
if (!/\n\.sheet \{/.test(css)) {
  findings.push('StrokeOrder.module.css: no `.sheet` rule — the paper has to be drawn inside the SVG');
}
if (!new RegExp(`rx=\\{PAPER_CORNER\\}`).test(tsx)) {
  findings.push('StrokeOrder.tsx: the sheet does not use `PAPER_CORNER` as its corner, so the placement and the paper can disagree');
}

const ringRule = css.match(/\.marker circle,\s*\.markerDone circle \{[^}]*stroke-width:\s*([\d.]+)/);
if (!ringRule) {
  findings.push('StrokeOrder.module.css: the badge ring rule is gone');
} else if (Number(ringRule[1]) !== MARKER_RING) {
  findings.push(
    `StrokeOrder.module.css: the ring is ${ringRule[1]} units and the layout reserves ${MARKER_RING}`,
  );
}

// --- report --------------------------------------------------------------------

const overrides = Object.keys(OVERRIDES);
console.log(
  `Stroke-order badges — ${shipping.length} characters, ${badges} badges, ring ${MARKER_RING}, sheet corner ${PAPER_CORNER}`,
);
console.log(
  overrides.length === 0
    ? '  placement is automatic for every character; no per-glyph overrides.'
    : `  per-glyph overrides in use: ${overrides.join(' ')}`,
);

if (findings.length === 0) {
  console.log('  every badge is on the sheet, clear of the ink, and readable at 152 px.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const line of findings) console.log(`    ${line}`);
}

if (CHECK && findings.length > 0) process.exit(1);
