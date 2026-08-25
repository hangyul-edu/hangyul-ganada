/**
 * The rules that decide what a learner has achieved.
 *
 * Every number on the home screen comes out of these two modules, so a mistake
 * here is a progress bar that lies. The mastery ladder in particular has one
 * property worth defending in a test: it never goes backwards. A learner who
 * writes ㄱ from memory and then has a bad day has still written ㄱ from
 * memory, and an app that takes that away teaches them to stop trying.
 */
import { describe, expect, it } from 'vitest';
import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { ALL_LETTERS, LETTER_LESSONS } from '../data/characters';
import { VOCABULARY } from '../data/vocabulary';
import { blankProgress, progressKey } from '../storage/schema';
import {
  applyAttempt,
  applyDemoSeen,
  applyHeard,
  applyIntroduced,
  applyRecognition,
  atLeast,
  remainingRequirements,
  reviewIntervalDays,
} from './mastery';
import {
  alphabetProgress,
  dailyProgress,
  dateKey,
  knownLetters,
  lessonProgress,
  alphabetComplete,
  nextLesson,
  REVIEW_SESSION_SIZE,
  reviewQueue,
  unitProgress,
  vocabularyProgress,
} from './progress';
import { streakSummary } from './activity';

const T0 = new Date('2026-04-10T08:00:00.000Z');
/** A letter: heard, watched, written once over a guide, and read back. */
const RULES = { recognitionRequired: true, demoRequired: true, writingRequired: true };
/**
 * A word: heard and understood, and **never written**.
 *
 * `writingRequired: false` is the product rule, not a relaxation of one. There
 * is no vocabulary handwriting anywhere in this app; a word that waited on ink
 * would be a word that could never finish.
 */
const WORD_RULES = { recognitionRequired: true, demoRequired: false, writingRequired: false };

function attempt(
  previous: ItemProgress | undefined,
  passed: boolean,
  mode: 'trace' | 'practice',
  now = T0,
): ItemProgress {
  return applyAttempt(
    previous,
    { kind: 'character', itemKey: 'ㄱ', outcome: { passed, score: passed ? 0.95 : 0.4, mode }, rules: RULES },
    now,
  );
}

describe('mastery ladder', () => {
  it('walks a letter from unseen to learned', () => {
    let row = applyIntroduced(undefined, { kind: 'character', itemKey: 'ㄱ' }, T0);
    expect(row.stage).toBe('introduced');

    row = applyHeard(row, { kind: 'character', itemKey: 'ㄱ', rules: RULES }, T0);
    expect(row.heard).toBe(true);
    expect(row.stage).toBe('introduced');

    row = applyDemoSeen(row, { kind: 'character', itemKey: 'ㄱ', rules: RULES }, T0);
    expect(row.demo_seen).toBe(true);
    expect(row.stage).toBe('introduced');

    row = attempt(row, true, 'trace');
    // One writing pass is the writing rung, whichever guide was on the paper.
    expect(row.stage).toBe('practised');
    expect(row.trace_passes).toBe(1);
    // Not yet learned: the reading check has not been answered.
    expect(row.learned).toBe(false);

    row = applyRecognition(row, { kind: 'character', itemKey: 'ㄱ', correct: true, rules: RULES }, T0);
    expect(row.stage).toBe('learned');
    expect(row.learned).toBe(true);
    expect(row.learned_at).toBe(T0.toISOString());
  });

  it('asks for one writing pass, not two', () => {
    // The second guided attempt — the same movement with a fainter model — is
    // gone from the product, and it is not replaced by anything. A learner who
    // has heard a letter, watched it, written it and read it back is finished.
    let row = applyHeard(undefined, { kind: 'character', itemKey: 'ㄱ', rules: RULES }, T0);
    row = applyDemoSeen(row, { kind: 'character', itemKey: 'ㄱ', rules: RULES }, T0);
    row = attempt(row, true, 'trace');
    expect(remainingRequirements(row, RULES)).toEqual(['recognise']);
    row = applyRecognition(row, { kind: 'character', itemKey: 'ㄱ', correct: true, rules: RULES }, T0);
    expect(row.stage).toBe('learned');
  });

  it('reaches the writing rung from either guide', () => {
    // Which guide was on the paper is a preference, not a rung.
    expect(attempt(undefined, true, 'practice').stage).toBe('practised');
    expect(attempt(undefined, true, 'trace').stage).toBe('practised');
    expect(atLeast(attempt(undefined, true, 'trace').stage, 'traced')).toBe(true);
  });

  it('will not finish a letter the learner never watched being written', () => {
    // Watching is a rung, and it is the one that teaches stroke order. A letter
    // that has been heard, written and read is still not finished if the
    // demonstration was skipped.
    let row = applyHeard(undefined, { kind: 'character', itemKey: 'ㄱ', rules: RULES }, T0);
    row = attempt(row, true, 'practice');
    row = applyRecognition(row, { kind: 'character', itemKey: 'ㄱ', correct: true, rules: RULES }, T0);
    expect(row.learned).toBe(false);
    expect(remainingRequirements(row, RULES)).toEqual(['watch']);

    row = applyDemoSeen(row, { kind: 'character', itemKey: 'ㄱ', rules: RULES }, T0);
    expect(row.learned).toBe(true);
  });

  it('never demotes a letter for a bad attempt', () => {
    let row = applyHeard(undefined, { kind: 'character', itemKey: 'ㄱ', rules: RULES }, T0);
    row = applyDemoSeen(row, { kind: 'character', itemKey: 'ㄱ', rules: RULES }, T0);
    row = attempt(row, true, 'practice');
    row = applyRecognition(row, { kind: 'character', itemKey: 'ㄱ', correct: true, rules: RULES }, T0);
    expect(row.stage).toBe('learned');

    const bad = attempt(row, false, 'practice');
    expect(bad.stage).toBe('learned');
    expect(bad.learned).toBe(true);
    // The bad day is recorded as a *current* state, not as a demotion.
    expect(bad.needs_review).toBe(true);
    expect(bad.fails).toBe(1);
    expect(bad.learned_at).toBe(T0.toISOString());
  });

  it('takes an item out of review when it is passed again', () => {
    const failed = attempt(undefined, false, 'practice');
    expect(failed.needs_review).toBe(true);
    const fixed = attempt(failed, true, 'practice');
    expect(fixed.needs_review).toBe(false);
  });

  it('completes a word on heard + understood, with no writing at all', () => {
    let row = applyIntroduced(undefined, { kind: 'word', itemKey: 'word_mul' }, T0);
    row = applyHeard(row, { kind: 'word', itemKey: 'word_mul', rules: WORD_RULES }, T0);
    expect(row.learned).toBe(false);

    row = applyRecognition(
      row,
      { kind: 'word', itemKey: 'word_mul', correct: true, rules: WORD_RULES },
      T0,
    );
    // No pen was ever involved, and the word is finished.
    expect(row.trace_passes + row.practice_passes).toBe(0);
    expect(row.stage).toBe('learned');
  });

  it('never asks a word to be written or watched', () => {
    // §35, as an assertion. If either of these ever comes back, some route in
    // the app is about to hand a learner a canvas and ask them to draw 엄.
    expect(remainingRequirements(undefined, WORD_RULES)).not.toContain('watch');
    expect(remainingRequirements(undefined, WORD_RULES)).not.toContain('write');
    expect(remainingRequirements(undefined, WORD_RULES)).toEqual(['hear', 'recognise']);
  });

  it('pushes a failed item back to the front of the review queue', () => {
    const failed = attempt(undefined, false, 'practice');
    expect(failed.review_due_at).toBe(T0.toISOString());
  });

  it('spaces successful reviews further apart each time', () => {
    expect(reviewIntervalDays(0)).toBe(1);
    expect(reviewIntervalDays(1)).toBe(3);
    expect(reviewIntervalDays(2)).toBe(7);
    expect(reviewIntervalDays(9)).toBe(21);
  });

  it('ignores a repeated play of the same pronunciation', () => {
    const first = applyHeard(undefined, { kind: 'character', itemKey: 'ㄱ', rules: RULES }, T0);
    const again = applyHeard(first, { kind: 'character', itemKey: 'ㄱ', rules: RULES }, T0);
    expect(again).toBe(first);
  });

  it('flags a wrong recognition answer without crediting a pass', () => {
    const row = applyRecognition(
      undefined,
      { kind: 'character', itemKey: 'ㄱ', correct: false, rules: RULES },
      T0,
    );
    expect(row.recognition_passes).toBe(0);
    expect(row.needs_review).toBe(true);
  });
});

// --- Progress ----------------------------------------------------------------

function learned(itemKey: string, kind: ItemProgress['kind'] = 'character', at = T0): ItemProgress {
  return {
    ...blankProgress(kind, itemKey, at.toISOString()),
    stage: 'learned',
    learned: true,
    heard: true,
    demo_seen: true,
    passes: 1,
    trace_passes: 1,
    practice_passes: 1,
    recognition_passes: 1,
    learned_at: at.toISOString(),
  };
}

function mapOf(...rows: ItemProgress[]): Record<string, ItemProgress> {
  return Object.fromEntries(rows.map((row) => [progressKey(row.kind, row.item_key), row]));
}

describe('progress figures', () => {
  it('counts the alphabet in letters, not in syllables', () => {
    const progress = mapOf(learned('ㅏ'), learned('ㄱ'), learned('가'));
    const alphabet = alphabetProgress(progress);
    expect(alphabet.total).toBe(ALL_LETTERS.length);
    // 가 is a syllable the learner practised; it is not one of the 40 letters.
    expect(alphabet.done).toBe(2);
  });

  it('reports a lesson as complete only when every letter in it is learned', () => {
    const lesson = LETTER_LESSONS[0]!;
    const empty = lessonProgress({}, lesson);
    expect(empty.ratio).toBe(0);
    const partial = lessonProgress(mapOf(learned('ㅏ')), lesson);
    expect(partial.done).toBe(1);
    expect(partial.ratio).toBeLessThan(1);
  });

  it('rolls lesson progress up into its unit', () => {
    const unit = unitProgress(mapOf(learned('ㅏ'), learned('ㅓ')), 'unit-1');
    expect(unit.total).toBe(6);
    expect(unit.done).toBe(2);
  });

  it('resumes at the first unfinished lesson, not the last one opened', () => {
    const first = LETTER_LESSONS[0]!;
    const allOfFirst = mapOf(
      ...first.character_ids.map((id) => learned(id.replace('char-', ''))),
    );
    expect(nextLesson({})?.id).toBe(first.id);
    expect(nextLesson(allOfFirst)?.id).toBe(LETTER_LESSONS[1]!.id);
  });

  it('has nothing to continue to once every lesson is finished', () => {
    /*
     * The loop this closes: `nextLesson` used to fall back to the *last*
     * lesson, so a learner who finished the alphabet was offered the chapter
     * they had just completed, under a button reading "Continue". Tapping it
     * returned them to it. Every time.
     *
     * `null` is the whole fix — it forces Home to have an answer for "you have
     * finished" instead of quietly re-offering finished work.
     */
    const everything = mapOf(
      ...LETTER_LESSONS.flatMap((lesson) =>
        lesson.character_ids.map((id) => learned(id.replace('char-', ''))),
      ),
    );
    expect(nextLesson(everything)).toBeNull();
    expect(alphabetComplete(everything)).toBe(true);
    expect(alphabetComplete({})).toBe(false);

    // And one letter short of the end is not the end.
    const lastLesson = LETTER_LESSONS[LETTER_LESSONS.length - 1]!;
    const allButOne = mapOf(
      ...LETTER_LESSONS.flatMap((lesson) =>
        lesson.character_ids
          .filter((id) => id !== lastLesson.character_ids[lastLesson.character_ids.length - 1])
          .map((id) => learned(id.replace('char-', ''))),
      ),
    );
    expect(nextLesson(allButOne)?.id).toBe(lastLesson.id);
  });

  it('counts a letter as known once it has been met, not once it is mastered', () => {
    const introduced: ItemProgress = {
      ...blankProgress('character', 'ㅏ', T0.toISOString()),
      stage: 'introduced',
    };
    expect(knownLetters(mapOf(introduced)).has('ㅏ')).toBe(true);
    expect(knownLetters({}).size).toBe(0);
  });

  it('measures vocabulary against the whole curriculum, because all of it is open', () => {
    const nothing = vocabularyProgress({});
    // Not 0 / 0: every word is accessible from the first launch, so the
    // denominator is the dataset and a learner who has done nothing reads 0%.
    expect(nothing.total).toBeGreaterThan(1000);
    expect(nothing.done).toBe(0);
    expect(nothing.ratio).toBe(0);
    // And "readable" is the suggestion figure, which starts empty and is not
    // the denominator of anything.
    expect(nothing.readable).toBe(0);
  });

  it('counts words finished out of sequence, and only those', () => {
    // Non-linear study is the point of removing the locks: word 1, word 800 and
    // word 2,000 in that order have to add up to exactly three.
    // Chosen by position in the list rather than by fixed index, so the test
    // does not have to be edited every time the corpus is curated.
    const picked = [
      VOCABULARY[0]!,
      VOCABULARY[Math.floor(VOCABULARY.length / 2)]!,
      VOCABULARY[VOCABULARY.length - 1]!,
    ];
    const progress = vocabularyProgress(
      mapOf(...picked.map((word) => learned(word.id, 'word', T0))),
    );
    expect(progress.done).toBe(3);
    expect(progress.total).toBe(VOCABULARY.length);
    // 3 out of the whole corpus, not 3 / 3 and not 100%.
    expect(progress.ratio).toBeCloseTo(3 / VOCABULARY.length, 10);
    expect(progress.ratio).toBeLessThan(0.01);
  });

  it('does not count an accessible word as a completed one', () => {
    // The trap this file exists to catch: removing the locks must not turn
    // "you may study this" into "you have studied this".
    const word = VOCABULARY[0]!;
    const opened = vocabularyProgress(
      mapOf({ ...blankProgress('word', word.id, T0.toISOString()), stage: 'introduced' }),
    );
    expect(opened.done).toBe(0);

    const finished = vocabularyProgress(mapOf(learned(word.id, 'word', T0)));
    expect(finished.done).toBe(1);
    expect(finished.total).toBe(opened.total);
  });

  it('counts the day’s goal from items that reached learned today', () => {
    const yesterday = new Date(T0.getTime() - 86_400_000);
    const progress = mapOf(learned('ㅏ', 'character', T0), learned('ㅓ', 'character', yesterday));
    const daily = dailyProgress(progress, 5, T0);
    expect(daily.done).toBe(1);
    expect(daily.total).toBe(5);
  });

  it('keeps a streak alive on a day the learner has not practised yet', () => {
    const today = dateKey(T0);
    const yesterday = dateKey(new Date(T0.getTime() - 86_400_000));
    const dayBefore = dateKey(new Date(T0.getTime() - 2 * 86_400_000));
    expect(streakSummary([dayBefore, yesterday], T0).current).toBe(2);
    expect(streakSummary([dayBefore, yesterday, today], T0).current).toBe(3);
    // A gap ends it.
    expect(streakSummary([dayBefore], T0).current).toBe(0);
    expect(streakSummary([], T0).current).toBe(0);
  });
});

describe('review queue', () => {
  it('puts what the learner got wrong before what is merely due', () => {
    const failing: ItemProgress = {
      ...blankProgress('character', 'ㅅ', T0.toISOString()),
      needs_review: true,
      fails: 2,
      last_attempted_at: T0.toISOString(),
    };
    const due: ItemProgress = {
      ...learned('ㅁ'),
      review_due_at: new Date(T0.getTime() - 86_400_000).toISOString(),
    };
    const notDue: ItemProgress = {
      ...learned('ㄴ'),
      review_due_at: new Date(T0.getTime() + 86_400_000).toISOString(),
    };

    const queue = reviewQueue(mapOf(due, failing, notDue), T0);
    expect(queue.failing.map((r) => r.item_key)).toEqual(['ㅅ']);
    expect(queue.due.map((r) => r.item_key)).toEqual(['ㅁ']);
    expect(queue.ordered.map((r) => r.item_key)).toEqual(['ㅅ', 'ㅁ']);
  });

  it('orders the failing items by how often they have been missed', () => {
    const once: ItemProgress = {
      ...blankProgress('character', 'ㄱ', T0.toISOString()),
      needs_review: true,
      fails: 1,
    };
    const often: ItemProgress = {
      ...blankProgress('character', 'ㅋ', T0.toISOString()),
      needs_review: true,
      fails: 5,
    };
    expect(reviewQueue(mapOf(once, often), T0).failing.map((r) => r.item_key)).toEqual(['ㅋ', 'ㄱ']);
  });

  it('is empty for a learner who has done nothing wrong', () => {
    expect(reviewQueue(mapOf(learned('ㅏ')), T0).ordered).toEqual([]);
  });
});

/**
 * Adaptive review.
 *
 * The ladder is still a ladder — a beginner does not need SM-2 — but it is no
 * longer the *only* thing deciding when an item comes back. Two signals the
 * product already records now shape the interval, and each of these tests is
 * the reason one of them was added.
 */
describe('review scheduling adapts to how the item went', () => {
  it('brings a barely-passed item back sooner than a confident one', () => {
    const scraped = reviewIntervalDays(2, { score: 0.9 });
    const confident = reviewIntervalDays(2, { score: 1 });
    expect(confident).toBeGreaterThan(scraped);
  });

  it('brings an item the learner keeps losing back sooner', () => {
    const easy = reviewIntervalDays(3, { score: 0.95, fails: 0 });
    const hard = reviewIntervalDays(3, { score: 0.95, fails: 4 });
    expect(hard).toBeLessThan(easy);
    // ...but not forever. History informs the schedule; it does not sentence
    // an item to being asked every day for the rest of the course.
    expect(hard).toBeGreaterThanOrEqual(2);
  });

  it('never schedules a review inside the same day', () => {
    for (const streak of [0, 1, 2, 3, 9]) {
      for (const fails of [0, 3, 20]) {
        expect(reviewIntervalDays(streak, { score: 0.9, fails })).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('still lengthens as the streak grows, all else equal', () => {
    const signals = { score: 0.95, fails: 0 };
    const days = [0, 1, 2, 3].map((streak) => reviewIntervalDays(streak, signals));
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i]!).toBeGreaterThan(days[i - 1]!);
    }
  });

  it('reads nothing when there are no signals, so old rows still schedule', () => {
    // A progress row written by a previous release has no `last_score`. It must
    // schedule exactly as it always did rather than throwing or collapsing to
    // the minimum.
    expect(reviewIntervalDays(0)).toBe(1);
    expect(reviewIntervalDays(3)).toBe(21);
  });
});

describe('the review queue asks the most urgent things first', () => {
  const row = (patch: Partial<ItemProgress>): ItemProgress => ({
    ...blankProgress('character', patch.item_key ?? 'ㄱ', '2026-01-01T00:00:00.000Z'),
    ...patch,
  });

  const now = new Date('2026-03-01T00:00:00.000Z');

  it('puts failed items ahead of merely due ones', () => {
    const queue = reviewQueue(
      {
        due: row({ item_key: 'ㄴ', review_due_at: '2026-01-01T00:00:00.000Z' }),
        failed: row({ item_key: 'ㄷ', needs_review: true }),
      },
      now,
    );
    expect(queue.ordered[0]!.item_key).toBe('ㄷ');
  });

  it('orders due items by how much they are at risk, not by date alone', () => {
    // Both are due; one is a day overdue and has been failed five times, the
    // other is a week overdue and has never been failed. The first is the
    // better use of the next question.
    const queue = reviewQueue(
      {
        old: row({ item_key: 'ㅁ', review_due_at: '2026-02-22T00:00:00.000Z', fails: 0 }),
        shaky: row({ item_key: 'ㅂ', review_due_at: '2026-02-28T00:00:00.000Z', fails: 5 }),
      },
      now,
    );
    expect(queue.due.map((r) => r.item_key)).toEqual(['ㅂ', 'ㅁ']);
  });

  it('offers a sitting rather than the whole backlog, and keeps the backlog', () => {
    const progress: Record<string, ItemProgress> = {};
    for (let i = 0; i < REVIEW_SESSION_SIZE + 20; i += 1) {
      progress[`k${i}`] = row({
        item_key: `k${i}`,
        review_due_at: '2026-02-01T00:00:00.000Z',
        fails: i,
      });
    }
    const queue = reviewQueue(progress, now);
    expect(queue.session).toHaveLength(REVIEW_SESSION_SIZE);
    expect(queue.ordered).toHaveLength(REVIEW_SESSION_SIZE + 20);
    // And the sitting is the riskiest ones, not the first ones by key.
    expect(queue.session[0]!.fails).toBeGreaterThan(queue.ordered.at(-1)!.fails);
  });
});
