import { expect, test, type Page } from '@playwright/test';

import { waitForLaunch } from './helpers/launch';

/**
 * Waits for the dialog's entrance to finish before anything is measured.
 *
 * It scales in from 0.9, and two `boundingBox()` calls are two separate round
 * trips — so measuring during the animation compares one button at one frame
 * against the other at the next, and reports a two-pixel misalignment in a
 * layout that is exactly aligned. Settled, both buttons measure 136 × 48 at the
 * same y, which is the reference's own figure.
 */
async function settled(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((el) => getComputedStyle(el).transform))
    .toBe('none');
}

/**
 * The confirmation dialog, as a learner meets it.
 *
 * ## Why the reset dialog and not the exit dialog
 *
 * They are the same component. The exit dialog is opened by the phone's Back
 * button, which reaches the app through Capacitor's `backButton` event — there
 * is no browser gesture that produces it, so a browser cannot open that dialog
 * at all. `SystemBack.test.tsx` covers its behaviour directly. This covers the
 * shape both of them wear, on the one that a page can actually open.
 *
 * ## What is asserted, and why each of these
 *
 * The two answers are **side by side and the same width**. That is the part of
 * the design most likely to be lost: a future translation is long, somebody
 * stacks them "just for that language", and the dialog quietly becomes two
 * different dialogs. Equal columns also mean the wordier answer cannot grow
 * into the quieter one.
 *
 * And it is asserted at **200% text**, because that is where a two-column
 * layout of buttons usually gives up.
 */
test.describe('the confirmation dialog', () => {
  for (const width of [360, 430]) {
    test(`puts its two answers side by side and equal at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('/me');
      await waitForLaunch(page);
      await page.getByRole('button', { name: /Reset learning progress/i }).click();

      await settled(page);
      const dialog = page.getByRole('dialog');

      const cancel = await page.getByTestId('reset-cancel').boundingBox();
      const confirm = await page.getByTestId('reset-confirm').boundingBox();
      expect(cancel, 'the cancel answer is missing').toBeTruthy();
      expect(confirm, 'the confirm answer is missing').toBeTruthy();

      // Same row: their vertical centres agree to within a pixel.
      expect(Math.abs(cancel!.y + cancel!.height / 2 - (confirm!.y + confirm!.height / 2))).toBeLessThan(1.5);
      // Same width, and cancel comes first.
      expect(Math.abs(cancel!.width - confirm!.width)).toBeLessThan(1.5);
      expect(cancel!.x).toBeLessThan(confirm!.x);
      // Big enough to hit.
      expect(confirm!.height).toBeGreaterThanOrEqual(44);

      // Inside the viewport, with room around it.
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThan(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    });
  }

  test('holds its shape when the text is doubled', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/me');
    await waitForLaunch(page);
    await page.addStyleTag({
      content:
        'html { -webkit-text-size-adjust: 200% !important; text-size-adjust: 200% !important; }',
    });
    await page.getByRole('button', { name: /Reset learning progress/i }).click();
    await settled(page);

    const cancel = await page.getByTestId('reset-cancel').boundingBox();
    const confirm = await page.getByTestId('reset-confirm').boundingBox();
    expect(Math.abs(cancel!.width - confirm!.width)).toBeLessThan(1.5);
    expect(Math.abs(cancel!.y - confirm!.y)).toBeLessThan(1.5);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the dialog pushes the page sideways at 200% text').toBeLessThanOrEqual(1);
  });

  test('cancel closes it and changes nothing', async ({ page }) => {
    await page.goto('/me');
    await waitForLaunch(page);
    await page.getByRole('button', { name: /Reset learning progress/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('reset-cancel').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
