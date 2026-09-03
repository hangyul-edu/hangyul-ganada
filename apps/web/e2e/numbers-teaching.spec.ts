import { expect, test, type Page } from '@playwright/test';

import { copy } from './helpers/copy';
import { openApp } from './helpers/launch';

/**
 * How the Numbers course teaches, and how it answers.
 *
 * ## What is being pinned, and why it is not a screenshot
 *
 * Both defects here are things a screenshot comparison would have passed. The
 * explanation was a well-rendered paragraph and the feedback was a well-rendered
 * sentence; nothing was broken, and both were wrong for a beginner:
 *
 * > 부분을 순서대로 읽어요. 십일은 십-일, 11. 이십은 이-십, 20. 삼십오는
 * > 삼-십-오, 35예요.
 *
 * > 조금 달라요 · 정답은 8
 *
 * So what is asserted is the *shape of the teaching*: that a number the lesson
 * is explaining is broken into pieces on screen, that the pieces add up to the
 * word, that there is a way to hear it, and that the sentence beside it is a
 * caption rather than three worked examples. And on the answer side: that the
 * verdict is decisive, and that the screen does not say a third time what the
 * red cross and the blue tick have already said twice.
 */

const SINO_BUILD = '/letters/numbers/num-lesson-sino-build';

async function intoExplanation(page: Page, lesson: string) {
  await openApp(page, lesson);
  await page.getByTestId('numbers-start').click();
  await expect(page.getByTestId('numbers-phase-explain')).toBeVisible();
}

test.describe('the explanation is shown, not narrated', () => {
  test('breaks each number into parts that add up to the word', async ({ page }) => {
    await intoExplanation(page, SINO_BUILD);

    // 11, 20 and 35 — the three the paragraph used to carry as prose.
    for (const [id, parts, whole] of [
      ['num-sino-11', ['십', '일'], '십일'],
      ['num-sino-20', ['이', '십'], '이십'],
      ['num-sino-35', ['삼', '십', '오'], '삼십오'],
    ] as const) {
      const card = page.getByTestId(`number-breakdown-${id}`);
      await expect(card).toBeVisible();

      // The pieces, in the order they are said.
      const chips = card.getByRole('listitem');
      await expect(chips).toHaveCount(parts.length);
      for (const [at, part] of parts.entries()) {
        await expect(chips.nth(at)).toHaveText(part);
      }

      // And the word they make. The chips joined must *be* the word, which is
      // what stops a diagram teaching a spelling the language does not have.
      await expect(card).toContainText(whole);
      expect(parts.join('')).toBe(whole);
    }
  });

  test('offers a way to hear every number it takes apart', async ({ page }) => {
    await intoExplanation(page, SINO_BUILD);
    for (const id of ['num-sino-11', 'num-sino-20', 'num-sino-35']) {
      await expect(
        page.getByTestId(`number-breakdown-${id}`).getByRole('button'),
      ).toHaveCount(1);
    }
  });

  test('never writes a number with a hyphen in it', async ({ page }) => {
    /*
      십-일 is not how 십일 is written, spoken or spelled. It was a diagram drawn
      in punctuation, and a beginner has no way to know it is not part of the
      word.
    */
    await intoExplanation(page, SINO_BUILD);
    const text = (await page.getByTestId('numbers-phase-explain').innerText()) ?? '';
    expect(text).not.toMatch(/[가-힣]-[가-힣]/);
  });

  test('keeps the sentence to a caption, and the step reachable at 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await intoExplanation(page, SINO_BUILD);

    // One sentence, not three worked examples.
    const caption = page.getByTestId('numbers-phase-explain').locator('p').last();
    const words = ((await caption.innerText()) ?? '').trim();
    expect(words.split(/[.!?。]/).filter((s) => s.trim()).length).toBeLessThanOrEqual(2);

    // And the way on is still reachable — by scrolling, which is allowed, but
    // it has to exist and be clickable.
    await expect(page.getByRole('button', { name: copy('numbers', 'action.next') })).toBeEnabled();
  });
});

/*
 * The wrong-answer rules are asserted in `numbers.spec.ts`, against the
 * lesson's own exercise data rather than by walking the phases blind:
 * N-e2e-5 now asserts that the feedback does *not* restate the answer, and
 * N-e2e-5c that 조금 달라요 is gone from the rendered product. A second,
 * looser copy of those here was reaching for the option group before the
 * practice phase had opened, which is a flaky test of nothing.
 */
