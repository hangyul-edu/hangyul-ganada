/**
 * A learner who is measured at Level 30 stops being taught beginner words.
 *
 * The reported defect, driven through the store the screens actually read:
 * open the app untested, be shown some words and answer none of them, sit the
 * Vocabulary Level Test, come out at 30 — and find 그래서 at the top of Today's
 * Vocabulary.
 *
 * ## Why it is here and not only in the domain suite
 *
 * `domain/vocabularyDay.test.ts` can call `buildDailyPlan` with any progress map
 * it likes, including one no real learner could be in. The state that produced
 * this defect is one only the *app* creates: `WordSessionPage` writes a progress
 * row the moment a word appears on screen (`recordIntroduced`) and a memory row
 * only when an answer is graded, so a word shown and abandoned has one and not
 * the other. A domain test that constructed both would never have found it, and
 * one that constructed neither would have passed.
 *
 * So this drives `LearnerProvider` — the same provider, the same actions, the
 * same derivation the screens read — and never touches the selector directly.
 */
import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';

import { VOCABULARY } from '../data/vocabulary';
import { MemoryDriver } from '../storage/driver';
import { LearnerContext, type LearnerContextValue } from './LearnerContext';
import { LearnerProvider } from './LearnerProvider';

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
  await waitFor(() => expect(current?.vocabularyDay.words.length ?? 0).toBeGreaterThan(0));
  return {
    view,
    get context() {
      return current!;
    },
  };
}

const levelOf = new Map(VOCABULARY.map((word) => [word.id, word.level]));
const wordOf = new Map(VOCABULARY.map((word) => [word.id, word.word]));

/** The result the Level Test writes when it settles on a level. */
function measured(level: number) {
  return {
    level,
    takenAt: new Date().toISOString(),
    asked: 24,
    correct: 22,
    ceiling: 30,
    recentItems: [] as string[],
  } as unknown as Parameters<LearnerContextValue['saveLevelTestResult']>[0];
}

describe('a level measured after the day has started', () => {
  it('stops teaching beginner words to a learner measured at 30', async () => {
    const app = await open(durableDriver());

    /*
     * Shown, and not answered. This is `WordSessionPage`'s own first effect —
     * `recordIntroduced` fires when a question mounts, before the learner has
     * done anything — and it is the whole of the state that caused the defect.
     */
    const shown = app.context.vocabularyDay.words.slice(0, 3).map((word) => word.wordId);
    await act(async () => {
      for (const wordId of shown) app.context.recordIntroduced('word', wordId);
    });

    // Every one of them is a beginner word: that is what an untested learner
    // gets, and it is correct until the test says otherwise.
    for (const wordId of shown) expect(levelOf.get(wordId)!).toBeLessThanOrEqual(4);

    await act(async () => {
      app.context.saveLevelTestResult(measured(30));
    });

    await waitFor(() => expect(app.context.vocabularyDay.level).toBe(30));

    const plan = app.context.vocabularyDay.words;
    const opener = plan[0]!;
    expect(
      levelOf.get(opener.wordId),
      `the day opens on ${wordOf.get(opener.wordId)} (${opener.source})`,
    ).toBeGreaterThanOrEqual(27);

    for (const word of plan) {
      if (word.source !== 'new') continue;
      expect(
        levelOf.get(word.wordId),
        `${wordOf.get(word.wordId)} was offered as new material`,
      ).toBeGreaterThanOrEqual(27);
    }
  });

  it('does not bring a word back as weak just because it was once on screen', async () => {
    /*
     * The mechanism, on its own. A word that has been shown and never answered
     * has a progress row and no memory row; `weakestRecall` used to read that
     * as recall 0 — the strongest claim it can make — so the word outranked
     * everything the learner's level had chosen.
     */
    const app = await open(durableDriver());
    const shown = app.context.vocabularyDay.words[0]!.wordId;
    await act(async () => {
      app.context.recordIntroduced('word', shown);
      app.context.saveLevelTestResult(measured(30));
    });

    await waitFor(() => expect(app.context.vocabularyDay.level).toBe(30));
    const carried = app.context.vocabularyDay.words.find((word) => word.wordId === shown);
    expect(carried?.source).not.toBe('weak');
  });

  it('keeps what the learner earned when the level changes under them', async () => {
    // §59: a measurement invalidates the unresolved part of the plan and never
    // the part that was earned.
    const app = await open(durableDriver());
    const finished = app.context.vocabularyDay.words[0]!.wordId;
    await act(async () => {
      app.context.completeDailyWord(finished);
      app.context.recordRecognition('word', finished, true);
    });
    await waitFor(() => expect(app.context.vocabularyDay.completed).toContain(finished));

    await act(async () => {
      app.context.saveLevelTestResult(measured(30));
    });

    await waitFor(() => expect(app.context.vocabularyDay.level).toBe(30));
    expect(app.context.vocabularyDay.completed).toContain(finished);
    expect(app.context.vocabularyProgressToday.done).toBe(1);
  });
});
