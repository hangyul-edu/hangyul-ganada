import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { drawScribble, traceGlyphThoroughly } from './helpers/trace';

/**
 * Writing a multi-syllable Korean word.
 *
 * ## Why this file exists
 *
 * The mobile visual QA that ran before it reported no horizontal page scrolling
 * and no shell overflow — and it was right, and the screen was still broken.
 * Four syllable boxes sat in a row that scrolled *inside* the page, so
 * `document.scrollWidth` never grew and half the controls were off the edge of
 * the phone anyway.
 *
 * So the assertions here are on **elements**, not on the document: every control
 * a learner has to reach is measured against the viewport it is supposed to be
 * inside. A page that does not scroll sideways is not the same claim as a
 * button you can tap.
 */

// --- the words under test -----------------------------------------------------

/**
 * Lessons chosen for the length of the word they open on.
 *
 * A lesson opens on its first word, so it is the first word that has to be the
 * right length. These are fixed rather than derived because deriving them means
 * re-implementing the curriculum's chunking here, and a second copy of that
 * rule would be free to disagree with the first. Every test asserts the length
 * of the word it actually got, so curation moving a word says so plainly
 * instead of quietly testing something else.
 */
const CASES = {
  two: { id: 'vocab-essentials-3', syllables: 2 },
  three: { id: 'vocab-essentials-7', syllables: 3 },
  /** 기도하다 — the word from the bug report, and the first word of its set. */
  four: { id: 'vocab-society-13', syllables: 4, word: '기도하다' },
};

/**
 * The longest word the product actually ships, read from the built corpus.
 *
 * Read rather than assumed: "the longest word" is a fact about the data, and
 * the layout has to survive whatever that turns out to be. If curation ever
 * admits a 5-syllable entry, `the longest word fits` starts exercising it
 * without anyone editing this file — and `covers the longest words shipped`
 * fails, which is the prompt to add a case for it.
 */
function longestShippingLength(): number {
  const path = fileURLToPath(new URL('../src/data/generated/vocabulary.json', import.meta.url));
  const corpus = JSON.parse(readFileSync(path, 'utf8')) as { words: { word: string }[] };
  return Math.max(...corpus.words.map((w) => [...w.word].length));
}

// --- helpers -----------------------------------------------------------------

async function openWriting(page: Page, lessonId: string) {
  await page.goto(`/words/${lessonId}`);
  await page.getByRole('button', { name: 'Practise writing' }).click();
  await expect(page.getByTestId('word-writing')).toBeVisible();
}

const canvas = (page: Page) => page.getByTestId('writing-canvas');
const chips = (page: Page) => page.getByTestId('syllable-chip');
const check = (page: Page) => page.getByTestId('check-word');
/** The ink surface — it carries the accessible name naming the syllable. */
const inkSurface = (page: Page) => canvas(page).getByRole('img');

/**
 * Waits for the syllable-change animation to finish.
 *
 * The box fades and travels a few pixels in on each syllable change, so a
 * position measured straight after navigating is a position mid-flight.
 * Anything asserting where the box *is* has to let it arrive first.
 */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

/** Writes every syllable of the word, leaving the learner on the last one. */
async function writeEverySyllable(page: Page, { scribble }: { scribble?: number[] } = {}) {
  const count = await chips(page).count();
  for (let i = 0; i < count; i += 1) {
    await chips(page).nth(i).click();
    await expect(canvas(page)).toBeVisible();
    if (scribble?.includes(i)) await drawScribble(page, canvas(page));
    else await traceGlyphThoroughly(page, canvas(page));
  }
}

/**
 * Asserts an element sits fully inside the viewport's horizontal bounds.
 *
 * This is the assertion the old suite did not have. `document.scrollWidth` is
 * blind to a control clipped by an inner scroll container; a bounding box is
 * not.
 */
async function expectHorizontallyInside(page: Page, target: Locator, name: string) {
  await expect(target, `${name} should be visible`).toBeVisible();
  const box = await target.boundingBox();
  expect(box, `${name} has no box`).not.toBeNull();
  const width = page.viewportSize()!.width;
  // A half-pixel of slack for sub-pixel layout rounding, and no more.
  expect(box!.x, `${name} is cut off on the left`).toBeGreaterThanOrEqual(-0.5);
  expect(
    box!.x + box!.width,
    `${name} is cut off on the right (viewport ${width}px)`,
  ).toBeLessThanOrEqual(width + 0.5);
  expect(box!.width, `${name} has collapsed to nothing`).toBeGreaterThan(0);
}

/** Every control the learner has to be able to see and reach. */
async function expectEveryControlInside(page: Page) {
  await expectHorizontallyInside(page, page.getByTestId('word-title'), 'word title');
  await expectHorizontallyInside(page, canvas(page), 'active canvas');
  await expectHorizontallyInside(page, page.getByTestId('syllable-previous'), 'Previous arrow');
  await expectHorizontallyInside(page, page.getByTestId('syllable-next'), 'Next arrow');
  await expectHorizontallyInside(page, page.getByTestId('undo'), 'Undo');
  await expectHorizontallyInside(page, page.getByTestId('clear'), 'Clear');
  await expectHorizontallyInside(page, check(page), 'whole-word Check');

  const count = await chips(page).count();
  for (let i = 0; i < count; i += 1) {
    await expectHorizontallyInside(page, chips(page).nth(i), `syllable chip ${i + 1}`);
  }

  // The page itself must also not have grown a sideways scrollbar.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'the page scrolls horizontally').toBeLessThanOrEqual(1);
}

// --- layout ------------------------------------------------------------------

const PHONES = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone X', width: 375, height: 812 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone 14 Pro Max', width: 430, height: 932 },
];

test.describe('the word writing screen fits the phone it is on', () => {
  for (const phone of PHONES) {
    test(`${phone.name} (${phone.width}×${phone.height}) — 기도하다`, async ({ page }) => {
      await page.setViewportSize({ width: phone.width, height: phone.height });
      await openWriting(page, CASES.four.id);

      await expect(page.getByTestId('word-title')).toHaveText(CASES.four.word);
      await expectEveryControlInside(page);

      // The check button is the one that used to end up under the system bar.
      await expect(check(page)).toBeInViewport();
    });
  }

  // Two, three and four syllables, each on the smallest phone supported.
  for (const [name, testCase] of Object.entries(CASES)) {
    test(`a ${testCase.syllables}-syllable word (${name}) fits at 375×667`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await openWriting(page, testCase.id);

      const title = await page.getByTestId('word-title').innerText();
      // Says so loudly if curation moved the word this case was chosen for.
      expect(
        [...title].length,
        `${testCase.id} now opens on "${title}", not a ${testCase.syllables}-syllable word`,
      ).toBe(testCase.syllables);

      await expect(chips(page)).toHaveCount(testCase.syllables);
      await expectEveryControlInside(page);
    });
  }

  test('the cases cover the longest words the vocabulary ships', async ({ page }) => {
    const longest = longestShippingLength();
    const covered = Math.max(...Object.values(CASES).map((c) => c.syllables));
    expect(
      covered,
      `the corpus now ships ${longest}-syllable words; the longest case here is ${covered}`,
    ).toBeGreaterThanOrEqual(longest);

    // And that longest length genuinely fits on the smallest phone.
    await page.setViewportSize({ width: 375, height: 667 });
    await openWriting(page, CASES.four.id);
    await expectEveryControlInside(page);

    // The heading must not have been rescued by wrapping between syllables —
    // 기도하 / 다 is a different word from the one on the page.
    const lines = await page.getByTestId('word-title').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getClientRects().length;
    });
    expect(lines, 'the word broke across lines').toBeLessThanOrEqual(1);
  });

  test('desktop smoke', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWriting(page, CASES.four.id);
    await expectEveryControlInside(page);
    await expect(canvas(page)).toHaveCount(1);
  });

  test('touch targets are big enough to hit', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openWriting(page, CASES.four.id);

    const targets: [string, Locator][] = [
      ['Previous', page.getByTestId('syllable-previous')],
      ['Next', page.getByTestId('syllable-next')],
      ['syllable chip', chips(page).first()],
    ];
    for (const [name, target] of targets) {
      const box = (await target.boundingBox())!;
      expect(box.width, `${name} is too narrow to tap`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${name} is too short to tap`).toBeGreaterThanOrEqual(44);
    }
  });
});

// --- navigation ---------------------------------------------------------------

test.describe('moving between the syllables of a word', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('only one canvas is on screen, and it opens on the first syllable', async ({ page }) => {
    await openWriting(page, CASES.four.id);

    await expect(canvas(page)).toHaveCount(1);
    await expect(chips(page)).toHaveCount(4);
    // 기, not a scroll offset into the middle of the word.
    await expect(chips(page).first()).toHaveAttribute('aria-current', 'step');
    await expect(inkSurface(page)).toHaveAttribute('aria-label', /기/);
  });

  test('the arrows step one syllable at a time', async ({ page }) => {
    await openWriting(page, CASES.four.id);

    await expect(page.getByTestId('syllable-previous')).toBeDisabled();
    await page.getByTestId('syllable-next').click();
    await expect(chips(page).nth(1)).toHaveAttribute('aria-current', 'step');
    await expect(inkSurface(page)).toHaveAttribute('aria-label', /도/);

    await page.getByTestId('syllable-previous').click();
    await expect(chips(page).first()).toHaveAttribute('aria-current', 'step');

    // The far end stops rather than wrapping.
    for (let i = 0; i < 3; i += 1) await page.getByTestId('syllable-next').click();
    await expect(chips(page).nth(3)).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('syllable-next')).toBeDisabled();
  });

  test('a syllable can be tapped directly', async ({ page }) => {
    await openWriting(page, CASES.four.id);

    await chips(page).nth(3).click();
    await expect(inkSurface(page)).toHaveAttribute('aria-label', /다/);
    await chips(page).nth(1).click();
    await expect(inkSurface(page)).toHaveAttribute('aria-label', /도/);
  });

  test('a swipe beside the box turns the page', async ({ page }) => {
    await openWriting(page, CASES.four.id);
    const stage = (await page.getByTestId('carousel-stage').boundingBox())!;
    const frame = (await page.getByTestId('canvas-frame').boundingBox())!;

    // Started in the gutter between the stage edge and the paper — a place the
    // learner cannot be writing.
    const y = stage.y + stage.height / 2;
    const from = frame.x - 6;
    await page.mouse.move(from, y);
    await page.mouse.down();
    await page.mouse.move(from - 120, y, { steps: 12 });
    await page.mouse.up();

    // Exactly one syllable, not several.
    await expect(chips(page).nth(1)).toHaveAttribute('aria-current', 'step');
  });

  test('a horizontal stroke inside the box never turns the page', async ({ page }) => {
    await openWriting(page, CASES.four.id);
    await expect(chips(page).first()).toHaveAttribute('aria-current', 'step');

    const box = (await canvas(page).locator('canvas').first().boundingBox())!;
    const y = box.y + box.height / 2;

    // ㅡ, drawn right across the box — the exact gesture a swipe detector would
    // claim. Three times, in both directions, well past any sane threshold.
    for (const [x0, x1] of [
      [box.x + box.width * 0.08, box.x + box.width * 0.92],
      [box.x + box.width * 0.92, box.x + box.width * 0.08],
      [box.x + box.width * 0.05, box.x + box.width * 0.95],
    ]) {
      await page.mouse.move(x0, y);
      await page.mouse.down();
      await page.mouse.move(x1, y, { steps: 16 });
      await page.mouse.up();
    }

    // Still on 기, and the ink is on the paper.
    await expect(chips(page).first()).toHaveAttribute('aria-current', 'step');
    await expect(inkSurface(page)).toHaveAttribute('aria-label', /기/);
    await expect(page.getByTestId('undo')).toBeEnabled();
  });

  test('writing survives leaving a syllable and coming back', async ({ page }) => {
    await openWriting(page, CASES.four.id);

    await traceGlyphThoroughly(page, canvas(page));
    await expect(chips(page).first()).toHaveAttribute('data-status', 'drafted');

    await page.getByTestId('syllable-next').click();
    // A fresh syllable starts empty — the previous one's ink did not follow.
    await expect(page.getByTestId('undo')).toBeDisabled();

    await page.getByTestId('syllable-previous').click();
    // ...and 기's ink is still there.
    await expect(page.getByTestId('undo')).toBeEnabled();
    await expect(chips(page).first()).toHaveAttribute('data-status', 'drafted');
  });

  test('rapid navigation loses neither the index nor the ink', async ({ page }) => {
    await openWriting(page, CASES.four.id);
    await traceGlyphThoroughly(page, canvas(page));

    for (let i = 0; i < 6; i += 1) {
      await page.getByTestId('syllable-next').click();
      await page.getByTestId('syllable-previous').click();
    }
    await chips(page).nth(3).click();
    await chips(page).nth(0).click();

    await expect(chips(page).first()).toHaveAttribute('aria-current', 'step');
    await expect(chips(page)).toHaveCount(4);
    await expect(page.getByTestId('undo')).toBeEnabled();
  });

  test('undo and clear touch only the syllable on screen', async ({ page }) => {
    await openWriting(page, CASES.four.id);

    await traceGlyphThoroughly(page, canvas(page));
    await page.getByTestId('syllable-next').click();
    await traceGlyphThoroughly(page, canvas(page));

    await page.getByTestId('clear').click();
    // 도 is empty again...
    await expect(page.getByTestId('undo')).toBeDisabled();
    await expect(chips(page).nth(1)).toHaveAttribute('data-status', 'empty');
    // ...and 기 was not touched.
    await expect(chips(page).first()).toHaveAttribute('data-status', 'drafted');
    await page.getByTestId('syllable-previous').click();
    await expect(page.getByTestId('undo')).toBeEnabled();
  });
});

// --- one check, one result -----------------------------------------------------

test.describe('checking the whole word', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('there is exactly one check action for a four-syllable word', async ({ page }) => {
    await openWriting(page, CASES.four.id);

    // Not one per syllable, on any syllable.
    for (let i = 0; i < 4; i += 1) {
      await chips(page).nth(i).click();
      await expect(check(page)).toHaveCount(1);
      await expect(page.getByRole('button', { name: /^Check/ })).toHaveCount(1);
    }
  });

  test('check waits until every part has been written', async ({ page }) => {
    await openWriting(page, CASES.four.id);
    await expect(check(page)).toBeDisabled();

    for (let i = 0; i < 3; i += 1) {
      await chips(page).nth(i).click();
      await traceGlyphThoroughly(page, canvas(page));
      // Three of four written is still not a word.
      await expect(check(page)).toBeDisabled();
    }

    await chips(page).nth(3).click();
    await traceGlyphThoroughly(page, canvas(page));
    await expect(check(page)).toBeEnabled();
  });

  test('writing every part well passes the word once', async ({ page }) => {
    await openWriting(page, CASES.four.id);
    await writeEverySyllable(page);

    await check(page).click();

    const feedback = page.getByTestId('word-feedback');
    await expect(feedback).toHaveCount(1);
    await expect(page.getByTestId('word-feedback-headline')).toHaveText('Nice work');
    // Every syllable passed, and none of them announced itself separately.
    await expect(page.getByTestId('word-feedback-item')).toHaveCount(4);
    await expect(feedback.locator('[data-status="needsWork"]')).toHaveCount(0);
    await expect(page.getByTestId('word-feedback-fix')).toHaveCount(0);

    // One way onward, into the reading step the word flow ends with.
    await page.getByTestId('word-feedback-continue').click();
    await expect(page.getByTestId('word-feedback')).toHaveCount(0);
  });

  test('a partly wrong word names the parts, keeps the good ones, and jumps to a fix', async ({
    page,
  }) => {
    await openWriting(page, CASES.four.id);
    // 기 and 도 traced properly; 하 and 다 scribbled.
    await writeEverySyllable(page, { scribble: [2, 3] });

    await check(page).click();

    // One result, not four.
    await expect(page.getByTestId('word-feedback')).toHaveCount(1);
    await expect(page.getByTestId('word-feedback-headline')).toHaveText('Almost there');
    await expect(page.getByTestId('word-feedback-summary')).toContainText('2 parts');

    const items = page.getByTestId('word-feedback-item');
    await expect(items.nth(0)).toHaveAttribute('data-status', 'passed');
    await expect(items.nth(1)).toHaveAttribute('data-status', 'passed');
    await expect(items.nth(2)).toHaveAttribute('data-status', 'needsWork');
    await expect(items.nth(3)).toHaveAttribute('data-status', 'needsWork');

    // The advice is a sentence, not a score or an internal reason name.
    const advice = await items.nth(2).innerText();
    expect(advice).not.toMatch(/\d+\s*%|mismatch|threshold|outside|incomplete|mixed/i);

    // Fix goes straight to that syllable, with its writing still there.
    await page.getByTestId('word-feedback-fix').first().click();
    await expect(page.getByTestId('word-feedback')).toHaveCount(0);
    await expect(inkSurface(page)).toHaveAttribute('aria-label', /하/);
    await expect(page.getByTestId('undo')).toBeEnabled();

    // The two good syllables are still good; only two need doing again.
    await expect(chips(page).nth(0)).toHaveAttribute('data-status', 'passed');
    await expect(chips(page).nth(1)).toHaveAttribute('data-status', 'passed');
    await expect(chips(page).nth(2)).toHaveAttribute('data-status', 'needsWork');

    // And there is still exactly one check action, now offering another go.
    await expect(check(page)).toHaveCount(1);
    await expect(check(page)).toHaveText(/Check again/);
  });

  test('repairing only the failed parts passes the word', async ({ page }) => {
    await openWriting(page, CASES.four.id);
    await writeEverySyllable(page, { scribble: [2, 3] });
    await check(page).click();
    await page.getByTestId('word-feedback-fix').first().click();

    // Only 하 and 다 are rewritten. 기 and 도 are never touched again.
    for (const i of [2, 3]) {
      await chips(page).nth(i).click();
      await page.getByTestId('clear').click();
      await traceGlyphThoroughly(page, canvas(page));
    }

    await check(page).click();
    await expect(page.getByTestId('word-feedback-headline')).toHaveText('Nice work');
  });

  test('a word that passes waits to be left rather than leaving on its own', async ({ page }) => {
    await openWriting(page, CASES.four.id);
    await writeEverySyllable(page);
    await check(page).click();

    // The success state is a moment, not a transition. Auto-advancing on the
    // verdict replaced it with the next screen before it could be read.
    await expect(page.getByTestId('word-feedback-headline')).toHaveText('Nice work');
    await expect(page.getByTestId('word-writing')).toBeVisible();

    // Dismissing the sheet still leaves the learner on the finished word, with
    // one way onward.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('word-feedback')).toHaveCount(0);
    await expect(page.getByTestId('word-continue')).toBeVisible();
    await expect(check(page)).toHaveCount(0);

    await page.getByTestId('word-continue').click();
    await expect(page.getByTestId('word-writing')).toHaveCount(0);
  });

  test('the writing box does not move when the last part is started', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openWriting(page, CASES.four.id);

    // Everything but the last syllable.
    for (let i = 0; i < 3; i += 1) {
      await chips(page).nth(i).click();
      await traceGlyphThoroughly(page, canvas(page));
    }

    await chips(page).nth(3).click();
    await settle(page);
    const before = (await canvas(page).boundingBox())!;

    // The stroke that completes the set. It flips the check button from
    // unavailable to available, and used to take a line of helper copy out of
    // the layout with it — moving the paper while the pen was still on it.
    const box = (await canvas(page).locator('canvas').first().boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 8 });
    await page.mouse.up();

    await expect(check(page)).toBeEnabled();
    const after = (await canvas(page).boundingBox())!;
    expect(after.x, 'the writing box moved horizontally').toBeCloseTo(before.x, 0);
    expect(after.y, 'the writing box moved vertically').toBeCloseTo(before.y, 0);
    expect(after.width, 'the writing box resized').toBeCloseTo(before.width, 0);
  });

  test('the check button stays reachable while the sheet is closed', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openWriting(page, CASES.four.id);
    await writeEverySyllable(page);
    await expect(check(page)).toBeInViewport();
    await expectHorizontallyInside(page, check(page), 'whole-word Check');
  });
});
