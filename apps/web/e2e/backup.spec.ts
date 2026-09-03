import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { openApp } from './helpers/launch';

/**
 * Taking your learning off the phone, and putting it back.
 *
 * ## Why this is an end-to-end spec
 *
 * `storage/backup.test.ts` proves the envelope, and `pages/backupFlow.test.tsx`
 * drives the two buttons over a `MemoryDriver`. Neither can see the two things
 * this feature actually runs on: **the real IndexedDB driver**, whose `entries`
 * zips `getAllKeys()` against `getAll()` and is only correct because those two
 * agree on order, and **the browser's own download**, which is the whole
 * delivery mechanism on the web. A backup that silently pairs the wrong key
 * with the wrong value, or a *Save a copy* that produces no file, is the exact
 * shape of failure this feature exists to prevent — and both are invisible to a
 * suite that mocks either half away.
 *
 * The learner is seeded through the app's own IndexedDB, the way
 * `review-hub.spec.ts` does and for the same reason: driving the daily session
 * to produce a review schedule would take minutes and would be testing the
 * daily session.
 */

/** Rows in three stores, so a mispaired key would show up as a wrong value. */
const SEED = {
  progress: [
    ['character:ㄱ', { kind: 'character', item_key: 'ㄱ', learned: true }],
    ['character:ㅎ', { kind: 'character', item_key: 'ㅎ', learned: false }],
  ],
  memory: [
    ['character:ㄱ:writing', { stability: 9.5 }],
    ['character:ㅎ:writing', { stability: 1.25 }],
  ],
  mistakes: [['character:ㅎ', { item_key: 'ㅎ', picked: 'ㅅ' }]],
} as const;

async function seed(page: Page): Promise<void> {
  await page.evaluate(async (rows) => {
    const open = indexedDB.open('hangyul-ganada');
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    for (const [store, entries] of Object.entries(rows)) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        for (const [key, value] of entries as Array<[string, unknown]>) {
          tx.objectStore(store).put(value, key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    db.close();
  }, SEED);
}

test('a copy holds every store, with each key beside its own value', async ({ page }) => {
  await openApp(page, '/me');
  await seed(page);
  await page.reload();
  await page.getByTestId('backup-save').scrollIntoViewIfNeeded();

  const download = page.waitForEvent('download');
  await page.getByTestId('backup-save').click();
  const file = await download;

  expect(file.suggestedFilename()).toMatch(/^hangyul-ganada-learning-\d{4}-\d{2}-\d{2}\.json$/);
  const written = JSON.parse(readFileSync((await file.path())!, 'utf8')) as {
    format: string;
    schema_version: number;
    stores: Record<string, Array<[string, unknown]>>;
  };

  expect(written.format).toBe('hangyul-ganada/learning-backup');
  expect(written.schema_version).toBeGreaterThan(0);
  /*
   * Compared as maps, not as arrays: the order two IndexedDB reads come back in
   * is not the assertion — that each key kept the value that was stored under
   * it is. ㄱ's stability is 9.5 and ㅎ's is 1.25, and a driver that zipped the
   * two lists out of step would swap exactly those.
   */
  expect(Object.fromEntries(written.stores.memory)).toEqual({
    'character:ㄱ:writing': { stability: 9.5 },
    'character:ㅎ:writing': { stability: 1.25 },
  });
  expect(Object.fromEntries(written.stores.progress)).toMatchObject({
    'character:ㄱ': { learned: true },
    'character:ㅎ': { learned: false },
  });
  expect(written.stores.mistakes).toHaveLength(1);
  await expect(page.getByTestId('backup-notice')).toBeVisible();
});

test('restoring replaces what is on the device, and it survives a reload', async ({ page }) => {
  await openApp(page, '/me');
  await seed(page);
  await page.reload();
  const download = page.waitForEvent('download');
  await page.getByTestId('backup-save').scrollIntoViewIfNeeded();
  await page.getByTestId('backup-save').click();
  const copy = (await (await download).path())!;

  // A second device: same origin, no learning, and one row of its own that the
  // restore has to remove rather than merge around.
  await page.evaluate(async () => {
    const open = indexedDB.open('hangyul-ganada');
    const db: IDBDatabase = await new Promise((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(['progress', 'memory', 'mistakes'], 'readwrite');
      tx.objectStore('progress').clear();
      tx.objectStore('memory').clear();
      tx.objectStore('mistakes').clear();
      tx.objectStore('progress').put({ kind: 'character', item_key: 'ㄴ' }, 'character:ㄴ');
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('backup-restore').scrollIntoViewIfNeeded();
  await page.getByTestId('backup-restore').click();
  (await chooser).setFiles(copy);
  await page.getByTestId('backup-restore-confirm').click();
  await expect(page.getByTestId('backup-notice')).toBeVisible();

  // Read back from storage after a cold load: the restore is only worth
  // anything if it outlives the session that performed it.
  await page.reload();
  const stored = await page.evaluate(async () => {
    const open = indexedDB.open('hangyul-ganada');
    const db: IDBDatabase = await new Promise((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    const read = (store: string) =>
      new Promise<{ keys: string[] }>((resolve) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
        request.onsuccess = () => resolve({ keys: request.result.map(String) });
      });
    const progress = await read('progress');
    const memory = await read('memory');
    db.close();
    return { progress: progress.keys.sort(), memory: memory.keys.sort() };
  });

  expect(stored.progress).toEqual(['character:ㄱ', 'character:ㅎ']);
  expect(stored.memory).toEqual(['character:ㄱ:writing', 'character:ㅎ:writing']);
});
