import { expect, test, type Page } from '@playwright/test';

import { openApp } from './helpers/launch';

/**
 * The streak a learner sees, from the first launch to the first learning day.
 *
 * `domain/streak.test.ts` holds the arithmetic and `store/streak.test.tsx`
 * holds which events count. What neither can see is the chip on Home: that a
 * learner who has never answered anything is invited to start rather than
 * shown "0 days" beside a flame, that the first answered question makes it
 * "1 day", that a session opened and closed with nothing answered leaves it
 * as it was, and that the number survives a reload and a cut network.
 *
 * The profile is written into IndexedDB in the shapes the store writes —
 * `settings.active_days` plus an activity row — because the alternative, a
 * full lesson through the interface, is what `journey.spec.ts` is for.
 */

async function seedDay(
  page: Page,
  { attempts, learningDay }: { attempts: number; learningDay: boolean },
) {
  await page.evaluate(
    async ({ attempts, learningDay }) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('hangyul-ganada');
        request.onsuccess = () => resolve(request.result);
      });
      const day = new Date();
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const tx = db.transaction(['activity', 'settings'], 'readwrite');
      tx.objectStore('activity').put(
        {
          date,
          first_at: day.toISOString(),
          last_at: day.toISOString(),
          active_ms: 45_000,
          attempts,
          passes: 0,
          characters_learned: 0,
          words_learned: 0,
          reviews: 0,
          items: attempts > 0 ? { 'character:ㄱ': attempts } : {},
        },
        date,
      );
      if (learningDay) {
        const existing = await new Promise<Record<string, unknown> | undefined>((resolve) => {
          const request = tx.objectStore('settings').get('preferences');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(undefined);
        });
        tx.objectStore('settings').put({ ...(existing ?? {}), active_days: [date] }, 'preferences');
      }
      await new Promise((resolve) => {
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
      db.close();
    },
    { attempts, learningDay },
  );
}

test('a learner who has never answered anything is invited to start, not shown a zero', async ({ page }) => {
  await openApp(page, '/');
  const chip = page.getByTestId('home-streak');
  await expect(chip).toHaveAttribute('data-streak-status', 'never');
  await expect(chip).toHaveText('Start today');
  await expect(page.getByText(/0 days?/)).toHaveCount(0);
});

test('time on a session screen with nothing answered is not a streak day', async ({ page }) => {
  await openApp(page, '/');
  await seedDay(page, { attempts: 0, learningDay: false });
  await openApp(page, '/');
  const chip = page.getByTestId('home-streak');
  await expect(chip).toHaveAttribute('data-streak-status', 'never');
  await expect(chip).toHaveText('Start today');
});

test('the first answered question is Day 1, and stays Day 1 across a reload and offline', async ({
  page,
  context,
}) => {
  await openApp(page, '/');
  await seedDay(page, { attempts: 1, learningDay: true });
  await openApp(page, '/');
  const chip = page.getByTestId('home-streak');
  await expect(chip).toHaveAttribute('data-streak-status', 'active');
  await expect(chip).toHaveText('1 day');

  await page.reload();
  await expect(page.getByTestId('home-streak')).toHaveText('1 day');

  // The Activity screen reads the same number through the same function.
  await page.getByTestId('home-streak').click();
  await expect(page).toHaveURL(/\/me\/activity$/);
  await expect(page.getByText('day in a row')).toBeVisible();
  await expect(page.getByText('1', { exact: true }).first()).toBeVisible();

  // With the network cut, the number is read from the device, not lost.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByTestId('home-streak')).toHaveText('1 day', { timeout: 15_000 });
  } finally {
    await context.setOffline(false);
  }
});
