import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The accessibility audit, run against the app rather than asserted about it.
 *
 * ## Why axe, and why on every screen
 *
 * Accessibility work that lives in review comments decays: someone adds a
 * button without a name, nobody notices for four releases, and the person who
 * finds out is a learner using a screen reader. axe-core checks the rules that
 * can be checked mechanically — names, roles, contrast, labels, landmark
 * structure, heading order — and it checks them on the rendered DOM, which is
 * the only place they are true.
 *
 * It cannot check the things that matter most: whether the reading order makes
 * sense, whether a hint is announced at the right moment, whether the writing
 * canvas is usable at all without sight. Those are covered by the explicit
 * assertions at the end of this file and by the design decisions the components
 * document. This suite is the floor, not the ceiling.
 *
 * ## Which rules
 *
 * WCAG 2.1 A and AA. That is the level the app claims and the level the stores
 * ask about, so anything below it is a defect rather than an aspiration.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * The one pair this product ships knowingly below AA.
 *
 * White on #FF6700 measures **2.91:1**. AA asks 4.5:1 of normal text and 3:1 of
 * large text, so a white label on the brand orange clears neither — and no
 * colour at that hue clears 4.5:1 against white either, so a product whose
 * primary really is #FF6700 cannot have an AA-contrasting label on it. The
 * choice is between the brand and the threshold, and the brand is the whole
 * design system: every filled orange control on the reference artboards carries
 * a white label, and a dark label on brand orange reads as a disabled button.
 *
 * So it is allowed, once, by exact colour pair — and written down, with the
 * measured number, rather than being hidden by switching the contrast rule off.
 * Everything else the rule finds is a defect and fails the suite. The same
 * statement appears in `docs/report.md` and in the store accessibility notes,
 * because a known gap that is only known to the test suite is not disclosed.
 */
const BRAND_CONTRAST_EXCEPTION = /foreground color: #ffffff, background color: #ff6700/i;

function isBrandException(node: { any?: Array<{ message?: string }> }): boolean {
  const checks = node.any ?? [];
  return checks.length > 0 && checks.every((check) => BRAND_CONTRAST_EXCEPTION.test(check.message ?? ''));
}

async function scan(page: Page) {
  /*
   * Park the pointer before measuring.
   *
   * A `click()` leaves the mouse where it clicked, and the safe action footer
   * puts consecutive primary buttons in the same place — so after tapping "Got
   * it, let's start" the pointer is sitting on "Trace it" and the audit reads
   * its *hover* colour. `--hg-primary-hover` is a different orange from
   * `--hg-primary`, so the one allowed exception below stops matching and a
   * transient pointer state is reported as a defect on a screen nobody is
   * touching. What is being audited is the screen at rest.
   */
  await page.mouse.move(0, 0);
  // `document.fonts.ready` next: contrast is measured on rendered text, and a
  // fallback face can have different metrics and a different rendered weight.
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return {
    ...results,
    violations: results.violations
      .map((violation) =>
        violation.id === 'color-contrast'
          ? { ...violation, nodes: violation.nodes.filter((node) => !isBrandException(node)) }
          : violation,
      )
      .filter((violation) => violation.nodes.length > 0),
  };
}

function describeViolations(results: Awaited<ReturnType<typeof scan>>) {
  return results.violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join('\n    ')}`,
    )
    .join('\n  ');
}

const SCREENS: Array<{ name: string; path: string }> = [
  { name: 'home', path: '/' },
  { name: 'letters', path: '/letters' },
  { name: 'words', path: '/words' },
  { name: 'review', path: '/review' },
  { name: 'activity', path: '/activity' },
  { name: 'settings', path: '/me' },
  { name: 'privacy', path: '/me/privacy' },
  { name: 'legal', path: '/me/legal' },
  { name: 'language', path: '/me/language' },
];

/**
 * Every screen, in both appearances.
 *
 * Dark mode is a second palette, which means a second set of contrast pairs and
 * a second chance to get one of them wrong. Auditing only the light theme would
 * certify half the product. `emulateMedia` is how the dark palette is reached
 * without a stored preference: the token sheet follows the device when the
 * learner has not chosen, which is the default every new install is in.
 */
for (const scheme of ['light', 'dark'] as const) {
  for (const screen of SCREENS) {
    test(`${screen.name} has no WCAG A or AA violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(screen.path);
      const results = await scan(page);
      expect(results.violations, `\n  ${describeViolations(results)}`).toEqual([]);
    });
  }
}

/**
 * Opens the first lesson and walks to the writing box.
 *
 * A lesson starts on the unit introduction and then the character
 * introduction; the canvas is two taps in. Scanning the URL alone would audit
 * the intro screen and report the canvas as clean without ever rendering it.
 */
async function openWritingBox(page: Page) {
  await page.goto('/letters/lesson-vowels-core');
  // `click()` auto-waits; `isVisible()` does not, and asking it before React
  // has rendered returns false and silently skips the step.
  await page.getByRole('button', { name: "Got it — let's start" }).click();
  await page.getByRole('button', { name: /Trace it/ }).click();
  await expect(page.getByTestId('writing-canvas').first()).toBeVisible();
}

/**
 * The word-writing screen, in both appearances.
 *
 * Two taps in, like the letter canvas — and, unlike it, not covered by the
 * screen list above at all until this cycle. It is the screen with the most
 * controls on it: a navigator, two arrows, two tools and a check, over a
 * canvas, on the smallest viewport the product supports.
 */
for (const scheme of ['light', 'dark'] as const) {
  test(`writing a word has no WCAG A or AA violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/words/vocab-society-13');
    await page.getByRole('button', { name: 'Practise writing' }).click();
    await expect(page.getByTestId('word-writing')).toBeVisible();
    const results = await scan(page);
    expect(results.violations, `\n  ${describeViolations(results)}`).toEqual([]);
  });
}

/**
 * What a screen reader is handed on the first screen of the first lesson.
 *
 * Written after an actual TalkBack session on the emulator, which is where the
 * plural bug this asserts on was found: the demonstration announced itself as
 * *"How ㄱ is written, in 1 strokes"*, because the label was one string with a
 * number interpolated into it rather than a plural. Nothing on screen showed it
 * — the visible caption underneath was already pluralised and read "1 stroke" —
 * so it was audible only, to the people who could least afford it.
 */
test('the character introduction reads correctly to a screen reader', async ({ page }) => {
  // Unit 2 has no explainer — only units 1, 3 and 11 do — so this lesson opens
  // straight on the letter.
  await page.goto('/letters/lesson-consonants-first');
  await expect(page.getByRole('button', { name: /Trace it/ })).toBeVisible();

  await expect(page.getByRole('img', { name: 'How ㄱ is written, in 1 stroke' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the pronunciation of 기역' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the pronunciation of 가' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Watch again|Pause/ })).toBeVisible();
});

test('the character introduction has no WCAG A or AA violations', async ({ page }) => {
  await page.goto('/letters/lesson-vowels-core');
  await page.getByRole('button', { name: "Got it — let's start" }).click();
  await expect(page.getByRole('button', { name: /Trace it/ })).toBeVisible();
  const results = await scan(page);
  expect(results.violations, `\n  ${describeViolations(results)}`).toEqual([]);
});

test('a writing session has no WCAG A or AA violations', async ({ page }) => {
  // The screen with the canvas on it, which is the one a mechanical checker is
  // least likely to have been run against and most likely to need it.
  await openWritingBox(page);
  const results = await scan(page);
  expect(results.violations, `\n  ${describeViolations(results)}`).toEqual([]);
});

/**
 * The things axe cannot see.
 *
 * Each of these is a decision the product made about a learner who cannot see
 * the screen, or cannot use a pointer, and each would pass an automated audit
 * while being unusable.
 */
test.describe('what an automated check cannot tell', () => {
  test('every screen can be reached and operated from the keyboard alone', async ({ page }) => {
    await page.goto('/');
    // Tab until something whose destination is /letters has focus, then
    // activate it. A navigation built from divs and click handlers would pass
    // axe and fail here, which is the point of asking.
    await expect(page.locator('a[href$="/letters"]').first()).toBeVisible();
    let reached = false;
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const href = await page.evaluate(() =>
        (document.activeElement as HTMLAnchorElement | null)?.getAttribute('href'),
      );
      if (href && href.endsWith('/letters')) {
        reached = true;
        break;
      }
    }
    expect(reached, 'the letters tab was never reachable by keyboard').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/letters/);
  });

  test('the writing canvas announces what it is for, and what has been written', async ({
    page,
  }) => {
    // A canvas is opaque to assistive technology: it has no children and no
    // text. Two things make it usable — a name that says which character this
    // box is for, and a live region that says how many strokes are in it, since
    // a learner who cannot see the ink has no other way to know it arrived.
    await openWritingBox(page);
    const box = page.getByTestId('writing-canvas').first();

    const named = box.getByRole('img');
    const label = await named.first().getAttribute('aria-label');
    expect(label, 'the writing area needs an accessible name').toBeTruthy();
    expect(label, 'the name should say which character').toMatch(/[ㄱ-ㅎㅏ-ㅣ가-힣]/);

    const live = box.locator('[aria-live]');
    await expect(live, 'strokes need announcing as they are drawn').toHaveCount(1);
    await expect(live).toHaveAttribute('aria-live', 'polite');
  });

  test('the interface language is announced to assistive technology', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', /\w/);
    await expect(page.locator('html')).toHaveAttribute('dir', /ltr|rtl/);
  });

  test('Korean is marked as Korean wherever it appears in another language', async ({ page }) => {
    // Without `lang="ko"` a screen reader in English reads 사과 as a string of
    // unpronounceable characters, or silently skips it. Checked on the screens
    // that actually put Korean in front of an English-reading learner.
    for (const path of ['/letters', '/words']) {
      await page.goto(path);
      await expect(page.locator('[lang="ko"]').first()).toBeVisible();
    }
  });
});
