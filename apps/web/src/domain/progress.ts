import type { ItemProgress, LetterLesson, VocabularyWord } from '@hangyul-ganada/shared-types';

import { ALL_LETTERS, CURRICULUM_UNITS, LETTER_LESSONS, getLessonCharacters } from '../data/characters';
import { VOCABULARY, corpusTotal, usesKnownLetters } from '../data/vocabulary';
import { progressKey } from '../storage/schema';

/**
 * Every progress figure in Hangyul ganada, defined once.
 *
 * A progress bar is a promise. If two bars on the same screen measure different
 * things and neither says which, the learner learns to ignore both — and a bar
 * that moves for reasons the learner cannot predict is worse than no bar.
 *
 * So each function here answers exactly one question, is named after that
 * question, and is the only place the answer is computed:
 *
 * | Bar | Numerator | Denominator |
 * | --- | --- | --- |
 * | Daily goal | items that reached `learned` today | the learner's daily target |
 * | Alphabet | letters at `learned` | 40 — the letters of Hangul |
 * | Unit | characters in the unit at `learned` | characters in the unit |
 * | Lesson | characters in the lesson at `learned` | characters in the lesson |
 * | Session | steps finished | steps in this session |
 * | Vocabulary | words at `learned` | every word in the curriculum |
 * | Level | words in the level at `learned` | words in the level |
 * | Review | items reviewed today | items that were due today |
 *
 * Two of those deserve their reasoning stated, because the obvious choice is
 * wrong. The alphabet bar counts **letters only** — including the fifty-odd
 * practice syllables would mean the bar reads 40% when the learner knows every
 * letter in Korean, which is the opposite of what they have achieved. And the
 * vocabulary bar counts against the **whole dataset**, because every word in it
 * is open: a bar measured against "what you may access" would sit at 100% for a
 * learner who has studied nothing at all.
 */

export type ProgressMap = Record<string, ItemProgress>;

export interface Fraction {
  done: number;
  total: number;
  /** 0–1. Zero when the total is zero, never NaN. */
  ratio: number;
}

export function fraction(done: number, total: number): Fraction {
  return { done, total, ratio: total > 0 ? Math.min(1, done / total) : 0 };
}

function isLearned(progress: ProgressMap, kind: ItemProgress['kind'], key: string): boolean {
  return progress[progressKey(kind, key)]?.stage === 'learned';
}

/** True once the learner has met the letter, even if not yet mastered. */
export function isIntroduced(progress: ProgressMap, character: string): boolean {
  const row = progress[progressKey('character', character)];
  return Boolean(row && row.stage !== 'unseen');
}

// --- The alphabet ------------------------------------------------------------

export const TOTAL_LETTERS = ALL_LETTERS.length;

/** Letters of Hangul the learner has learned, out of all 40. */
export function alphabetProgress(progress: ProgressMap): Fraction {
  const done = ALL_LETTERS.filter((c) => isLearned(progress, 'character', c.character)).length;
  return fraction(done, TOTAL_LETTERS);
}

/**
 * Letters the learner has at least been introduced to.
 *
 * This — not `learned` — is what counts as "you can read this". A learner who
 * has met ㅂ in a lesson can read 바다 even if their handwriting is not yet good
 * enough to pass, and treating the two as the same thing would break the
 * connection the whole curriculum is built on.
 *
 * It decides what the app *suggests*, never what it *allows*: vocabulary has no
 * locks. See `usesKnownLetters` in `data/vocabulary.ts`.
 */
export function knownLetters(progress: ProgressMap): Set<string> {
  return new Set(ALL_LETTERS.filter((c) => isIntroduced(progress, c.character)).map((c) => c.character));
}

// --- Lessons and units -------------------------------------------------------

export function lessonProgress(progress: ProgressMap, lesson: LetterLesson): Fraction {
  const characters = getLessonCharacters(lesson);
  const done = characters.filter((c) => isLearned(progress, 'character', c.character)).length;
  return fraction(done, characters.length);
}

export function unitProgress(progress: ProgressMap, unitId: string): Fraction {
  const unit = CURRICULUM_UNITS.find((u) => u.id === unitId);
  if (!unit) return fraction(0, 0);
  const characters = unit.lesson_ids
    .map((id) => LETTER_LESSONS.find((l) => l.id === id))
    .filter((l): l is LetterLesson => Boolean(l))
    .flatMap(getLessonCharacters);
  const unique = new Map(characters.map((c) => [c.character, c]));
  const done = [...unique.keys()].filter((ch) => isLearned(progress, 'character', ch)).length;
  return fraction(done, unique.size);
}

/**
 * The lesson to open when the learner taps "continue", or `null` when there is
 * no lesson left to open.
 *
 * The first lesson with anything left in it, in curriculum order — not the last
 * one they opened. Resuming where they *stopped* would strand a learner who
 * skipped ahead once, and this is the one button on the home screen that has to
 * be right every time.
 *
 * ## Why it returns null instead of the last lesson
 *
 * It used to end `?? LETTER_LESSONS.at(-1)`, and that fallback was a loop with
 * a friendly name on it. A learner who finished the alphabet — the one moment
 * in this product that is unambiguously an achievement — was shown the last
 * chapter they had already completed, under a button reading *Continue*. They
 * tapped it, arrived at a lesson with every letter green, came back, and were
 * offered the same chapter again. Forever.
 *
 * The fallback existed because the return type had nowhere to put "finished".
 * So the type says it now, and the caller has to decide what finishing looks
 * like — which is the right place for that decision, and produced a completion
 * card on Home rather than a silent re-offer. Every caller must handle `null`;
 * `progress.test.ts` is the guard that one cannot quietly reintroduce the
 * fallback.
 */
export function nextLesson(progress: ProgressMap): LetterLesson | null {
  return LETTER_LESSONS.find((lesson) => lessonProgress(progress, lesson).ratio < 1) ?? null;
}

/** True once every letter lesson is finished. The alphabet is done. */
export function alphabetComplete(progress: ProgressMap): boolean {
  return nextLesson(progress) === null;
}

// --- Vocabulary --------------------------------------------------------------

export interface VocabularyProgress extends Fraction {
  /**
   * Words whose letters the learner has already met.
   *
   * A *recommendation* figure — how much of the curriculum is comfortable
   * right now — and deliberately not the denominator of anything. Every word
   * is open regardless.
   */
  readable: number;
}

/**
 * Words learned, out of every word in the curriculum.
 *
 * The denominator is the whole dataset, and it has to be. Vocabulary has no
 * locks: all 2,832 words are open from the first launch, so a bar measured
 * against "what is available" would read 100% for a learner who has studied
 * nothing, which is not a progress bar — it is a lie with a gradient on it.
 * 75 / 2,832 is small, and it is true, and it grows for exactly one reason:
 * the learner finished a word.
 *
 * Note what is *not* counted. A word that was opened, or seen, or heard, is
 * not a word that was learned; only `stage === 'learned'` moves this. See
 * `domain/mastery.ts` for what earns that.
 */
export function vocabularyProgress(progress: ProgressMap): VocabularyProgress {
  const letters = knownLetters(progress);
  const done = VOCABULARY.filter((w) => isLearned(progress, 'word', w.id)).length;
  const readable = VOCABULARY.filter((w) => usesKnownLetters(w, letters)).length;
  // The denominator is the *published* corpus, not the part of it that has been
  // fetched — see `corpusTotal`. A progress bar whose denominator grows while
  // the learner watches is worse than one that starts at its final size.
  return { ...fraction(done, corpusTotal()), readable };
}

export function levelProgress(progress: ProgressMap, words: VocabularyWord[]): Fraction {
  const done = words.filter((w) => isLearned(progress, 'word', w.id)).length;
  return fraction(done, words.length);
}

// --- The day -----------------------------------------------------------------

/** Local calendar day, so "today" matches the learner's day, not UTC's. */
export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Characters finished today.
 *
 * **Characters**, not items. Words have their own daily goal now — see
 * `domain/vocabularyDay.ts` — and counting them here as well meant two goals
 * measuring overlapping things: a learner who did ten words would watch the
 * letter goal fill up without having touched a letter, and the two numbers on
 * Home would be describing the same afternoon twice.
 *
 * The two are deliberately different in kind. This one counts *mastery* — a
 * character that has walked its whole ladder — because that is what a letter
 * lesson produces. The word goal counts *a day's work*, because vocabulary is
 * met, practised and revisited rather than finished once.
 */
export function learnedToday(progress: ProgressMap, now: Date): number {
  const today = dateKey(now);
  return Object.values(progress).filter(
    (row) =>
      row.kind === 'character' &&
      row.learned_at !== null &&
      dateKey(new Date(row.learned_at)) === today,
  ).length;
}

export function dailyProgress(progress: ProgressMap, target: number, now: Date): Fraction {
  return fraction(learnedToday(progress, now), Math.max(1, target));
}

// The streak arithmetic lives in `domain/activity.ts` (`streakSummary`,
// `learningStreak`) and only there. A second implementation used to live here
// and was read by Home while the Activity screen read the other one — two
// truths for one number, over two different day sets. Do not add one back.

// --- Review ------------------------------------------------------------------

/**
 * What Review should offer, hardest first.
 *
 * Order, and why:
 *
 * 1. **Failed and not since passed.** The learner got it wrong and has not
 *    fixed it. Nothing else is more worth their next two minutes.
 * 2. **Due, by how overdue.** Something learned three weeks ago and never seen
 *    since is closer to forgotten than something learned yesterday.
 * 3. **Most-failed first**, within each group, because the item they have
 *    missed four times is the one that is actually not learned.
 *
 * This is not a spaced-repetition engine and does not pretend to be. It is the
 * smallest scheduler that makes the Review tab worth opening, which is the
 * thing a static list of past mistakes is not.
 */
export interface ReviewQueue {
  /** Items the learner has failed and not since passed. */
  failing: ItemProgress[];
  /** Items whose scheduled review has come round. */
  due: ItemProgress[];
  /** Everything, in the order Review should present it. */
  ordered: ItemProgress[];
  /**
   * The first `REVIEW_SESSION_SIZE` of `ordered`, which is what a session runs.
   *
   * A queue and a session are different things and conflating them is how
   * review becomes something a learner avoids: someone who comes back after a
   * fortnight has ninety items due, and a screen that offers ninety is a screen
   * they close. The queue keeps all of them — nothing is dropped — and the
   * session takes the ones most at risk.
   */
  session: ItemProgress[];
}

/**
 * How many items one review session asks for.
 *
 * Twelve is about four minutes of writing, which is short enough to start
 * without deciding to and long enough to be worth having done. The rest of the
 * queue is still there tomorrow, and the count is shown so the learner knows
 * that.
 */
export const REVIEW_SESSION_SIZE = 12;

/**
 * How overdue an item is, in days. Negative means not yet due.
 *
 * Used for ordering rather than for deciding: an item three weeks overdue is
 * closer to forgotten than one due this morning, and asking them in the order
 * they happened to be scheduled would spend a short session on the ones the
 * learner is least likely to have lost.
 */
function daysOverdue(row: ItemProgress, now: Date): number {
  if (!row.review_due_at) return 0;
  return (now.getTime() - new Date(row.review_due_at).getTime()) / 86_400_000;
}

/**
 * How much this item needs asking, most urgent first.
 *
 * Two things make an item urgent, and they are not the same thing. **Overdue**
 * says the memory has had longest to fade. **History of failure** says this is
 * the one the learner keeps losing. An item that is both is the single best use
 * of the next question, and a plain sort by due date finds it only by accident.
 */
function risk(row: ItemProgress, now: Date): number {
  return daysOverdue(row, now) + row.fails * 1.5;
}

export function reviewQueue(progress: ProgressMap, now: Date): ReviewQueue {
  const rows = Object.values(progress);
  const stamp = now.toISOString();

  // Failed-and-not-since-passed comes first, whatever the schedule says: the
  // learner got it wrong and has not been given the chance to put it right.
  const failing = rows
    .filter((row) => row.needs_review)
    .sort((a, b) => b.fails - a.fails || compareDates(a.last_attempted_at, b.last_attempted_at));

  const due = rows
    .filter((row) => !row.needs_review && row.review_due_at !== null && row.review_due_at <= stamp)
    .sort((a, b) => risk(b, now) - risk(a, now) || compareDates(a.review_due_at, b.review_due_at));

  const ordered = [...failing, ...due];
  return { failing, due, ordered, session: ordered.slice(0, REVIEW_SESSION_SIZE) };
}

function compareDates(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}
