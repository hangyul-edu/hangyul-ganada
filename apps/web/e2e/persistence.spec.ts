/**
 * Does an ordinary browser keep what the learner does — and does the app say so?
 *
 * There are unit tests for the rule (`storage/capability.test.ts`,
 * `store/storageWarning.test.tsx`), and they run against a driver in a `Map`.
 * They cannot see the failure that reached customers: an ordinary desktop
 * Chrome window, real IndexedDB, and a red panel on the My Learning screen
 * saying the learner's progress was not being saved. Only a real browser can
 * answer that, so this spec asks it directly.
 *
 * Two halves, and the second is the one that matters:
 *
 * 1. **The screen is quiet** on a healthy browser — first visit, reload,
 *    second tab, and with `navigator.storage.persisted()` forced to `false`,
 *    which is a statement about eviction policy and not about whether writes
 *    work. It must never be able to produce the warning on its own.
 * 2. **The data is actually there** after a reload — the two daily goals, a
 *    saved word, and a learned item, read back out of the app's own store.
 *    A quiet screen over an empty database would be the worse bug of the two.
 */
import { expect, test, type Page } from '@playwright/test';

/** The warning, in the language the app is running in for these tests. */
const WARNING = /not being saved|저장되지 않고/;

/** What the shell publishes about the store it opened. See `ui/AppShell.tsx`. */
async function storage(page: Page) {
  const shell = page.locator('[data-storage-engine]').first();
  await expect(shell).toBeAttached();
  return {
    engine: await shell.getAttribute('data-storage-engine'),
    durable: await shell.getAttribute('data-storage-durable'),
  };
}

async function openMyLearning(page: Page) {
  await page.goto('/me');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('the storage warning', () => {
  test('stays away on an ordinary browser, across reloads and tabs', async ({ page, context }) => {
    await openMyLearning(page);
    expect(await storage(page)).toMatchObject({
      engine: 'indexeddb',
      durable: 'true',
    });
    await expect(page.getByText(WARNING)).toHaveCount(0);

    // A reload re-opens the database while the previous connection is still
    // closing, which is where a single-attempt open used to drop the app onto
    // the memory fallback and start warning.
    for (let i = 0; i < 3; i += 1) {
      await page.reload();
      await openMyLearning(page);
      await expect(page.getByText(WARNING)).toHaveCount(0);
    }

    // A second tab holding the same database open.
    const second = await context.newPage();
    await openMyLearning(second);
    await expect(second.getByText(WARNING)).toHaveCount(0);
    await openMyLearning(page);
    await expect(page.getByText(WARNING)).toHaveCount(0);
    await second.close();
  });

  test('is not triggered by navigator.storage.persisted() being false', async ({ page }) => {
    /*
     * The rule this whole fix exists to state. `persisted() === false` is the
     * *default* for every origin that has not been granted persistent storage,
     * which is nearly all of them — it says the browser may evict this origin
     * under storage pressure, and says nothing at all about whether a write
     * lands right now. Reading it as "learning data cannot be saved" is what
     * put a red panel under healthy installs.
     */
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          persisted: () => Promise.resolve(false),
          persist: () => Promise.resolve(false),
          estimate: () => Promise.resolve({ quota: 0, usage: 0 }),
        },
      });
    });
    await openMyLearning(page);
    expect(await storage(page)).toMatchObject({ durable: 'true' });
    await expect(page.getByText(WARNING)).toHaveCount(0);
  });

  test('appears when the store genuinely refuses to keep a write', async ({ page }) => {
    // The other side of the rule. IndexedDB is taken away entirely, which is
    // what an enterprise policy or a browser set to block site data does, and
    // the app falls back to a store that cannot survive a reload.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: null,
      });
    });
    await openMyLearning(page);
    expect(await storage(page)).toMatchObject({
      engine: 'memory',
      durable: 'false',
    });
    await expect(page.getByText(WARNING).first()).toBeVisible();
  });

  test('keeps writing after something else takes the database away', async ({ page }) => {
    /*
     * `versionchange` fires when anything else needs to change the database —
     * another tab on a newer release, or the browser's own "clear site data".
     * The app must let go of its connection or it wedges the other party, and
     * letting go used to be the end of it: the handle was dropped and every
     * later read and write threw. Silently, because every write in this app is
     * fire-and-forget, so a learner went on practising into a driver that had
     * stopped accepting anything and nothing on any screen said so.
     *
     * `deleteDatabase` is the cleanest way to fire the event from a test. What
     * is under test is not the deleted rows — those are gone, correctly — it is
     * whether the very next write lands at all.
     */
    await openMyLearning(page);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const request = indexedDB.deleteDatabase('hangyul-ganada');
          request.onsuccess = () => resolve('ok');
          request.onerror = () => resolve('error');
          request.onblocked = () => resolve('blocked');
        }),
    );

    await page.getByRole('button', { name: '20 a day' }).click();
    await expect(page.getByRole('button', { name: '20 a day' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The reload is the assertion: before the fix the write went nowhere and
    // this came back on the default.
    await openMyLearning(page);
    await expect(page.getByRole('button', { name: '20 a day' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText(WARNING)).toHaveCount(0);
  });
});

test.describe('what the learner did', () => {
  test('the two daily goals, a saved word and a learned item survive a reload', async ({
    page,
    context,
  }) => {
    await openMyLearning(page);

    // 1 & 2 — the two daily goals, changed away from their defaults.
    const letters = page.getByRole('button', { name: '15 a day' });
    await letters.click();
    await expect(letters).toHaveAttribute('aria-pressed', 'true');
    const words = page.getByRole('button', { name: '15 words a day' });
    await words.click();
    await expect(words).toHaveAttribute('aria-pressed', 'true');

    // 3 — a saved word, from its own detail page.
    await page.goto('/words/word/word_hada');
    // Named for the word it saves — "Save" alone is ambiguous in a list, so the
    // accessible name carries the headword. See `ui/SaveButton.tsx`.
    const save = page.getByRole('button', { name: /^(Save 하다|Remove 하다 from saved)$/ });
    await expect(save).toBeVisible();
    if ((await save.getAttribute('aria-pressed')) !== 'true') await save.click();
    await expect(save).toHaveAttribute('aria-pressed', 'true');

    // 4 — one letter marked learned, written straight into the progress store.
    //
    // Not through a lesson: this test is about whether the store keeps what it
    // is given, and routing it through the writing flow would make a change to
    // that flow read as a storage regression. The row is deliberately partial —
    // `normaliseProgress` fills the rest in on the way back out, which is the
    // path a real stored row from an older release takes too.
    await page.evaluate(async () => {
      const request = indexedDB.open('hangyul-ganada', 2);
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('progress', 'readwrite');
        tx.objectStore('progress').put(
          {
            kind: 'character',
            item_key: 'ㄱ',
            stage: 'learned',
            learned: true,
            attempts: 1,
            passes: 1,
            last_attempted_at: new Date().toISOString(),
          },
          'character:ㄱ',
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });

    // 5 — reload, in the same tab.
    await openMyLearning(page);
    await expect(
      page
        .locator('div')
        .filter({ hasText: /^Letters learned1$/ })
        .first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '15 a day' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: '15 words a day' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText(WARNING)).toHaveCount(0);

    // 6 — and in a tab opened fresh, which is how a learner comes back.
    const reopened = await context.newPage();
    await reopened.goto('/words/saved');
    await expect(reopened.getByText('하다')).toBeVisible();
    await reopened.goto('/me');
    await expect(reopened.getByRole('button', { name: '15 a day' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(reopened.getByText(WARNING)).toHaveCount(0);
    await reopened.close();
  });
});
