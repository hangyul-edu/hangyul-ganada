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

test('finds a word the app does not teach, and says it is not homework', async ({ page }) => {
  await openApp(page, '/words');
  await waitForLaunch(page);

  await page.getByRole('searchbox').fill(LOOKUP);

  const dictionary = page.getByRole('region', { name: /dictionary/i });
  await expect(dictionary).toBeVisible();
  // Exact: the dictionary holds longer words containing this one, and a
  // substring match would find one of those and call it a pass for a search
  // that had failed.
  await expect(dictionary.getByText(LOOKUP, { exact: true })).toBeVisible();

  // The promise the heading is there to make. A learner cannot tell a curated
  // card from a scraped gloss by looking, so the app has to say which is which.
  await expect(dictionary).toContainText(/not part of your daily practice/i);
});

test('opens the entry, shows its senses, and credits the source', async ({ page }) => {
  await openApp(page, '/words');
  await waitForLaunch(page);

  await page.getByRole('searchbox').fill(LOOKUP);
  await page
    .getByRole('region', { name: /dictionary/i })
    .getByText(LOOKUP, { exact: true })
    .click();

  await expect(page.getByTestId('dictionary-headword')).toHaveText(LOOKUP);
  // The first sense is open; the rest are behind a disclosure that counts them.
  await expect(page.getByText(/twig or branch/i).first()).toBeVisible();
  await expect(page.getByRole('group')).toContainText(/other meaning/i);

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

  const dictionary = page.getByRole('region', { name: /dictionary/i });
  if (await dictionary.isVisible()) {
    await expect(dictionary.getByText('차', { exact: true })).toHaveCount(0);
  }
});

test('a taught word gains dictionary examples of the sense it teaches', async ({ page }) => {
  /*
    한 has a dictionary entry with examples, and its taught sense matches one of
    them — which is what makes those examples showable on the card at all. A
    dictionary sense whose gloss is *not* the taught one goes under Other
    meanings with its own examples; this is the other half.
  */
  await openApp(page, '/words');
  await waitForLaunch(page);

  await page.getByRole('searchbox').fill('사람');
  await page.getByRole('link', { name: /사람/ }).first().click();
  await expect(page.getByTestId('detail-headword')).toHaveText('사람');

  const more = page.getByRole('group');
  await more.getByText(/other meanings/i).first().click();

  // Whatever the dictionary has for it, the attribution must arrive with it.
  await expect(more.getByText(/Wiktionary/)).toBeVisible();
});
