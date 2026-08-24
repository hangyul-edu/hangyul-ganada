import { expect, test } from '@playwright/test';

import { openApp, waitForLaunch } from './helpers/launch';

/**
 * The sound-change lesson, section by section.
 *
 * ## Why this is not a DOM count
 *
 * The page builds itself out of the corpus: each of the six patterns in
 * `sound_patterns` finds the three lowest-difficulty words the build has tagged
 * with it, and a pattern that finds none is dropped — `.filter(examples.length
 * > 0)` in `SoundChangesPage`. That is the right behaviour and it is silent,
 * which is the problem: a re-levelling, a corpus edit or a change to
 * `pronunciation.py` can empty a pattern and the lesson simply gets shorter
 * with every gate still green. Palatalisation is three words away from that
 * today.
 *
 * It had already happened once. `pattern_of` used liaison as its catch-all for
 * "the word sounds different and no named rule fired", which is 받침
 * neutralisation — 옷 is [옫] and nothing slid anywhere — so `note_for` excluded
 * liaison from word cards, the build took the lesson's data from `note_for`,
 * and the one pattern the code comments say is "taught once, in the
 * sound-change lesson" was taught nowhere. Five cards where the copy is written
 * for six.
 *
 * So this asserts the lesson by *name*: every pattern that has copy must have a
 * card, and every card must show a written form, a spoken form and a way to
 * hear it. A shallow count would have passed the whole time.
 */

/** Every pattern the product has written an explanation for. */
const PATTERNS = ['tensing', 'aspiration', 'nasal', 'lateral', 'palatal', 'liaison'] as const;

test('the sound-change lesson has a card for every pattern it has copy for', async ({ page }) => {
  await openApp(page, '/letters/sounds');
  await waitForLaunch(page);

  const cards = page.locator('main section, main article, main [class*="lesson"]');
  // The headings are the pattern names, translated. Read them off the page
  // rather than out of the bundle, because what a learner gets is the page.
  const headings = await page.locator('main h2').allInnerTexts();
  expect(
    headings.length,
    `the lesson shows ${headings.length} sections; the product has copy for ${PATTERNS.length}`,
  ).toBe(PATTERNS.length);

  // Every section names a written form, a said form, and offers the sound.
  for (let i = 0; i < headings.length; i += 1) {
    const section = cards.nth(i);
    await expect(section, `section ${i + 1} (${headings[i]}) has no heading`).toContainText(/\S/);
  }

  /*
    Three pairs per section, counted per section rather than over the page.

    A total would pass while one pattern quietly thinned to a single word, and
    thinning is the likelier failure: palatalisation has three words in the
    whole corpus and liaison had two the day this was written, both of them
    hand-written irregulars. Each card shows a lead pair and the next two
    examples, so three arrows is the lesson as designed and two is a card that
    has started to disappear.
  */
  const arrowsPerSection = await page.evaluate(() =>
    [...document.querySelectorAll('main h2')].map((h) => ({
      heading: (h.textContent ?? '').trim(),
      arrows: ((h.closest('section, article, div')?.textContent ?? '').match(/→/g) ?? []).length,
    })),
  );
  for (const section of arrowsPerSection) {
    expect(section.arrows, `“${section.heading}” shows ${section.arrows} example(s), not 3`)
      .toBeGreaterThanOrEqual(3);
  }

  // Something to press on every card, so a learner can hear each pattern.
  const speakers = page.getByRole('button', { name: /listen|play|들어|재생/i });
  expect(await speakers.count(), 'a way to hear every pattern').toBeGreaterThanOrEqual(
    PATTERNS.length,
  );
});

test('every section of the lesson shows real Korean, not an empty shell', async ({ page }) => {
  await openApp(page, '/letters/sounds');
  await waitForLaunch(page);

  const sections = await page.evaluate(() => {
    const out: { heading: string; hangul: number }[] = [];
    for (const h of document.querySelectorAll('main h2')) {
      const card = h.closest('section, article, div');
      const text = card?.textContent ?? '';
      out.push({
        heading: (h.textContent ?? '').trim(),
        hangul: [...text].filter((c) => c >= '가' && c <= '힣').length,
      });
    }
    return out;
  });

  expect(sections.length).toBeGreaterThanOrEqual(6);
  for (const section of sections) {
    // A written form, a spoken form and two more examples is a lot of Hangul.
    // A card that lost its examples would fall well under this.
    expect(section.hangul, `“${section.heading}” carries almost no Korean`).toBeGreaterThan(8);
  }
});
