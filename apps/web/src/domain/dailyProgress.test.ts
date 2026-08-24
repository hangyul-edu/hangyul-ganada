import { describe, expect, it } from 'vitest';

import {
  dayProgress,
  endsSession,
  planIsCurrent,
  retrySteps,
  scheduleSteps,
  sessionProgress,
  type DailyPlan,
  type WordStep,
} from './vocabularyDay';

/**
 * What moves the progress bar, and what does not.
 *
 * §32 cases A–G. The rule the learner is promised is simple enough to state in
 * one line — *ten words means ten words answered correctly* — and every case
 * here is a way the old model broke it: an introduction card that counted, a
 * wrong answer that counted, a word that was dropped from the session for being
 * wrong, a session that ended at 8/10 with two words unaccounted for.
 *
 * These test the domain rather than the screen, because this is where the
 * arithmetic lives. `WordSessionPage` decides *when* a word is completed; what
 * "completed" then means to the bar is decided here, and the two are joined by
 * `plan.completed` — a persisted list of word ids, which is also why the retry
 * queue survives a reload without being stored separately.
 */

const plan = (goal: number, ids: string[], completed: string[] = []): DailyPlan => ({
  date: '2026-08-23',
  goal,
  words: ids.map((wordId) => ({
    wordId,
    source: 'new' as const,
    steps: ['intro', 'meaning', 'produce'] as DailyPlan['words'][number]['steps'],
  })),
  completed,
});

describe("today's vocabulary progress", () => {
  it('A — ten introductions and no answers is 0 of 10', () => {
    /*
     * The case the old model got most wrong. Meeting a word is teaching, not
     * evidence — §23 — and a learner who read all ten cards and answered
     * nothing had a full bar and had learned nothing.
     *
     * At this layer that is simply: nothing is in `completed`, so nothing
     * counts. The screen's part of it is that an intro step never calls
     * `completeDailyWord`, which `WordSessionPage` enforces by only crediting
     * on a correct answer.
     */
    const day = plan(10, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    const progress = dayProgress(day);
    expect(progress.done).toBe(0);
    expect(progress.total).toBe(10);
    expect(progress.percent).toBe(0);
    expect(progress.complete).toBe(false);
  });

  it('B — five correct is 5 of 10, and half the bar', () => {
    const day = plan(10, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], ['a', 'b', 'c', 'd', 'e']);
    const progress = dayProgress(day);
    expect(progress.done).toBe(5);
    expect(progress.percent).toBe(50);
    expect(Math.round(progress.ratio * 100)).toBe(50);
  });

  it('C — four right and one wrong is 4 of 5, and the wrong one comes back', () => {
    // §26's worked example: A C D E correct, B wrong.
    const day = plan(5, ['a', 'b', 'c', 'd', 'e'], ['a', 'c', 'd', 'e']);
    expect(dayProgress(day).done).toBe(4);
    const again = retrySteps(day, new Map([['b', 'meaning']]));
    expect(again.map((step) => step.wordId)).toEqual(['b']);
    // A different question about the same word — §27.
    expect(again[0]!.step).not.toBe('meaning');
    expect(again[0]!.completesWord).toBe(true);
  });

  it('D — answering the retry correctly finishes the day', () => {
    const day = plan(5, ['a', 'b', 'c', 'd', 'e'], ['a', 'c', 'd', 'e', 'b']);
    const progress = dayProgress(day);
    expect(progress.done).toBe(5);
    expect(progress.percent).toBe(100);
    expect(progress.complete).toBe(true);
    expect(retrySteps(day)).toEqual([]);
  });

  it('E — the same word wrong twice is still one incomplete word', () => {
    /*
     * No double counting, and no completion by exhaustion. A word missed twice
     * is missed; it stays owed and it stays *one* word, so the denominator
     * cannot drift and the numerator cannot be inflated by attempts.
     */
    const day = plan(5, ['a', 'b', 'c', 'd', 'e'], ['a', 'c', 'd', 'e']);
    const first = retrySteps(day, new Map([['b', 'meaning']]));
    const second = retrySteps(day, new Map([['b', first[0]!.step]]));
    expect(dayProgress(day).done).toBe(4);
    expect(second).toHaveLength(1);
    expect(second[0]!.wordId).toBe('b');
    // And it varies again rather than repeating what was just missed.
    expect(second[0]!.step).not.toBe(first[0]!.step);
  });

  it('F — a reload keeps the progress and the words still owed', () => {
    /*
     * §31, and the reason the retry queue is not stored anywhere. What is owed
     * is *derived* from the plan — the words not in `completed` — and the plan
     * is what persists. A reload therefore cannot lose a pending retry without
     * also losing the progress bar, and the two cannot disagree.
     */
    const day = plan(10, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const reloaded: DailyPlan = JSON.parse(JSON.stringify(day));
    expect(dayProgress(reloaded).done).toBe(7);
    expect(retrySteps(reloaded).map((s) => s.wordId)).toEqual(['h', 'i', 'j']);
    // …and the ordinary scheduler agrees about what is left.
    const scheduled = new Set(scheduleSteps(reloaded).map((s) => s.wordId));
    expect([...scheduled].sort()).toEqual(['h', 'i', 'j']);
  });

  it('G — extra study passes 100%, and the bar does not', () => {
    // §30. Fifteen words finished against a goal of ten is 150%, and the bar is
    // full rather than overflowing its container.
    const ids = Array.from({ length: 15 }, (_, n) => `w${n}`);
    const day = plan(10, ids, ids);
    const progress = dayProgress(day);
    expect(progress.done).toBe(15);
    expect(progress.percent).toBe(150);
    expect(progress.ratio).toBe(1);
  });

  it('never counts a word twice, however often it is completed', () => {
    const day = plan(5, ['a', 'b', 'c', 'd', 'e'], ['a', 'a', 'a']);
    expect(dayProgress(day).done).toBe(1);
  });
});

/**
 * The one day a plan written by the previous build is still readable.
 *
 * §60. `completed` changed meaning without changing shape, so there is no
 * migration; what bounds the exposure is that a plan is only ever run on its
 * own calendar day. This holds that bound, because if `planIsCurrent` ever
 * stopped checking the date the missing migration would become a real one.
 */
describe('a plan from before the change', () => {
  it('is dropped tomorrow, whatever it credited today', () => {
    const day = plan(10, ['a', 'b'], ['a']);
    const today = new Date(`${day.date}T09:00:00`);
    expect(planIsCurrent(day, today)).toBe(true);
    expect(planIsCurrent(day, new Date(today.getTime() + 86_400_000))).toBe(false);
  });
});

/**
 * Two numbers, photographed disagreeing.
 *
 * The header counted the day and the bar under it counted the session, and on a
 * day the learner had extended they were 10 and 15 — the screen said `10 / 10`
 * over a bar a third empty. They are genuinely different questions and both are
 * worth asking; what was wrong was asking them in the same sentence.
 */
describe('the session bar and the day bar', () => {
  it('H — a fifteen-word session against a ten-word goal reads 0 / 15, not 0 / 10', () => {
    const ids = Array.from({ length: 15 }, (_, n) => `w${n}`);
    const day = plan(10, ids);
    expect(sessionProgress(day).total).toBe(15);
    expect(dayProgress(day).total).toBe(10);
  });

  it('I — five extra words do not appear as five extra out of ten', () => {
    // The photographed case: a ten-word day extended by five, five of them done.
    const ids = Array.from({ length: 15 }, (_, n) => `w${n}`);
    const done = ids.slice(0, 5);
    const day = plan(10, ids, done);
    expect(sessionProgress(day)).toMatchObject({ done: 5, total: 15, percent: 33 });
    expect(dayProgress(day)).toMatchObject({ done: 5, total: 10, percent: 50 });
  });
});

/**
 * When the button says 마치기.
 *
 * §53. Photographed at 9 / 10: the last unseen word answered wrong, the retry
 * already scheduled, and a button offering to finish. The rule is that the end
 * of the queue is not the end of the session while the plan is still owed a
 * word — and that is a question about obligations, so `endsSession` asks the
 * obligations.
 */
describe('whether this is the last question', () => {
  const missed = (entries: [string, WordStep][] = []) => new Map<string, WordStep>(entries);

  it('J — mid-queue is never the end', () => {
    const day = plan(2, ['a', 'b']);
    expect(endsSession(day, missed(), 3, [])).toBe(false);
  });

  it('K — the last queued step, answered wrong, is not the end', () => {
    // Nine of ten done, on the tenth, and it was wrong: the word is owed again.
    const ids = Array.from({ length: 10 }, (_, n) => `w${n}`);
    const day = plan(10, ids, ids.slice(0, 9));
    expect(endsSession(day, missed([['w9', 'meaning']]), 0, [])).toBe(false);
  });

  it('L — the same step answered right is the end', () => {
    const ids = Array.from({ length: 10 }, (_, n) => `w${n}`);
    const day = plan(10, ids, ids.slice(0, 9));
    expect(endsSession(day, missed(), 0, ['w9'])).toBe(true);
  });

  it('M — a word owed from earlier keeps the session open', () => {
    // The learner got w3 wrong at question four and has now answered the last
    // queued step correctly. w3 is still owed, so this is not the end.
    const ids = Array.from({ length: 10 }, (_, n) => `w${n}`);
    const day = plan(10, ids, ids.filter((id) => id !== 'w3' && id !== 'w9'));
    expect(endsSession(day, missed([['w3', 'meaning']]), 0, ['w9'])).toBe(false);
  });
});
