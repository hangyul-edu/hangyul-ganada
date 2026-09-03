import type { CurveSegment, StrokeStep } from '@hangyul-ganada/shared-types';

import COMPOSITION from './generated/composition.json';
import { MEDIAL_PARTS, branchesLeft, medialForm, toJamo, type MedialForm } from './jamo';
import { STROKE_ORDER, STROKE_ORDER_UPRIGHT } from './strokes';

/**
 * Putting letters into a syllable block — for counting and grading, not drawing.
 *
 * ## What this decides, and what it does not
 *
 * It decides *where the letters of a block are*: which region of the square each
 * one occupies, in the reference face's own spacing. It does not decide what a
 * letter looks like — `strokes.ts` does — and it never invents a shape.
 *
 * That distinction is the whole history of this file. Every demonstration in the
 * app was once drawn from what it produced with the *shapes* invented here too,
 * and that is where six rounds of "the stroke demo still looks wrong" came from:
 * inventing a finished shape means you can always invent a wrong one — a
 * chamfered ㅂ, a ㄱ leaning the wrong way, a 글 whose ㄹ collapsed into three
 * overlapping lines — and the only way to find out is for a person to look.
 *
 * The correction was not to stop composing. It was to stop *guessing*: the part
 * boxes below are measured off the reference glyph by
 * `scripts/measure-composition.mjs`, and the letters placed into them are the
 * authored primitives in `strokes.ts`. Nothing here is a number somebody tuned
 * until a screenshot looked acceptable.
 *
 * For one cycle the demonstration came from somewhere else entirely — each
 * stroke cut out of a rasterised glyph, so that the union of them was the glyph
 * by construction. That held, and its price was that the cut showed: a junction
 * is ink two strokes both pass through, and dividing it drew a boundary the
 * learner could see. See `data/strokeVectors`, which draws these polylines
 * directly and is what the app uses now.
 *
 * So the diagrams in the rest of this comment describe where the letters *are*.
 * Read them that way — it is what a grader needs to know, and what a renderer
 * needs to place.
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
 * **A letter fills the box the face gives *that* letter in *that* block.** The
 * measured table below is not a set of slots letters are dropped into; each box
 * is the ink of one letter of one syllable in the reference face, so filling it
 * reproduces the face's own proportions for it. ㅇ ends up a wide oval at the
 * foot of 강 and a wider one in 우 because that is what Pretendard draws, and
 * the ㅗ of 옷 gets the short stem the face gives it.
 *
 * This is not what this file did first, twice over. It stretched letters into
 * *class-average* slots, which is a different thing and produced a lens for an
 * ㅇ; the correction to that was to hold each consonant's own drawn proportions
 * within a fixed bound — 1.8 out of square for a round letter, 2.9 for an
 * angular one. Both numbers were guesses standing in for a measurement, and
 * once the measurement existed they were wrong: the face flattens 강's ㅇ to
 * 1.87 and 우's to 2.08, so the bound was holding them rounder than the
 * reference glyph two inches above them on the screen. The bounds survive only
 * on the fallback path below, where the region really is a class average.
 *
 * **A vowel fills its region too, for a different reason.** ㅏ, ㅗ and ㅣ are
 * straight lines. Stretching a straight line does not distort it, and the stem
 * of ㅏ *should* run the height of the block while the bar of ㅗ *should* run
 * its width. What matters is where the lines land, not their aspect ratio.
 *
 * **A letter can have more than one form, and the block picks.** ㄱ's leg leans
 * in 가 and comes straight down in 고 — the face's own distinction, and one the
 * fit cannot produce, because a wide slot *stretches* a leaning leg further
 * over rather than straightening it. See `strokesOf` and `STROKE_ORDER_UPRIGHT`.
 *
 * **ㅓ is not ㅏ.** They are the same two strokes mirrored, and a block places
 * them differently: 가 puts the stem beside the consonant and lets the branch
 * reach the edge, 어 holds the stem back so the branch has room. One region for
 * both left 어 with a hole down the middle and its stem against the frame.
 *
 * ## One table, and everything else derived from it
 *
 * `LAYOUTS` is the only place in the app that says where a component of a block
 * goes. The writing instruction under the animation reads it — so the sentence
 * says "and ㅏ on the right" only when the ㅏ really is drawn on the right — and
 * the regression tests read it.
 *
 * ## What this is *not* any more
 *
 * It is not the picture. The demonstration draws the character in the learner's
 * practice face and uncovers it along these polylines; see `ui/StrokeOrder.tsx`.
 * So what a block laid out here has to get right is *which part of the glyph
 * each stroke is*, and roughly where — near enough that the mask lands on the
 * ink it is uncovering. It no longer decides how the character looks, because
 * nothing built out of straight segments and measured slots was ever going to
 * match a typeface, and the lesson had the typeface on screen two inches above
 * for comparison. Tuning the numbers below will not make the demonstration
 * prettier; it will only move the mask.
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
 * The pen this layout is drawn with, in the coordinates `composeSyllableStrokes`
 * returns — the paper, not the block.
 *
 * Exported because the renderer has to use the same number, and stated in the
 * output's units because that is the only place the two modules meet. Reading
 * it as block units instead makes the pen a third too thick, and a third too
 * thick is enough to close the gaps this layout is built on: 국 arrives with
 * its three bands touching, which is exactly what it did.
 *
 * The gaps below are only as wide as they are *after* the ink is on them, so
 * this constant is not a detail of the renderer. It is part of the layout.
 */
export const COMPOSED_PEN = 0.05;
const PEN = COMPOSED_PEN / INK_SPAN;

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
    // Taller than the measurement said, on purpose. That number was a median
    // across the class, and the class contains 글 — whose vowel is ㅡ, a bar
    // with no stem at all — which pulled it down far enough to leave 국 and 공
    // with a ㅜ barely deeper than its own bar. A band sized for the vowels
    // that have a stem costs 글 nothing, because a bar sits anywhere in it.
    medial: ink(0, 0.38, 1, 0.60),
    final: ink(0.112, 0.68, 0.888, 1),
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

/**
 * Where the reference face puts each letter of each taught syllable.
 *
 * Measured, per syllable, by `scripts/measure-composition.mjs` — see its note
 * for how. This is what `LAYOUTS` above could not be: the table below is a
 * median over a class of syllables, and a median is nobody. It put the ㅇ and
 * the ㅓ of 어 a tenth of the block apart because that is the average gap across
 * ten syllables whose consonants are different widths; the face puts them
 * *touching*. Same for 오, 구, 국, 글, 옷 — every syllable whose letters run
 * into each other came out with a gap between them, and read as two letters
 * standing next to each other rather than one character.
 *
 * `LAYOUTS` is still the fallback, for a syllable added to the curriculum
 * before the table is re-measured. It composes; it just composes from the
 * average until someone runs the script.
 */
interface Measured {
  /** Width over height of the reference glyph's ink. */
  aspect: number;
  /** One box per letter, in fractions of that glyph's ink. */
  parts: number[][];
}

const MEASURED = COMPOSITION.syllables as unknown as Record<string, Measured>;

/**
 * How much clear paper two stacked letters keep between them, in block units.
 *
 * One pen, because two centrelines a full pen apart are two strokes whose ink
 * just fails to touch. See `separateColliding`.
 */
const STACK_CLEARANCE = PEN;

/**
 * The measured boxes for a syllable, as regions of the block.
 *
 * Two conversions. The glyph's ink is not square, so its coordinates are mapped
 * into a block that has the same proportions rather than stretched to fill one.
 * And a measured box is an *outline* while a region bounds *centrelines*, so it
 * is inset by half the pen — which is what makes two boxes that share an edge
 * come out as two strokes that touch.
 */
function measuredRegions(syllable: string): Region[] | null {
  const found = MEASURED[syllable];
  if (!found) return null;
  const width = Math.min(1, found.aspect);
  const height = Math.min(1, 1 / found.aspect);
  const half = PEN / 2;
  return found.parts.map(([x0, y0, x1, y1]) => {
    const left = 0.5 + (x0! - 0.5) * width;
    const right = 0.5 + (x1! - 0.5) * width;
    const top = 0.5 + (y0! - 0.5) * height;
    const bottom = 0.5 + (y1! - 0.5) * height;
    return {
      x0: Math.min(left + half, (left + right) / 2),
      x1: Math.max(right - half, (left + right) / 2),
      y0: Math.min(top + half, (top + bottom) / 2),
      y1: Math.max(bottom - half, (top + bottom) / 2),
    };
  });
}

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
 * **These apply only to the fallback path** — a syllable the curriculum has
 * added but nobody has re-measured, which is laid out from `LAYOUTS`, a median
 * over a class of syllables. A median is nobody, so a letter dropped into one
 * has to be protected from it, and these are the protection: a 받침 slot is
 * about twice as wide as it is tall, and a real Hangul face does flatten a
 * letter that far and further, but not without limit.
 *
 * A syllable with a measured box does not come through here, and must not: its
 * box is that letter's own ink in that block, so a bound could only hold the
 * letter away from the shape the face gives it. That is what these numbers were
 * doing before the measurement existed — see the note at the top of the file.
 */
const MAX_SQUEEZE_ANGULAR = 2.9;
const MAX_SQUEEZE_ROUND = 1.8;

/**
 * And the bound for a consonant sitting above a horizontal vowel.
 *
 * Tighter than the general one because that slot is the widest and shallowest
 * in the alphabet: left to fill it, a near-square ㄱ flattens to nearly three
 * times out of shape, which is not what a face does to it and not what 국 looks
 * like.
 */
const MAX_SQUEEZE_WIDE_SLOT = 2.2;

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
/**
 * Whether a letter contains a closed round stroke — ㅇ, and ㅎ's bowl.
 *
 * Exported because two tests need the same answer, and the obvious shorthand
 * for it is wrong: "more than eight points" used to identify ㅇ because it was
 * the only stroke sampled that finely. Curved strokes are all sampled from
 * their own curves now, so ㄱ has twenty-five points and a test asking that
 * question got ㄱ's ninety-degree corner when it wanted ㅇ's arc. What
 * distinguishes a ring is that it comes back to where it started.
 */
export function hasRoundStroke(strokes: StrokeStep[]): boolean {
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
  {
    keepShape,
    anchorX = 'centre',
    squeeze,
  }: { keepShape: boolean; anchorX?: Anchor; squeeze?: number },
): StrokeStep[] {
  const ink = inkBounds(strokes);
  const inkWidth = ink.x1 - ink.x0;
  const inkHeight = ink.y1 - ink.y0;
  let scaleX = inkWidth < FLAT ? 0 : (region.x1 - region.x0) / inkWidth;
  let scaleY = inkHeight < FLAT ? 0 : (region.y1 - region.y0) / inkHeight;

  if (keepShape && scaleX > 0 && scaleY > 0) {
    // A slot bound tightens the letter's own; it never loosens it. ㅇ stays as
    // round in a wide slot as it is anywhere else.
    const own = hasRoundStroke(strokes) ? MAX_SQUEEZE_ROUND : MAX_SQUEEZE_ANGULAR;
    const limit = squeeze === undefined ? own : Math.min(squeeze, own);
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

  const move = (point: { x: number; y: number }) => ({
    x: scaleX === 0 ? centreX : offsetX + point.x * scaleX,
    y: scaleY === 0 ? centreY : offsetY + point.y * scaleY,
  });

  // A per-axis scale and offset is a diagonal affine, and an affine maps a cubic
  // to a cubic by moving its four points — so the exact geometry survives being
  // fitted into a slot with no resampling and no loss. This is why ㅇ squeezed
  // into a block is a true ellipse: it is the same four segments, moved.
  return strokes.map((stroke) => withGeometry(stroke, move));
}

/** Applies a point transform to a stroke's polyline and its curve together. */
function withGeometry(
  stroke: StrokeStep,
  move: (point: { x: number; y: number }) => { x: number; y: number },
): StrokeStep {
  const next: StrokeStep = { points: stroke.points.map(move) };
  if (stroke.curve) {
    next.curve = stroke.curve.map(
      (segment): CurveSegment => ({
        c1: move(segment.c1),
        c2: move(segment.c2),
        to: move(segment.to),
      }),
    );
  }
  if (stroke.ends) next.ends = stroke.ends;
  return next;
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
  return strokes.map((stroke) =>
    withGeometry(stroke, (point) => ({ x: onPaper(point.x), y: onPaper(point.y) })),
  );
}

/**
 * Where in a block a letter is, which is what decides which form of it is written.
 *
 * Only ㄱ, ㅋ and ㄲ have two forms, and the face chooses between them by exactly
 * this: the leg leans in 가, 거, 기 and 강 — every block whose vowel stands to
 * the right — and comes straight down in 고, 구, 그, 국, 공, 글, under 국, and in
 * the letter written on its own. See `STROKE_ORDER_UPRIGHT`.
 */
type Slot = 'initial-beside-vowel' | 'initial-above-vowel' | 'final';

/**
 * The strokes to write a letter with, given where in the block it goes.
 *
 * This used to be left to the fit, on the theory that a squat slot squashes a
 * leaning leg upright. It does the opposite: a wide, shallow slot *stretches* a
 * near-square ㄱ sideways, and the lean is authored as a fraction of the letter's
 * width, so the leg came out at nearly sixty degrees. Every block with a
 * horizontal vowel had one — 고, 구, 그, 국, 공, 글 all read as a diagonal slash
 * under a bar rather than as ㄱ.
 *
 * Reading the slot instead of measuring the stretch is not a smaller fix; it is
 * the face's own rule, and it has no number in it to get wrong.
 */
function strokesOf(jamo: string, slot?: Slot): StrokeStep[] {
  if (slot && slot !== 'initial-beside-vowel') {
    const upright = STROKE_ORDER_UPRIGHT[jamo];
    if (upright) return upright;
  }
  return STROKE_ORDER[jamo] ?? [];
}

/**
 * The letters a block is written with, each in the form this block writes it in.
 *
 * A block is its letters and nothing else, but "its letters" is not quite the
 * same list as the isolated ones: ㄱ has two forms and which one a block takes
 * depends on where in the block it sits (see `strokesOf`). Exported so that
 * anything checking "the block is its letters" checks it against the letters
 * the block actually writes, rather than against a second copy of that rule.
 *
 * The strokes are the authored ones, in the letter's own box — not placed.
 */
export function blockLetterForms(
  syllable: string,
): Array<{ jamo: string; strokes: StrokeStep[] }> {
  const layout = syllableLayout(syllable);
  if (!layout) return [];
  const jamo = toJamo(syllable);
  return jamo.map((letter, at) => ({
    jamo: letter,
    strokes:
      at === 0
        ? strokesOf(letter, layout.form === 'vertical' ? 'initial-beside-vowel' : 'initial-above-vowel')
        : at === 2
          ? strokesOf(letter, 'final')
          : strokesOf(letter),
  }));
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
  const [, medial, final] = toJamo(syllable);
  const measured = measuredRegions(syllable);
  const [written, , writtenFinal] = blockLetterForms(syllable);

  if (measured && measured.length === toJamo(syllable).length) {
    // Measured off the reference glyph: one box per letter, in the face's own
    // spacing. Every letter fills its box, because the box *is* that letter's
    // ink in this block in this face — so filling it is how the demonstration
    // and the reference character come out as the same letter in the same
    // proportions, and holding a letter back from its box could only make them
    // differ.
    const draw = (regions: Region[]): StrokeStep[][] => {
      const parts = [
        fit(written!.strokes, regions[0]!, { keepShape: false }),
        fit(strokesOf(medial!), regions[1]!, {
          keepShape: false,
          anchorX: branchesLeft(medial!) ? 'end' : 'start',
        }),
      ];
      if (final && regions[2]) parts.push(fit(writtenFinal!.strokes, regions[2], { keepShape: false }));
      return parts;
    };
    return setOnPaper(separateColliding(measured, draw).flat());
  }

  const out: StrokeStep[] = [
    ...fit(written!.strokes, layout.initial, {
      keepShape: true,
      // A consonant over a horizontal vowel gets a wide, shallow band, and
      // filling it makes every letter as wide as the widest one that has to fit
      // — ㄱ stretched to ㄲ's width, which is how 국 ended up looking like a
      // pile of bars. Holding the squeeze near what a face uses lets each
      // letter be as wide as its own shape wants and no wider.
      squeeze: layout.form === 'horizontal' ? MAX_SQUEEZE_WIDE_SLOT : undefined,
    }),
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
    out.push(...fit(writtenFinal!.strokes, layout.final, { keepShape: true }));
  }
  return setOnPaper(out);
}

/**
 * Keeps two letters of a block from sharing ink, by measuring the ink.
 *
 * ## The block this exists for
 *
 * 꽃. The face's measured boxes put the onset at y 0…0.343 and the vowel at
 * 0.227…0.486 — they *overlap*, by a ninth of the block. That is not a bad
 * measurement: in Pretendard the ㅗ's stem really does rise between the two ㄱ
 * of ㄲ, and a bounding box around a part is bound to include it. The face gets
 * away with it because its stem is thin and the gap between the ㄱ is wide.
 *
 * This model draws every stroke with one uniform pen and lays the ㄲ out to its
 * own measured width, so the same arrangement puts the stem's ink *through* the
 * left ㄱ's leg — measured, 85 px of shared ink at 512², a bridge three units
 * tall between the two halves of the tense consonant. On screen it reads as a
 * spur growing out of the middle of ㄲ, which is what QA photographed.
 *
 * ## Why this is driven by ink and not by the boxes
 *
 * Separating the *boxes* was the first attempt and it was wrong on blocks that
 * are perfectly fine. 고 is a ㄱ over a ㅗ, and the ㄱ's leg comes down beside
 * the ㅗ's stem, so their boxes overlap by nearly half the block while their ink
 * never touches — the two are interlocked, not colliding, and that interlock is
 * what makes the block read as one character. Pushing the vowel's box clear of
 * the consonant's took 고's ㅗ down to a bar with no stem at all, and the
 * guide/demonstration gate correctly reported that the two were now teaching
 * different shapes.
 *
 * So the question is asked of the strokes: do any two segments of two different
 * letters come closer than a pen? Only 꽃, of the thirty-three measured blocks,
 * answers yes.
 *
 * ## What is moved, and how far
 *
 * The lower letter's box is shortened from the top, a quarter of a pen at a
 * time, and the block is redrawn and re-measured. Only the top edge moves, so
 * the vowel's bar stays exactly where the face put it and only its stem
 * shortens — which is the part of ㅗ that was in the wrong place. 꽃 settles
 * after two steps.
 *
 * The letter is never shortened past a pen of its own height: a part that could
 * only be freed by deleting it is a measurement problem, and this leaves the
 * collision in place for `glyph:structure` to fail on rather than quietly
 * shipping a block with a letter missing.
 */
const SEPARATION_STEPS = 12;

function separateColliding(
  regions: Region[],
  draw: (regions: Region[]) => StrokeStep[][],
): StrokeStep[][] {
  const adjusted = regions.map((region) => ({ ...region }));
  let parts = draw(adjusted);
  for (let step = 0; step < SEPARATION_STEPS; step += 1) {
    let moved = false;
    for (let below = 1; below < parts.length; below += 1) {
      for (let above = 0; above < below; above += 1) {
        if (!partsCollide(parts[above]!, parts[below]!)) continue;
        const box = adjusted[below]!;
        const floor = box.y1 - PEN;
        if (box.y0 >= floor) continue;
        box.y0 = Math.min(box.y0 + PEN / 4, floor);
        moved = true;
      }
    }
    if (!moved) break;
    parts = draw(adjusted);
  }
  return parts;
}

/** Whether any segment of one letter comes within a pen of any of the other. */
function partsCollide(a: StrokeStep[], b: StrokeStep[]): boolean {
  for (const one of a) {
    for (let i = 1; i < one.points.length; i += 1) {
      for (const other of b) {
        for (let j = 1; j < other.points.length; j += 1) {
          if (
            segmentDistance(one.points[i - 1]!, one.points[i]!, other.points[j - 1]!, other.points[j]!) <
            PEN - STACK_CLEARANCE / 8
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/** Shortest distance between two line segments. */
function segmentDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  q1: { x: number; y: number },
  q2: { x: number; y: number },
): number {
  return Math.min(
    pointToSegment(p1, q1, q2),
    pointToSegment(p2, q1, q2),
    pointToSegment(q1, p1, p2),
    pointToSegment(q2, p1, p2),
  );
}

function pointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
