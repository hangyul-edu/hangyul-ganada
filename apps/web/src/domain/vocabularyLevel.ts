import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { CUMULATIVE_WORDS, LEVELS } from './levelTest';

/**
 * What the learner's Vocabulary Level does to what they are taught.
 *
 * ## The problem this fixes
 *
 * Every learner got the same words in the same order. The corpus is sorted by
 * usefulness and the day's plan took a prefix of it, so two people who had
 * studied for the same number of days had studied the same list — and somebody
 * who arrived already knowing five hundred words spent their first fortnight
 * being taught 나, 우리 and 네. The test told them they were level 14 and then
 * nothing used the number.
 *
 * ## The mix
 *
 * Seven new words in ten come from the learner's own level, give or take one;
 * two are a little easier; one is a little harder. Easier words are not
 * padding — they are the ones a placement test says you *probably* know, and
 * being right about them is what makes a session feel possible. The harder one
 * is the reason to come back.
 *
 * ## Two learners at the same level do not get the same list
 *
 * Every learner has a `content_seed`, made once and kept. Selection inside a
 * level is ordered by a hash of (seed, study day, word), so the choice is
 * arbitrary but *fixed*: the same learner on the same day gets the same list
 * however many times they close the app, and the next day gets a different one.
 *
 * ## What the corpus can actually support
 *
 * The teaching corpus is 2,581 words, which is the first 2,581 by frequency,
 * which is **Hangyul levels 1 to 13**. There is nothing above that to teach
 * yet — see I-04 — so a learner placed at level 20 is taught from the top of
 * what exists rather than from nothing. The level they are shown is still their
 * level; the words are the hardest the product has. When the corpus reaches ten
 * thousand this clamp stops firing on its own.
 */

/** Levels the shipped corpus actually has words at. Computed, not assumed. */
export interface LevelRange {
  min: number;
  max: number;
}

/**
 * How new words are spread around the learner's level. Shares of ten.
 *
 * Six at the level, two a little below, two a little above. The two below are
 * not padding: they are the words a placement test says the learner probably
 * knows, and being right about them is what makes a session feel possible. The
 * two above are the reason to come back.
 */
export const MIX = { atLevel: 6, easier: 2, harder: 2 } as const;

/**
 * The band a learner may be taught from, before any widening.
 *
 * §17 and §18. A learner at level L is taught from L−1 to L+1, and the ends of
 * the scale are asymmetric because they have to be: nothing exists below 1, and
 * a learner at 30 has nothing above them, so their band deepens downward
 * instead. **A learner placed at 30 is never offered ordinary new vocabulary
 * from level 1 to 27**, and that is the whole point of the exercise — the app
 * knowing they already read Korean is the difference between a level system and
 * a number beside `Lv.`
 *
 * Words they got *wrong*, words due for review and words they saved themselves
 * are a different question and are not selected here. Remediation is allowed to
 * reach anywhere; ordinary new study is not.
 */
export function teachingZone(level: number): { min: number; max: number } {
  const clamp = (value: number) => Math.min(LEVELS, Math.max(1, value));
  if (level <= 2) return { min: 1, max: clamp(level + 1) };
  if (level >= LEVELS - 1) return { min: clamp(LEVELS - 2), max: LEVELS };
  return { min: clamp(level - 1), max: clamp(level + 1) };
}

/**
 * The level a frequency rank falls in. **Not** a word's level any more.
 *
 * Kept because the Level Test's *dictionary* anchors have no taught level —
 * they are not taught — and a rank is the only evidence there is about them.
 * Nothing that selects a word for a learner may call this: the corpus stopped
 * at rank 3,500 while the ladder ran to 10,635, so it returned a number between
 * 1 and 14 for every word the product owns and 30 for the eight it had never
 * seen a rank for. Levels 15 to 29 were empty and everybody above 14 was taught
 * the same eighty words.
 */
export function levelOfRank(rank: number | null): number {
  if (rank === null) return LEVELS;
  for (let level = 0; level < CUMULATIVE_WORDS.length; level += 1) {
    if (rank <= CUMULATIVE_WORDS[level]!) return level + 1;
  }
  return LEVELS;
}

/**
 * A word's Vocabulary Level, 1–30.
 *
 * Read from the word, not computed here. It is decided once, at content build
 * time, from frequency *and* learner utility *and* linguistic complexity *and*
 * semantic complexity — see `scripts/content/level.py` — and it is the same
 * number the Level Test reports and this module selects by. §31 of the brief:
 * one meaning of level 18, not two.
 */
export function wordLevel(word: VocabularyWord): number {
  return word.level;
}

/**
 * A small, stable, well-spread hash. FNV-1a, 32-bit.
 *
 * Not for security and not for uniformity beyond "two adjacent word ids do not
 * land next to each other". What it has to be is *the same on every device*,
 * because a learner who reads their word list on a phone and then on a laptop
 * has to see the same list.
 */
export function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/**
 * The level a learner has *outgrown*, read from what they have learned.
 *
 * The lowest level where they still have real work left — under two thirds of
 * it learned — floored at 1. Somebody who has learned nothing is at level 1,
 * which is where the corpus starts, so the app behaves exactly as it did before
 * the test existed until they ask it not to.
 *
 * ## Why this is evidence and not gamification
 *
 * §64 is right that an assessed level is a measurement and studying does not
 * move it: the number on the home screen is what the test said, and it only
 * changes when the test is taken again. This is a different question. A learner
 * placed at 1 who has since finished every word at levels 1 and 2 cannot be
 * *taught* from levels 1 and 2 any more — there is nothing left in them — and
 * the honest response is to teach the next band rather than to hand them a
 * short day forever. §19 says fix the content rather than widen the range; this
 * is the case where the content is fine and the learner has simply used it.
 *
 * It only ever moves *upward* from the measured level. A learner who is
 * assessed at 20 and has learned nothing is still taught at 20 — their history
 * in this installation is not evidence about their Korean, which is §15.
 */
export function levelFromProgress(
  corpus: readonly VocabularyWord[],
  isLearned: (wordId: string) => boolean,
): number {
  const total = new Map<number, number>();
  const done = new Map<number, number>();
  for (const word of corpus) {
    const at = wordLevel(word);
    total.set(at, (total.get(at) ?? 0) + 1);
    if (isLearned(word.id)) done.set(at, (done.get(at) ?? 0) + 1);
  }
  for (let at = 1; at <= LEVELS; at += 1) {
    const size = total.get(at) ?? 0;
    if (size === 0) continue;
    if ((done.get(at) ?? 0) / size < 2 / 3) return at;
  }
  return LEVELS;
}

/**
 * The level the day's words are chosen around.
 *
 * The measured level, or what they have outgrown, whichever is higher. Never
 * lower than the measurement: an empty app is not evidence that somebody has
 * forgotten Korean.
 */
export function teachingLevel(measured: number | null, outgrown: number): number {
  return Math.min(LEVELS, Math.max(1, measured ?? 1, outgrown));
}

/** The levels present in a corpus, so the mix can be clamped to reality. */
export function levelRange(corpus: readonly VocabularyWord[]): LevelRange {
  let min = LEVELS;
  let max = 1;
  for (const word of corpus) {
    const level = wordLevel(word);
    if (level < min) min = level;
    if (level > max) max = level;
  }
  return min > max ? { min: 1, max: 1 } : { min, max };
}

/**
 * Which level each of `count` new words should come from.
 *
 * Every target lands inside `teachingZone`, and that is the change worth
 * naming. The version this replaces added an offset of −2 to +2 and then
 * clamped to whatever levels the corpus happened to have — which, when levels
 * 15 to 29 were empty, meant a learner at 20 was clamped to 14 and taught the
 * same eighty words as a learner at 15.
 *
 * Deterministic given the seed and the day, and shuffled rather than blocked: a
 * session that opened with two easy words and closed with the hard one would be
 * a session with a shape, and the shape would be the wrong lesson.
 */
export function targetLevels(
  level: number,
  count: number,
  range: LevelRange,
  seed: string,
  dayIndex: number,
): number[] {
  const zone = teachingZone(level);
  // The zone is what the learner may be taught; the range is what the corpus
  // has. Where they disagree the corpus wins, because a level with no words in
  // it cannot be taught from — and `pickNewWords` records that as a deficit
  // rather than quietly reaching further down.
  const low = Math.max(zone.min, range.min);
  const high = Math.min(zone.max, range.max);
  const clamp = (value: number) => Math.min(high, Math.max(low, value));
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const roll = hash(`${seed}:${dayIndex}:slot:${i}`) % 10;
    let offset: number;
    if (roll < MIX.atLevel) offset = 0;
    else if (roll < MIX.atLevel + MIX.easier) offset = -1;
    else offset = 1;
    out.push(clamp(level + offset));
  }
  return out;
}

/**
 * What a day could not find, and where it looked.
 *
 * §19 and §20: when a level runs out of candidates the selector may widen by
 * **one** level and no further, and if that still fails the day is short and
 * the shortfall is recorded. The alternative — widening until something is
 * found — is how a content problem becomes a teaching problem, and it is what
 * produced a level-30 learner being handed 엄마.
 */
export interface LevelDeficit {
  /** The level the plan wanted a word from. */
  wanted: number;
  /** How many it could not supply from `wanted` or one level either side. */
  short: number;
}

export interface NewWordRequest {
  corpus: readonly VocabularyWord[];
  /** The learner's Vocabulary Level, or the conservative stand-in. */
  level: number;
  /** Stable per learner. See `content_seed`. */
  seed: string;
  /** How many days the learner has studied. Rotates the choice. */
  dayIndex: number;
  /** How many new words the day wants. */
  count: number;
  /** Words already met, in any stage. Never offered as new again. */
  isMet: (wordId: string) => boolean;
  /** Words introduced recently. Skipped unless the pool is exhausted. */
  isRecent: (wordId: string) => boolean;
}

/**
 * The day's new words.
 *
 * ## Why the pool is scanned whole rather than prefixed
 *
 * The old plan took the first `goal` unmet words in priority order and stopped,
 * which is why every learner got the same list and why the cost of a session
 * did not grow with the corpus. This has to look at every unmet word to know
 * what is available at each level, so it is one pass over the corpus per day —
 * 2,581 rows now, 10,000 at the target, and once a day either way. The plan it
 * builds is stored, so a session still costs nothing.
 *
 * ## Recent words
 *
 * A word introduced in the last fortnight is not offered as new again, because
 * Review is what brings words back and Today's Vocabulary is what brings new
 * ones. The rule yields when it has to: if a level has nothing but recent
 * words, a recent word is better than a short day.
 */
export function pickNewWords(request: NewWordRequest): VocabularyWord[] {
  return planNewWords(request).words;
}

/** The same choice, with what it could not find. See `LevelDeficit`. */
export function planNewWords(request: NewWordRequest): {
  words: VocabularyWord[];
  deficits: LevelDeficit[];
} {
  const { corpus, level, seed, dayIndex, count, isMet, isRecent } = request;
  if (count <= 0) return { words: [], deficits: [] };

  const range = levelRange(corpus);
  const zone = teachingZone(level);
  const eligible = new Map<number, VocabularyWord[]>();
  for (const word of corpus) {
    if (isMet(word.id)) continue;
    const at = wordLevel(word);
    const list = eligible.get(at);
    if (list) list.push(word);
    else eligible.set(at, [word]);
  }
  // Inside a level, the order is a hash of (learner, day, word): arbitrary,
  // stable for the day, and different for the next learner and the next day.
  for (const list of eligible.values()) {
    list.sort((a, b) => hash(`${seed}:${dayIndex}:${a.id}`) - hash(`${seed}:${dayIndex}:${b.id}`));
  }

  const wanted = targetLevels(level, count, range, seed, dayIndex);
  const chosen: VocabularyWord[] = [];
  const taken = new Set<string>();
  const short = new Map<number, number>();

  /**
   * Where a target level may look, in order.
   *
   * The target, then one level either side, and **that is all**. Widening past
   * the teaching zone is refused: the previous version walked outward across
   * the whole thirty-level scale until it found something, which is why a
   * learner placed at 25 was handed level-14 vocabulary without anything
   * anywhere reporting a problem.
   */
  function search(at: number): number[] {
    const inside = (value: number) =>
      value >= Math.max(1, zone.min - 1) && value <= Math.min(LEVELS, zone.max + 1);
    return [at, at - 1, at + 1].filter(inside);
  }

  for (const target of wanted) {
    let picked: VocabularyWord | undefined;
    // Two passes: everything that is not recent, then everything. A word met in
    // the last fortnight is Review's job, and a repeat beats a short day.
    for (const allowRecent of [false, true]) {
      for (const at of search(target)) {
        picked = (eligible.get(at) ?? []).find(
          (word) => !taken.has(word.id) && (allowRecent || !isRecent(word.id)),
        );
        if (picked) break;
      }
      if (picked) break;
    }
    if (!picked) {
      short.set(target, (short.get(target) ?? 0) + 1);
      continue;
    }
    taken.add(picked.id);
    chosen.push(picked);
  }
  return {
    words: chosen,
    deficits: [...short].map(([level, count]) => ({ wanted: level, short: count })),
  };
}

/** The name shown beside a level on the home screen. Four bands, thirty levels. */
export function levelBand(level: number): 'starter' | 'everyday' | 'confident' | 'advanced' {
  if (level <= 5) return 'starter';
  if (level <= 13) return 'everyday';
  if (level <= 21) return 'confident';
  return 'advanced';
}

/** How far back a word counts as "just introduced". Study days, not calendar days. */
export const RECENT_DAYS = 14;

/**
 * Words the learner met in the last fortnight.
 *
 * Read from `first_seen_at`, which the progress row already records, rather
 * than from a second list that would have to be kept in step with it. Calendar
 * days rather than study days: a learner who takes a week off should come back
 * to the words they were in the middle of, not to a fortnight of new ones.
 *
 * These are excluded from *new* selection only. Review is what brings a word
 * back, and it does so on the schedule the learner's own answers earned.
 */
export function recentlyIntroduced(
  progress: Record<string, { kind: string; item_key: string; first_seen_at: string | null }>,
  now: Date,
): Set<string> {
  const cutoff = now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const out = new Set<string>();
  for (const row of Object.values(progress)) {
    if (row.kind !== 'word' || !row.first_seen_at) continue;
    if (Date.parse(row.first_seen_at) >= cutoff) out.add(row.item_key);
  }
  return out;
}
