import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { openApp } from './helpers/launch';

/**
 * The Review hub, and the two lists the learner owns.
 *
 * ```
 * Review ─┬─▶ Start review          the scheduler's session
 *         ├─▶ Saved words           what the learner bookmarked
 *         └─▶ Wrong vocabulary      what they got wrong
 * ```
 *
 * ## Why this is an end-to-end spec and not more unit tests
 *
 * `store/reviewLists.test.tsx` already proves the two lists are independent,
 * survive a reload and never double up — over the real provider and a real
 * driver, which is most of what matters. What it cannot see is the half of the
 * brief that is about *screens*: that the count on the hub row is the number of
 * rows on the page it opens, that removing a word says "remove" and not
 * "delete", that the practice button offers a session it can actually run, and
 * that a reload of the browser keeps all of it. Those are cross-screen
 * agreements, and a cross-screen agreement is exactly the thing a unit test
 * mocks away.
 *
 * ## Seeding
 *
 * Through the app's own IndexedDB, after waiting for `LearnerProvider` to have
 * opened it — the same approach and the same reason as `seedLettersForReview`
 * in `accessibility.spec.ts`. Driving twelve words through the daily session in
 * the browser would take minutes per assertion and would be testing the daily
 * session, which has its own spec.
 */

/**
 * The taught words this spec works with, in corpus priority order.
 *
 * Read off disk in Node rather than fetched from inside the page. The app's
 * service worker sits in front of every request the page makes, and what a
 * seeding helper wants is the corpus the build produced — not whatever the
 * worker decides to answer with on a given run. `band-1` is the slice the app
 * loads before the home screen paints, so these are the first words a learner
 * meets and the ones the scheduler reaches for first.
 */
function taughtWords(count: number): string[] {
  const dir = fileURLToPath(new URL('../public/corpus/', import.meta.url));
  const band = readdirSync(dir).find((name) => name.startsWith('band-1-'));
  if (!band) throw new Error(`no band-1 in ${dir} — run npm run content:corpus`);
  const rows = JSON.parse(readFileSync(join(dir, band), 'utf8')).words as Array<{ id: string }>;
  return rows.slice(0, count).map((row) => row.id);
}

/**
 * A profile that has met `ids` and got every one of them wrong.
 *
 * A progress row *and* a memory row, because review considers only items with
 * both — an item with neither has been displayed and not exercised, and the
 * scheduler is right to ignore it.
 */
async function seedWrongWords(page: Page, ids: string[]) {
  await page.evaluate(async (wordIds) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('hangyul-ganada');
      request.onsuccess = () => resolve(request.result);
    });
    const when = new Date(Date.now() - 2 * 864e5).toISOString();
    const tx = db.transaction(['progress', 'memory', 'mistakes'], 'readwrite');
    for (const id of wordIds) {
      tx.objectStore('progress').put(
        {
          item_key: id, kind: 'word', stage: 'introduced', attempts: 1, passes: 0, fails: 1,
          trace_passes: 0, write_passes: 0, recognition_passes: 0, heard: true, learned: false,
          needs_review: true, last_score: 0, first_seen_at: when, last_attempted_at: when,
          learned_at: null, review_due_at: when,
        },
        `word:${id}`,
      );
      for (const skill of ['meaning_recognition', 'reading_recognition', 'sentence_comprehension']) {
        tx.objectStore('memory').put(
          {
            item_key: `word:${id}`, skill, stability_days: 0.4, difficulty: 0.8, reps: 1,
            lapses: 1, last_at: when, due_at: when, last_score: 0,
          },
          `word:${id}:${skill}`,
        );
      }
      /*
       * The notebook row, in the shape `normaliseMistake` reads — camelCase,
       * keyed `${kind}:${itemKey}`, and `answer` is required or the row is
       * discarded on load. `correctSince: 0` is what keeps it unresolved.
       */
      tx.objectStore('mistakes').put(
        {
          id: `word:${id}`, kind: 'word', itemKey: id, mode: 'read',
          skill: 'meaning_recognition', chose: null, answer: id,
          firstAt: when, lastAt: when, wrongCount: 1, correctSince: 0,
        },
        `word:${id}`,
      );
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }, ids);
}

async function openStore(page: Page) {
  await openApp(page, '/');
  // The provider has to have opened the database and written its settings row
  // before a seed goes in, or the app's own write lands on top of the seed.
  await expect(page.locator('[data-storage-engine]')).toBeVisible();
  await page.waitForTimeout(500);
}

test('the hub offers the two lists, with counts that match the screens behind them', async ({
  page,
}) => {
  await openStore(page);
  const ids = taughtWords(6);
    await seedWrongWords(page, ids);

  await openApp(page, '/review');
  const wrong = page.getByTestId('hub-wrong');
  await expect(wrong).toBeVisible();
  await expect(page.getByTestId('hub-saved')).toBeVisible();
  // The number beside "Wrong vocabulary" is the number of words, and the screen
  // it opens shows exactly that many rows. Two figures, one fact.
  await expect(wrong).toContainText('6');

  await wrong.click();
  await expect(page).toHaveURL(/\/review\/mistakes/);
  // Scoped to the notebook's own list: the bottom navigation is list items too,
  // and an unscoped `listitem` count is five tabs plus whatever is on screen.
  await expect(page.getByTestId('mistake-list').getByRole('listitem')).toHaveCount(6);
});

test('a wrong word can be practised, and the size offered is a size that can be run', async ({
  page,
}) => {
  await openStore(page);
  const ids = taughtWords(6);
    await seedWrongWords(page, ids);

  await openApp(page, '/review/mistakes');
  const practise = page.getByTestId('practice-wrong');
  await expect(practise).toBeVisible();

  /*
   * §16. With six wrong words the rungs are 5 and All 6 — never 10 or 20,
   * because pressing 20 would give a session of six and the number on the
   * button would have been a lie.
   */
  const sizes = page.getByRole('group', { name: /How many/i });
  await expect(sizes.getByRole('button', { name: '20' })).toHaveCount(0);
  await expect(sizes.getByRole('button', { name: '5' })).toBeVisible();

  await practise.click();
  await expect(page).toHaveURL(/\/review\/session/);
  // A real question arrived. Which kind is the scheduler's business — §17 asks
  // for variety, which `reviewLists.test.tsx` measures over the whole plan.
  await expect(page.getByText(/1 \/ \d+/)).toBeVisible();
});

test('a mistake is removed by hand, and the word itself is not deleted', async ({ page }) => {
  await openStore(page);
  const ids = taughtWords(3);
    await seedWrongWords(page, ids);

  await openApp(page, '/review/mistakes');
  const rows = page.getByTestId('mistake-list').getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await page.getByRole('button', { name: 'Done with this' }).first().click();
  await expect(rows).toHaveCount(2);

  // Still a word in the app, with its own page. Removing a notebook row is not
  // deleting vocabulary — §14, and the wording on the button says so too.
  await openApp(page, `/words/word/${ids[0]}`);
  await expect(page.getByRole('heading').first()).toBeVisible();

  // And the removal survived the reload.
  await openApp(page, '/review/mistakes');
  await expect(page.getByTestId('mistake-list').getByRole('listitem')).toHaveCount(2);
});

test('saving a word puts it on the saved list, and unsaving takes it off', async ({ page }) => {
  await openStore(page);
  const ids = taughtWords(1);
  
  await openApp(page, `/words/word/${ids[0]}`);
  const bookmark = page.getByRole('button', { name: /save|bookmark/i }).first();
  await expect(bookmark).toBeVisible();
  await bookmark.click();

  await openApp(page, '/words/saved');
  await expect(page.getByTestId('saved-list').getByRole('listitem')).toHaveCount(1);

  // The word count survives a reload — it is on the settings row, not in a hook.
  await openApp(page, '/review');
  await expect(page.getByTestId('hub-saved')).toContainText('1');

  /*
   * §13: the learner *removes it from saved*. The control says Remove, and the
   * word is still in the app afterwards — the failure this guards against is a
   * button that reads like it deletes vocabulary, which no learner should have
   * to test for themselves.
   */
  await openApp(page, '/words/saved');
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await expect(page.getByText(/No saved words yet/)).toBeVisible();
  await openApp(page, `/words/word/${ids[0]}`);
  await expect(page.getByRole('heading').first()).toBeVisible();
});

test('the empty states say how something gets here', async ({ page }) => {
  // §20, on a profile that has done nothing. Not a zero on its own: a sentence
  // that names the action which fills the list, and a way to go and do it.
  await openApp(page, '/words/saved');
  await expect(page.getByText(/No saved words yet/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Go to words/i })).toBeVisible();

  await openApp(page, '/review/mistakes');
  await expect(page.getByText(/Nothing missed yet/)).toBeVisible();
  const cta = page.getByRole('link', { name: /Start today's words/i });
  await expect(cta).toBeVisible();
  // And it goes somewhere other than the screen the back arrow goes to.
  await cta.click();
  await expect(page).toHaveURL(/\/words\/today/);
});

/**
 * The new screens at every phone width, in both directions, at 200% text.
 *
 * ## Why these four widths
 *
 * 360 is the narrowest Android phone still worth supporting, 390 and 412 are
 * where most of the market sits, and 430 is the largest phone before a layout
 * starts looking like a small tablet. A row that fits at 390 and breaks at 360
 * breaks for the cheapest devices, which is the wrong half of the audience to
 * lose.
 *
 * ## Why right-to-left
 *
 * Arabic ships. It was possible to believe otherwise — the note at the top of
 * `locale.spec.ts` said Arabic had been withdrawn, and it had said so long
 * enough that the suite had no RTL layout coverage while the language was in
 * the picker. `describeLocale('ar').direction` is `rtl` and always was.
 *
 * What is asserted is the failure mode a mirrored layout actually has: content
 * pushed off the edge, so the page scrolls sideways. A chevron pointing the
 * wrong way is a real defect and is not something a test can see; that is what
 * the screenshots in the report are for.
 */
const WIDTHS = [360, 390, 412, 430];
const NEW_SCREENS = [
  { name: 'review', path: '/review' },
  { name: 'saved words', path: '/words/saved' },
  { name: 'wrong vocabulary', path: '/review/mistakes' },
];

for (const { name, path } of NEW_SCREENS) {
  test(`${name} fits every phone width, in both directions, at 200% text`, async ({ page }) => {
    for (const locale of ['en', 'ar']) {
      await page.addInitScript((code) => {
        window.localStorage.setItem('hangyul_ganada:locale', code);
      }, locale);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        await openApp(page, path);
        /*
         * Text zoom, not page zoom. Android's accessibility font scale enlarges
         * text and leaves the viewport where it is, which is the case that
         * actually breaks a row; browser zoom scales the viewport too and hides
         * the bug. Same technique as `accessibility.spec.ts`.
         */
        await page.addStyleTag({
          content:
            'html { -webkit-text-size-adjust: 200% !important; text-size-adjust: 200% !important; }',
        });
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(
          overflow,
          `${name} in ${locale} at ${width}px scrolls sideways by ${overflow}px at 200% text`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test(`${name} is laid out in the reading direction of the language`, async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('hangyul_ganada:locale', 'ar');
    });
    await openApp(page, path);
    // The document says which way it reads, and the app sets it from the
    // locale rather than from a hard-coded attribute in `index.html`.
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  });
}
