import { expect, test, type Page } from '@playwright/test';

import { drawScribble, traceGlyphThoroughly, traceReferenceGlyph } from './helpers/trace';

/**
 * The journey a paying customer takes.
 *
 * ```
 * install ─▶ open ─▶ no login ─▶ hear the first letter ─▶ trace ─▶ fail
 *    ─▶ retry ─▶ pass ─▶ recognise ─▶ progress moves ─▶ learn a word
 *    ─▶ see the picture ─▶ hear it ─▶ write it ─▶ close ─▶ reopen
 *    ─▶ the progress is still there
 * ```
 *
 * Everything runs in English, because English is the default and a fresh
 * browser context has no stored preference. `locale.spec.ts` covers what
 * happens when the learner chooses otherwise.
 */

// Playwright gives each test its own browser context, so IndexedDB and
// localStorage already start empty. An addInitScript that cleared them would
// re-run on every navigation and wipe the progress these tests assert on.

const FIRST_LESSON = '/letters/lesson-vowels-core';

const firstBox = (page: Page) => page.getByTestId('writing-canvas').first();

async function waitForFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(firstBox(page).locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(300);
}

/**
 * Traces whatever guide is on screen, checks it, and takes the offered step.
 *
 * `andWait` is false for the transition into recognition, which is a
 * multiple-choice screen with no writing box to wait for.
 */
async function passStep(page: Page, next: string | RegExp, andWait = true) {
  await traceReferenceGlyph(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByRole('button', { name: next }).click();
  if (andWait) await waitForFonts(page);
}

/**
 * Walks past the unit explainer and the letter's introduction card.
 *
 * Both cards are conditional — a unit explainer is shown once, and a letter met
 * before goes straight to the box — so each step is probed rather than assumed.
 * The probe has to wait first. `isVisible()` does not auto-wait, and asking it
 * one tick after `goto` answers "no" for a card that is about to appear, which
 * skips a step the walk-through needed to take and strands it on the explainer.
 * Splitting the locale packs into lazily-loaded chunks added exactly that tick,
 * and turned an intermittent failure into a certain one.
 *
 * So each stage waits for *whichever* of the possible next things appears, then
 * acts on the one that did.
 */
async function startWriting(page: Page) {
  const unitCta = page.getByRole('button', { name: "Got it — let's start" });
  const introCta = page.getByRole('button', { name: /Trace it|Write it/ });

  await expect(unitCta.or(introCta).or(firstBox(page)).first()).toBeVisible();
  if (await unitCta.isVisible()) {
    await unitCta.click();
    await expect(introCta.or(firstBox(page)).first()).toBeVisible();
  }
  if (await introCta.isVisible()) await introCta.click();
  await waitForFonts(page);
}

test('home leads with the brand and then with the lesson', async ({ page }) => {
  await page.goto('/');

  // The real logo asset, not a text approximation of it.
  const logo = page.getByRole('img', { name: /Hangyul ganada/ });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', /brand\/logo-lockup\.png$/);

  // Streak on the same row, to its right, and no taller than the header.
  const streak = page.getByRole('link', { name: /learning record/i });
  await expect(streak).toBeVisible();
  const [logoBox, streakBox] = await Promise.all([logo.boundingBox(), streak.boundingBox()]);
  expect(logoBox && streakBox).toBeTruthy();
  expect(streakBox!.x).toBeGreaterThan(logoBox!.x + logoBox!.width);
  // Vertically centred on each other rather than merely both near the top.
  const logoMid = logoBox!.y + logoBox!.height / 2;
  const streakMid = streakBox!.y + streakBox!.height / 2;
  expect(Math.abs(logoMid - streakMid)).toBeLessThan(4);

  // The learning card starts immediately below — no greeting banner between.
  const cta = page.getByRole('button', { name: 'Start now' });
  const ctaBox = (await cta.boundingBox())!;
  expect(ctaBox.y).toBeLessThan(420);

  // And the page ends without a chasm above the navigation.
  const gap = await page.evaluate(() => {
    const scroller = document.querySelector('#main')!;
    scroller.scrollTop = scroller.scrollHeight;
    const nav = document.querySelector('nav')!.getBoundingClientRect().top;
    let lowest = 0;
    for (const el of scroller.querySelectorAll('*')) {
      if (el.children.length) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) lowest = Math.max(lowest, r.bottom);
    }
    return nav - lowest;
  });
  expect(gap).toBeLessThan(64);
});

test('a new customer can start learning with no account of any kind', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Hangyul ganada/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start now' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();

  // Nothing anywhere asks who they are.
  const wall = page.getByText(/sign in|log in|create an account|subscribe|upgrade/i);
  await expect(wall).toHaveCount(0);

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('the first lesson explains what Hangul is before asking for a stroke', async ({ page }) => {
  await page.goto(FIRST_LESSON);
  await expect(page.getByRole('heading', { level: 2, name: 'Six vowels to start' })).toBeVisible();
  await page.getByRole('button', { name: "Got it — let's start" }).click();

  // Then the letter itself. A vowel's name is its sound, so it gets one row,
  // labelled plainly; a consonant gets two, because 기역 and 가 are different
  // things to say and the label has to keep them apart.
  await expect(page.getByText('ㅏ', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Play the pronunciation of/ })).toHaveCount(1);
  await expect(page.getByText('Sound', { exact: true })).toBeVisible();
  await expect(page.getByText('Name', { exact: true })).toHaveCount(0);

  // And a writing instruction about *this* letter rather than about Korean
  // stroke order in general — the same sentence on every screen was the thing
  // a beginner learned to skip.
  await expect(page.getByText('First the long line down. Then the short line across.')).toBeVisible();
});

test('a consonant is introduced with its name and its sound, separately', async ({ page }) => {
  await page.goto('/letters/lesson-consonants-first');
  // ㄱ is *called* 기역 and *sounds* like the g in 가. A learner told only the
  // first will sound out 가 as "giyeok-a".
  await expect(page.getByText('Name', { exact: true })).toBeVisible();
  await expect(page.getByText('기역')).toBeVisible();
  // Not "Its sound — 가", which a beginner can only read as "ㄱ *is* 가".
  await expect(page.getByText('Hear ㄱ in')).toBeVisible();
  await expect(page.getByText('Its sound')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Play the pronunciation of/ })).toHaveCount(2);

  // One romanisation, in a sentence — not a bare "g / k" under the glyph and
  // then "between g and k" again underneath it.
  await expect(page.getByText('g / k')).toHaveCount(0);
  await expect(page.getByText(/Between g and k/)).toBeVisible();
});

test('a faithful trace passes and an obvious scribble fails', async ({ page }) => {
  await page.goto(FIRST_LESSON);
  await startWriting(page);

  await drawScribble(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();

  const failure = page.getByRole('status');
  await expect(failure).toBeVisible();
  await expect(failure).toContainText(/Not quite|Almost/);
  await expect(firstBox(page)).toHaveClass(/incorrect/);

  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('button', { name: 'Clear' }).click();

  await traceReferenceGlyph(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(page.getByRole('status')).toContainText("That's it!");
  await expect(firstBox(page)).toHaveClass(/correct/);
});

test('the guide gets lighter across the steps and never disappears', async ({ page }) => {
  // The property the whole learning model now rests on. A beginner cannot
  // reproduce a shape from an empty box, so there is no step that asks them to:
  // the second writing step is the same box with the model much fainter, and
  // "much fainter" and "gone" are the two things this test tells apart.
  const guideOpacity = () =>
    firstBox(page)
      .locator('canvas')
      .first()
      .evaluate((el) => Number(getComputedStyle(el).opacity));

  await page.goto(FIRST_LESSON);
  await startWriting(page);

  const full = await guideOpacity();
  expect(full, 'tracing shows the character plainly').toBeGreaterThan(0.2);

  await traceReferenceGlyph(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByRole('button', { name: /lighter guide/ }).click();
  await waitForFonts(page);

  const light = await guideOpacity();
  expect(light, 'practice still shows the character').toBeGreaterThan(0);
  expect(light, 'practice is lighter than tracing').toBeLessThan(full);

  await traceReferenceGlyph(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByRole('button', { name: 'Now read it' }).click();

  // Reading: the same letter among its look-alikes.
  await expect(page.getByText('Which one makes this sound?')).toBeVisible();
  await page.getByRole('button', { name: 'Choose ㅏ' }).click();
  await expect(page.getByRole('status')).toContainText('That is ㅏ');
});

test('no step, and no setting, ever presents an empty writing box', async ({ page }) => {
  // The rule stated as a rule. Walked in both practice styles, because a
  // setting that quietly reintroduced the blank box would be the same defect
  // wearing a different name.
  const guideOpacity = () =>
    firstBox(page)
      .locator('canvas')
      .first()
      .evaluate((el) => Number(getComputedStyle(el).opacity));

  for (const style of ['guided', 'focused'] as const) {
    await page.goto('/me');
    await page
      .getByRole('button', { name: style === 'guided' ? /^Guided/ : /^Focused/ })
      .click();

    await page.goto(FIRST_LESSON);
    await startWriting(page);
    expect(await guideOpacity(), `${style}: first writing step`).toBeGreaterThan(0);

    await traceReferenceGlyph(page, firstBox(page));
    await page.getByRole('button', { name: 'Check' }).click();
    const next = page.getByRole('button', { name: /lighter guide/ });
    if (await next.isVisible()) {
      await next.click();
      await waitForFonts(page);
      expect(await guideOpacity(), `${style}: second writing step`).toBeGreaterThan(0);
    }
  }

  // And nothing anywhere offers to take it away.
  await expect(page.getByRole('button', { name: /Show the character|hint/i })).toHaveCount(0);
});


test('undo and clear both work before checking', async ({ page }) => {
  await page.goto(FIRST_LESSON);
  await startWriting(page);

  await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();

  await traceReferenceGlyph(page, firstBox(page));
  await expect(page.getByRole('button', { name: 'Check' })).toBeEnabled();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Check' })).toBeEnabled();

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();
});

test('progress survives closing and reopening the app', async ({ page, context }) => {
  await page.goto(FIRST_LESSON);
  await startWriting(page);

  // The whole loop, so the letter actually reaches `learned` — a traced pass
  // alone is progress but not mastery, and the alphabet bar counts mastery.
  // The demonstration is one of the rungs, and it plays by itself on the way
  // in; waiting for it is what a learner does rather than something the test
  // has to arrange.
  await expect(page.getByRole('button', { name: 'Watch again' }).first()).toBeVisible();
  await page.waitForTimeout(2500);
  await passStep(page, /lighter guide/);
  await passStep(page, 'Now read it', false);
  await page.getByRole('button', { name: 'Choose ㅏ' }).click();
  await expect(page.getByRole('status')).toContainText('That is ㅏ');

  // Close every page in the context and open a fresh one — the same profile,
  // read back from IndexedDB rather than from anything in memory.
  const reopened = await context.newPage();
  await page.close();
  await reopened.goto('/letters');
  await expect(reopened.getByText('The Hangul alphabet')).toBeVisible();
  const meter = reopened.getByRole('progressbar', { name: /letters learned/ });
  await expect(meter).toHaveAttribute('aria-valuenow', /[1-9]\d*/);
  await reopened.close();
});

test('every practice typeface renders its own glyph, and grades against it', async ({ page }) => {
  // Six faces, and the choice has to reach the writing lesson rather than
  // relabelling a picker: each one must paint a *different* reference glyph,
  // and a faithful trace of whichever is showing must still pass.
  const faces = ['Standard', 'Sans Serif', 'Myeongjo', 'Traditional', 'Handwriting', 'Rounded'];
  const seen = new Set<string>();

  for (const face of faces) {
    await page.goto('/me');
    const option = page.getByRole('button', { name: new RegExp(`^${face}`) }).first();
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');

    await page.goto(FIRST_LESSON);
    await startWriting(page);
    await waitForFonts(page);

    // The ink in the guide canvas is what the evaluator builds its mask from.
    const ink = await firstBox(page)
      .locator('canvas')
      .first()
      .evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 20) count += 1;
        return count;
      });
    expect(ink, `${face} painted no reference glyph`).toBeGreaterThan(100);
    expect(seen.has(String(ink)), `${face} painted the same glyph as another face`).toBe(false);
    seen.add(String(ink));

    await traceReferenceGlyph(page, firstBox(page));
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByRole('status'), `${face} failed an honest trace`).toContainText(
      "That's it!",
    );
  }
});

test('the chosen typeface survives a restart', async ({ page, context }) => {
  await page.goto('/me');
  await page.getByRole('button', { name: /^Traditional/ }).first().click();
  await expect(page.getByRole('button', { name: /^Traditional/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const reopened = await context.newPage();
  await reopened.goto('/me');
  await expect(reopened.getByRole('button', { name: /^Traditional/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await reopened.close();
});

test('a word is met in context before it is written: word, sound, meaning, sentence, pen', async ({
  page,
}) => {
  await page.goto('/words/vocab-essentials-1');

  // The meeting card comes first: the word, its sound, its meaning, and the
  // sentence it lives in.
  //
  // Asserted by shape rather than by the word itself. Which word opens a lesson
  // is a curation decision — the first word has changed twice as the corpus was
  // reviewed — and a test that pins it fails on content edits that are working
  // as intended, which teaches everyone to ignore it.
  await expect(page.getByRole('button', { name: /Play the pronunciation of/ }).first()).toBeVisible();
  await expect(page.getByTestId('word-headword')).not.toBeEmpty();
  await expect(page.getByTestId('word-meaning')).not.toBeEmpty();

  // Real Korean context, before the pen. This is the ordering the whole word
  // screen was rebuilt around: a learner who writes 사과 without having seen it
  // used has practised calligraphy, not Korean.
  const example = page.getByRole('heading', { name: 'Example' });
  await expect(example).toBeVisible();

  // And no picture, anywhere. Vocabulary imagery was removed from the product:
  // it gave the meaning away before any Korean had been read. The assertion is
  // on the *rendered page* rather than on the data, because an <img> that a
  // future component reintroduces is exactly what this is guarding against.
  await expect(page.getByRole('img')).toHaveCount(0);

  await page.getByRole('button', { name: 'Practise writing' }).click();
  await waitForFonts(page);

  // One box on screen, whatever the word's length — and one check for the word
  // rather than one per syllable. The detail of that lives in
  // `word-writing.spec.ts`; here it only has to be the screen the pen step
  // actually leads to.
  await expect(page.getByTestId('writing-canvas')).toHaveCount(1);

  const parts = page.getByTestId('syllable-chip');
  const count = await parts.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    await parts.nth(i).click();
    await traceGlyphThoroughly(page, page.getByTestId('writing-canvas'));
  }

  await expect(page.getByTestId('check-word')).toHaveCount(1);
  await page.getByTestId('check-word').click();
  await expect(page.getByTestId('word-feedback-headline')).toHaveText('Nice work');
});

test('the vocabulary is browsed by what words are about, not by a level', async ({ page }) => {
  await page.goto('/words');

  // No numbered grading anywhere on the screen a learner browses.
  await expect(page.getByText(/^Level \d/)).toHaveCount(0);
  await expect(page.getByText(/study them in any order/)).toHaveCount(0);

  // Categories a learner can want, with how far through each one they are.
  await expect(page.getByRole('button', { name: /Animals & Nature/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Food & Drink/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /People & Family/ })).toBeVisible();
});

test('every word is open on a brand-new profile', async ({ page }) => {
  // The behaviour this replaces: level 1 open, everything else a padlock.
  await page.goto('/words');
  await page.getByRole('button', { name: /Animals & Nature/ }).click();

  // Nothing anywhere says the learner may not have this yet.
  await expect(page.getByText(/^Not yet$/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Learn them' })).toHaveCount(0);

  // The sets are links, not dead cards.
  const sets = page.getByRole('link', { name: /^Set \d/ });
  expect(await sets.count()).toBeGreaterThan(5);

  // A category needing letters the learner has not met says so — as a
  // heads-up, above a list that is open anyway.
  await expect(page.getByText(/new letters in this category/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Learn the letters' }).first()).toBeVisible();
});

test('a word set far past the learner opens and can be studied', async ({ page }) => {
  // Requires no prior lesson, no prior word, and no prior category.
  await page.goto('/words');
  await page.getByRole('button', { name: /Describing Things/ }).click();
  const late = page.getByRole('link', { name: /^Set/ }).nth(20);
  await expect(late).toBeVisible();
  await late.click();

  await expect(page).toHaveURL(/\/words\/vocab-/);
  // The word itself, not a "finish the previous lesson first" interstitial.
  await expect(page.getByRole('button', { name: /Practise writing/ })).toBeVisible();

  // And it is genuinely studiable from here: the pen, with no prerequisite met.
  await page.getByRole('button', { name: /Practise writing/ }).click();
  await waitForFonts(page);
  await expect(firstBox(page)).toBeVisible();
});

test('a word can be found by typing what it means', async ({ page }) => {
  // The half of "find a word" that matters for a beginner: they know the
  // English long before they can type the Korean.
  await page.goto('/words');
  await page.getByRole('searchbox', { name: /Search the vocabulary/ }).fill('apple');
  await expect(page.getByRole('link', { name: /사과/ }).first()).toBeVisible();

  await page.getByRole('searchbox', { name: /Search the vocabulary/ }).fill('고양이');
  await expect(page.getByRole('link', { name: /고양이/ }).first()).toBeVisible();
});

test('a failed letter lands in review, and review is something you can do', async ({ page }) => {
  await page.goto(FIRST_LESSON);
  await startWriting(page);

  await drawScribble(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('status')).toBeVisible();

  await page.goto('/review');

  // The dashboard, not a list of past mistakes. One button, and three counts a
  // learner can act on.
  await expect(page.getByText('Review for you')).toBeVisible();
  await expect(page.getByText('Needs practice')).toBeVisible();
  await page.getByRole('button', { name: 'Start review' }).click();

  // What the sitting asks is chosen by the scheduler from the weakest skill for
  // that letter, so the exercise type is not pinned here — what is pinned is
  // that a real question arrived and can be answered. See `domain/review.ts`.
  const prompt = page.locator('main p, main h1, main h2').first();
  await expect(prompt).toBeVisible();
  await expect(page.getByText(/1 \/ \d+/)).toBeVisible();
});

test('review never reports a number the session cannot deliver', async ({ page }) => {
  // The screen and the session read the same function, so "12 items" on the
  // dashboard and an empty sitting cannot disagree. A brand-new profile is the
  // case that used to get this wrong: a dashboard of zeroes.
  await page.goto('/review');
  await expect(page.getByText(/Nothing to review yet/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start review' })).toHaveCount(0);
});

test('settings offers two voices, and switching one persists', async ({ page }) => {
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: /Pronunciation voice/ })).toBeVisible();

  const male = page.getByRole('button', { name: /Male voice/ });
  await male.click();
  await expect(male).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('button', { name: /Male voice/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the licences that must be shown are shown, and nothing else is', async ({ page }) => {
  await page.goto('/me/legal');
  await expect(page.getByRole('heading', { name: 'Legal & Licences' })).toBeVisible();
  // The share-alike sources, which is what the licences actually oblige.
  await expect(page.getByText('English Wiktionary', { exact: true })).toBeVisible();
  await expect(page.getByText(/CC BY-SA 4.0/).first()).toBeVisible();
  await expect(page.getByText('OFL 1.1').first()).toBeVisible();
  // OpenMoji was the illustrations' source and is gone with them. Asserted as
  // absent rather than simply dropped from the list: a credit for an asset the
  // app no longer ships is a claim about the binary that is not true, and it
  // would survive unnoticed for years.
  await expect(page.getByText(/OpenMoji/i)).toHaveCount(0);
  // The speech engine's licence asks for nothing, so it is not named here.
  await expect(page.getByText(/Azure|Neural|TTS/i)).toHaveCount(0);
  // Nor is TOPIK, in either direction. This screen used to end with three
  // sentences explaining that the vocabulary order is not a TOPIK grade — a
  // disclaimer about levels the app stopped showing two cycles ago, on a page
  // opened to read a font licence. No licence asks for it and no visible claim
  // needs it, so raising the subject at all is the defect now.
  await expect(page.getByText(/TOPIK/i)).toHaveCount(0);
  await expect(page.getByText(/difficulty|ranking|순서에 대하여/i)).toHaveCount(0);
});

test('a learner is never told where a word came from', async ({ page }) => {
  // Provenance is kept for the build, the licence audit and content QA — and
  // taken out of the learning experience. A dictionary credit on a word card
  // reads as an admission that nobody wrote it.
  for (const route of ['/words', '/']) {
    await page.goto(route);
    await expect(page.getByText(/wiktionary|corpus|OpenSubtitles|dataset/i)).toHaveCount(0);
  }
});

test('resetting the learning record asks first, then actually clears it', async ({ page }) => {
  await page.goto(FIRST_LESSON);
  await startWriting(page);
  await traceReferenceGlyph(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('status')).toContainText("That's it!");

  await page.goto('/me');
  await page.getByRole('button', { name: 'Reset learning progress' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Reset', exact: true }).click();

  await page.goto('/letters');
  const meter = page.getByRole('progressbar', { name: /letters learned/ });
  await expect(meter).toHaveAttribute('aria-valuenow', '0');
});

test('nothing in the app sells anything', async ({ page }) => {
  for (const route of ['/', '/letters', '/words', '/review', '/me']) {
    await page.goto(route);
    await expect(
      page.getByText(/premium|subscription|free trial|upgrade now|TOPIK|payment/i),
    ).toHaveCount(0);
  }
});

test('the whole app is reachable by keyboard', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();

  await page.goto(FIRST_LESSON);
  await startWriting(page);
  await expect(page.getByRole('button', { name: /Undo/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Clear/ })).toBeVisible();
});

/**
 * The customer-facing settings screen, after the simplification.
 *
 * Asserted as absences, which is the only way to test a removal. Backup and
 * restore was a JSON file the learner exported, kept somewhere, and imported —
 * a developer's mental model of a consumer app, and the one feature on the
 * screen that could not be used without understanding what a file is. It is
 * gone, and so is every trace of it: no buttons, no file input, no format.
 *
 * The rest is the copy rule. Nothing a learner reads in ordinary settings
 * explains that there is no account, that there is no server, or what the
 * storage engine is. Those facts are true, they are in the privacy policy where
 * someone looking for them will find them, and they are not what a settings
 * screen is for.
 */
test('settings no longer asks a learner to manage files, or explains the architecture', async ({
  page,
}) => {
  await page.goto('/me');

  for (const gone of [/Save a copy/i, /Restore a copy/i, /Back ?up/i, /\bimport\b/i, /\bexport\b/i]) {
    await expect(page.getByText(gone), `settings still mentions ${gone}`).toHaveCount(0);
  }
  await expect(page.locator('input[type="file"]')).toHaveCount(0);

  for (const jargon of [/IndexedDB/i, /SQLite/i, /\bJSON\b/i, /\bdatabase\b/i, /\bserver\b/i, /no account/i]) {
    await expect(page.getByText(jargon), `settings still says ${jargon}`).toHaveCount(0);
  }
});

test('the privacy policy is one tap from settings, and the licences are still there', async ({
  page,
}) => {
  await page.goto('/me');
  await page.getByRole('link', { name: /Privacy/ }).click();
  await expect(page).toHaveURL(/\/me\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  // The commitments a store reviewer and a regulator both look for, in the
  // words the screen now uses: it answers the questions people actually have
  // rather than describing the product to them.
  await expect(page.getByText(/Nothing you do here leaves this device/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No ads, no tracking' })).toBeVisible();
  await expect(page.getByText(/There is no account/)).toBeVisible();
  await expect(page.getByText(/Notifications, and only if you turn the daily reminder on/)).toBeVisible();
  await expect(page.getByText(/Deleting the app deletes it with it/)).toBeVisible();
  // And nothing about how any of it is implemented.
  await expect(page.getByText(/IndexedDB|SQLite|service worker/i)).toHaveCount(0);

  await page.goto('/me');
  await page.getByRole('link', { name: /Legal & Licences/ }).click();
  await expect(page).toHaveURL(/\/me\/legal$/);
});

test('the settings screen leads with what the learner has done, not with what is left', async ({
  page,
}) => {
  await page.goto('/me');
  for (const label of ['Letters learned', 'Words learned', 'Study days']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  // The catalogue size was the largest number a beginner saw on this screen.
  await expect(page.getByText(/2,581|2581/)).toHaveCount(0);
  await expect(page.getByText('Sessions', { exact: true })).toHaveCount(0);
});
