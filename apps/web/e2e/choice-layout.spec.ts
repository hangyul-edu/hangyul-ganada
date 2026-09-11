import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { openApp } from './helpers/launch';

/**
 * Four choices are four across or two by two — never three and one.
 *
 * The gap-fill question lays its Korean candidates out as chips, and those
 * chips used to wrap: on a 360 px phone the fourth fell onto its own line. A
 * customer photographed it. The layout is measured now (`useChoiceColumns`),
 * and this puts a real gap-fill on screen — a review sitting in `context`
 * mode over four seeded words, which is deterministic where the daily plan is
 * not — at every width the release is held to, in the three interface
 * languages that change the chips' width most: Korean, English and Arabic
 * (right-to-left), at normal and doubled text, and measures the rows the
 * chips actually form.
 */
const WIDTHS = [320, 360, 375, 390, 412, 430];
const LOCALES = ['ko', 'en', 'ar'];
const LARGE_TEXT =
  ':root{--hg-text-caption:26px;--hg-text-body-sm:28px;--hg-text-body:30px;--hg-text-body-lg:32px;--hg-text-title:34px}';

/** The first taught words, from the band the app loads before Home paints. */
function taughtWords(count: number): string[] {
  const dir = fileURLToPath(new URL('../public/corpus/', import.meta.url));
  const band = readdirSync(dir).find((name) => name.startsWith('band-1-'));
  if (!band) throw new Error(`no band-1 in ${dir} — run npm run content:corpus`);
  const rows = JSON.parse(readFileSync(join(dir, band), 'utf8')).words as Array<{ id: string }>;
  return rows.slice(0, count).map((row) => row.id);
}

/** A profile that has met `ids` and lost them, so a review has something to ask. */
async function seedWrongWords(page: Page, ids: string[]) {
  await page.evaluate(async (wordIds) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('hangyul-ganada');
      request.onsuccess = () => resolve(request.result);
    });
    const when = new Date(Date.now() - 2 * 864e5).toISOString();
    const tx = db.transaction(['progress', 'memory'], 'readwrite');
    for (const id of wordIds) {
      tx.objectStore('progress').put(
        {
          item_key: id, kind: 'word', stage: 'introduced', attempts: 1, passes: 0, fails: 1,
          trace_passes: 0, write_passes: 0, recognition_passes: 0, heard: true, learned: false,
          needs_review: true, last_score: 0, first_seen_at: when, last_attempted_at: when,
          learned_at: null, review_due_at: when,
        },
        `word:${id}`,
      );
      for (const skill of ['meaning_recognition', 'reading_recognition', 'sentence_comprehension']) {
        tx.objectStore('memory').put(
          {
            item_key: `word:${id}`, skill, stability_days: 0.4, difficulty: 0.8, reps: 1,
            lapses: 1, last_at: when, due_at: when, last_score: 0,
          },
          `word:${id}:${skill}`,
        );
      }
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }, ids);
}

/** Opens a review sitting in gap-fill mode and steps to the first chip grid. */
async function firstChipQuestion(page: Page): Promise<boolean> {
  await openApp(page, '/');
  await expect(page.locator('[data-storage-engine]')).toBeVisible();
  await seedWrongWords(page, taughtWords(12));
  await openApp(page, '/review/session?mode=context');
  const grid = page.locator('[role=group][data-columns]');
  const forward = page.locator('[role=status] button').first();
  const option = page.locator('[role=group] button:not([disabled])').first();
  for (let step = 0; step < 40; step += 1) {
    if (await grid.isVisible().catch(() => false)) return true;
    if (await forward.isVisible().catch(() => false)) {
      await forward.click();
      continue;
    }
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      continue;
    }
    await page.waitForTimeout(120);
  }
  return false;
}

/** The rows the chips form, as counts, from their boxes. */
async function rows(page: Page): Promise<{ counts: number[]; overflow: boolean; columns: string | null }> {
  return page.evaluate(() => {
    const grid = document.querySelector('[role=group][data-columns]')!;
    const chips = [...grid.querySelectorAll('button')];
    const tops = new Map<number, number>();
    let overflow = false;
    const gridBox = grid.getBoundingClientRect();
    for (const chip of chips) {
      const box = chip.getBoundingClientRect();
      const key = Math.round(box.top);
      tops.set(key, (tops.get(key) ?? 0) + 1);
      if (chip.scrollWidth > chip.clientWidth + 1) overflow = true;
      if (box.left < gridBox.left - 1 || box.right > gridBox.right + 1) overflow = true;
      if (box.height < 44) overflow = true;
    }
    return {
      counts: [...tops.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n),
      overflow,
      columns: grid.getAttribute('data-columns'),
    };
  });
}

for (const locale of LOCALES) {
  test(`${locale}: the chip grid is 4 or 2×2 at every width and at doubled text`, async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((code) => {
      window.localStorage.setItem('hangyul_ganada:locale', code);
    }, locale);
    const found = await firstChipQuestion(page);
    expect(found, 'a gap-fill question was reached').toBe(true);

    for (const scale of [1, 2]) {
      if (scale === 2) await page.addStyleTag({ content: LARGE_TEXT });
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 844 });
        await page.waitForTimeout(120);
        const shape = await rows(page);
        expect(['2', '4'], `${width}px ×${scale}`).toContain(shape.columns);
        // Row-major and balanced: [4] or [2, 2]. Never [3, 1], never [1, 3].
        expect([[4], [2, 2]], `${width}px ×${scale} rows ${shape.counts}`).toContainEqual(shape.counts);
        expect(shape.overflow, `${width}px ×${scale} a chip overflows or is under 44 px tall`).toBe(false);
        if (locale === 'ar') {
          await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        }
        await page.screenshot({ path: `test-results/choice-layout-${locale}-${width}-${scale}x.png` });
      }
    }
  });
}
