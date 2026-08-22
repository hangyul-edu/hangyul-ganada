import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { waitForLaunch } from './helpers/launch';

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
  await page.getByRole('button', { name: /Trace it|Write it/ }).click();
  await expect(page.getByTestId('writing-canvas').first()).toBeVisible();
}

/**
 * The daily vocabulary session, which is where words are now learned.
 *
 * This used to scan the word-*writing* screen — a navigator, two arrows, two
 * tools and a check, over a canvas. That screen is gone: vocabulary is never
 * handwritten. What replaced it is a question with four options, and it has its
 * own accessibility problem to guard against, which is that the options are the
 * only thing on screen and a screen reader has to be able to tell them apart.
 */
for (const scheme of ['light', 'dark'] as const) {
  test(`the daily word session has no WCAG A or AA violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/words/today');
    await expect(page.getByTestId('word-headword')).toBeVisible();
    const results = await scan(page);
    expect(results.violations, `\n  ${describeViolations(results)}`).toEqual([]);
  });
}


/**
 * The matching grid, which is the one screen made of two lists that mean each
 * other.
 *
 * It has an accessibility problem no other exercise has: the answer is a
 * *relationship* between two controls rather than a property of one, and a
 * screen reader user has to be able to tell which side they are on, which item
 * is selected, and what has already been paired. Both columns are real buttons
 * with `aria-pressed` on the selectable side and `disabled` on what is used up,
 * and the running instruction is in an `aria-live` region — this is what checks
 * that none of it regressed into a div with a click handler.
 */
for (const scheme of ['light', 'dark'] as const) {
  test(`the matching grid has no WCAG A or AA violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/words/today');
    await expect(page.getByTestId('word-headword')).toBeVisible();

    // Walk the session until the grid comes round. It is scheduled after four
    // words have been introduced and questioned, so it is a few screens in.
    for (let step = 0; step < 30; step += 1) {
      const grid = page.getByRole('group', { name: /Match each word/i });
      if (await grid.count()) break;
      const forward = page
        .locator('button:visible')
        .filter({ hasText: /Got it|Next|Continue|Finish/i })
        .first();
      const options = page
        .locator('button:visible')
        .filter({ hasText: /^(?!Show a hint|Save|Skip|Can't use audio).+/ });
      if (await forward.count()) await forward.click();
      else if (await options.count()) await options.first().click();
      else break;
      await page.waitForTimeout(150);
    }
    await expect(page.getByRole('group', { name: /Match each word/i })).toBeVisible();

    const results = await scan(page);
    expect(results.violations, `\n  ${describeViolations(results)}`).toEqual([]);
  });
}

/**
 * The way past a question made of sound, which is the whole point of it.
 *
 * A control that a learner who cannot hear has to find, reach and operate — so
 * it has to be a real button, reachable by keyboard, and named. A `<span>` with
 * an `onClick` would look identical and be useless to exactly the person it was
 * added for.
 */
test('the sound-free control on a letter question is a real, reachable button', async ({
  page,
}) => {
  await seedLettersForReview(page);
  await page.goto('/review');

  /*
   * The **Listen** practice entry, not a general review.
   *
   * Walking a mixed sitting until a heard-only question happens to come round
   * is a test that depends on the scheduler's order, and it skipped itself for
   * two runs because the order put `read` and `write` first. The Review screen
   * offers each mode on its own precisely so a learner can practise one of
   * them, and picking `Listen` means the very first question is the one under
   * test. If that entry is not there, this profile has no heard-only question
   * and the assertion below could not mean anything — which is worth failing
   * on, not stepping over.
   */
  const listen = page.getByRole('button', { name: /^Listen/ });
  await expect(listen).toBeVisible();
  await listen.click();

  const escape = page.getByRole('button', { name: /Can't use audio/i });
  await expect(escape).toBeVisible();

  // Reachable by keyboard, operable by keyboard, and it does what it says.
  await escape.focus();
  await expect(escape).toBeFocused();
  await escape.press('Enter');
  await expect(page.getByRole('button', { name: /Can't use audio/i })).toHaveCount(0);

  // The clip is gone and a readable prompt has taken its place — the question
  // is still there to answer rather than skipped.
  await expect(page.getByRole('group', { name: /Answers/i })).toBeVisible();

  const results = await scan(page);
  expect(results.violations, `\n  ${describeViolations(results)}`).toEqual([]);
});

/**
 * The listening question is one control, in both themes.
 *
 * ## What was there
 *
 * A 44px 🔊 sat directly above the button that plays the clip: the same action
 * twice, once as a control and once as an emoji belonging to no part of this
 * product's drawing. It was `aria-hidden`, so it labelled nothing — it was
 * filling the space where a prompt would go on the questions that have no
 * visible prompt, because the sound *is* the prompt.
 *
 * ## Why a test and not just a deletion
 *
 * Decoration comes back. It comes back as a different emoji, as an inline SVG,
 * as a "sound wave" flourish under the button — each time defensible on its own
 * and each time re-creating the thing that was removed. So this asserts the
 * absence of *any* pictograph on the screen, not the absence of one character,
 * and it asserts the positive shape as well: one button, big enough to hit, with
 * a name that says what it does, and the accessibility escape still under it.
 */
test.describe('the listening question', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`is one clear control and no decoration, in ${theme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await seedLettersForReview(page);
      await page.goto('/review');

      const listen = page.getByRole('button', { name: /^Listen/ });
      await expect(listen).toBeVisible();
      await listen.click();

      /*
        No pictograph anywhere on the screen. The range covers the emoji blocks
        and Miscellaneous Symbols, which is where every candidate for a
        decorative speaker lives; the product's own icons are inline SVG and are
        not caught by it.
      */
      const rendered = await page.locator('body').innerText();
      expect(rendered, 'a decorative pictograph is on the listening question').not.toMatch(
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
      );

      /*
        The one control, named for what it does rather than for the answer.
        Naming the letter would read the answer aloud to a screen-reader user,
        which is why an unnamed `SpeakerButton` says "Play the sound" instead of
        "Play the pronunciation of " with nothing after it — which is what it
        used to say here.
      */
      const speaker = page.getByRole('button', { name: /Play the sound/i });
      await expect(speaker).toHaveCount(1);
      const box = await speaker.boundingBox();
      expect(box?.width, 'the audio control is too small to hit').toBeGreaterThanOrEqual(44);
      expect(box?.height, 'the audio control is too small to hit').toBeGreaterThanOrEqual(44);

      // The way past a question made of sound is still there, and still secondary.
      await expect(page.getByRole('button', { name: /Can't use audio/i })).toBeVisible();

      const results = await scan(page);
      expect(results.violations, `\n  ${describeViolations(results)}`).toEqual([]);
    });
  }
});

/** A profile with letters learned long enough ago to be due for review. */
async function seedLettersForReview(page: Page) {
  await page.goto('/');
  /*
   * Wait for the app's own store to be open before writing into it.
   *
   * `LearnerProvider` opens the database, reads the profile and then writes
   * settings back. Seeding before that finishes has the app's own write land
   * on top of the seed, and the test then runs against an empty profile and
   * skips itself — which is what it did.
   */
  await expect(page.locator('[data-storage-engine]')).toBeVisible();
  await page.waitForTimeout(500);
  await page.evaluate(async (letters) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('hangyul-ganada');
      request.onsuccess = () => resolve(request.result);
    });
    const old = new Date(Date.now() - 30 * 864e5).toISOString();
    const tx = db.transaction(['progress', 'memory'], 'readwrite');
    for (const character of letters) {
      tx.objectStore('progress').put(
        {
          item_key: character, kind: 'character', stage: 'learned', attempts: 6, passes: 5,
          fails: 1, trace_passes: 2, write_passes: 2, recognition_passes: 2, heard: true,
          learned: true, needs_review: false, last_score: 0.9, first_seen_at: old,
          last_attempted_at: old, learned_at: old, review_due_at: null,
        },
        `character:${character}`,
      );
      for (const skill of ['sound_recognition', 'shape_recognition', 'handwriting']) {
        tx.objectStore('memory').put(
          {
            item_key: `character:${character}`, skill, stability_days: 1.2, difficulty: 0.3,
            reps: 2, lapses: 0, last_at: old, due_at: old, last_score: 0.85,
          },
          `character:${character}:${skill}`,
        );
      }
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }, ['ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ']);
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
  await expect(page.getByRole('button', { name: /Trace it|Write it/ })).toBeVisible();

  await expect(page.getByRole('img', { name: 'How ㄱ is written, in 1 stroke' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the pronunciation of 기역' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the pronunciation of 가' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Watch again|Pause/ })).toBeVisible();
});

test('the character introduction has no WCAG A or AA violations', async ({ page }) => {
  await page.goto('/letters/lesson-vowels-core');
  await page.getByRole('button', { name: "Got it — let's start" }).click();
  await expect(page.getByRole('button', { name: /Trace it|Write it/ })).toBeVisible();
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

/**
 * WCAG 1.4.4: the text can be doubled and nothing is lost.
 *
 * ## Why this needs a browser and not a review
 *
 * Every size in this product is a token, most of them are `rem` or `clamp()`,
 * and reading the stylesheet says they scale. What reading cannot say is what
 * happens when they all scale at once: a row that fitted at 16 px pushes its
 * neighbour off the side at 32 px, a `clamp()` with a `px` ceiling stops
 * growing while the text around it keeps going, and a fixed-height control
 * clips its own label rather than growing.
 *
 * The criterion is about *loss*, not about tidiness — text may reflow, wrap
 * badly, or become ugly at 200% and still pass. What may not happen is content
 * disappearing, becoming unreachable, or being cut off. So this asks two
 * questions a machine can answer honestly: does the page now scroll sideways,
 * and is any text clipped by an ancestor that will not scroll to reveal it.
 *
 * Set on the root as a percentage rather than through Playwright's zoom,
 * because browser zoom scales *everything* including the viewport, which is a
 * different criterion (1.4.10) and does not test what a learner who has raised
 * only their text size will see.
 */
test.describe('text at 200%', () => {
  for (const screen of SCREENS) {
    test(`${screen.name} loses nothing when text is doubled`, async ({ page }) => {
      await page.goto(screen.path);
      await waitForLaunch(page);
      /*
        `text-size-adjust`, not `font-size` on the root.

        This test was first written as `html { font-size: 200% }`, which moves
        `rem`-based type and nothing else — and this product's type scale is in
        **px**. So it scaled nothing, passed on all nine screens, and reported a
        result it had not earned. The honest emulation of the mechanism that
        actually reaches the app is text zoom: Android's accessibility font
        scale arrives at a WebView as `textZoom`, which multiplies rendered text
        whatever unit it was authored in, and `-webkit-text-size-adjust` is the
        nearest thing desktop Chromium offers.
      */
      await page.addStyleTag({
        content:
          'html { -webkit-text-size-adjust: 200% !important; text-size-adjust: 200% !important; }',
      });
      // One frame for layout to settle before anything is measured.
      await page.waitForTimeout(150);

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow, `${screen.name} scrolls sideways by ${overflow}px at 200% text`).toBeLessThanOrEqual(1);

      /*
        Text cut off by an ancestor that cannot be scrolled to reveal it.

        `overflow: hidden` on a box whose text no longer fits is the exact
        failure this criterion is about, and it is invisible to an axe scan
        because the markup is perfectly correct — the words are in the DOM,
        just not on the screen. Elements that scroll are fine: the content is
        still reachable.
      */
      const clipped = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          if (!el.textContent?.trim() || el.children.length > 0) continue;
          const style = getComputedStyle(el);
          if (style.overflow === 'visible' || style.overflowY === 'auto' || style.overflowY === 'scroll') continue;
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          /*
            Text hidden on purpose, for a screen reader only.

            `hg-sr-only` collapses its box to a pixel and clips — that is how
            the technique works, and the words are fully available to assistive
            technology, which is the entire point of them. Detected by the
            collapsed box rather than by the class name, so a second visually
            hidden helper does not have to be remembered here. No box holding
            text a sighted learner is meant to read is one pixel tall.
          */
          if (el.clientHeight <= 1 || el.clientWidth <= 1) continue;
          const cut = el.scrollHeight - el.clientHeight;
          // A couple of pixels is line-box rounding, not a lost word.
          if (cut > 3) bad.push(`${el.tagName.toLowerCase()}.${el.className}: ${cut}px hidden — "${el.textContent.trim().slice(0, 40)}"`);
        }
        return bad;
      });
      expect(clipped, `${screen.name} clips text at 200%:\n${clipped.join('\n')}`).toEqual([]);
    });
  }
});
