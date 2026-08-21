import { expect, test, type Page } from '@playwright/test';

import { waitForLaunch } from './helpers/launch';

/**
 * The learner's record, the quotation, and the rows that scroll sideways.
 *
 * These are the parts of the app that only a real browser can answer for: a
 * favicon the browser actually resolved, a horizontal row a mouse can actually
 * reach the end of, and a page of statistics computed from a store that was
 * really written to.
 */

/** Writes a plausible history straight into the store the app reads. */
async function seedHistory(page: Page, days: number) {
  await page.goto('/');
  await page.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('hangyul-ganada');
      request.onsuccess = () => resolve(request.result);
    });
    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const tx = db.transaction(['activity', 'settings'], 'readwrite');
    const store = tx.objectStore('activity');
    const dates: string[] = [];
    for (let back = count - 1; back >= 0; back -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - back);
      const date = key(day);
      dates.push(date);
      store.put(
        {
          date,
          first_at: day.toISOString(),
          last_at: day.toISOString(),
          active_ms: 12 * 60_000,
          attempts: 18,
          passes: 15,
          characters_learned: 2,
          words_learned: 0,
          reviews: 0,
          items: { 'character:ㅏ': 9, 'character:ㄱ': 4 },
        },
        date,
      );
    }
    const existing = await new Promise<Record<string, unknown> | undefined>((resolve) => {
      const request = tx.objectStore('settings').get('preferences');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });
    tx.objectStore('settings').put({ ...(existing ?? {}), active_days: dates }, 'preferences');
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  }, days);
}

test('the browser tab icon is a real favicon.ico carrying every small size', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toBe('/favicon.ico');

  // And it is really there: a favicon that 404s is a favicon that silently
  // falls back to the browser's blank page glyph.
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);

  // A `.ico` is a container, and the reason to use one is that it holds more
  // than one size. Shipping a single 48 px image renamed `.ico` would pass a
  // status check and still be a smudge in the tab, so the sizes are read out of
  // the file itself: an ICONDIR header of `0 0 1 0` then an image count.
  const bytes = new Uint8Array(await response.body());
  expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0, 0, 1, 0]);
  const count = bytes[4] | (bytes[5] << 8);
  // Entry n starts at 6 + 16n; byte 0 is the width, where 0 means 256.
  const widths = Array.from({ length: count }, (_, n) => bytes[6 + 16 * n] || 256);
  expect(widths.sort((a, b) => a - b)).toEqual([16, 32, 48]);
});

test('home ends with a quotation, attributed', async ({ page }) => {
  await page.goto('/');
  const quote = page.locator('figure blockquote');
  await expect(quote).toBeVisible();
  const text = (await quote.textContent())!.trim();
  expect(text.length).toBeGreaterThan(20);

  // Named, always. An unattributed quotation is the kind that gets invented.
  const author = page.locator('figure figcaption');
  await expect(author).toBeVisible();
  expect((await author.textContent())!.replace(/[—\s]/g, '').length).toBeGreaterThan(3);
});

test('the streak opens the learner’s record, not the settings screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /learning record/i }).click();
  await expect(page).toHaveURL(/\/me\/activity$/);
  await expect(page.getByRole('heading', { name: 'Learning activity' })).toBeVisible();
  // Not Settings: the old behaviour answered a question nobody had asked.
  await expect(page.getByRole('heading', { name: /Practice typeface/ })).toHaveCount(0);
});

test('a learner on day one gets a welcome, not a dashboard of zeroes', async ({ page }) => {
  await page.goto('/me/activity');
  await expect(page.getByText(/Your learning story starts today/)).toBeVisible();
  // No chart, no calendar, no 0%.
  await expect(page.getByText('0%')).toHaveCount(0);
});

test('the activity page reports the history the learner actually has', async ({ page }) => {
  await seedHistory(page, 5);
  await page.goto('/me/activity');

  // The number and its unit are separate elements, so the streak reads as a
  // headline figure rather than a sentence.
  await expect(page.getByText('days in a row')).toBeVisible();
  await expect(page.getByText('Longest streak')).toBeVisible();
  await expect(page.getByText('Days practised')).toBeVisible();

  // 5 days × 12 minutes = 1 h, all-time.
  await expect(page.getByText('1 h', { exact: false }).first()).toBeVisible();

  // The weekly summary reports the part of that week which falls inside this
  // one. How much that is depends on which weekday the suite runs, so what is
  // asserted is that the section exists and carries a real figure — pinning
  // "1 h" here would make the test pass on a Sunday and fail on a Wednesday.
  const week = page.getByLabel('This week');
  await expect(week).toBeVisible();
  await expect(week.getByText(/\d+\s*(min|h)/).first()).toBeVisible();

  // Only the ranges there is history for. A "3 months" tab on a five-day-old
  // profile is the same chart with more empty space.
  await expect(page.getByRole('button', { name: '7 days' })).toBeVisible();
  await expect(page.getByRole('button', { name: '3 months' })).toHaveCount(0);

  // Picking a day in the calendar opens that day.
  const today = page.locator('[role="gridcell"]:not([disabled])').last();
  await today.click();
  await expect(page.getByText('Writing attempts')).toBeVisible();
  await expect(page.getByText('18', { exact: true }).first()).toBeVisible();
});

test('a horizontal filter row can be reached with a mouse', async ({ page }) => {
  // The defect this covers: `overflow-x: auto` alone is enough on a phone and
  // useless on a desktop, where a plain wheel has no horizontal axis. The far
  // end of the row was visible and unreachable.
  //
  // The row it was written against — Level 1 … Level 8 on the Words screen —
  // is gone with the levels. The chart's range row is the remaining horizontal
  // scroller and has the same behaviour to keep, so it is the one under test.
  // At 320 px — the narrowest phone the app supports — the range row is wider
  // than the screen, which is the condition the behaviour exists for.
  await page.setViewportSize({ width: 320, height: 720 });
  await seedHistory(page, 200);
  await page.goto('/me/activity');
  // Every assertion below dispatches through `page.mouse`, which has no
  // actionability check — so the launch screen has to be gone first or the
  // wheel lands on it. See `helpers/launch`.
  await waitForLaunch(page);
  const row = page.getByRole('group', { name: /time range/i });
  await expect(row).toBeVisible();

  const overflow = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, 'the range row is wider than the screen').toBeGreaterThan(10);

  // No visible scrollbar — this is an app, not a web page.
  const gutter = await row.evaluate((el) => el.offsetHeight - el.clientHeight);
  expect(gutter).toBe(0);

  // A vertical wheel over the row scrolls it sideways.
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => row.evaluate((el) => el.scrollLeft), { timeout: 2000 })
    .toBeGreaterThan(0);

  // Dragging moves it too, and does not select the chip it started on.
  await row.evaluate((el) => {
    el.scrollLeft = 0;
  });
  const first = page.getByRole('button', { name: '7 days' });
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  const start = (await first.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(start.x + start.width / 2 - i * 18, start.y + start.height / 2);
  }
  await page.mouse.up();
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(first, 'a drag must not double as a click').toHaveAttribute('aria-pressed', 'true');
});

test('a short press on a chip still selects it', async ({ page }) => {
  // The other half of the drag threshold: if this breaks, the filters stop
  // working entirely and the row scrolls beautifully.
  await seedHistory(page, 40);
  await page.goto('/me/activity');
  const month = page.getByRole('button', { name: '30 days' });
  await month.click();
  await expect(month).toHaveAttribute('aria-pressed', 'true');
});
