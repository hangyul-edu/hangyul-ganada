import { expect, test, type Page } from '@playwright/test';

import { copy } from './helpers/copy';
import { openApp, waitForLaunch } from './helpers/launch';

/**
 * Back, as a learner presses it: the header chevron, the browser's own button,
 * and the phone's.
 *
 * ## What is being pinned
 *
 * One policy — `ui/routePolicy.ts` — for four input paths that used to be three
 * different rules:
 *
 * | Input | How it arrives |
 * | --- | --- |
 * | the header chevron | `AppHeader` calls `goBack` |
 * | Android's hardware key | the shell calls `offerBackIntent` |
 * | Android's gesture | the same, via the same Capacitor listener |
 * | the browser toolbar | a real `POP`, which the app does not intercept |
 *
 * The first two are exercised here directly. The gesture is the hardware key on
 * the same listener and has no separate web surface to drive. The browser
 * button is exercised through `page.goBack()`, and what it proves is different:
 * not that the policy ran — it did not — but that the *stack the policy leaves
 * behind* is one a learner can walk without meeting a screen twice.
 *
 * ## Why the hardware key is driven through the app's own entry point
 *
 * `offerBackIntent` is precisely what `native/backIntent` exposes to the
 * Capacitor listener, so calling it from the page is the same press the phone
 * delivers. Simulating a keypress would test Chromium's key handling instead.
 */

/** One press of the phone's Back button, through the app's own registry. */
async function hardwareBack(page: Page): Promise<void> {
  await page.evaluate(() => window.__hangyulBackIntent?.());
}

declare global {
  interface Window {
    __hangyulBackIntent?: () => boolean;
  }
}

/**
 * A tab in the bottom bar.
 *
 * Scoped to the navigation landmark rather than matched by name over the whole
 * page: Home draws its own "Words" quick card and a level row whose accessible
 * name contains the word, so an unscoped match is three links and a strict-mode
 * failure. The tab bar is the subject here.
 */
function tab(page: Page, key: 'home' | 'letters' | 'words' | 'review' | 'profile') {
  return page
    .getByRole('navigation', { name: copy('navigation', 'primary') })
    .getByRole('link', { name: copy('navigation', `tabs.${key}`), exact: true });
}

/** The header's back chevron. */
function chevron(page: Page) {
  return page.getByTestId('app-back');
}

async function at(page: Page): Promise<string> {
  return page.evaluate(() => window.location.pathname);
}

test.describe('back from Home', () => {
  test('offers the exit immediately, and cancel leaves the learner on Home', async ({ page }) => {
    await openApp(page, '/');

    // Home draws no chevron. This is the other half of `back:coverage`, asserted
    // here too because it is what makes the exit offer the *only* thing Back
    // can mean on this screen.
    await expect(chevron(page)).toHaveCount(0);

    await hardwareBack(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(copy('common', 'exit.title'));

    await page.getByTestId('exit-stay').click();
    await expect(dialog).toHaveCount(0);
    expect(await at(page)).toBe('/');
  });

  test('offers the exit after a walk through the tabs, not a walk back through them', async ({
    page,
  }) => {
    /*
      The reported defect, in the order it was reported: Words, then Letters,
      then Review, then Back. The old depth rule popped one tab at a time and
      took four presses to reach the offer.
    */
    await openApp(page, '/');
    await tab(page, 'words').click();
    await tab(page, 'letters').click();
    await tab(page, 'review').click();
    expect(await at(page)).toBe('/review');

    await hardwareBack(page);
    expect(await at(page)).toBe('/');

    await hardwareBack(page);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('opens one dialog however fast the button is pressed', async ({ page }) => {
    await openApp(page, '/');
    await hardwareBack(page);
    await hardwareBack(page);
    await hardwareBack(page);
    // Odd number of presses: open, closed, open. Never two.
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
});

test.describe('back from a bottom-tab root', () => {
  for (const tab of ['/letters', '/words', '/review', '/me']) {
    test(`${tab} goes straight Home, by chevron and by hardware key`, async ({ page }) => {
      await openApp(page, tab);
      await expect(chevron(page)).toHaveCount(1);
      await chevron(page).click();
      expect(await at(page)).toBe('/');

      await openApp(page, tab);
      await hardwareBack(page);
      expect(await at(page)).toBe('/');
    });
  }

  test('leaves no ping-pong entry behind: Home then Back offers the exit', async ({ page }) => {
    await openApp(page, '/');
    await tab(page, 'letters').click();
    await chevron(page).click();
    expect(await at(page)).toBe('/');

    await hardwareBack(page);
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('back from a nested screen', () => {
  test('returns to the screen the learner came from', async ({ page }) => {
    await openApp(page, '/me');
    await page.getByRole('link', { name: copy('settings', 'privacy.title') }).click();
    expect(await at(page)).toBe('/me/privacy');

    await chevron(page).click();
    expect(await at(page)).toBe('/me');
  });

  test('uses the declared parent when deep-linked with no history of ours', async ({ page }) => {
    await openApp(page, '/me/privacy');
    await hardwareBack(page);
    expect(await at(page)).toBe('/me');
  });

  test('returns Learning activity to Home when that is where it was opened from', async ({
    page,
  }) => {
    /*
      Reached from the streak on Home and declared under `/me`. A reference
      screen keeps the pop, so the learner goes back where they were rather than
      to the tab the route happens to live in.
    */
    await openApp(page, '/');
    await page.getByTestId('home-streak').click();
    expect(await at(page)).toBe('/me/activity');

    await hardwareBack(page);
    expect(await at(page)).toBe('/');
  });
});

test.describe('back from a sitting', () => {
  test("Today's Vocabulary returns to Words, not to Home", async ({ page }) => {
    await openApp(page, '/words');
    await page.getByTestId('start-today').click();
    await page.getByTestId('placement-skip').click().catch(() => {});
    expect(await at(page)).toBe('/words/today');

    await hardwareBack(page);
    expect(await at(page)).toBe('/words');
  });

  test("Today's Vocabulary opened from a deep link still returns to Words", async ({ page }) => {
    await openApp(page, '/words/today');
    await page.getByTestId('placement-skip').click().catch(() => {});

    await hardwareBack(page);
    expect(await at(page)).toBe('/words');
  });

  test('a Numbers lesson returns to the Numbers course, then Letters, then Home', async ({
    page,
  }) => {
    await openApp(page, '/letters/numbers/num-lesson-sino-basics');
    await hardwareBack(page);
    expect(await at(page)).toBe('/letters/numbers');

    await hardwareBack(page);
    expect(await at(page)).toBe('/letters');

    await hardwareBack(page);
    expect(await at(page)).toBe('/');
  });
});

test.describe('a modal answers before the route does', () => {
  test('the exit dialog closes rather than navigating', async ({ page }) => {
    await openApp(page, '/');
    await hardwareBack(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    await hardwareBack(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await at(page)).toBe('/');
  });
});

test.describe('the browser’s own back and forward', () => {
  test('walk a stack of [Home, where they are] however many tabs were tapped', async ({ page }) => {
    await openApp(page, '/');
    await tab(page, 'words').click();
    await tab(page, 'review').click();

    /*
      The first tap leaves Home and pushes; the second replaces. So the stack is
      [Home, Review] and not [Home, Words, Review]: one browser Back reaches
      Home, with no Words entry in between to be walked through, and the learner
      is never one press from leaving the site.
    */
    await page.goBack();
    await waitForLaunch(page);
    expect(await at(page)).toBe('/');

    await page.goForward();
    await waitForLaunch(page);
    expect(await at(page)).toBe('/review');
  });

  test('the first tab tap does not replace Home, so Back stays inside the app', async ({ page }) => {
    /*
      Replacing on every tap was the first version of the tab rule, and it left
      a learner who had opened the app and tapped one tab a single browser Back
      from being off the product entirely.
    */
    await openApp(page, '/');
    await tab(page, 'letters').click();

    await page.goBack();
    await waitForLaunch(page);
    expect(await at(page)).toBe('/');
  });
});
