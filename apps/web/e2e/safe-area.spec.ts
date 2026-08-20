import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The regression fixture for a bug a physical phone found and this suite did not.
 *
 * A Samsung running the ㄱ lesson photographed the orange **Write it** button
 * (labelled *Trace it* at the time)
 * with its bottom third underneath Android's three-button navigation bar. Every
 * automated check passed: the browser has no navigation bar to be underneath,
 * `document.scrollHeight` was fine, and the emulator's WebView happened to be
 * old enough that Capacitor inset the whole view and published a zero.
 *
 * ```
 *      what the browser saw            what the phone did
 *   ┌──────────────────────┐        ┌──────────────────────┐
 *   │                      │        │                      │
 *   │   [    Trace it   ]  │        │   [    Trace it   ]  │
 *   │                      │        │▓▓▓▓▓◀ ● ▶ ▓▓▓▓▓▓▓▓▓▓│  ← the bottom of
 *   └──────────────────────┘        └──────────────────────┘    the button is
 *          PASS                            BROKEN                in there
 * ```
 *
 * So these tests do the one thing the old ones did not: they publish a system
 * inset the way the native layer does, and then ask whether a control a
 * customer has to press ends **above** the usable bottom of the viewport.
 *
 * `--hg-native-safe-bottom` is exactly the variable `HangyulInsetsPlugin`
 * writes onto the document element, so setting it here drives the same code
 * path a device drives. 48 CSS px is Android's three-button bar; 24 is a
 * gesture handle; 0 is a desktop browser and an older WebView.
 */

/** Android three-button navigation: the tallest bottom inset a phone reports. */
const THREE_BUTTON = 48;
/** A gesture handle. Short, and still enough to clip a button's corners. */
const GESTURE = 24;

const FIRST_LESSON = '/letters/lesson-vowels-core';
const FIRST_CONSONANTS = '/letters/lesson-consonants-first';

/**
 * Publishes a system inset before the app paints, as the native side does.
 *
 * `addInitScript` rather than an `evaluate` after load, so the very first frame
 * is laid out with the inset in place — a layout that is only correct after a
 * reflow is a layout that flashes a button into the navigation bar on a real
 * device.
 */
async function withSystemInset(page: Page, bottom: number, top = 24) {
  await page.addInitScript(
    ([bottomPx, topPx]) => {
      // An init script runs before the document has an element to style, so the
      // listener is registered first and the immediate attempt is the optional
      // one. Getting that order wrong sets nothing at all, silently — which is
      // how this helper spent its first run publishing no inset and passing
      // every assertion in the file.
      const apply = () => {
        const root = document.documentElement;
        if (!root) return;
        root.style.setProperty('--hg-native-safe-bottom', `${bottomPx}px`);
        root.style.setProperty('--hg-native-safe-top', `${topPx}px`);
      };
      document.addEventListener('DOMContentLoaded', apply);
      apply();
    },
    [bottom, top],
  );
}

/**
 * Resolves one of the safe-area variables to a number of CSS pixels.
 *
 * Not by reading the custom property. A custom property's computed value is an
 * unevaluated token stream, so `getPropertyValue('--hg-safe-bottom')` hands back
 * the literal string `max(48px, 0px)` and `parseFloat` of that is `NaN` — which
 * quietly becomes 0 and turns every assertion below into one that cannot fail.
 * That is the same class of mistake as the bug being tested, so the value is
 * measured instead: give an element that height and ask the layout how tall it
 * came out.
 */
async function resolveInset(page: Page, name: string): Promise<number> {
  return page.evaluate((property) => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;top:-9999px;width:1px;height:var(${property});`;
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  }, name);
}

/**
 * The bottom of the viewport a control may actually occupy.
 *
 * Not `innerHeight`. That is the whole window including the strip the operating
 * system draws its navigation into, and measuring against it is precisely the
 * mistake that let this ship.
 */
async function usableBottom(page: Page): Promise<number> {
  const inset = await resolveInset(page, '--hg-safe-bottom');
  return (await page.evaluate(() => window.innerHeight)) - inset;
}

/** Asserts a control is fully on screen and fully clear of the system's strip. */
async function expectClearOfSystemBars(page: Page, control: Locator, name: string) {
  await expect(control, `${name} is on screen`).toBeVisible();
  const box = await control.boundingBox();
  expect(box, `${name} has a box`).not.toBeNull();
  const limit = await usableBottom(page);
  const top = await resolveInset(page, '--hg-safe-top');
  // Both edges: the whole control, corners included, not merely its midpoint.
  expect(Math.round(box!.y + box!.height), `${name} ends above the navigation bar`).toBeLessThanOrEqual(
    Math.round(limit),
  );
  expect(Math.round(box!.y), `${name} starts below the status bar`).toBeGreaterThanOrEqual(
    Math.round(top),
  );
}

async function openFirstConsonant(page: Page) {
  await page.goto(FIRST_CONSONANTS);
  const unitCta = page.getByRole('button', { name: "Got it — let's start" });
  const introCta = page.getByRole('button', { name: /Trace it|Write it/ });
  await expect(unitCta.or(introCta).first()).toBeVisible();
  if (await unitCta.isVisible()) await unitCta.click();
  await expect(introCta).toBeVisible();
}

test.describe('system-bar bounds', () => {
  test('the harness can see the inset it is asserting against', async ({ page }) => {
    // Guards the guard. If this reads 0 while a 48 px inset is published, every
    // other test in this file is passing vacuously — which is exactly how a
    // suite ends up green next to a broken phone.
    await withSystemInset(page, THREE_BUTTON);
    await page.goto(FIRST_LESSON);
    expect(await resolveInset(page, '--hg-safe-bottom')).toBe(THREE_BUTTON);
    expect(await resolveInset(page, '--hg-safe-top')).toBe(24);
  });

  test('the ㄱ lesson’s Write it button clears a three-button navigation bar', async ({
    page,
  }) => {
    await withSystemInset(page, THREE_BUTTON);
    await openFirstConsonant(page);

    // The exact screen from the physical-device screenshot: the consonant
    // lesson, the demonstration on screen, the orange call to action at the
    // foot of it.
    await expect(page.getByText('기역')).toBeVisible();
    await expectClearOfSystemBars(
      page,
      page.getByRole('button', { name: /Trace it|Write it/ }),
      'Write it',
    );
  });

  test('and clears a gesture bar, and a viewport with no inset at all', async ({ page }) => {
    for (const inset of [GESTURE, 0]) {
      const context = await page.context().browser()!.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      });
      const fresh = await context.newPage();
      await withSystemInset(fresh, inset);
      await openFirstConsonant(fresh);
      await expectClearOfSystemBars(
        fresh,
        fresh.getByRole('button', { name: /Trace it|Write it/ }),
        `Write it at ${inset}px`,
      );
      await context.close();
    }
  });

  test('the unit explainer’s Got it button clears it too', async ({ page }) => {
    await withSystemInset(page, THREE_BUTTON);
    await page.goto(FIRST_LESSON);
    await expectClearOfSystemBars(
      page,
      page.getByRole('button', { name: "Got it — let's start" }),
      "Got it — let's start",
    );
  });

  test('and so does Check, at every scroll position of the writing step', async ({ page }) => {
    await withSystemInset(page, THREE_BUTTON);
    await page.goto(FIRST_LESSON);
    await page.getByRole('button', { name: "Got it — let's start" }).click();
    await page.getByRole('button', { name: /Trace it|Write it/ }).click();

    const check = page.getByRole('button', { name: 'Check' });
    await expectClearOfSystemBars(page, check, 'Check');

    // The interesting half. Check used to scroll with the canvas, and anything
    // that scrolls can be scrolled to the bottom edge of the screen — which on
    // a phone is where Android draws its buttons. It is in the footer row now,
    // so scrolling the lesson to its end must not move it at all.
    const before = (await check.boundingBox())!.y;
    await page.evaluate(() => {
      const scroller = document.querySelector('main > div > div');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    await expectClearOfSystemBars(page, check, 'Check after scrolling to the end');
    expect((await check.boundingBox())!.y).toBe(before);
  });

  test('a long screen can be scrolled to its very last line', async ({ page }) => {
    await withSystemInset(page, THREE_BUTTON);
    await page.goto('/letters/sounds');

    const last = page.locator('main p').last();
    await last.scrollIntoViewIfNeeded();
    const box = await last.boundingBox();
    const limit = await usableBottom(page);
    // Not merely "on screen" — readable, with its descenders clear of the bar.
    expect(Math.round(box!.y + box!.height)).toBeLessThanOrEqual(Math.round(limit));
  });

  test('the bottom navigation keeps its tabs above the bar', async ({ page }) => {
    await withSystemInset(page, THREE_BUTTON);
    await page.goto('/');
    // The nav's *background* may reach the bottom edge — that is the point of
    // an edge-to-edge layout. Its last tappable row may not.
    await expectClearOfSystemBars(page, page.getByRole('link', { name: /Home/ }), 'Home tab');
  });

  test('a modal’s last action stays above the bar', async ({ page }) => {
    /*
     * Opened from Settings rather than from the vocabulary screen.
     *
     * This used to open the Words screen's category picker, a sheet of eighteen
     * rows. That picker is gone — vocabulary is no longer browsed by choosing a
     * category before studying — and what is being tested was never the picker
     * anyway: it is `ui/Modal`, which every sheet and dialog in the app shares,
     * and specifically whether its last tappable row clears the system
     * navigation bar. The reset confirmation is the same component with its
     * action row at the bottom, and it is reachable in two taps.
     */
    await withSystemInset(page, THREE_BUTTON);
    await page.goto('/me');
    const opener = page.getByRole('button', { name: /Reset|Clear/ }).last();
    await expect(opener).toBeVisible();
    await opener.scrollIntoViewIfNeeded();
    await opener.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The modal's ground reaches the bottom edge of the screen, as an
    // edge-to-edge surface should. The last row a thumb can hit does not.
    const rows = dialog.getByRole('button');
    await rows.last().scrollIntoViewIfNeeded();
    await expectClearOfSystemBars(page, rows.last(), 'last row of the modal');
  });

  test('the footer action is the last tab stop, and focusing it does not move it', async ({
    page,
  }) => {
    await withSystemInset(page, THREE_BUTTON);
    await openFirstConsonant(page);

    const cta = page.getByRole('button', { name: /Trace it|Write it/ });
    const before = (await cta.boundingBox())!;

    // Tab order follows the DOM, and the footer is the last row of the grid, so
    // the one action that leaves this screen is the last thing a keyboard or a
    // switch reaches — after the replay control and the two speaker buttons,
    // not before them.
    const stops: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active === document.body) return null;
        return (active.getAttribute('aria-label') || active.textContent || '').trim();
      });
      // Tab wraps back to the document once it runs out of controls, so the
      // first cycle is the whole of this screen's focus order.
      if (stop === null) break;
      stops.push(stop);
    }

    expect(stops).toEqual([
      'Skip to main content',
      'Back',
      // The demonstration is the first thing on the screen now — the still
      // glyph that used to sit above it is gone — so it is the first thing
      // reached, which is the order a sighted learner sees it in. It autoplays,
      // so the replay control reads Pause at this moment; it is the same button.
      expect.stringMatching(/Watch again|Pause/),
      'Play the pronunciation of 기역',
      'Play the pronunciation of 가',
      expect.stringMatching(/Trace it|Write it/),
    ]);

    // Focusing it must not have scrolled it: a pinned footer that jumps when a
    // switch user reaches it is a pinned footer in name only.
    await cta.focus();
    const after = (await cta.boundingBox())!;
    expect(after.y).toBe(before.y);
    await expectClearOfSystemBars(page, cta, 'Write it while focused');
  });

  test('enlarged system text does not push the action into the bar', async ({ page }) => {
    await withSystemInset(page, THREE_BUTTON);
    // What Android's Font size slider does to a WebView: the root font size
    // grows and every rem-based size grows with it.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.fontSize = '20px';
      });
    });
    await openFirstConsonant(page);
    await expectClearOfSystemBars(
      page,
      page.getByRole('button', { name: /Trace it|Write it/ }),
      'Write it at 125% text',
    );
  });
});
