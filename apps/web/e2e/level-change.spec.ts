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
    const request = indexedDB.open('hangyul-ganada', 2);
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
    const request = indexedDB.open('hangyul-ganada', 2);
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
  await openApp(page, '/words/today');
  const headword = page.getByTestId('word-headword');
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
