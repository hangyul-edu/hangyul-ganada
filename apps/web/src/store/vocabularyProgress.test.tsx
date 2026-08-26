/**
 * What the learner did today, and whether the app still knows tomorrow.
 *
 * Three numbers on three screens are all supposed to be the same fact —
 * *today* on the vocabulary home, *배운 단어* on My Learning, and the plan the
 * session walks — and the bug report is that they disagree with each other and
 * with the learner's memory of what they just did: ten words studied, and the
 * screen still says 0 / 10.
 *
 * These drive the real store through the real actions, over a driver that
 * writes and reads like the shipped one, and then read the numbers back the way
 * the screens read them.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { MemoryDriver } from '../storage/driver';
import { LearnerContext, type LearnerContextValue } from './LearnerContext';
import { LearnerProvider } from './LearnerProvider';

/** A store that keeps what it is given, as IndexedDB does. */
function durableDriver(): MemoryDriver {
  const driver = new MemoryDriver();
  return new Proxy(driver, {
    get: (target, key) =>
      key === 'durable' ? true : key === 'name' ? 'indexeddb' : Reflect.get(target, key, target),
  }) as MemoryDriver;
}

/** Publishes the live context so a test can drive it and read it back. */
function Probe({ onReady }: { onReady: (value: LearnerContextValue) => void }) {
  return (
    <LearnerContext.Consumer>
      {(value) => {
        if (!value) return null;
        return <Live value={value} onReady={onReady} />;
      }}
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
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    onReady(value);
  });
  const today = value.vocabularyProgressToday;
  return (
    <>
      <span data-testid="today">{`${today.done}/${today.total}`}</span>
      <span data-testid="percent">{Math.round(today.ratio * 100)}</span>
      <span data-testid="learned">{value.summary.words_learned}</span>
      <span data-testid="plan">{value.vocabularyDay.words.length}</span>
    </>
  );
}

/** Mounts the provider over `driver` and hands back the live context. */
async function open(driver: MemoryDriver) {
  let current: LearnerContextValue | null = null;
  const view = render(
    <LearnerProvider driver={driver}>
      <Probe onReady={(value) => (current = value)} />
    </LearnerProvider>,
  );
  /*
   * Wait on the captured context, not on the rendered number.
   *
   * They converge at different moments. React commits the DOM first and flushes
   * passive effects afterwards, and `current` is written by an effect — so
   * there is a window in which `plan` already reads 10 on screen and `current`
   * is still the render before it, holding an empty plan. Waiting on the DOM
   * returns inside that window; the next line then reads `words[0]` and gets
   * `undefined`.
   *
   * It failed as "Cannot read properties of undefined (reading 'wordId')" under
   * a loaded machine and passed every time on an idle one, which is the same
   * race `study` below was already fixed for and the same reason: the helper
   * waited for the wrong thing. Polling `current` converges strictly later, so
   * this one cannot return early.
   */
  await waitFor(() => expect(current?.vocabularyDay.words.length ?? 0).toBeGreaterThan(0));
  return {
    view,
    get context() {
      return current!;
    },
  };
}

/*
 * Read through `waitFor` at the call sites rather than sampled directly.
 *
 * Every action here goes through `act`, which flushes the update it wraps — but
 * the provider persists in the background and re-renders when that lands, so an
 * assertion made on the very next line can be one render behind. It passed
 * consistently on an idle machine and failed about one run in twenty under a
 * loaded one, which is the worst kind of test to leave in a suite.
 */
const today = () => screen.getByTestId('today').textContent;
const percent = () => Number(screen.getByTestId('percent').textContent);
const learned = () => Number(screen.getByTestId('learned').textContent);

/**
 * Finishes `count` words of today's plan the way a session finishes them.
 *
 * Waits for the plan to actually hold that many first. `extendVocabularyDay`
 * lands through the provider's state and its persist, so reading the plan on
 * the next line can see the pre-extension one and quietly study ten words when
 * the test asked for twenty — which passed on an idle machine and failed under
 * a loaded one, reported as an assertion about a progress counter three lines
 * further down. The race was in the helper, not in the thing being asserted.
 */
async function study(app: { context: LearnerContextValue }, count: number) {
  await waitFor(() =>
    expect(app.context.vocabularyDay.words.length).toBeGreaterThanOrEqual(
      Math.min(count, app.context.vocabularyDay.goal),
    ),
  );
  const words = app.context.vocabularyDay.words.slice(0, count);
  for (const word of words) {
    await act(async () => {
      app.context.completeDailyWord(word.wordId);
      app.context.recordRecognition('word', word.wordId, true);
    });
  }
  return words.map((word) => word.wordId);
}

describe("today's vocabulary", () => {
  it('counts one word as one, however many questions it took', async () => {
    const app = await open(durableDriver());
    const [first] = app.context.vocabularyDay.words;

    // The same word finished twice — a retry after a wrong answer, or a second
    // question about it later in the sitting. The goal counts words.
    await act(async () => {
      app.context.completeDailyWord(first!.wordId);
      app.context.recordRecognition('word', first!.wordId, true);
      app.context.completeDailyWord(first!.wordId);
      app.context.recordRecognition('word', first!.wordId, true);
    });

    await waitFor(() => expect(today()).toBe(`1/${app.context.state.settings.daily_word_goal}`));
    await waitFor(() => expect(learned()).toBe(1));
  });

  it('reaches the goal and stays there', async () => {
    const app = await open(durableDriver());
    const goal = app.context.state.settings.daily_word_goal;
    await study(app, goal);

    await waitFor(() => expect(today()).toBe(`${goal}/${goal}`));
    await waitFor(() => expect(percent()).toBe(100));
    await waitFor(() => expect(learned()).toBe(goal));
  });
});

describe('coming back', () => {
  it('still says what it said, over a reload', async () => {
    // One store, two mounts: what closing the tab and opening it again does.
    const driver = durableDriver();
    const first = await open(driver);
    const goal = first.context.state.settings.daily_word_goal;
    const studied = await study(first, goal);
    await waitFor(() => expect(today()).toBe(`${goal}/${goal}`));
    first.view.unmount();

    const second = await open(driver);
    await waitFor(() => expect(today()).toBe(`${goal}/${goal}`));
    await waitFor(() => expect(percent()).toBe(100));
    await waitFor(() => expect(learned()).toBe(goal));
    // And the same words, not a fresh ten.
    expect(second.context.vocabularyDay.completed).toEqual(studied);
  });

  it('keeps a part-finished day part-finished', async () => {
    const driver = durableDriver();
    const first = await open(driver);
    await study(first, 4);
    const goal = first.context.state.settings.daily_word_goal;
    first.view.unmount();

    const second = await open(driver);
    await waitFor(() => expect(today()).toBe(`4/${goal}`));
    expect(second.context.vocabularyDay.completed).toHaveLength(4);
  });
});

describe('studying past the goal', () => {
  it('keeps what was already done, and adds to it', async () => {
    /*
     * The failure this was reported as: finishing the day, tapping for more,
     * and the counter going back to zero. Extending used to *rebuild* the plan
     * from scratch, which threw away `completed` — so a learner who asked for
     * five more words was told they had done none of the ten they had just
     * finished.
     */
    const app = await open(durableDriver());
    const goal = app.context.state.settings.daily_word_goal;
    await study(app, goal);

    await act(async () => app.context.extendVocabularyDay(5));
    await waitFor(() => expect(today()).toBe(`${goal}/${goal}`));
    expect(app.context.vocabularyDay.words.length).toBe(goal + 5);
    expect(app.context.vocabularyDay.goal).toBe(goal);

    await study(app, goal + 2);
    await waitFor(() => expect(today()).toBe(`${goal + 2}/${goal}`));
    await waitFor(() => expect(learned()).toBe(goal + 2));
  });

  it('reads past 100% in the number and not in the bar', async () => {
    const app = await open(durableDriver());
    const goal = app.context.state.settings.daily_word_goal;
    await study(app, goal);
    await act(async () => app.context.extendVocabularyDay(10));
    await study(app, goal + goal);

    // The denominator stays the promise the learner made. §D.
    await waitFor(() => expect(today()).toBe(`${goal * 2}/${goal}`));
    expect(app.context.vocabularyProgressToday.percent).toBe(200);
    // The bar is a bar. It cannot be more than full.
    await waitFor(() => expect(percent()).toBe(100));
  });

  it('survives a reload with the extra words on it', async () => {
    const driver = durableDriver();
    const first = await open(driver);
    const goal = first.context.state.settings.daily_word_goal;
    await study(first, goal);
    await act(async () => first.context.extendVocabularyDay(5));
    await study(first, goal + 2);
    first.view.unmount();

    const second = await open(driver);
    await waitFor(() => expect(today()).toBe(`${goal + 2}/${goal}`));
    expect(second.context.vocabularyDay.words.length).toBe(goal + 5);
  });
});

describe('a slow store', () => {
  /**
   * The shipped driver is IndexedDB, whose writes land whenever the browser
   * lets them. Every write here is delayed and completes out of order — the
   * worst honest schedule a device can produce — and the deal the provider
   * makes must hold anyway: the screen is right immediately from memory, and
   * once the writes settle, a reload agrees with what the learner saw.
   */
  function slowDriver(pending: Set<Promise<void>>): MemoryDriver {
    const driver = durableDriver();
    const original = driver.put.bind(driver);
    // Adversarial on purpose: each write is *slower* the earlier it was
    // issued, so any two writes in flight at once complete in reverse order.
    // A repository that lets the driver decide the order loses every time,
    // which is what makes this a deterministic gate rather than a coin flip.
    let seq = 0;
    const delayed = <T,>(store: Parameters<MemoryDriver['put']>[0], key: string, value: T) => {
      const wait = Math.max(1, 45 - 8 * seq++);
      const job: Promise<void> = new Promise((resolve) =>
        setTimeout(() => {
          void original(store, key, value).then(resolve);
        }, wait),
      );
      pending.add(job);
      void job.finally(() => pending.delete(job));
      return job;
    };
    return new Proxy(driver, {
      get: (target, prop) =>
        prop === 'put' ? delayed : Reflect.get(target, prop, target),
    }) as MemoryDriver;
  }

  /**
   * Waits until no write is in flight and none arrives for a beat longer than
   * the longest delay — the repositories chain writes per row, so a queued
   * write only enters `pending` when its predecessor settles.
   */
  async function settled(pending: Set<Promise<void>>) {
    for (;;) {
      while (pending.size > 0) await Promise.all([...pending]);
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (pending.size === 0) return;
    }
  }

  it('credits every correct answer under write latency, and a reload agrees', { timeout: 30_000 }, async () => {
    const pending = new Set<Promise<void>>();
    const driver = slowDriver(pending);
    const first = await open(driver);
    const goal = first.context.state.settings.daily_word_goal;

    // Answer fast — faster than any write can settle.
    const studied = await study(first, 4);
    // The screen is right from memory, before persistence has caught up.
    await waitFor(() => expect(today()).toBe(`4/${goal}`));

    // Let every queued write land, in whatever order the delays produced.
    await settled(pending);
    first.view.unmount();

    const second = await open(driver);
    await waitFor(() => expect(today()).toBe(`4/${goal}`));
    expect(second.context.vocabularyDay.completed).toEqual(studied);
  });

  it('a mid-day retake under write latency still keeps the earned words', { timeout: 30_000 }, async () => {
    const pending = new Set<Promise<void>>();
    const driver = slowDriver(pending);
    const first = await open(driver);
    const studied = await study(first, 3);

    await act(async () =>
      first.context.saveLevelTestResult({
        level: 14,
        low: 12,
        high: 16,
        items: 30,
        takenAt: '2026-03-01T09:00:00.000Z',
        recentItems: [],
      }),
    );
    await waitFor(() => expect(first.context.vocabularyDay.level).toBe(14));
    expect(first.context.vocabularyDay.completed).toEqual(studied);

    await settled(pending);
    first.view.unmount();

    const second = await open(driver);
    await waitFor(() => expect(second.context.vocabularyDay.level).toBe(14));
    expect(second.context.vocabularyDay.completed).toEqual(studied);
  });
});
