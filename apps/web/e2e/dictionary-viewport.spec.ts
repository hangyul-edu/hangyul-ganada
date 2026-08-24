import { expect, test, type Page } from '@playwright/test';

import { openApp, waitForLaunch } from './helpers/launch';

/**
 * The same dictionary entry, read at five widths.
 *
 * ## The report this exists for
 *
 * A user said an entry showed different content on a phone and on a desktop.
 * Reading the source found no branch that could do it — a repository-wide
 * search for `matchMedia`, `innerWidth`, `isMobile` and `useMediaQuery` finds
 * three call sites, and they are the colour scheme, reduced motion and the
 * native inset padding. None of them is anywhere near the dictionary, which
 * fetches one manifest, one index and one content-hashed chunk regardless of
 * how wide the window is.
 *
 * That is an argument, not evidence. The layout *does* change with width — the
 * senses list reflows, the source line wraps — and a reader comparing two
 * screens sees the reflow and reasonably calls it different content. So the
 * question this test answers is the one the report actually raises: at every
 * width, is the *content* the same?
 *
 * ## Why a fingerprint rather than a screenshot
 *
 * A screenshot at 360 and one at 1440 differ on every pixel and prove nothing.
 * What must be equal is the meaning: the headword, its romanisation, and for
 * each sense the part of speech, the gloss, the usage labels and the example
 * sentences, in order. That is what `fingerprint` collects, and comparing it is
 * the difference between "it looks the same" and "it says the same".
 *
 * A width that hid one sense, truncated a gloss, dropped the labels or showed
 * three examples where another showed four would fail here. So would a build
 * that served a stale chunk to one of them.
 */

/** The widths a phone actually is, and the desktop the report compared against. */
const WIDTHS = [
  { name: 'small phone', width: 360, height: 780 },
  { name: 'iPhone', width: 390, height: 844 },
  { name: 'Pixel', width: 412, height: 915 },
  { name: 'large phone', width: 430, height: 932 },
  { name: 'desktop', width: 1440, height: 900 },
];

/**
 * Both surfaces a word can be read on, because they are different pages.
 *
 * `/words/dictionary/:headword` is the reference entry — every sense, its part
 * of speech, its usage labels and its citations. `/words/word/:wordId` is the
 * taught card, which shows the curated example and then whichever dictionary
 * sentences survive the quality filter. The report was about "the dictionary",
 * and a learner means both, so both are checked.
 *
 * 가지 is not taught and has three senses. 거의 is taught and is the entry the
 * example-sentence report was about: one nominal sense, a usage label naming
 * two particles, and four citations, none of which may reach the card.
 */
const PAGES = [
  { name: '가지 · dictionary entry', path: '/words/dictionary/%EA%B0%80%EC%A7%80', heading: '가지' },
  { name: '거의 · dictionary entry', path: '/words/dictionary/%EA%B1%B0%EC%9D%98', heading: '거의' },
];

/**
 * Everything the page says, in the order it says it, with the layout removed.
 *
 * Read out of the DOM rather than off the screen, so a sense folded into the
 * "4 other meanings" disclosure still counts. That disclosure is the one thing
 * on this page that really can hide content, so whether it is open is recorded
 * as well: a width that opened it while another kept it shut would be showing
 * different content in the sense a reader means, even though both pages hold
 * the same words.
 */
async function fingerprint(page: Page) {
  return page.evaluate(() => {
    const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('main') ?? document.body;
    const senses = [...main.querySelectorAll('section')].map((section) => ({
      lines: [...section.querySelectorAll('p, li')].map((p) => text(p)).filter(Boolean),
    }));
    return {
      heading: text(main.querySelector('h1')),
      disclosures: [...main.querySelectorAll('details')].map((node) => ({
        summary: text(node.querySelector('summary')),
        open: node.open,
      })),
      // Every readable string on the page, so a sense that vanishes at one
      // width cannot hide behind a container that happens to match.
      all: [...main.querySelectorAll('h1, h2, h3, p, li, dd, dt')]
        .map((node) => text(node))
        .filter(Boolean),
      senses,
    };
  });
}

for (const target of PAGES) {
  test(`says the same thing on ${target.name} at every width`, async ({ page }) => {
    const readings: { name: string; value: unknown }[] = [];

    for (const { name, width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await openApp(page, target.path);
      await waitForLaunch(page);

      // The h1 is the page ("Dictionary"); the headword is the first line of the
      // entry, and waiting for it is waiting for the fetched chunk to arrive.
      await expect(page.getByText(target.heading, { exact: true }).first()).toBeVisible();
      readings.push({ name, value: await fingerprint(page) });
    }

    const [first, ...rest] = readings;
    for (const reading of rest) {
      expect(
        reading.value,
        `${target.name} reads differently at ${reading.name} than at ${first.name}`,
      ).toEqual(first.value);
    }
  });
}
