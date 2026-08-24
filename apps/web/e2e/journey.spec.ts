import { expect, test, type Page } from '@playwright/test';

import { waitForLaunch, openTodaysWords } from './helpers/launch';
import { CONTINUE, copy } from './helpers/copy';
import { drawScribble, traceReferenceGlyph } from './helpers/trace';

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

/**
 * The first lesson, always from its first letter.
 *
 * `?from=start` is load-bearing here, not decoration. A lesson now *resumes* at
 * the first letter the learner has not finished — §48 — and these specs share
 * one profile across a run, so without it a test asserting on ㅏ would pass
 * alone and fail after any earlier test had finished ㅏ. The resume behaviour
 * itself is asserted separately.
 */
const FIRST_LESSON = '/letters/lesson-vowels-core?from=start';

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
  /*
   * The explanation, and the unit's name exactly once.
   *
   * This used to assert an `<h2>` carrying the unit title. Eight of the twelve
   * units are named after their first lesson, and the session header already
   * shows the lesson — so on unit 1 the unit's name was on the screen twice,
   * forty vertical pixels apart. The heading is the copy that went; the
   * explanation it sat above is the thing this test is about, and it is still
   * here.
   *
   * The title is read from the bundle rather than written out. It used to be
   * written out, the twelve unit titles were then rewritten, and this case
   * failed on wording it was never about.
   */
  await expect(page.getByText('Hangul is an alphabet, not a set of pictures.')).toBeVisible();
  const unitName = copy('learning', 'units.unit-1.title');
  expect(
    (await page.locator('main').innerText()).split(unitName).length - 1,
    'the unit is named twice on one screen',
  ).toBe(1);
  await page.getByRole('button', { name: "Got it — let's start" }).click();

  // Then the letter itself — as the demonstration, which is the only glyph on
  // the screen now. There used to be a still one above it as well, so the same
  // ㅏ appeared twice and the animated one sat below the fold; the still is
  // gone and this is what took its place. It is an image with the letter in its
  // accessible name, because the shape is the content and text cannot carry it.
  await expect(
    page.getByRole('img', { name: /How ㅏ is written, in \d+ strokes?/ }).first(),
  ).toBeVisible();
  // It plays by itself on arrival, so the replay control is here for a second
  // look rather than being the way to get a first one.
  await expect(page.getByRole('button', { name: /Watch again|Pause/ })).toBeVisible();

  // A vowel's name is its sound, so it gets one row, labelled plainly; a
  // consonant gets two, because 기역 and 가 are different things to say and the
  // label has to keep them apart.
  await expect(page.getByRole('button', { name: /Play the pronunciation of/ })).toHaveCount(1);
  await expect(page.getByText('Sound', { exact: true })).toBeVisible();
  await expect(page.getByText('Name', { exact: true })).toHaveCount(0);

  // One line under it, and it is about the sound. The written-out description
  // of the stroke movement went with the still glyph: it narrated something the
  // learner had just watched happen, and a screen that answers "what does this
  // look like" three times over is what this lesson was reported for.
  await expect(page.getByText('like the a in "father"')).toBeVisible();
  await expect(
    page.getByText('First the long line down. Then the short line across.'),
  ).toHaveCount(0);
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

  /*
    What a wrong attempt says now: the verdict, and Try again.

    Three wordings have stood here. First a card with a headline — "Not quite",
    "Almost" — which a learner on their fourth attempt at ㄱ has read three times
    without being told anything they can act on. Then one actionable sentence
    ("write inside the box", "follow the guide"), which this test asserted on.
    Now neither: §15 asks for the verdict and the way to try again, and nothing
    else. A grader that explains itself is a grader talking about itself.
  */
  const failure = page.getByRole('status');
  await expect(failure).toBeVisible();
  await expect(failure).toContainText('Incorrect.');
  await expect(firstBox(page)).toHaveClass(/incorrect/);

  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('button', { name: 'Clear' }).click();

  await traceReferenceGlyph(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();

  /*
    And a correct one says two words.

    It said nothing at all for a while: the acceptance was announced to a screen
    reader and shown to nobody, on the reasoning that a sighted learner sees the
    box lock and the button appear. They do, and they were also entitled to be
    told. The same two words are on every screen in the product that has a
    verdict, which is what `common:verdict.*` is for.
  */
  await expect(firstBox(page)).toHaveClass(/correct/);
  await expect(page.getByRole('status')).toContainText('Correct.');
  await expect(page.getByText("That's it!")).toHaveCount(0);
});

test('a letter is written once, over a guide, and then read back', async ({ page }) => {
  /*
   * The whole lesson, and the step that is no longer in it.
   *
   * There used to be two writing steps — trace the model, then write it again
   * over a fainter copy of the same model — and this test used to assert that
   * the second was lighter than the first. §9 deleted that step, and it was not
   * replaced: the second attempt asked for the identical movement with less ink
   * on the paper, so the only thing it could measure was whether the learner
   * would do it twice.
   *
   * What survives is the property the learning model actually rests on: the
   * model is on the paper for the one attempt there is, and it is never taken
   * away.
   */
  const guideOpacity = () =>
    firstBox(page)
      .locator('canvas')
      .first()
      .evaluate((el) => Number(getComputedStyle(el).opacity));

  await page.goto(FIRST_LESSON);
  await startWriting(page);

  expect(await guideOpacity(), 'the writing step shows the character').toBeGreaterThan(0.2);

  await traceReferenceGlyph(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();

  // Straight to reading. Nothing offers a second, fainter go.
  await expect(page.getByRole('button', { name: /lighter guide/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try a question' }).click();

  // Reading: the same letter among its look-alikes.
  await expect(page.getByText('Which one makes this sound?')).toBeVisible();
  await page.getByRole('button', { name: 'Choose ㅏ' }).click();
  /*
   * The verdict, and not a restatement of it.
   *
   * This used to read "That is ㅏ", which tells somebody who has just tapped the
   * tile marked ㅏ that the answer is ㅏ. §16 removed the pattern everywhere it
   * appeared.
   */
  await expect(page.getByRole('status')).toContainText('Correct.');
});

test('no step ever presents an empty writing box, and nothing offers a fainter one', async ({
  page,
}) => {
  const guideOpacity = () =>
    firstBox(page)
      .locator('canvas')
      .first()
      .evaluate((el) => Number(getComputedStyle(el).opacity));

  await page.goto(FIRST_LESSON);
  await startWriting(page);
  expect(await guideOpacity(), 'the writing step shows the character').toBeGreaterThan(0);

  await traceReferenceGlyph(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();

  // No second writing step, and nothing offering a lighter guide to write over.
  await expect(page.getByRole('button', { name: /lighter guide/ })).toHaveCount(0);
  // And nothing anywhere offers to take the model away.
  await expect(page.getByRole('button', { name: /Show the character|hint/i })).toHaveCount(0);
});

test('My Learning has no practice-style choice to make', async ({ page }) => {
  /*
   * The regression guard for a setting that was deleted rather than defaulted.
   *
   * *Guided* and *Focused* chose between the full tracing model and a fainter
   * one. Both are gone: there is one guide, it is always on the paper, and a
   * learner four minutes into Hangul is not asked to decide how much help they
   * need before they have tried once.
   *
   * Asserted on the screen rather than on the settings object, because the
   * failure this catches is a card coming back — a preference that still exists
   * in a store and renders nowhere is a different, smaller problem.
   */
  await page.goto('/me');
  await expect(page.getByRole('button', { name: /^Guided/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Focused/ })).toHaveCount(0);
  await expect(page.getByText(/Practice style/i)).toHaveCount(0);
  await expect(page.getByText(/lighter guide/i)).toHaveCount(0);

  // The group itself stays — it is where the voice lives — and the voice is
  // what should lead it.
  await expect(page.getByRole('button', { name: /Female voice/i })).toBeVisible();
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
  await passStep(page, 'Try a question', false);
  await page.getByRole('button', { name: 'Choose ㅏ' }).click();
  /*
   * The verdict, and not a restatement of it.
   *
   * This used to read "That is ㅏ", which tells somebody who has just tapped the
   * tile marked ㅏ that the answer is ㅏ. §16 removed the pattern everywhere it
   * appeared.
   */
  await expect(page.getByRole('status')).toContainText('Correct.');

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

test('an interrupted lesson resumes at the letter that is unfinished', async ({ page }) => {
  /*
   * §48. Leaving at 5 / 6 and coming back to letter 1 throws away four minutes
   * of work and then asks for them again.
   *
   * Asserted by *identity* rather than by an index: the lesson is opened from
   * the start, its first letter is finished, and re-opening it without
   * `?from=start` must not show that letter again. Which letter comes second is
   * a curriculum decision and not this test's business.
   */
  await page.goto(FIRST_LESSON);
  await startWriting(page);
  const first = (await page.getByTestId('prompt-glyph').textContent())!.trim();
  expect(first).toBeTruthy();

  /*
   * The letter has to be *finished*, not merely written.
   *
   * Resume goes to the first letter that is not `learned`, and writing is one
   * rung of four — a letter that has been written and not read back is still
   * unfinished, and coming back to it is the correct behaviour rather than a
   * bug. So this walks the whole loop: the demonstration plays itself on the
   * way in, then write, then read it back.
   */
  await traceReferenceGlyph(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByRole('button', { name: 'Try a question' }).click();
  await page.getByRole('button', { name: `Choose ${first}` }).click();
  // The verdict, not the letter read back to somebody who just tapped it. §16.
  await expect(page.getByRole('status')).toContainText('Correct.');

  // Away, and back — without the restart parameter.
  await page.goto('/letters/lesson-vowels-core');
  await startWriting(page);
  await expect(page.getByTestId('prompt-glyph')).not.toHaveText(first);

  // …and starting over is still offered, as the secondary route it is.
  await page.goto(FIRST_LESSON);
  await startWriting(page);
  await expect(page.getByTestId('prompt-glyph')).toHaveText(first);
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
    // The shared verdict, the same two words every screen with one uses.
    await expect(page.getByRole('status'), `${face} failed an honest trace`).toContainText(
      'Correct.',
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

test('a word is met, then asked about — and never written', async ({ page }) => {
  /*
   * The vocabulary flow, end to end, and the thing it must not contain.
   *
   * This test used to walk a learner from the meeting card to a canvas and
   * grade their handwriting of every syllable. That whole path is gone: a
   * learner who draws 사과 has practised calligraphy, not Korean, and the letters
   * in it were already taught with their stroke order. What is asserted now is
   * the opposite of what was asserted then — that the pen never appears.
   */
  await openTodaysWords(page);

  // The meeting card: the word, its sound, its meaning, and the sentence it
  // lives in. Asserted by shape rather than by which word it is — which word
  // opens the day is a scheduling decision, and a test that pins it fails on
  // content edits that are working as intended.
  await expect(page.getByTestId('word-headword')).not.toBeEmpty();
  await expect(page.getByTestId('word-meaning')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: /Play the pronunciation of/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Example' })).toBeVisible();

  // No picture, anywhere. Vocabulary imagery was removed from the product: it
  // gave the meaning away before any Korean had been read. Asserted on the
  // *rendered page* rather than on the data, because an <img> a future
  // component reintroduces is exactly what this guards against.
  await expect(page.getByRole('img')).toHaveCount(0);

  // No pen, either — not on this screen and not on any screen after it.
  await expect(page.getByTestId('writing-canvas')).toHaveCount(0);

  /*
   * Walk on until a question arrives.
   *
   * Not "the next screen": the sitting *interleaves*, so a learner meets two or
   * three words before being asked about the first one. That gap is the whole
   * point — three questions about 엄마 in a row measure whether they can
   * remember the previous screen — so this steps past the meeting cards rather
   * than assuming a question follows the first of them.
   */
  for (let step = 0; step < 6; step += 1) {
    const meet = page.getByRole('button', { name: 'Got it' });
    if (!(await meet.count())) break;
    await meet.first().click();
    await expect(page.getByTestId('writing-canvas')).toHaveCount(0);
  }

  // What arrives is a question with options, answered by tapping.
  await expect(page.getByRole('group')).toBeVisible();
  await expect(page.getByTestId('writing-canvas')).toHaveCount(0);
});

test('a word session with no canvas anywhere in it', async ({ page }) => {
  // §35 asks for the whole application to be searched for vocabulary
  // handwriting. This walks a full sitting and asserts the canvas never
  // appears — the routes that used to reach it are gone, and this is what
  // notices if one comes back.
  await openTodaysWords(page);

  for (let step = 0; step < 12; step += 1) {
    await expect(page.getByTestId('writing-canvas')).toHaveCount(0);
    const meet = page.getByRole('button', { name: 'Got it' });
    if (await meet.count()) {
      await meet.first().click();
      continue;
    }
    const options = page.getByRole('group').locator('button:not([disabled])');
    if (!(await options.count())) break;
    await options.first().click();
    const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
    if (await next.count()) await next.first().click();
  }
});

test('the vocabulary opens on today, not on a catalogue', async ({ page }) => {
  /*
   * §22, which is the rule the whole screen was rebuilt around: the corpus is
   * behind the learning system and is never the interface. A learner arrives at
   * one number and one button.
   */
  await page.goto('/words');

  // The day's card, whichever state it is in. Earlier specs in the run may have
  // finished today's words, and a finished day offers "A little more" instead
  // of Start — asserting only on Start made this test depend on how much
  // studying the specs before it happened to do.
  const today = page.getByTestId('today-card');
  await expect(today).toBeVisible();
  await expect(today.getByRole('heading')).toBeVisible();
  await expect(
    today.getByRole('button', { name: /^(Start|Keep going|A little more)$/ }),
  ).toBeVisible();

  // No numbered grading, and no numbered sets, anywhere a learner browses.
  await expect(page.getByText(/^Level \d/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Set \d/ })).toHaveCount(0);
});

test('categories are a way to look something up, not the way in', async ({ page }) => {
  await page.goto('/words');

  // Below the day's card, and reachable.
  await expect(page.getByRole('heading', { name: /Browse by topic/ })).toBeVisible();
  const category = page.getByRole('link', { name: /Animals & Nature/ });
  await expect(category).toBeVisible();
  await category.click();

  // A reference view of the words themselves — no sets, no per-chunk progress,
  // and nothing that says the learner may not have these yet.
  await expect(page).toHaveURL(/\/words\/category\//);
  await expect(page.getByText(/^Not yet$/)).toHaveCount(0);
  await expect(page.getByTestId('writing-canvas')).toHaveCount(0);
});

test('a word can be found by typing what it means', async ({ page }) => {
  // The half of "find a word" that matters for a beginner: they know the
  // English long before they can type the Korean.
  await page.goto('/words');
  const search = page.getByRole('searchbox', { name: /Search the vocabulary/ });
  await search.fill('apple');
  await expect(page.getByText('사과').first()).toBeVisible();

  await search.fill('고양이');
  await expect(page.getByText('고양이').first()).toBeVisible();
});

test('a failed letter lands in review, and review is something you can do', async ({ page }) => {
  await page.goto(FIRST_LESSON);
  await startWriting(page);

  await drawScribble(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('status')).toBeVisible();

  await page.goto('/review');

  // The hub: one session to start, and the learner's own two lists under it.
  // The scheduler counts that used to sit here are gone — see `ReviewPage`.
  await expect(page.getByText('Review for you')).toBeVisible();
  await expect(page.getByTestId('hub-saved')).toBeVisible();
  await expect(page.getByTestId('hub-wrong')).toBeVisible();
  await page.getByRole('button', { name: 'Start review' }).click();

  // What the sitting asks is chosen by the scheduler from the weakest skill for
  // that letter, so the exercise type is not pinned here — what is pinned is
  // that a real question arrived and can be answered. See `domain/review.ts`.
  const prompt = page.locator('main p, main h1, main h2').first();
  await expect(prompt).toBeVisible();
  await expect(page.getByText(/1 \/ \d+/)).toBeVisible();
});

test('review never reports a number the session cannot deliver', async ({ page }) => {
  /*
   * §43 and §44, from the outside.
   *
   * The screen and the session are now handed the *same resolved plan*, so the
   * number on the button and the number of questions behind it cannot disagree.
   * Two cases, and both used to be wrong:
   *
   *   nothing due  →  the screen used to offer Start and then render "not found"
   *   n due        →  the count was a guess at what the session would contain
   */
  await page.goto('/review');
  await expect(page.getByText(/Nothing to review yet/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start review' })).toHaveCount(0);
});

test('the number on the review button is the number of questions behind it', async ({ page }) => {
  // Give the profile something to review, the quickest honest way.
  await page.goto(FIRST_LESSON);
  await startWriting(page);
  await drawScribble(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('status')).toBeVisible();

  await page.goto('/review');
  /*
   * Read the count from the card's own accessible text, not by parsing digits
   * out of it: at one exercise the copy is "One short exercise", because that
   * is what a plural form is for. A test that scraped `\d+` found nothing and
   * failed on the most ordinary case there is.
   */
  const promised = (await page.getByTestId('review-length').textContent()) ?? '';
  expect(promised).toMatch(/exercise/i);
  const count = /^one\b/i.test(promised.trim())
    ? 1
    : Number(promised.match(/\d+/)?.[0]);
  expect(count, `the review card reads "${promised}"`).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Start review' }).click();
  // The session counter names the same total — the plan's, not a second guess.
  await expect(page.getByText(`1 / ${count}`)).toBeVisible();
});

test('a review mode with nothing behind it cannot be pressed', async ({ page }) => {
  // §46. A brand-new profile has no letters, so Hangul writing review is empty
  // — and an empty mode is shown as empty rather than offered and apologised
  // for. This is the button that used to navigate into a dead end.
  await page.goto(FIRST_LESSON);
  await startWriting(page);
  await drawScribble(page, firstBox(page));
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('status')).toBeVisible();

  await page.goto('/review');
  for (const mode of ['Reading', 'Listening', 'Writing']) {
    const button = page.getByRole('button', { name: new RegExp(mode) });
    if (!(await button.count())) continue;
    const disabled = await button.first().isDisabled();
    const label = (await button.first().textContent()) ?? '';
    const zero = /\b0\b/.test(label);
    // Disabled exactly when it has nothing.
    expect(disabled, `${mode} reads "${label}"`).toBe(zero);
  }
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
  await expect(page.getByRole('status')).toContainText('Correct.');

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
  /*
   * After the launch screen, like every other test that drives input directly.
   *
   * It used to pass without waiting, because the router mounted behind the
   * splash and the skip link existed from the first frame. It does not any
   * more: the router waits for the corpus core so that no screen renders
   * against an empty curriculum (see `data/corpus.ts`), and until it mounts
   * there is nothing to tab to — which is correct, because until it mounts
   * there is nothing to skip *to* either.
   */
  await waitForLaunch(page);
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
  /*
   * The permissions line, asserted literally because *this* case is about what
   * the privacy screen says. It read "Notifications, and only if you turn the
   * daily reminder on" until the reminder was removed, at which point the
   * screen was naming a permission the package no longer declares.
   */
  await expect(page.getByText(/asks for no permissions at all/)).toBeVisible();
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

/**
 * The three lists a learner owns, and the one thing none of them may contain.
 *
 * Saved words, the wrong-answer notebook and review are deliberately separate
 * concepts (§41), and the way they go wrong is by quietly becoming each other —
 * so each is walked to its own screen and its own session here.
 */
test('a word can be saved, found again, and reviewed from its own list', async ({ page }) => {
  await openTodaysWords(page);
  const headword = await page.getByTestId('word-headword').textContent();
  expect(headword?.trim()).toBeTruthy();

  // Saving is on the meeting card, where a learner meets the word.
  await page.getByRole('button', { name: /Save|Saved/ }).first().click();

  await page.goto('/words/saved');
  await expect(page.getByRole('heading', { name: 'Saved words' })).toBeVisible();
  await expect(page.getByText(headword!.trim()).first()).toBeVisible();

  // Search finds it, by the Korean.
  await page.getByRole('searchbox', { name: /saved words/i }).fill(headword!.trim());
  await expect(page.getByText(headword!.trim()).first()).toBeVisible();
  await page.getByRole('searchbox', { name: /saved words/i }).fill('');

  // …and its detail opens, with everything the quiz screens leave out.
  await page.getByText(headword!.trim()).first().click();
  await expect(page).toHaveURL(/\/words\/word\//);
  await expect(page.getByTestId('detail-headword')).toHaveText(headword!.trim());
  // Romanisation, not "Pronunciation": the label changed with the notation
  // under it, from IPA to Revised Romanization. Asserted through its test id as
  // well as its label, so a rename of the heading cannot quietly take the
  // romanisation off the card with it.
  await expect(page.getByText('Romanisation')).toBeVisible();
  await expect(page.getByTestId('detail-romanization')).toBeVisible();
  // No pen here either, and no picture.
  await expect(page.getByTestId('writing-canvas')).toHaveCount(0);
  await expect(page.getByRole('img')).toHaveCount(0);
});

test('the saved list survives a restart, and a word can be taken off it', async ({
  page,
  context,
}) => {
  await openTodaysWords(page);
  const headword = (await page.getByTestId('word-headword').textContent())!.trim();
  await page.getByRole('button', { name: /Save|Saved/ }).first().click();

  // A fresh page over the same profile: what relaunching actually does.
  const reopened = await context.newPage();
  await page.close();
  await reopened.goto('/words/saved');
  await expect(reopened.getByText(headword).first()).toBeVisible();

  await reopened.getByRole('button', { name: 'Remove' }).first().click();
  await expect(reopened.getByText(headword)).toHaveCount(0);
  await reopened.close();
});

test('a wrong answer writes itself into the notebook', async ({ page }) => {
  /*
   * §35: the learner never saves a mistake. This answers questions wrongly on
   * purpose and then goes and looks, which is the only way to test a thing that
   * is supposed to happen without being asked for.
   */
  await openTodaysWords(page);

  let missed = 0;
  for (let step = 0; step < 24 && missed < 2; step += 1) {
    // Wait for the next screen to be one of the two things it can be, rather
    // than asking a freshly-navigated DOM what is on it — `count()` does not
    // auto-wait, and a React render lands after the click resolves.
    const meet = page.getByRole('button', { name: 'Got it' });
    const options = page.getByRole('group').locator('button:not([disabled])');
    await expect(meet.or(options).first()).toBeVisible();

    if (await meet.count()) {
      await meet.first().click();
      continue;
    }

    /*
     * Pick something, then ask the *option* whether it was wrong.
     *
     * By the class the component puts on a picked-and-incorrect choice, not by
     * the feedback text: the text is a translation and this walk should not
     * depend on which language the run happens to be in.
     */
    await options.first().click();

    /*
     * One press is not always a whole answer.
     *
     * A multiple-choice question is decided by the choice; *Put the word
     * together* is decided when the last syllable lands in the last slot, and
     * its tiles are in a `role="group"` too. Pressing once there fills one slot
     * and nothing else happens, so this walk used to stand in front of a
     * half-assembled 거짓말 waiting for a Next that only appears when the word
     * is finished. Keep pressing until the screen offers a way on.
     *
     * Whether the assembly is right does not matter. The subject of this test
     * is what the notebook does with a wrong *answer*, and the loop carries on
     * to the next question either way.
     */
    /*
     * "Next", "Next word" or "Finish".
     *
     * A choice question's Continue reads *Next*; a build question's reads *Next
     * word*, because there the next thing genuinely is a word and naming it is
     * better than not. An anchored `/^(Next|Finish)$/` matched neither of the
     * build screens and the walk stood in front of a finished question.
     */
    const next = page.getByRole('button', { name: CONTINUE });
    for (let press = 0; press < 5 && !(await next.count()); press += 1) {
      const remaining = page.getByRole('group').locator('button:not([disabled])');
      if (!(await remaining.count())) break;
      await remaining.first().click({ timeout: 2000 }).catch(() => {});
    }
    await expect(next.first()).toBeVisible();
    if (await page.locator('button[class*="wrong"]').count()) missed += 1;
    await next.first().click();
  }
  expect(missed, 'the walk has to get something wrong for this to mean anything').toBeGreaterThan(0);

  await page.goto('/review/mistakes');
  // The name the hub row uses. The screen used to call itself "Missed answers"
  // and be opened from a row reading "Wrong words" — one place, two names.
  await expect(page.getByRole('heading', { name: 'Wrong words' })).toBeVisible();
  await expect(page.getByText('Answer').first()).toBeVisible();

  // Filters, and a session built from the notebook.
  await page.getByRole('button', { name: 'Words' }).click();
  await expect(page.getByText('Answer').first()).toBeVisible();

  await page.getByRole('button', { name: /Review ·/ }).click();
  await expect(page).toHaveURL(/set=mistakes/);
  await expect(page.getByRole('group')).toBeVisible();
  // And it is a quiz, not a canvas.
  await expect(page.getByTestId('writing-canvas')).toHaveCount(0);
});

test('the notebook is empty, and says so, on a clean record', async ({ page }) => {
  await page.goto('/review/mistakes');
  await expect(page.getByText(/Nothing missed yet/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Review ·/ })).toHaveCount(0);
});
