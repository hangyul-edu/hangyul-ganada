import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { openApp, openTodaysWords } from './helpers/launch';

/**
 * The mid-day Level Test retake, against the built product.
 *
 * ## The journey this pins
 *
 * The release-blocking report of this pass: a learner starts Today's
 * Vocabulary at the default Level 1, masters three words, leaves, sits the
 * Vocabulary Level Test, comes out at 30, and returns the same calendar day.
 * The old behaviour served them the remaining Level-1 words for the rest of
 * the day. The canonical rule now: **the mastered three are preserved, and
 * every unresolved ordinary new-study target is regenerated for Level 30.**
 *
 * ## Why the studied state and the result are written to storage directly
 *
 * Answering three questions *correctly* from a browser would mean reading the
 * corpus to know the right options — a test that answers from the data it is
 * checking. The store-level truth that three correct answers produce exactly
 * this settings row is pinned by `store/placement.test.tsx` and
 * `pages/wordSessionCredits.test.ts`; what only a browser can prove is the
 * other half: that an app *reloading over that row* rebuilds the day at the
 * measured level without losing the credit, renders 3 / 10, and persists the
 * corrected plan. So the row is written the way the store writes it, into the
 * same IndexedDB the app opens, and everything after the reload is the real
 * product.
 *
 * The word levels are read from the generated corpus on the Node side — the
 * page is never asked to grade its own answers.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = (
  JSON.parse(readFileSync(join(HERE, '../src/data/generated/vocabulary.json'), 'utf8')) as {
    words: Array<{ id: string; word: string; level: number }>;
  }
).words;
const LEVEL_OF = new Map(CORPUS.map((word) => [word.id, word.level]));
const SURFACE_OF = new Map(CORPUS.map((word) => [word.id, word.word]));

const BEGINNER_FILLER = new Set(['남자', '여자', '엄마', '아빠', '나', '너']);

type StoredPlan = {
  date: string;
  goal: number;
  level?: number;
  words: Array<{ wordId: string; source: string; steps: string[] }>;
  completed: string[];
};

async function readSettings(page: Page): Promise<{ daily_plan: StoredPlan | null } & Record<string, unknown>> {
  return page.evaluate(async () => {
    const request = indexedDB.open('hangyul-ganada');
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const get = tx.objectStore('settings').get('preferences');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return row as never;
  });
}

async function writeSettings(page: Page, settings: unknown): Promise<void> {
  await page.evaluate(async (row) => {
    const request = indexedDB.open('hangyul-ganada');
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(row, 'preferences');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, settings);
}

test('a mid-day retake keeps the mastered words and serves the measured level', async ({
  page,
}) => {
  // Open today's words once, declining placement, so a real Level-1 plan is
  // built by the app and persisted.
  await openTodaysWords(page);
  await expect
    .poll(async () => (await readSettings(page))?.daily_plan?.words?.length ?? 0, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);

  const before = await readSettings(page);
  const plan = before.daily_plan!;
  expect(plan.level).toBe(1);
  const mastered = plan.words.slice(0, 3).map((word) => word.wordId);
  const oldUnresolved = plan.words.slice(3).map((word) => word.wordId);
  expect(oldUnresolved.length).toBeGreaterThan(0);

  // Three words mastered, then a Level Test result of 30 — the rows exactly as
  // completeDailyWord and saveLevelTestResult write them.
  await writeSettings(page, {
    ...before,
    daily_plan: { ...plan, completed: mastered },
    level_test: {
      level: 30,
      low: 28,
      high: 30,
      items: 30,
      takenAt: new Date().toISOString(),
      recentItems: [],
    },
  });

  // Return to Today's Vocabulary: a cold load over the written rows.
  await openApp(page, '/words');

  // The provider rebuilds the plan for Level 30 and persists it.
  await expect
    .poll(async () => (await readSettings(page))?.daily_plan?.level, { timeout: 10_000 })
    .toBe(30);

  const after = (await readSettings(page)).daily_plan!;

  // Earned progress is preserved — in the store, and on the screen.
  expect(after.completed).toEqual(mastered);
  expect(after.date).toBe(plan.date);
  expect(after.goal).toBe(plan.goal);
  await expect(page.getByTestId('today-card')).toContainText(new RegExp(`3\\s*/\\s*${plan.goal}`));
  await expect(page.getByTestId('today-level')).toContainText('30');

  // The unresolved Level-1 targets are gone, and everything unresolved now
  // sits in the Level-30 zone (28–30, one level of picker grace at most).
  const ids = after.words.map((word) => word.wordId);
  for (const id of mastered) expect(ids).toContain(id);
  for (const id of oldUnresolved) expect(ids).not.toContain(id);
  const unresolved = after.words.filter((word) => !mastered.includes(word.wordId));
  expect(unresolved.length).toBeGreaterThan(0);
  for (const word of unresolved) {
    const level = LEVEL_OF.get(word.wordId) ?? 0;
    expect(level, `${SURFACE_OF.get(word.wordId)} after the retake`).toBeGreaterThanOrEqual(27);
    expect(BEGINNER_FILLER.has(SURFACE_OF.get(word.wordId) ?? '')).toBe(false);
  }

  // And the session actually serves the corrected day: the next new word met
  // in the sitting is one of the regenerated ids, not a beginner word.
  /*
    Through the helper written for this route, and with room for the fetch it
    starts.

    The corpus arrives in priority bands, and this learner's plan is now Level
    28–30 — words that live in a *later* band than the one a cold load has when
    the splash clears. So opening Today's Vocabulary here is a page load, a band
    fetch and a question build before any word can be named, and the suite's
    default 10 s expect timeout is a default rather than a measured bound for
    that. It held on an idle machine and ran out inside `verify:release`, behind
    a spec that had just spent five minutes of the same worker.

    `openTodaysWords` also answers the placement prompt if it appears, which
    `openApp` does not; it should not appear here — the test wrote a level_test
    — and relying on that rather than handling it is a second way to fail for a
    reason that is not the subject.
  */
  await openTodaysWords(page);
  /*
    Wait for the band, not for a clock.

    This learner's plan is Level 28–30, which lives in a later corpus band than
    a cold load holds. The session draws a deliberately blank frame until it
    arrives — correct product behaviour, and indistinguishable from a broken
    screen from out here, which is why it carries a test id. A fixed thirty
    seconds was a test of how loaded the machine was: it held alone and ran out
    inside `verify:release`, in both projects on different runs.
  */
  await expect(page.getByTestId('words-loading')).toHaveCount(0, { timeout: 45_000 });
  const headword = page.getByTestId('word-headword');
  /*
    Wait for the headword to *exist*, on the same measured bound.

    `toHaveCount(0)` is satisfied by a page that has not rendered the session
    yet — an absent element counts zero — so the wait above can pass at t=0 and
    hand the next assertion the suite's default ten seconds for a band fetch and
    a question build. That is what failed inside `verify:release` while passing
    in nine seconds alone: not a slow assertion, a wait that had already
    returned. The assertions below are unchanged; only the time allowed to
    observe them is, and it is the same forty-five seconds the band wait uses
    because it is the same fetch being waited on.
  */
  await expect(headword).toBeVisible({ timeout: 45_000 });
  await expect(headword).not.toBeEmpty();
  const shown = (await headword.textContent())?.trim() ?? '';
  expect(BEGINNER_FILLER.has(shown)).toBe(false);
  const shownLevels = unresolved
    .map((word) => SURFACE_OF.get(word.wordId))
    .filter((surface): surface is string => Boolean(surface));
  expect(shownLevels).toContain(shown);
});

test('a retake in the other direction is beginner-appropriate the same day', async ({ page }) => {
  // The reverse journey: an advanced day, part-done, retaken down to Level 1.
  await openTodaysWords(page);
  await expect
    .poll(async () => (await readSettings(page))?.daily_plan?.words?.length ?? 0, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);

  const first = await readSettings(page);
  // Give the learner a Level-30 result and let the app rebuild an advanced day.
  await writeSettings(page, {
    ...first,
    level_test: {
      level: 30,
      low: 28,
      high: 30,
      items: 30,
      takenAt: new Date().toISOString(),
      recentItems: [],
    },
  });
  await openApp(page, '/words');
  await expect
    .poll(async () => (await readSettings(page))?.daily_plan?.level, { timeout: 10_000 })
    .toBe(30);

  const advanced = await readSettings(page);
  const plan = advanced.daily_plan!;
  const mastered = plan.words.slice(0, 4).map((word) => word.wordId);

  await writeSettings(page, {
    ...advanced,
    daily_plan: { ...plan, completed: mastered },
    level_test: {
      level: 1,
      low: 1,
      high: 3,
      items: 30,
      takenAt: new Date().toISOString(),
      recentItems: [],
    },
  });
  await openApp(page, '/words');
  await expect
    .poll(async () => (await readSettings(page))?.daily_plan?.level, { timeout: 10_000 })
    .toBe(1);

  const after = (await readSettings(page)).daily_plan!;
  expect(after.completed).toEqual(mastered);
  await expect(page.getByTestId('today-card')).toContainText(new RegExp(`4\\s*/\\s*${plan.goal}`));
  const unresolved = after.words.filter((word) => !mastered.includes(word.wordId));
  expect(unresolved.length).toBeGreaterThan(0);
  for (const word of unresolved) {
    const level = LEVEL_OF.get(word.wordId) ?? 99;
    expect(level, `${SURFACE_OF.get(word.wordId)} after the retake down`).toBeLessThanOrEqual(3);
  }
});

test('a real retake, through the test itself, replans and survives a restart', async ({ page }) => {
  /**
   * The whole journey the brief asks for, with nothing written by hand:
   *
   *     existing learner state
   *       → a Level Test retake sat in the real UI
   *       → the new result
   *       → the recommendation rebuilt from it
   *       → the next vocabulary session
   *       → a restart
   *       → the same valid state
   *
   * The two tests above write the level-test row directly, which is the right
   * trade for pinning the *rebuild* — they can assert an exact level without the
   * browser having to grade its own answers. What they cannot show is that the
   * screen which produces that row produces this one, and that the app is still
   * consistent after being closed and reopened on the far side of it.
   *
   * So this one answers *I don't know* to every question. That is a real answer
   * the model weighs, it needs no knowledge of the bank, and it lands at Level 1
   * — a known endpoint. The learner starts at Level 30 with mastery, so the
   * retake moves them the length of the scale in the direction that is hardest
   * to get right: **down**, where every rule about not re-teaching what is
   * already mastered has to hold at once.
   */
  await openTodaysWords(page);
  await expect
    .poll(async () => (await readSettings(page))?.daily_plan?.words?.length ?? 0, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);

  const seeded = await readSettings(page);
  const plan = seeded.daily_plan!;
  const mastered = plan.words.slice(0, 2).map((word) => word.wordId);

  /*
    An established learner: measured at 30, two words mastered today, three
    saved, a streak, and a fortnight of study time behind them. Everything below
    has to still be here at the end.
  */
  await writeSettings(page, {
    ...seeded,
    daily_plan: { ...plan, completed: mastered },
    saved_items: ['word:word_sagwa', 'word:word_hakgyo', 'word:word_chaek'],
    active_days: ['2026-09-05', '2026-09-06', '2026-09-07'],
    level_test: {
      level: 30,
      low: 28,
      high: 30,
      items: 30,
      takenAt: '2026-09-07T10:00:00.000Z',
      recentItems: [],
    },
  });
  await openApp(page, '/words');
  await expect
    .poll(async () => (await readSettings(page))?.daily_plan?.level, { timeout: 10_000 })
    .toBe(30);
  const advanced = (await readSettings(page)).daily_plan!;
  const advancedWords = advanced.words.map((word) => word.wordId);

  // --- the retake, sat for real ----------------------------------------------

  await openApp(page, '/me/level-test');
  // A returning learner is told what they came out at last time, and the button
  // says "again" rather than "start".
  await expect(page.getByText(/Last time you came out at Level 30\./i)).toBeVisible();
  await page.getByTestId('level-start').click();
  await expect(page.getByTestId('level-unknown')).toBeVisible({ timeout: 20_000 });

  let asked = 0;
  for (let i = 0; i < 40; i += 1) {
    if (await page.getByTestId('level-result').count()) break;
    await page.getByTestId('level-unknown').click();
    asked += 1;
  }
  /*
    Twenty, not thirty. The learner said *I don't know* to everything, the
    posterior settled, and the sitting ended at the floor rather than asking ten
    more questions of somebody who had already answered them all the same way.
  */
  expect(asked).toBe(20);
  await expect(page.getByTestId('level-result')).toHaveText(/^1of 30$/);

  // --- the recommendation, rebuilt --------------------------------------------

  // The result screen leads to the words it just changed.
  await page.getByRole('button', { name: /Learn words at my level/i }).click();
  await expect(page).toHaveURL(/\/words\/today$/);

  await expect
    .poll(async () => (await readSettings(page))?.daily_plan?.level, { timeout: 10_000 })
    .toBe(1);
  const replanned = (await readSettings(page)).daily_plan!;

  // Nothing the learner earned was spent to get here.
  expect(replanned.completed).toEqual(mastered);
  expect(replanned.date).toBe(plan.date);
  expect(replanned.goal).toBe(plan.goal);

  const after = await readSettings(page);
  expect(after.saved_items).toEqual(['word:word_sagwa', 'word:word_hakgyo', 'word:word_chaek']);
  expect(after.active_days).toEqual(['2026-09-05', '2026-09-06', '2026-09-07']);
  // The new result replaced the old one, and the finished sitting was cleared
  // with it — there is no half-finished test left on the device.
  expect((after.level_test as { level: number }).level).toBe(1);
  expect(after.level_test_sitting).toBeNull();

  /*
    The plan is genuinely different, and genuinely at the new level: the
    unresolved Level-30 targets are gone, and no word the learner already
    completed has been handed back as new material.
  */
  const replannedWords = replanned.words.map((word) => word.wordId);
  expect(replannedWords).not.toEqual(advancedWords);
  /*
    A mastered word may still be in the plan — it is where the 2/10 comes from —
    but it must be *resolved*. What "do not re-teach a mastered word as new
    content" means concretely is that it never becomes an outstanding
    obligation again, which is a statement about `completed` rather than about
    the `source` label the entry was created with. The label is history: an
    entry chosen as `new` this morning and finished this morning is still the
    entry that was chosen as new.
  */
  for (const wordId of mastered) {
    const row = replanned.words.find((word) => word.wordId === wordId);
    if (row) expect(replanned.completed).toContain(wordId);
  }
  const unresolved = replanned.words.filter((word) => !replanned.completed.includes(word.wordId));
  for (const wordId of mastered) {
    expect(unresolved.map((word) => word.wordId)).not.toContain(wordId);
  }
  const newTargets = unresolved.filter((word) => word.source === 'new');
  expect(newTargets.length).toBeGreaterThan(0);
  for (const word of newTargets) {
    // A learner measured at Level 1 is not handed Level-20 vocabulary.
    expect(LEVEL_OF.get(word.wordId) ?? 99).toBeLessThanOrEqual(4);
  }
  // No word appears twice: a rebuild must not create a duplicate obligation.
  expect(new Set(replannedWords).size).toBe(replannedWords.length);

  // --- and it survives being closed --------------------------------------------

  await openApp(page, '/words');
  const restarted = await readSettings(page);
  expect(restarted.daily_plan?.level).toBe(1);
  expect(restarted.daily_plan?.completed).toEqual(mastered);
  expect(restarted.daily_plan?.words.map((word) => word.wordId)).toEqual(replannedWords);
  expect(restarted.saved_items).toEqual(['word:word_sagwa', 'word:word_hakgyo', 'word:word_chaek']);
  expect((restarted.level_test as { level: number }).level).toBe(1);
  await expect(page.getByTestId('today-card')).toContainText(
    new RegExp(`${mastered.length}\\s*/\\s*${plan.goal}`),
  );
});
