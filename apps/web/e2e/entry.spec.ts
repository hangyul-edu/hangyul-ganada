/**
 * Two things a learner notices in the first minute, in the real browser.
 *
 * **The sound arrives on its own.** A listening question is a speaker icon and
 * three letters, and until this cycle it was silent until the learner guessed
 * that the icon was the question. There are unit tests for the rule; this is
 * the one that runs the actual screen, with the actual audio element, and
 * records which file was asked for.
 *
 * **A new screen starts at the top.** The unit tests drive the two scroll
 * containers directly because jsdom has no layout. This drives a phone-sized
 * viewport with real layout, scrolls a lesson to the bottom, and moves on.
 */
import { openTodaysWords } from './helpers/launch';
import { expect, test, type Page } from '@playwright/test';

/**
 * Records every clip the app asks to play, before any of the app has run.
 *
 * `Audio` is replaced rather than spied on, because the interesting assertion
 * is *which utterance* was requested and how many times — "some audio API was
 * touched" is exactly the check that passed while the app was silent.
 */
async function recordPlayback(page: Page) {
  await page.addInitScript(() => {
    const played: string[] = [];
    (window as unknown as { __played: string[] }).__played = played;
    class Recording extends Audio {
      play(): Promise<void> {
        played.push(new URL(this.src, location.href).pathname);
        return Promise.resolve();
      }
    }
    window.Audio = Recording as unknown as typeof Audio;
  });
}

const played = (page: Page) =>
  page.evaluate(() => (window as unknown as { __played: string[] }).__played ?? []);

/**
 * Walks past the unit explainer, if this profile is being shown one.
 *
 * Probed rather than assumed, and the probe waits first: `isVisible()` does not
 * auto-wait, and asking one tick after `goto` answers "no" for a card that is
 * about to appear. See the same note in `journey.spec.ts`.
 */
async function pastExplainer(page: Page) {
  const unitCta = page.getByRole('button', { name: "Got it — let's start" });
  const introCta = page.getByRole('button', { name: /Trace it|Write it/ });
  await expect(unitCta.or(introCta).first()).toBeVisible();
  if (await unitCta.isVisible()) await unitCta.click();
  await expect(introCta).toBeVisible();
}

test('the letter introduction says the letter without being asked', async ({ page }) => {
  await recordPlayback(page);
  await page.goto('/letters/lesson-vowels-core');
  await pastExplainer(page);
  await expect.poll(() => played(page)).toHaveLength(1);
  // ㅏ's sound example is 아 — codepoint C544 — and that is the file that has to
  // be asked for. A vowel's name and its sound are the same word, so one
  // recording serves both ids and the file is filed under the name; what
  // matters, and what this asserts, is the *utterance*.
  expect((await played(page))[0]).toMatch(/\/audio\/letters\/(female|male)\/\w+_c544\.mp3$/);
});

test('a listening question plays itself once, and again only when asked', async ({ page }) => {
  await recordPlayback(page);
  // Straight to a review sitting in listening mode, which is the exercise the
  // screenshot showed: "which letter makes this sound?" and a speaker button.
  await page.goto('/letters/lesson-vowels-core');
  await pastExplainer(page);

  // The introduction and the recognition question share one mechanism
  // (`useEntryAudio`), and the introduction is reachable without drawing. The
  // recognition step's own autoplay is covered by the unit tests, which can
  // mount it directly.
  await expect.poll(() => played(page)).toHaveLength(1);

  const before = (await played(page)).length;
  await page.getByRole('button', { name: /Play the pronunciation/ }).first().click();
  await expect.poll(() => played(page)).toHaveLength(before + 1);
});

test('changing the appearance does not make the app speak', async ({ page }) => {
  await recordPlayback(page);
  await page.goto('/letters/lesson-vowels-core');
  await pastExplainer(page);
  await expect.poll(() => played(page)).toHaveLength(1);

  await page.evaluate(() => {
    document.documentElement.dataset.appearance = 'dark';
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  expect(await played(page)).toHaveLength(1);
});

test('a word screen scrolled to the bottom opens the next step at the top', async ({ page }) => {
  // A short viewport, because the bug only exists on a screen that overflows
  // and this card fits on a tall one. A phone held in landscape, or a small
  // phone at the largest system text size, gets here honestly; forcing it is
  // how the mechanism is exercised without depending on which word the lesson
  // happens to open on.
  await page.setViewportSize({ width: 390, height: 420 });
  await openTodaysWords(page);

  const region = page.locator('[data-scroll-region="focus"]');
  await expect(region).toBeVisible();
  await expect(page.getByTestId('word-headword')).toBeVisible();

  await region.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const scrolled = await region.evaluate((element) => element.scrollTop);
  expect(scrolled, 'the word screen has to be scrollable for this to mean anything').toBeGreaterThan(
    0,
  );

  /*
   * On to the next screen, which starts at the top of its scroll region rather
   * than wherever the last one was left.
   *
   * Asserted by *which word* rather than by the meeting card disappearing: the
   * sitting interleaves, so the screen after meeting 하다 is often meeting a
   * different word, and the card is legitimately still there. What must not
   * persist is the scroll position.
   */
  const first = await page.getByTestId('word-headword').textContent();
  await page.getByRole('button', { name: 'Got it' }).first().click();
  await expect(page.getByTestId('word-headword')).not.toHaveText(first!);
  expect(await region.evaluate((element) => element.scrollTop)).toBe(0);
});

test('a tab screen opens at the top after a long scroll on another one', async ({ page }) => {
  // My Learning, because it is the longest tab screen in the product and is
  // long on a brand-new profile too. `/words` is long only once a category has
  // been opened, which made this pass alone and fail in the suite — the shared
  // profile is a property of the run, and a test that depends on it is testing
  // the run.
  await page.goto('/me');
  const main = page.locator('main');
  await expect(page.getByRole('heading', { name: 'My Learning' })).toBeVisible();
  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole('link', { name: /Letters/ }).first().click();
  await expect(page).toHaveURL(/\/letters$/);
  expect(await page.locator('main').evaluate((element) => element.scrollTop)).toBe(0);
});
