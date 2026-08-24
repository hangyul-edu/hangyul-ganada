import { expect, test } from '@playwright/test';

import { openApp, waitForLaunch } from './helpers/launch';

/**
 * The dictionary half of search, in a real browser.
 *
 * ## What only a browser can answer here
 *
 * `data/dictionary.test.ts` proves the fetching and ranking against a stubbed
 * `fetch` — that two callers cause one download, that a chunk is not fetched to
 * answer a search, that a failure is not cached. All of that is true of the
 * module in isolation and none of it says the feature works.
 *
 * What it cannot say is whether the files are *there*. The dictionary is 4.5 MB
 * of JSON in `public/`, deliberately never imported, so no bundler resolves it,
 * no typechecker reads it and no unit test touches it. If the build stopped
 * copying `public/dictionary`, if a path lost its `BASE_URL` prefix, or if the
 * manifest named a chunk that had been cleaned away, every gate in the suite
 * would stay green and search would silently return only the 2,581 taught
 * words — which is exactly what search did before this feature existed, so
 * nobody would notice from the outside.
 *
 * So this asks a browser to type a word that is deliberately *not* taught, and
 * to find it anyway.
 */

/**
 * A headword the dictionary has and the syllabus does not.
 *
 * Checked to be absent from the corpus, which is the whole point: 나가다 was the
 * first choice and is *taught*, so the dedupe correctly hid it from the
 * dictionary section and the test failed for the one reason that meant the
 * feature was working. 가지 is a common noun nobody is taught, with three
 * senses, so it also exercises the disclosure.
 */
const LOOKUP = '가지';

test('finds a word the app does not teach, and says on the entry that it is not homework', async ({ page }) => {
  await openApp(page, '/words');
  await waitForLaunch(page);

  await page.getByRole('searchbox').fill(LOOKUP);

  /*
    One list, and the untaught word is simply in it.

    The results used to be split under a *Dictionary* heading carrying the line
    "reference only, not part of your daily practice". That sentence is true and
    it was on the wrong screen: somebody who has typed a word into a search box
    wants to know whether the word is there, not which of the app's two corpora
    answered. The distinction is made where a learner acts on it — on the entry
    they open — and this test now follows them there.
  */
  const results = page.getByRole('main');
  // Exact: the dictionary holds longer words containing this one, and a
  // substring match would find one of those and call it a pass for a search
  // that had failed.
  await expect(results.getByText(LOOKUP, { exact: true }).first()).toBeVisible();

  await results.getByText(LOOKUP, { exact: true }).first().click();
  await expect(page.getByText(/not part of your daily practice/i)).toBeVisible();
});

test('opens the entry, shows its senses, and credits the source', async ({ page }) => {
  await openApp(page, '/words');
  await waitForLaunch(page);

  await page.getByRole('searchbox').fill(LOOKUP);
  // One list since the search results were unified; the row is simply in it.
  await page.getByRole('main').getByText(LOOKUP, { exact: true }).first().click();

  await expect(page.getByTestId('dictionary-headword')).toHaveText(LOOKUP);

  /*
    The first sense is open; the rest are behind a disclosure that counts them.

    Which sense comes first is not asserted, and that is deliberate. This used
    to require "twig or branch" to be the visible one, and it broke the day the
    ingestion started reading definitions written as templates: 가지 went from
    two senses to four, "kind, sort; variety" sorted ahead of it, and a passing
    test turned into a failing one on a change that made the dictionary better.
    A gloss written by an upstream editor is not this app's fact to pin.

    What *is* this app's promise: one sense is shown, the others are counted and
    reachable, and the licence is credited on the same screen.
  */
  const senses = page.getByRole('group');
  await expect(senses).toContainText(/other meaning/i);
  // A `<details>`/`<summary>`, not a button — the disclosure is native, so
  // `getByRole('button')` finds nothing inside it and waits until the test
  // times out. The summary is what opens it.
  await senses.locator('summary').click();
  // 가지 is the word this spec is built on because it has several unrelated
  // senses; the aubergine and the branch are both in there once it is opened.
  await expect(page.getByText(/twig or branch/i).first()).toBeVisible();

  /*
    CC BY-SA 4.0 asks for attribution where the material is used, and this is
    where it is used. Asserted rather than trusted, because the line is easy to
    lose in a refactor and its absence is a licence problem rather than a
    cosmetic one.
  */
  await expect(page.getByText(/CC BY-SA 4\.0/)).toBeVisible();
});

test('a taught word is never offered twice', async ({ page }) => {
  await openApp(page, '/words');
  await waitForLaunch(page);

  // 차 is on the syllabus and also in the dictionary. The card wins; the
  // dictionary's other senses of it live on that card, under Other meanings.
  await page.getByRole('searchbox').fill('차');

  // One row, in one list. Two would be a choice the learner should not have to
  // make — one leading to a hand-written card with a recording, the other to a
  // bare gloss of the same spelling.
  await expect(page.getByRole('main').getByText('차', { exact: true })).toHaveCount(1);
});

test('a taught word gains dictionary examples of the sense it teaches', async ({ page }) => {
  /*
    §8–§15 removed the *More from the dictionary* disclosure and everything under
    it. The screenshot that prompted it showed 발 offering the learner "leg",
    "counter for steps", "a blind screen", "strands of noodles" and "rounds of
    gunfire" on a card that teaches one sense of one word.

    What replaced it is narrower on purpose: sentences from the dictionary that
    demonstrate *the taught sense*, filtered by `data/exampleQuality.ts`, at most
    two, with no disclosure to open. 195 of 2,578 cards gain one — see
    `worddetail:qa` — and 방 is one of them.
  */
  await openApp(page, '/words');
  await waitForLaunch(page);

  await page.getByRole('searchbox').fill('방');
  await page.getByRole('link', { name: /방/ }).first().click();
  await expect(page.getByTestId('detail-headword')).toHaveText('방');

  const more = page.getByRole('region', { name: /more examples/i });
  await expect(more).toBeVisible();
  // Its own example is on the card already; this section must not repeat it.
  await expect(more.getByText('방이 깨끗해요.')).toHaveCount(0);
  await expect(more.locator('li')).not.toHaveCount(0);
  expect(await more.locator('li').count()).toBeLessThanOrEqual(2);

  // And nothing offering the senses the card does not teach.
  await expect(page.getByText(/more from the dictionary/i)).toHaveCount(0);
});
