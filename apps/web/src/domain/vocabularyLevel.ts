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

/** How new words are spread around the learner's level. Shares of ten. */
export const MIX = { atLevel: 7, easier: 2, harder: 1 } as const;

/** The level a frequency rank falls in. The scale the test reports on. */
export function levelOfRank(rank: number | null): number {
  if (rank === null) return LEVELS;
  for (let level = 0; level < CUMULATIVE_WORDS.length; level += 1) {
    if (rank <= CUMULATIVE_WORDS[level]!) return level + 1;
  }
  return LEVELS;
}

export function wordLevel(word: VocabularyWord): number {
  return levelOfRank(word.frequency.rank);
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
 * A learner's level when they have never taken the test.
 *
 * Conservative, and derived from what they have actually done rather than
 * guessed: the level of the hardest word they have learned, one below, floored
 * at 1. Somebody who has learned nothing starts at level 1, which is where the
 * corpus starts anyway — so the app behaves exactly as it did before the test
 * existed until the learner asks it not to.
 */
export function levelFromProgress(
  corpus: readonly VocabularyWord[],
  isLearned: (wordId: string) => boolean,
): number {
  let hardest = 0;
  for (const word of corpus) {
    if (!isLearned(word.id)) continue;
    const level = wordLevel(word);
    if (level > hardest) hardest = level;
  }
  return Math.max(1, hardest - 1);
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
 * Deterministic given the seed and the day, and shuffled rather than blocked —
 * a session that opened with two easy words and closed with the hard one would
 * be a session with a shape, and the shape would be the wrong lesson.
 */
export function targetLevels(
  level: number,
  count: number,
  range: LevelRange,
  seed: string,
  dayIndex: number,
): number[] {
  const clamp = (value: number) => Math.min(range.max, Math.max(range.min, value));
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const roll = hash(`${seed}:${dayIndex}:slot:${i}`) % 10;
    let offset: number;
    if (roll < MIX.atLevel) {
      offset = (hash(`${seed}:${dayIndex}:near:${i}`) % 3) - 1; // -1, 0, +1
    } else if (roll < MIX.atLevel + MIX.easier) {
      offset = -1 - (hash(`${seed}:${dayIndex}:easy:${i}`) % 2); // -1, -2
    } else {
      offset = 1 + (hash(`${seed}:${dayIndex}:hard:${i}`) % 2); // +1, +2
    }
    out.push(clamp(level + offset));
  }
  return out;
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
  const { corpus, level, seed, dayIndex, count, isMet, isRecent } = request;
  if (count <= 0) return [];

  const range = levelRange(corpus);
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

  /** Nearest levels to `at`, closest first, so a miss widens rather than fails. */
  function search(at: number): number[] {
    const order = [at];
    for (let d = 1; d <= LEVELS; d += 1) {
      if (at - d >= range.min) order.push(at - d);
      if (at + d <= range.max) order.push(at + d);
    }
    return order;
  }

  for (const target of wanted) {
    let picked: VocabularyWord | undefined;
    // Two passes: everything that is not recent, then everything.
    for (const allowRecent of [false, true]) {
      for (const at of search(target)) {
        picked = (eligible.get(at) ?? []).find(
          (word) => !taken.has(word.id) && (allowRecent || !isRecent(word.id)),
        );
        if (picked) break;
      }
      if (picked) break;
    }
    if (!picked) break;
    taken.add(picked.id);
    chosen.push(picked);
  }
  return chosen;
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
