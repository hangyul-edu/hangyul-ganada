import type { HangulCharacter, StrokeStep } from '@hangyul-ganada/shared-types';

import { syllableLayout } from './compose';

/**
 * "Where do I start, which way do I go, what comes next" — for this character.
 *
 * ## What this replaced
 *
 * Every letter in the app used to carry the same sentence under its
 * demonstration: *"Top to bottom, left to right. Those two rules decided almost
 * every Korean stroke."* It is true, it is interesting, and it is not an
 * instruction. A learner looking at ㄱ with a pen in their hand needs to know
 * that it is one stroke, that it starts in the top left, and that it goes
 * across before it turns down. Being told the historical principle behind that
 * is a fact about Korean; being told the movement is a lesson.
 *
 * ## Where the instruction comes from
 *
 * From `data/strokes.ts` — the same polylines the demonstration animates and
 * the same ones `strokeOrderNotes` grades against. Not from a second, hand-typed
 * description of them, which is a copy that will eventually disagree with the
 * animation the learner is watching while they read it. Everything below is
 * derived: which way each stroke runs, how long it is relative to the box,
 * whether it turns a corner.
 *
 * The order itself is not derived from anything — it is the standard order a
 * Korean primary school teaches, written down in `strokes.ts`. This only
 * describes it.
 *
 * ## Two ways to describe a character, chosen by what it is made of
 *
 * A letter with parts is described by its parts: ㅘ is ㅗ then ㅏ, 가 is ㄱ then
 * ㅏ, ㅃ is ㅂ written twice. That is both shorter and more useful than eight
 * clauses about lines, because it is how the writer is meant to be *thinking* —
 * and it is only available because `components` is already on every character.
 *
 * A letter with no parts is described stroke by stroke, at most four clauses,
 * with two identical neighbouring strokes collapsed into one ("the two short
 * lines across, top one first") rather than repeated.
 *
 * ## Why fragments and not 73 × 8 written sentences
 *
 * The instruction has to exist in eight languages for every character the
 * curriculum teaches, and it has to still be right the day somebody corrects a
 * stroke in `strokes.ts`. Composing each one from a small set of translated
 * fragments gives 100% coverage by construction — `strokeGuide.test.ts` asserts
 * it — and makes a data correction show up in all eight languages at once. The
 * fragments themselves are written for each language rather than translated
 * word for word, exactly as the pronunciation hints are.
 */

/** A shape a single stroke, or a pair of identical neighbours, makes. */
export type StrokeShape =
  | 'downLong'
  | 'downLongTwice'
  | 'downShort'
  | 'downShortTwice'
  | 'acrossLong'
  | 'acrossLongTwice'
  | 'acrossShort'
  | 'acrossShortTwice'
  | 'cornerAcrossDown'
  | 'cornerDownAcross'
  | 'slantLeft'
  | 'slantRight'
  | 'circle';

/**
 * Where the next part of a block goes, when the block puts it somewhere.
 *
 * "ㄱ first, then ㅏ" is true and says nothing about the hardest thing a
 * beginner is doing here, which is deciding *where on the paper* the second
 * letter goes. `right` and `below` come from the same layout table the
 * demonstration draws from — see `data/compose.ts` — so the sentence cannot
 * describe a position the animation does not show. `plain` is a letter written
 * from parts rather than a block — ㅘ is ㅗ then ㅏ, and it is not a block, so
 * the sentence names the parts and leaves the arrangement to the picture.
 */
export type PartPlacement = 'plain' | 'right' | 'below';

export type StrokeGuide =
  | { kind: 'strokes'; shapes: StrokeShape[] }
  /** Written as its parts: a compound vowel, a syllable block, a doubled letter. */
  | { kind: 'parts'; parts: string[]; doubled: boolean; placement: PartPlacement };

/** Below this, two coordinates are the same coordinate rather than a slope. */
const FLAT = 0.05;
/** A vertical stroke spanning at least this much of the box is a long one. */
const LONG_DOWN = 0.55;
/** And a horizontal one. Lower, because the box is as wide as it is tall but a
    letter's horizontals sit inside its verticals. */
const LONG_ACROSS = 0.45;

interface Measured {
  shape: StrokeShape;
  /** The stroke's starting point, for ordering a collapsed pair. */
  x: number;
  y: number;
}

function measure(stroke: StrokeStep): Measured | null {
  const points = stroke.points;
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  // A closed path with enough points to read as round: ㅇ, and the ring of ㅎ.
  if (points.length > 8 && Math.hypot(last.x - first.x, last.y - first.y) < FLAT) {
    return { shape: 'circle', x: first.x, y: first.y };
  }

  if (points.length >= 3) {
    // One corner. Which way it turns is the whole instruction: ㄱ goes across
    // and then down, ㄴ goes down and then across, and a learner who has them
    // the wrong way round has drawn a picture of the letter rather than
    // written it.
    const mid = points[1]!;
    const firstLeg = Math.abs(mid.x - first.x) > Math.abs(mid.y - first.y);
    const secondLeg = Math.abs(last.x - mid.x) > Math.abs(last.y - mid.y);
    if (firstLeg && !secondLeg) return { shape: 'cornerAcrossDown', x: first.x, y: first.y };
    if (!firstLeg && secondLeg) return { shape: 'cornerDownAcross', x: first.x, y: first.y };
  }

  const dx = last.x - first.x;
  const dy = last.y - first.y;

  if (Math.abs(dx) < FLAT) {
    return {
      shape: Math.abs(dy) >= LONG_DOWN ? 'downLong' : 'downShort',
      x: first.x,
      y: first.y,
    };
  }
  if (Math.abs(dy) < FLAT) {
    return {
      shape: Math.abs(dx) >= LONG_ACROSS ? 'acrossLong' : 'acrossShort',
      x: first.x,
      y: first.y,
    };
  }
  return { shape: dx < 0 ? 'slantLeft' : 'slantRight', x: first.x, y: first.y };
}

/** The `Twice` form of a shape, where collapsing a pair makes sense. */
const PAIRED: Partial<Record<StrokeShape, StrokeShape>> = {
  downLong: 'downLongTwice',
  downShort: 'downShortTwice',
  acrossLong: 'acrossLongTwice',
  acrossShort: 'acrossShortTwice',
};

/**
 * Collapses two identical neighbouring strokes into one clause.
 *
 * ㅑ is a long line down and then two short lines across, and describing it as
 * "then the short line across, then the short line across" is worse than
 * useless — it reads as a mistake. The pair becomes one clause that also says
 * which of the two comes first.
 *
 * The claim the collapsed clause makes ("top one first", "left one first") is
 * checked against the data rather than assumed: a pair written in the other
 * order is left as two separate clauses, so a future correction in
 * `strokes.ts` cannot silently turn this into a lie.
 */
function collapse(measured: Measured[]): StrokeShape[] {
  const out: StrokeShape[] = [];
  for (let i = 0; i < measured.length; i += 1) {
    const here = measured[i]!;
    const next = measured[i + 1];
    const paired = PAIRED[here.shape];
    const isRunOfTwo =
      paired !== undefined &&
      next !== undefined &&
      next.shape === here.shape &&
      measured[i + 2]?.shape !== here.shape;
    if (isRunOfTwo) {
      const vertical = here.shape === 'downLong' || here.shape === 'downShort';
      const ordered = vertical ? next!.x > here.x : next!.y > here.y;
      if (ordered) {
        out.push(paired!);
        i += 1;
        continue;
      }
    }
    out.push(here.shape);
  }
  return out;
}

/**
 * How to write this character, as data a sentence can be built from.
 *
 * Never returns null: a character with no describable strokes cannot exist,
 * because `characters.ts` refuses to build one without stroke data at all.
 */
export function strokeGuideFor(character: HangulCharacter): StrokeGuide {
  const parts = character.components;
  if (parts.length >= 2) {
    const doubled = parts.every((part) => part === parts[0]);
    // A wrapped vowel counts as `right`: ㅘ curls under the consonant, but the
    // stem the writer finishes on — the part that decides where the pen goes
    // next — is the one down the right-hand side.
    const layout = syllableLayout(character.character);
    const placement: PartPlacement = layout && layout.form === 'horizontal' ? 'below' : layout ? 'right' : 'plain';
    return { kind: 'parts', parts: [...parts], doubled, placement };
  }

  const measured = character.strokes.map(measure).filter((m): m is Measured => m !== null);
  const shapes = collapse(measured);
  return { kind: 'strokes', shapes };
}

/** What `t` has to look like. Kept structural so a test can pass a plain map. */
type Translate = (key: string, params?: Record<string, string>) => string;

/**
 * The finished sentence.
 *
 * Falls back to naming the stroke count when a character produces more clauses
 * than there is a natural sentence for. Nothing in the current curriculum does
 * — the test asserts as much — but a letter added later must degrade to
 * something true rather than to a blank line under its demonstration.
 */
export function strokeGuideText(guide: StrokeGuide, t: Translate, strokeCount: number): string {
  if (guide.kind === 'parts') {
    if (guide.doubled) {
      return t('strokeGuide.partsDouble', { a: guide.parts[0]! });
    }
    // A block says where the next letter goes; a letter made of parts only says
    // what they are. Same data, one more fact when there is one to give.
    if (guide.parts.length === 2) {
      return t(`strokeGuide.parts2.${guide.placement}`, {
        a: guide.parts[0]!,
        b: guide.parts[1]!,
      });
    }
    if (guide.parts.length === 3) {
      // Three parts is a 받침 block and nothing else, so there is no `plain`
      // form of this sentence to fall back to.
      return t(`strokeGuide.parts3.${guide.placement === 'below' ? 'below' : 'right'}`, {
        a: guide.parts[0]!,
        b: guide.parts[1]!,
        c: guide.parts[2]!,
      });
    }
    return t('strokeGuide.fallback', { strokes: String(strokeCount) });
  }

  const clauses = guide.shapes.map((shape) => t(`strokeGuide.shape.${shape}`));
  const [a, b, c, d] = clauses;
  if (clauses.length === 1) return t('strokeGuide.s1', { a: a! });
  if (clauses.length === 2) return t('strokeGuide.s2', { a: a!, b: b! });
  if (clauses.length === 3) return t('strokeGuide.s3', { a: a!, b: b!, c: c! });
  if (clauses.length === 4) return t('strokeGuide.s4', { a: a!, b: b!, c: c!, d: d! });
  return t('strokeGuide.fallback', { strokes: String(strokeCount) });
}
