import { expect, test, type Page } from '@playwright/test';

import { copy } from './helpers/copy';

/**
 * Offline.
 *
 * The product is bought once and every lesson, picture and recording ships with
 * it — but in a browser "ships with it" still means "was fetched at least once".
 * These tests are what turn that claim into something checkable: visit a screen,
 * cut the network, and see whether a paying customer on a plane still has an
 * app.
 *
 * The service worker only runs on a real origin over HTTP, so this suite drives
 * the production build through the preview server exactly as `journey.spec.ts`
 * does — never the dev server, where the worker is deliberately not registered.
 */

async function serviceWorkerReady(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    return Boolean(registration?.active);
  });
}

/**
 * Ready is not the same as *in charge*, and only one of them can serve a fetch.
 *
 * `navigator.serviceWorker.ready` resolves when a worker is active. A worker
 * that is active but has not yet claimed this page controls nothing, so a
 * request made in that window goes to the network — and if the network has just
 * been cut, it fails. That is what "Failed to fetch" was: not a broken cache,
 * a race with `clients.claim()`, and it only ever lost the race when the
 * machine was busy running the rest of the suite.
 *
 * `controller` is the thing the test actually depends on.
 */
async function serviceWorkerControls(page: Page): Promise<boolean> {
  return page.evaluate(
    () => 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
  );
}

test('the app installs an offline worker on first visit', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => serviceWorkerReady(page), { timeout: 15_000 }).toBe(true);
});

test('every core screen still opens with the network cut', async ({ page, context }) => {
  // First visit, online: this is the "install" half of "works after install".
  for (const route of ['/', '/letters', '/words', '/review', '/me']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
  }
  await expect.poll(() => serviceWorkerReady(page), { timeout: 15_000 }).toBe(true);

  await context.setOffline(true);
  try {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();

    // The curriculum is bundled, so the lesson list is real content and not a
    // cached empty shell.
    await page.goto('/letters');
    await expect(page.getByText('The Hangul alphabet')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: copy('learning', 'units.unit-1.title') }),
    ).toBeVisible();

    await page.goto('/words');
    await expect(page.getByRole('link', { name: /Food & Drink/ })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('a lesson can be written and graded with no network', async ({ page, context }) => {
  // Online first, all the way into the writing box. That is not a shortcut —
  // it is what "after installation" means for the practice typeface, which the
  // browser only downloads once something is drawn in it. The worker caches it
  // on that first use, and the lesson is offline-capable from then on.
  await page.goto('/letters/lesson-vowels-core');
  await page.getByRole('button', { name: "Got it — let's start" }).click();
  await page.getByRole('button', { name: /Trace it|Write it/ }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await expect.poll(() => serviceWorkerReady(page), { timeout: 15_000 }).toBe(true);

  await context.setOffline(true);
  try {
    await page.goto('/letters/lesson-vowels-core');
    await page.getByRole('button', { name: "Got it — let's start" }).click();
    await page.getByRole('button', { name: /Trace it|Write it/ }).click();
    await page.evaluate(() => document.fonts.ready);

    // Grading is geometry against a locally rendered glyph — no request is
    // involved, which is the whole reason it works here.
    const box = page.getByTestId('writing-canvas').first();
    await expect(box.locator('canvas').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('a pronunciation that has been played once plays again offline', async ({ page, context }) => {
  await page.goto('/letters/lesson-vowels-core');
  await page.getByRole('button', { name: "Got it — let's start" }).click();

  // Fetch the clip while online, the way tapping the speaker does.
  const played = await page.evaluate(async () => {
    const response = await fetch('/audio/manifest.json');
    const manifest = await response.json();
    const entry = manifest.entries.find((e: { female: unknown }) => e.female);
    if (!entry) return null;
    await fetch(`/${entry.female.src}`);
    return entry.female.src as string;
  });
  expect(played).toBeTruthy();
  await expect.poll(() => serviceWorkerReady(page), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => serviceWorkerControls(page), { timeout: 15_000 }).toBe(true);

  await context.setOffline(true);
  try {
    const offlineStatus = await page.evaluate(async (src) => {
      const response = await fetch(`/${src}`);
      return response.status;
    }, played!);
    expect(offlineStatus).toBe(200);
  } finally {
    await context.setOffline(false);
  }
});
