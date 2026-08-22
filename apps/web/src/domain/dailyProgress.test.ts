import { describe, expect, it } from 'vitest';

import { dayProgress, retrySteps, scheduleSteps, type DailyPlan } from './vocabularyDay';

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
