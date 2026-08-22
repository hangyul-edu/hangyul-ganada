import { act, render, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { getWord, vocabularyByPriority } from '../data/vocabulary';
import { defaultSessionSize, sessionSizes } from '../features/review/sessionSizes';
import { MemoryDriver } from '../storage/driver';
import { LearnerContext, type LearnerContextValue } from './LearnerContext';
import { LearnerProvider } from './LearnerProvider';

/**
 * The two lists the learner owns, and the promise that they are two.
 *
 * ## What is being protected
 *
 * Saved and wrong are separate facts about the same word and the brief is
 * explicit that neither may reach into the other: removing a word from the
 * mistake list must not unsave it, and unsaving it must not forgive the
 * mistake. They are stored in different places — `settings.saved_items` and the
 * `mistakes` store — so nothing *should* couple them, and this is the test that
 * says so out loud, because "they are in different stores" is an implementation
 * detail somebody could change on a Tuesday.
 *
 * Everything here drives the real provider over a driver that keeps what it is
 * given, and reads the result back the way a screen reads it. A test that
 * called the reducers directly would pass with the persistence broken.
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
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    onReady(value);
  });
  return <span data-testid="ready">{value.ready ? 'yes' : 'no'}</span>;
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

/** A word the app teaches, and one it only knows how to look up. */
const TAUGHT = 'word_hada';
const DICTIONARY_ONLY = '귀족';

describe('saved words', () => {
  it('survives a reload, because it is on the settings row and not in a hook', async () => {
    const driver = durableDriver();
    const first = await open(driver);
    await act(async () => first.context.toggleSaved('word', TAUGHT));
    await waitFor(() => expect(first.context.isSaved('word', TAUGHT)).toBe(true));
    first.view.unmount();

    // The same store, a new provider: exactly what a refresh or an app restart
    // does. Nothing is carried over in memory.
    const second = await open(driver);
    expect(second.context.isSaved('word', TAUGHT)).toBe(true);
  });

  it('holds a word the app does not teach', async () => {
    const driver = durableDriver();
    const app = await open(driver);
    await act(async () => app.context.toggleSavedHeadword(DICTIONARY_ONLY));
    await waitFor(() => expect(app.context.isSavedHeadword(DICTIONARY_ONLY)).toBe(true));
    // Stored under its own prefix, so nothing that walks the taught corpus can
    // mistake it for a card with a lesson and a recording.
    expect(app.context.state.settings.saved_items).toContain(`dict:${DICTIONARY_ONLY}`);
  });

  it('is one bookmark whichever screen it was saved from', async () => {
    const driver = durableDriver();
    const app = await open(driver);
    // 하다 is taught, so saving it *by headword* from the dictionary must land
    // on the taught card's key rather than creating a second row.
    await act(async () => app.context.toggleSavedHeadword('하다'));
    await waitFor(() => expect(app.context.isSaved('word', TAUGHT)).toBe(true));
    expect(app.context.state.settings.saved_items).toEqual([`word:${TAUGHT}`]);
    expect(app.context.isSavedHeadword('하다')).toBe(true);
  });

  it('unsaves cleanly, and the same word can be saved again', async () => {
    const driver = durableDriver();
    const app = await open(driver);
    await act(async () => app.context.toggleSaved('word', TAUGHT));
    await waitFor(() => expect(app.context.isSaved('word', TAUGHT)).toBe(true));
    await act(async () => app.context.toggleSaved('word', TAUGHT));
    await waitFor(() => expect(app.context.isSaved('word', TAUGHT)).toBe(false));
    expect(app.context.state.settings.saved_items).toEqual([]);
    await act(async () => app.context.toggleSaved('word', TAUGHT));
    await waitFor(() => expect(app.context.isSaved('word', TAUGHT)).toBe(true));
  });
});

describe('wrong vocabulary', () => {
  /**
   * One wrong answer, reported the way a session reports it.
   *
   * Through `recordReview`, which is the single function every screen in the
   * app answers through and the only thing that writes the notebook — §35, the
   * learner never files a mistake by hand.
   */
  const missIt = (context: LearnerContextValue, wordId: string) =>
    context.recordReview({
      kind: 'word',
      item_key: wordId,
      skill: 'meaning_recognition',
      mode: 'read',
      passed: false,
      score: 0,
      confused_with: 'something-else',
    });

  it('keeps one row however many times the same word goes wrong', async () => {
    const driver = durableDriver();
    const app = await open(driver);
    for (let i = 0; i < 5; i += 1) {
      await act(async () => missIt(app.context, TAUGHT));
    }
    await waitFor(() => expect(app.context.mistakes.length).toBe(1));
    const [row] = app.context.mistakes;
    expect(row?.itemKey).toBe(TAUGHT);
    // The count is metadata on the one row, not five rows.
    expect(row?.wrongCount).toBe(5);
  });

  it('survives a reload', async () => {
    const driver = durableDriver();
    const first = await open(driver);
    await act(async () => missIt(first.context, TAUGHT));
    await waitFor(() => expect(first.context.mistakes.length).toBe(1));
    first.view.unmount();

    const second = await open(driver);
    expect(second.context.mistakes.map((row) => row.itemKey)).toEqual([TAUGHT]);
  });

  it('can be cleared by hand without touching the dictionary or the word', async () => {
    const driver = durableDriver();
    const app = await open(driver);
    await act(async () => missIt(app.context, TAUGHT));
    await waitFor(() => expect(app.context.mistakes.length).toBe(1));
    const id = app.context.mistakes[0]!.id;
    await act(async () => app.context.clearMistake(id));
    await waitFor(() => expect(app.context.mistakes.length).toBe(0));
    /*
     * The word itself is untouched. Removing a row from a notebook is not
     * deleting a word, so: it is still in the corpus, and what the app knows
     * about how well the learner remembers it is still there. Only the
     * notebook row is gone.
     */
    expect(getWord(TAUGHT)).toBeDefined();
    expect(app.context.state.memory[`word:${TAUGHT}`]).toBeDefined();
  });
});

describe('saved and wrong are independent', () => {
  const missIt = (context: LearnerContextValue) =>
    context.recordReview({
      kind: 'word',
      item_key: TAUGHT,
      skill: 'meaning_recognition',
      mode: 'read',
      passed: false,
      score: 0,
      confused_with: 'something-else',
    });

  it('a word can be both at once', async () => {
    const driver = durableDriver();
    const app = await open(driver);
    await act(async () => app.context.toggleSaved('word', TAUGHT));
    await act(async () => missIt(app.context));
    await waitFor(() => expect(app.context.mistakes.length).toBe(1));
    expect(app.context.isSaved('word', TAUGHT)).toBe(true);
  });

  it('removing the mistake leaves it saved', async () => {
    const driver = durableDriver();
    const app = await open(driver);
    await act(async () => app.context.toggleSaved('word', TAUGHT));
    await act(async () => missIt(app.context));
    await waitFor(() => expect(app.context.mistakes.length).toBe(1));
    await act(async () => app.context.clearMistake(app.context.mistakes[0]!.id));
    await waitFor(() => expect(app.context.mistakes.length).toBe(0));
    expect(app.context.isSaved('word', TAUGHT)).toBe(true);
  });

  it('unsaving leaves the mistake', async () => {
    const driver = durableDriver();
    const app = await open(driver);
    await act(async () => app.context.toggleSaved('word', TAUGHT));
    await act(async () => missIt(app.context));
    await waitFor(() => expect(app.context.mistakes.length).toBe(1));
    await act(async () => app.context.toggleSaved('word', TAUGHT));
    await waitFor(() => expect(app.context.isSaved('word', TAUGHT)).toBe(false));
    expect(app.context.mistakes.length).toBe(1);
  });
});

describe('how long a practice session is', () => {
  it('never offers a session it cannot run', () => {
    // Seven saved words: 5 is a real session and 10 and 20 are not.
    expect(sessionSizes(7)).toEqual([5, 7]);
    expect(sessionSizes(3)).toEqual([3]);
    expect(sessionSizes(25)).toEqual([5, 10, 20, 25]);
    expect(sessionSizes(0)).toEqual([]);
  });

  it('does not offer the same number twice', () => {
    // Exactly ten: the rung and the whole list are the same session.
    expect(sessionSizes(10)).toEqual([5, 10]);
    expect(sessionSizes(5)).toEqual([5]);
  });

  it('starts on ten, or on everything when there is less', () => {
    expect(defaultSessionSize(50)).toBe(10);
    expect(defaultSessionSize(7)).toBe(7);
    expect(defaultSessionSize(1)).toBe(1);
    expect(defaultSessionSize(0)).toBe(0);
  });
});

describe('what a practice session is made of', () => {
  /**
   * Twelve wrong words, so a ten-question session has room to be varied and
   * still has to choose. Reported through `recordReview`, as everything is.
   */
  async function withMistakes(count: number) {
    const driver = durableDriver();
    const app = await open(driver);
    const words = vocabularyByPriority().slice(0, count);
    for (const word of words) {
      // Met first. A learner cannot get a word wrong before the app has taught
      // it, and review only ever considers items with a progress row — so a
      // fixture that skips this is testing a state the app cannot reach.
      await act(async () => app.context.recordIntroduced('word', word.id));
      await act(async () =>
        app.context.recordReview({
          kind: 'word',
          item_key: word.id,
          skill: 'meaning_recognition',
          mode: 'read',
          passed: false,
          score: 0,
        }),
      );
    }
    await waitFor(() => expect(app.context.mistakes.length).toBe(count));
    return { app, words };
  }

  it('asks about a wrong word in more than one way', async () => {
    const { app } = await withMistakes(30);
    const plan = app.context.practicePlan({ mistakesOnly: true, size: 10 });
    /*
     * §17: varied exercise types. Not decoration — a session that only ever
     * showed the Korean and asked for the meaning would let the learner pass
     * by recognising the shape of the card, which is the failure the notebook
     * exists to catch. The plan carries the modes it resolved to, so this is
     * a fact about the questions that will actually be asked rather than about
     * what the scheduler was willing to consider.
     */
    expect(plan.count).toBeGreaterThan(1);
    expect(plan.modes.length).toBeGreaterThan(1);
  });

  it('never asks the same question twice in one session', async () => {
    const { app } = await withMistakes(30);
    const plan = app.context.practicePlan({ mistakesOnly: true, size: 10 });
    const keys = plan.items.map((item) => `${item.kind}/${item.itemKey}/${item.skill}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('stays inside the notebook', async () => {
    const { app, words } = await withMistakes(30);
    const wrong = new Set(words.map((word) => word.id));
    const plan = app.context.practicePlan({ mistakesOnly: true, size: 10 });
    expect(plan.source).toBe('mistakes');
    for (const item of plan.items) expect(wrong.has(item.itemKey)).toBe(true);
  });

  it('honours the size the learner picked', async () => {
    const { app } = await withMistakes(30);
    expect(app.context.practicePlan({ mistakesOnly: true, size: 5 }).count).toBeLessThanOrEqual(5);
    expect(app.context.practicePlan({ mistakesOnly: true, size: 20 }).count).toBeGreaterThan(5);
  });

  it('says why it is empty rather than running nothing', async () => {
    const driver = durableDriver();
    const app = await open(driver);
    const mistakes = app.context.practicePlan({ mistakesOnly: true, size: 10 });
    expect(mistakes.count).toBe(0);
    expect(mistakes.emptyReason).toBe('no-mistakes');
    const saved = app.context.practicePlan({ savedOnly: true, size: 10 });
    expect(saved.count).toBe(0);
    expect(saved.emptyReason).toBe('none-saved');
  });

  it('a saved-words session contains only saved words', async () => {
    const driver = durableDriver();
    const app = await open(driver);
    const words = vocabularyByPriority().slice(0, 12);
    for (const word of words) {
      await act(async () => app.context.recordIntroduced('word', word.id));
      await act(async () =>
        app.context.recordReview({
          kind: 'word',
          item_key: word.id,
          skill: 'meaning_recognition',
          mode: 'read',
          passed: true,
          score: 1,
        }),
      );
      await act(async () => app.context.toggleSaved('word', word.id));
    }
    await waitFor(() => expect(app.context.state.settings.saved_items.length).toBe(12));
    const plan = app.context.practicePlan({ savedOnly: true, size: 10 });
    expect(plan.source).toBe('saved');
    expect(plan.count).toBeGreaterThan(0);
    const saved = new Set(words.map((word) => word.id));
    for (const item of plan.items) expect(saved.has(item.itemKey)).toBe(true);
    const keys = plan.items.map((item) => `${item.kind}/${item.itemKey}/${item.skill}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
