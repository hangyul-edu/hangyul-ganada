import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';

import type { LevelTestResult } from '../domain/levelTestTypes';
import { MemoryDriver } from '../storage/driver';
import { LearnerContext, type LearnerContextValue } from './LearnerContext';
import { LearnerProvider } from './LearnerProvider';

/**
 * Being placed, declining to be placed, and being left alone afterwards.
 *
 * ## Why this is a store test and not only an end-to-end one
 *
 * The prompt is one `if` in one screen. What decides whether it is *right* is
 * the state behind it, and that state has a property the screen cannot show:
 * a learner who declined and a learner who scored 1 both see "Lv. 1", and the
 * app must treat them differently for as long as they use it. §16 asks for
 * those to be separate facts; these are the tests that hold them apart.
 *
 * §59 cases A–E, at the layer where they are decidable.
 */

function durableDriver(): MemoryDriver {
  const driver = new MemoryDriver();
  return new Proxy(driver, {
    get: (target, key) =>
      key === 'durable' ? true : key === 'name' ? 'indexeddb' : Reflect.get(target, key, target),
  }) as MemoryDriver;
}

function Probe({ onReady }: { onReady: (value: LearnerContextValue) => void }) {
  return (
    <LearnerContext.Consumer>
      {(value) => (value ? <Live value={value} onReady={onReady} /> : null)}
    </LearnerContext.Consumer>
  );
}

function Live({
  value,
  onReady,
}: {
  value: LearnerContextValue;
  onReady: (value: LearnerContextValue) => void;
}) {
  useEffect(() => {
    onReady(value);
  });
  return null;
}

async function open(driver: MemoryDriver) {
  let current: LearnerContextValue | null = null;
  const view = render(
    <LearnerProvider driver={driver}>
      <Probe onReady={(value) => (current = value)} />
    </LearnerProvider>,
  );
  await waitFor(() => expect(current?.ready).toBe(true));
  return {
    view,
    get context() {
      return current!;
    },
  };
}

/** A finished sitting, the shape `saveLevelTestResult` stores. */
const assessedAt14: LevelTestResult = {
  level: 14,
  low: 12,
  high: 16,
  items: 30,
  takenAt: '2026-03-01T09:00:00.000Z',
  recentItems: [],
};

describe('placement', () => {
  it('a new learner has never been asked, and is taught from Level 1', async () => {
    // Case A, and the fallback in §18: untested is not a failure state, it is
    // the state everybody starts in, and it teaches from the bottom.
    const app = await open(durableDriver());
    expect(app.context.placementStatus).toBe('untested');
    expect(app.context.vocabularyLevel).toBe(1);
  });

  it('declining starts them at Level 1 and is not mistaken for a measurement', async () => {
    // Case B. The distinction §16 is about: same level, different fact.
    const app = await open(durableDriver());
    await act(async () => app.context.skipPlacement());
    await waitFor(() => expect(app.context.placementStatus).toBe('skipped'));
    expect(app.context.vocabularyLevel).toBe(1);
    expect(app.context.state.settings.level_test).toBeNull();
  });

  it('does not ask again after an explicit skip, across a restart', async () => {
    /*
     * Case B again, and the half of it that is about respect rather than
     * mechanics. A prompt the learner already answered, asked again tomorrow,
     * is not a recommendation — §17.
     */
    const driver = durableDriver();
    const first = await open(driver);
    await act(async () => first.context.skipPlacement());
    await waitFor(() => expect(first.context.placementStatus).toBe('skipped'));
    first.view.unmount();

    const second = await open(driver);
    expect(second.context.placementStatus).toBe('skipped');
  });

  it('a skip is recorded once and not re-stamped on every open', async () => {
    // The timestamp is evidence about when the decision was made. Rewriting it
    // on each launch would turn a six-month-old choice into a fresh one.
    const app = await open(durableDriver());
    await act(async () => app.context.skipPlacement());
    await waitFor(() => expect(app.context.placementStatus).toBe('skipped'));
    const first = app.context.state.settings.placement_skipped_at;
    await act(async () => app.context.skipPlacement());
    expect(app.context.state.settings.placement_skipped_at).toBe(first);
  });

  it('taking the test later replaces the default with a measurement', async () => {
    // Case C. The level moves, and the status stops being a default.
    const driver = durableDriver();
    const app = await open(driver);
    await act(async () => app.context.skipPlacement());
    await waitFor(() => expect(app.context.vocabularyLevel).toBe(1));

    await act(async () => app.context.saveLevelTestResult(assessedAt14));
    await waitFor(() => expect(app.context.placementStatus).toBe('assessed'));
    expect(app.context.vocabularyLevel).toBe(14);

    // And it survives the next launch, which is what makes it a placement
    // rather than a session's worth of luck.
    app.view.unmount();
    const again = await open(driver);
    expect(again.context.placementStatus).toBe('assessed');
    expect(again.context.vocabularyLevel).toBe(14);
  });

  it('an assessed learner is never asked again', async () => {
    // Case D. `assessed` is not `untested`, which is the whole condition the
    // prompt is drawn behind.
    const app = await open(durableDriver());
    await act(async () => app.context.saveLevelTestResult(assessedAt14));
    await waitFor(() => expect(app.context.placementStatus).toBe('assessed'));
    expect(app.context.placementStatus).not.toBe('untested');
  });

  it('a mid-day retake keeps the progress earned and replaces the unresolved targets', async () => {
    /*
     * Case E, rewritten to the canonical rule: **a measured level change takes
     * effect immediately.** The old rule — "a plan with work in it stands and
     * the new level starts tomorrow" — is exactly how a learner who studied
     * three beginner words, sat the test and came out advanced went back to
     * being taught 엄마 for the rest of the day. What is preserved is the work,
     * never the stale targets: the completed word keeps its credit and stays
     * in the plan; every unresolved ordinary new-study word is regenerated for
     * the measured level; the goal the learner agreed to does not move.
     */
    const app = await open(durableDriver());
    const before = app.context.vocabularyDay;
    expect(before.words.length).toBeGreaterThan(0);
    // Start the day, so this is a day in progress rather than an untouched plan.
    const earned = before.words[0]!.wordId;
    await act(async () => app.context.completeDailyWord(earned));
    await waitFor(() => expect(app.context.vocabularyDay.completed.length).toBe(1));
    const started = app.context.vocabularyDay;
    const oldUnresolved = started.words
      .filter((word) => word.source === 'new' && word.wordId !== earned)
      .map((word) => word.wordId);
    expect(oldUnresolved.length).toBeGreaterThan(0);

    await act(async () => app.context.saveLevelTestResult(assessedAt14));
    await waitFor(() => expect(app.context.vocabularyLevel).toBe(14));

    const after = await waitFor(() => {
      const plan = app.context.vocabularyDay;
      expect(plan.level).toBe(14);
      return plan;
    });
    // Same day, same goal, same size — and the earned word still credited.
    expect(after.date).toBe(started.date);
    expect(after.goal).toBe(started.goal);
    expect(after.words.length).toBe(started.words.length);
    expect(after.completed).toEqual(started.completed);
    expect(after.words.map((word) => word.wordId)).toContain(earned);
    // The unresolved beginner targets are gone, not carried.
    const remaining = after.words.map((word) => word.wordId);
    for (const id of oldUnresolved) expect(remaining).not.toContain(id);
  });

  it('a retake to the same level does not rebuild or reshuffle the day', async () => {
    // Fixture G. Being re-measured at the level the plan was already built for
    // is not a change; nothing about the day may move.
    const app = await open(durableDriver());
    await act(async () => app.context.saveLevelTestResult(assessedAt14));
    await waitFor(() => expect(app.context.vocabularyDay.level).toBe(14));
    const started = app.context.vocabularyDay;
    await act(async () => app.context.completeDailyWord(started.words[0]!.wordId));
    await waitFor(() => expect(app.context.vocabularyDay.completed.length).toBe(1));
    const mid = app.context.vocabularyDay;

    await act(async () =>
      app.context.saveLevelTestResult({ ...assessedAt14, takenAt: '2026-03-01T10:00:00.000Z' }),
    );
    await waitFor(() => expect(app.context.placementStatus).toBe('assessed'));

    const after = app.context.vocabularyDay;
    expect(after.words).toEqual(mid.words);
    expect(after.completed).toEqual(mid.completed);
  });

  it('a credit written just before the retake survives the rebuild', async () => {
    /*
     * The race the immediate-level rule creates: answer a word correctly,
     * finish the Level Test moments later, return. The correct answer was
     * committed by `completeDailyWord` before the plan was rebuilt, and the
     * rebuild must carry it — a level change may replace what is owed, never
     * what was earned.
     */
    const app = await open(durableDriver());
    const before = app.context.vocabularyDay;
    const earned = before.words[0]!.wordId;
    await act(async () => {
      app.context.completeDailyWord(earned);
      app.context.saveLevelTestResult(assessedAt14);
    });
    await waitFor(() => expect(app.context.vocabularyDay.level).toBe(14));
    const after = app.context.vocabularyDay;
    expect(after.completed).toContain(earned);
    expect(after.words.map((word) => word.wordId)).toContain(earned);
  });

  it('a goal changed mid-day applies tomorrow and wipes nothing', async () => {
    /*
     * The goal is a preference, and the stated rule has always been that a
     * mid-day change takes effect tomorrow. The provider's plan check used to
     * contradict it: any goal mismatch rebuilt the day from scratch, so a
     * learner three words in who nudged their goal watched 3/10 become 0/15.
     */
    const app = await open(durableDriver());
    const before = app.context.vocabularyDay;
    const earned = before.words[0]!.wordId;
    await act(async () => app.context.completeDailyWord(earned));
    await waitFor(() => expect(app.context.vocabularyDay.completed.length).toBe(1));

    await act(async () => app.context.setPreferences({ daily_word_goal: 20 }));
    const after = app.context.vocabularyDay;
    expect(after.completed).toContain(earned);
    expect(after.goal).toBe(before.goal);
    expect(after.words).toEqual(app.context.vocabularyDay.words);
  });

  it('a retake before the day is started rebuilds it for the new level', async () => {
    /*
     * Case F, and the defect this pair exists for.
     *
     * Sitting the Vocabulary Level Test is something a learner does minutes
     * after opening the app for the first time — which is exactly when a plan
     * has just been written at the default level. Case E's rule, applied to a
     * plan nobody has touched, is how somebody measured at 30 was taught 남자.
     *
     * Nothing is lost by replacing a plan with no work in it, so it is
     * replaced, and the level the learner was just measured at is the level
     * they are taught at today rather than tomorrow.
     */
    const app = await open(durableDriver());
    const before = app.context.vocabularyDay;
    expect(before.words.length).toBeGreaterThan(0);
    expect(before.completed).toEqual([]);

    await act(async () => app.context.saveLevelTestResult(assessedAt14));
    await waitFor(() => expect(app.context.vocabularyLevel).toBe(14));

    const after = app.context.vocabularyDay;
    expect(after.date).toBe(before.date);
    expect(after.words).not.toEqual(before.words);
  });
});
