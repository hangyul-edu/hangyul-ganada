import type { StrokeStep } from '@hangyul-ganada/shared-types';

import { MEDIAL_PARTS, branchesLeft, medialForm, toJamo, type MedialForm } from './jamo';
import { STROKE_ORDER } from './strokes';

/**
 * Putting letters into a syllable block.
 *
 * ## The bug this exists to make impossible
 *
 * `strokes.ts` draws every letter alone, filling a 0–1 box, because that is
 * what a lesson on ㄱ needs. A lesson on 가 needs something else. The block used
 * to be built by concatenating the letters' stroke data unchanged, which put a
 * full-size ㄱ and a full-size ㅏ in the *same* box: the demonstration drew them
 * one on top of the other and the finished frame was a tangle rather than a
 * character.
 *
 * A syllable block is not its letters side by side at full size. It is its
 * letters placed into regions of one square, and which regions depends on the
 * vowel:
 *
 * ```
 *  vertical vowel      horizontal vowel     …with a 받침
 *  ┌──────┬──────┐     ┌─────────────┐      ┌──────┬──────┐
 *  │  ㄱ  │  ㅏ  │     │      ㄱ      │      │  ㅇ  │  ㅏ  │
 *  │      │      │     ├─────────────┤      ├──────┴──────┤
 *  └──────┴──────┘     │      ㅗ      │      │      ㄴ      │
 *        가            └─────────────┘      └─────────────┘
 *                             고                    안
 * ```
 *
 * ## Separating the letters is not the same as composing them
 *
 * The first version of this file put each letter in a region and stretched it
 * to fill that region exactly. Nothing overlapped, every test passed, and the
 * result still did not look like Korean, because filling a rectangle is not
 * what a Hangul face does to a letter. Three things had to change.
 *
 * **A consonant keeps its shape.** ㄱ stretched to fill a tall narrow slot
 * leans over; ㅇ stretched to fill a wide flat 받침 slot becomes a lens. So a
 * consonant is scaled by one factor in both directions and centred in its
 * region — up to a bounded amount of squeeze, because a 받침 genuinely *is*
 * squat and holding ㄴ perfectly square at the foot of 안 would leave it a
 * third of the width it should be. Round letters get a much tighter bound than
 * angular ones, which is exactly the difference a real face applies: the ㄴ of
 * 안 flattens to about half its height, the ㅇ of 강 barely flattens at all.
 *
 * **A vowel fills its region.** ㅏ, ㅗ and ㅣ are straight lines. Stretching a
 * straight line does not distort it, and the stem of ㅏ *should* run the height
 * of the block while the bar of ㅗ *should* run its width. What matters is
 * where the lines land, not their aspect ratio.
 *
 * **ㅓ is not ㅏ.** They are the same two strokes mirrored, and a block places
 * them differently: 가 puts the stem beside the consonant and lets the branch
 * reach the edge, 어 holds the stem back so the branch has room. One region for
 * both left 어 with a hole down the middle and its stem against the frame.
 *
 * ## One table, and everything else derived from it
 *
 * `LAYOUTS` is the only place in the app that says where a component of a block
 * goes. The animation reads it, the writing instruction under the animation
 * reads it — so the sentence says "and ㅏ on the right" only when the ㅏ really
 * is drawn on the right — and the regression tests read it.
 */

/** A region of the block, in the same 0–1 coordinates the stroke data uses. */
export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where each part of a block goes. `final` is absent for a block with no 받침. */
export interface SyllableLayout {
  form: MedialForm;
  initial: Region;
  /** The vowel, when its branch is on the right of the stem — ㅏ ㅑ ㅐ ㅒ ㅣ. */
  medial: Region;
  /** The vowel, when its branch is on the left — ㅓ ㅕ ㅔ ㅖ. Vertical blocks only. */
  medialLeftBranch?: Region;
  /** The vertical arm of a wrapped vowel (ㅘ, ㅢ …). Absent otherwise. */
  medialWide?: Region;
  final?: Region;
}

/**
 * How much of the paper the block's ink covers, edge to edge.
 *
 * The rest is margin. A syllable is not written to the edges of a page and it
 * should not be drawn that way here.
 */
const INK_SPAN = 0.72;
const PAPER_MARGIN = (1 - INK_SPAN) / 2;

/**
 * The pen, as a fraction of the block — see `ui/StrokeOrder.tsx`, which draws
 * these strokes 5 units wide in a 100-unit box.
 */
const PEN = 0.05 / INK_SPAN;

/**
 * An ink box, as measured off the reference face, turned into the region the
 * stroke *centrelines* have to stay inside.
 *
 * The measurements below are outlines: where the black actually falls. The
 * polylines this file lays out are centrelines, and the pen puts half its width
 * outside each one. Inset by that and the drawn result reproduces the box that
 * was measured — which is the only way a table copied off a typeface produces
 * the typeface's proportions rather than a slightly fatter version of them.
 */
function ink(x0: number, y0: number, x1: number, y1: number): Region {
  const half = PEN / 2;
  return { x0: x0 + half, y0: y0 + half, x1: x1 - half, y1: y1 - half };
}

/**
 * The regions, by what the vowel is and whether the block has a 받침.
 *
 * ## These numbers were measured, not invented
 *
 * Three rounds of hand-tuning got the letters separated and still did not look
 * like Korean, because the eye was being asked to judge proportions against a
 * memory of them. So the reference face the app already ships — the same one
 * the big glyph at the top of the lesson is drawn in — was rendered to a canvas
 * for sixty-odd syllables, the ink segmented into its parts, and the component
 * boxes read off and taken as medians per layout. `scripts` is not the home for
 * that: it was a measurement, and its output is this table.
 *
 * What it showed was that the hand-tuned version had the *balance* wrong in a
 * way no amount of adjusting the gaps would fix. The consonant of 가 reaches
 * 0.59 across the block and its vowel's stem stands at 0.72; the hand-tuned
 * table gave the consonant 0.52 and started the vowel at 0.66. Every composed
 * syllable had a consonant too small next to a vowel too wide — which is
 * exactly what a four-stroke ㅂ crammed beside a long ㅏ looks like, and why 밥
 * was the block that finally made it obvious.
 *
 * Coordinates are the block's own: 0 and 1 are the edges of the finished ink,
 * so they can be compared with a measurement directly. `setOnPaper` puts the
 * block on the paper afterwards, smaller, with the margin around it.
 *
 * Regions never overlap and never leave the box, and they hold every stroke's
 * starting point far enough inside the frame for its numbered marker to sit
 * whole on the paper; `compose.test.ts` asserts all three for every block the
 * curriculum teaches.
 */
const LAYOUTS: Record<`${MedialForm}-${'open' | 'closed'}`, SyllableLayout> = {
  // 가 / 어
  'vertical-open': {
    form: 'vertical',
    initial: ink(0, 0.097, 0.59, 0.774),
    medial: ink(0.72, 0, 1, 1),
    medialLeftBranch: ink(0.695, 0, 1, 1),
  },
  // 밥 / 안 / 강
  'vertical-closed': {
    form: 'vertical',
    initial: ink(0, 0.063, 0.538, 0.585),
    medial: ink(0.744, 0, 1, 0.596),
    medialLeftBranch: ink(0.72, 0, 1, 0.596),
    final: ink(0.152, 0.622, 0.874, 1),
  },
  // 고 / 구 / 오
  'horizontal-open': {
    form: 'horizontal',
    initial: ink(0.117, 0, 0.877, 0.456),
    medial: ink(0, 0.557, 1, 1),
  },
  // 국 / 옷 / 글
  'horizontal-closed': {
    form: 'horizontal',
    initial: ink(0.112, 0, 0.912, 0.36),
    medial: ink(0, 0.42, 1, 0.568),
    final: ink(0.112, 0.669, 0.888, 1),
  },
  // 과 — no face was measured for this one, because the curriculum teaches no
  // wrapped block yet. The consonant and the vowel's horizontal arm stack on
  // the left in the proportions a horizontal block uses, and its vertical arm
  // takes the vowel column a vertical block uses.
  'wrapped-open': {
    form: 'wrapped',
    initial: ink(0.02, 0.03, 0.5, 0.42),
    medial: ink(0, 0.55, 0.6, 1),
    medialWide: ink(0.72, 0, 1, 1),
  },
  // 관.
  'wrapped-closed': {
    form: 'wrapped',
    initial: ink(0.02, 0.02, 0.47, 0.3),
    medial: ink(0, 0.38, 0.57, 0.596),
    medialWide: ink(0.73, 0, 1, 0.596),
    final: ink(0.152, 0.669, 0.874, 1),
  },
};

/** The layout a syllable uses, or null if it is not a composed syllable. */
export function syllableLayout(syllable: string): SyllableLayout | null {
  const jamo = toJamo(syllable);
  if (jamo.length < 2) return null;
  const form = medialForm(jamo[1]!);
  if (!form) return null;
  return LAYOUTS[`${form}-${jamo.length > 2 ? 'closed' : 'open'}`];
}

/** The region a syllable's vowel actually occupies, branch side accounted for. */
function medialRegion(layout: SyllableLayout, medial: string): Region {
  if (layout.form === 'vertical' && layout.medialLeftBranch && branchesLeft(medial)) {
    return layout.medialLeftBranch;
  }
  return layout.medial;
}

/** Below this an axis has no extent — the width of ㅣ, the height of ㅡ. */
const FLAT = 1e-6;

/**
 * How far out of square a consonant may be squeezed to fit its region.
 *
 * A 받침 slot is about twice as wide as it is tall, and a real Hangul face does
 * flatten a letter that far and further: measured off the reference face, the ㅂ
 * at the foot of 밥 is squeezed to about 2.7 times out of square and the ㅇ of
 * 강 to about 1.8. So the bounds are the face's, and they differ by letter for
 * the reason the face's do — a flattened circle stops reading as ㅇ long before
 * a flattened ㅂ stops reading as ㅂ.
 */
const MAX_SQUEEZE_ANGULAR = 2.9;
const MAX_SQUEEZE_ROUND = 1.8;

/**
 * Where a letter with no extent along an axis sits within its region.
 *
 * ㅣ is a stem and nothing else, so in 기 it takes the place a stem takes —
 * which is not the very edge of the vowel slot, because a slot is sized for a
 * stem *and its branch*. A third of the way in puts the ㅣ of 기 where a Hangul
 * face puts it, a little right of where the ㅏ of 가 stands.
 */
type Anchor = 'start' | 'centre' | 'end';
const STEM_INSET = 1 / 3;

/** The ink bounding box of a run of strokes. */
function inkBounds(strokes: StrokeStep[]): Region {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      x0 = Math.min(x0, point.x);
      y0 = Math.min(y0, point.y);
      x1 = Math.max(x1, point.x);
      y1 = Math.max(y1, point.y);
    }
  }
  return { x0, y0, x1, y1 };
}

/**
 * Whether a letter is built on a curve — ㅇ, and the bowl of ㅎ.
 *
 * Read from the stroke data rather than from a list of letters, so a curved
 * letter added later is handled without anyone remembering to add it here. A
 * closed path with enough points to read as round is the same test
 * `strokeGuide.ts` uses to decide whether to call a stroke a circle.
 */
function isRound(strokes: StrokeStep[]): boolean {
  return strokes.some((stroke) => {
    const points = stroke.points;
    if (points.length <= 8) return false;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    return Math.hypot(last.x - first.x, last.y - first.y) < 0.05;
  });
}

function place(anchor: Anchor, region: Region, axis: 'x' | 'y'): number {
  const low = axis === 'x' ? region.x0 : region.y0;
  const high = axis === 'x' ? region.x1 : region.y1;
  if (anchor === 'start') return low + (high - low) * STEM_INSET;
  if (anchor === 'end') return high - (high - low) * STEM_INSET;
  return (low + high) / 2;
}

/**
 * Maps a letter's strokes onto a region of the block.
 *
 * `keepShape` is the difference between a consonant and a vowel: a consonant is
 * scaled by a single factor so ㄱ does not lean and ㅇ does not turn into a
 * lens, while a vowel — which is straight lines — is stretched to put those
 * lines exactly where the block wants them.
 *
 * The order of the points, and so the direction the pen travels and where the
 * numbered marker sits, is untouched. Only where the ink lands changes.
 */
function fit(
  strokes: StrokeStep[],
  region: Region,
  { keepShape, anchorX = 'centre' }: { keepShape: boolean; anchorX?: Anchor },
): StrokeStep[] {
  const ink = inkBounds(strokes);
  const inkWidth = ink.x1 - ink.x0;
  const inkHeight = ink.y1 - ink.y0;
  let scaleX = inkWidth < FLAT ? 0 : (region.x1 - region.x0) / inkWidth;
  let scaleY = inkHeight < FLAT ? 0 : (region.y1 - region.y0) / inkHeight;

  if (keepShape && scaleX > 0 && scaleY > 0) {
    const limit = isRound(strokes) ? MAX_SQUEEZE_ROUND : MAX_SQUEEZE_ANGULAR;
    // Whichever direction has room to spare gives it up, so the letter keeps as
    // much of its own proportions as the region allows and is centred in what
    // it does not use.
    if (scaleX > scaleY * limit) scaleX = scaleY * limit;
    else if (scaleY > scaleX * limit) scaleY = scaleX * limit;
  }

  const centreX =
    scaleX === 0 ? place(anchorX, region, 'x') : (region.x0 + region.x1) / 2;
  const centreY = (region.y0 + region.y1) / 2;
  const offsetX = centreX - ((ink.x0 + ink.x1) / 2) * scaleX;
  const offsetY = centreY - ((ink.y0 + ink.y1) / 2) * scaleY;

  return strokes.map((stroke) => ({
    points: stroke.points.map((point) => ({
      x: scaleX === 0 ? centreX : offsetX + point.x * scaleX,
      y: scaleY === 0 ? centreY : offsetY + point.y * scaleY,
    })),
  }));
}

/**
 * From the block's own coordinates onto the paper.
 *
 * Everything above lays the block out between 0 and 1 — its own edges. This is
 * the only place that decides how big the block is on the page, and it leaves a
 * margin: a syllable written to all four edges of the frame reads as wedged in
 * however well its letters are placed inside it.
 *
 * A single letter never comes through here, because a single letter *is* the
 * block — `strokes.ts` already draws ㄱ with its own margins built in.
 */
function onPaper(v: number): number {
  return PAPER_MARGIN + v * INK_SPAN;
}

/** Where a layout region lands once the block is set on the paper. */
export function paperRegion(region: Region): Region {
  return {
    x0: onPaper(region.x0),
    y0: onPaper(region.y0),
    x1: onPaper(region.x1),
    y1: onPaper(region.y1),
  };
}

/** Places a laid-out block on the paper. */
function setOnPaper(strokes: StrokeStep[]): StrokeStep[] {
  return strokes.map((stroke) => ({
    points: stroke.points.map((point) => ({ x: onPaper(point.x), y: onPaper(point.y) })),
  }));
}

/** A letter's own stroke data, or nothing if the app cannot draw it. */
function strokesOf(jamo: string): StrokeStep[] {
  return STROKE_ORDER[jamo] ?? [];
}

/**
 * How a syllable block is written, in writing order, laid out as a block.
 *
 * Returns an empty array for anything that is not a composed syllable, which
 * `characters.ts` turns into a build failure.
 */
export function composeSyllableStrokes(syllable: string): StrokeStep[] {
  const layout = syllableLayout(syllable);
  if (!layout) return [];
  const [initial, medial, final] = toJamo(syllable);

  const out: StrokeStep[] = [
    ...fit(strokesOf(initial!), layout.initial, { keepShape: true }),
  ];

  if (layout.form === 'wrapped' && layout.medialWide) {
    // ㅘ is ㅗ then ㅏ, and in a block those two go to different places — the
    // arm underneath the consonant and the stem beside it. Writing order is
    // unchanged: the whole horizontal part, then the whole vertical one.
    const [wide, tall] = MEDIAL_PARTS[medial!] ?? [];
    out.push(...fit(strokesOf(wide ?? medial!), layout.medial, { keepShape: false }));
    if (tall) {
      out.push(
        ...fit(strokesOf(tall), layout.medialWide, {
          keepShape: false,
          // ㅣ has no width of its own, so it becomes the stem it stands for and
          // sits at the near edge of its slot rather than floating mid-region.
          anchorX: branchesLeft(tall) ? 'end' : 'start',
        }),
      );
    }
  } else {
    out.push(
      ...fit(strokesOf(medial!), medialRegion(layout, medial!), {
        keepShape: false,
        anchorX: branchesLeft(medial!) ? 'end' : 'start',
      }),
    );
  }

  if (final && layout.final) {
    out.push(...fit(strokesOf(final), layout.final, { keepShape: true }));
  }
  return setOnPaper(out);
}
