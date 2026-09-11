import { expect, test } from '@playwright/test';

import { openApp } from './helpers/launch';

declare global {
  interface Window {
    __hangyulQuoteId?: string;
  }
}

/**
 * The two requested quotations, in the built app.
 *
 * `scripts/qa-quote-render.mjs` measures every locale at every width; this is
 * the slice of it that runs in the suite on every release: six languages that
 * between them cover Hangul-only, Latin, Arabic (right-to-left), Tamil (the
 * longest translation), Thai (no word spaces) and Japanese — at the narrowest
 * width the product supports and at doubled text.
 *
 * The quotation is chosen through the `__hangyulQuoteId` seam so the test is
 * about rendering rather than about which of twenty-two lines the random pick
 * landed on.
 */
const LOCALES = ['ko', 'en', 'ar', 'ta', 'th', 'ja'] as const;
const QUOTES = {
  'dream-big-pieces': {
    ko: '꿈을 크게 가져라. 깨져도 그 조각이 크다.',
    byline: { ko: '작자 미상', en: 'Author unknown', ar: 'قائل مجهول', ta: 'அறியப்படாத ஆசிரியர்', th: 'ไม่ทราบผู้แต่ง', ja: '作者不詳' },
  },
  'carlyle-stepping-stone': {
    ko: '길을 걷다가 돌이 나타나면 약자는 그것을 걸림돌이라고 말하고, 강자는 그것을 디딤돌이라고 말한다.',
    byline: { ko: '토머스 칼라일', en: 'Thomas Carlyle', ar: 'توماس كارلايل', ta: 'தாமஸ் கார்லைல்', th: 'โทมัส คาร์ไลล์', ja: 'トーマス・カーライル' },
  },
} as const;

/** Doubles the pixel type tokens — the root font size does nothing here. */
const LARGE_TEXT = `:root{--hg-text-caption:26px;--hg-text-body-sm:28px;--hg-text-body:30px;--hg-text-body-lg:32px;--hg-text-title:34px}`;

for (const locale of LOCALES) {
  for (const [id, expected] of Object.entries(QUOTES)) {
    test(`${id} renders in ${locale} at 320 px and at doubled text`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.addInitScript(
        ({ code, quote }) => {
          window.localStorage.setItem('hangyul_ganada:locale', code);
          window.__hangyulQuoteId = quote;
        },
        { code: locale, quote: id },
      );
      await openApp(page, '/');

      const card = page.getByTestId('home-quote');
      await expect(card).toBeVisible();
      const byline = page.getByTestId('home-quote-author');
      await expect(byline).toContainText(expected.byline[locale]);

      if (locale === 'ko') {
        // Once. Not the Korean and then the Korean again in a second style.
        await expect(page.getByTestId('home-quote-text')).toHaveText(expected.ko);
        await expect(page.getByTestId('home-quote-original')).toHaveCount(0);
        await expect(page.getByTestId('home-quote-translation')).toHaveCount(0);
      } else {
        const original = page.getByTestId('home-quote-original');
        const translation = page.getByTestId('home-quote-translation');
        await expect(original).toHaveText(expected.ko);
        await expect(original).toHaveAttribute('dir', 'ltr');
        await expect(translation).not.toHaveText(expected.ko);
        await expect(translation).not.toContainText(/[가-힣]/);
        // Reading order: Korean, then the translation, then the byline.
        const order = await page.evaluate(() => {
          const ids = ['home-quote-original', 'home-quote-translation', 'home-quote-author'];
          const tops = ids.map((id) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().top);
          return tops[0]! < tops[1]! && tops[1]! < tops[2]!;
        });
        expect(order).toBe(true);
      }

      if (locale === 'ar') {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        const dirs = await page.evaluate(() => ({
          translation: getComputedStyle(document.querySelector('[data-testid="home-quote-translation"]')!).direction,
          original: getComputedStyle(document.querySelector('[data-testid="home-quote-original"]')!).direction,
        }));
        expect(dirs).toEqual({ translation: 'rtl', original: 'ltr' });
      }

      const fits = async () =>
        page.evaluate(() => {
          const card = document.querySelector('[data-testid="home-quote"]')!;
          const parts = [...card.querySelectorAll('[data-testid^="home-quote-"]')];
          const box = card.getBoundingClientRect();
          const sideways = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
          const overflow = parts.some((el) => el.scrollWidth > el.clientWidth + 1);
          const outside = parts.some((el) => {
            const r = el.getBoundingClientRect();
            return r.left < box.left - 1 || r.right > box.right + 1;
          });
          return { sideways, overflow, outside, cardOverflow: card.scrollWidth > card.clientWidth + 1 };
        });
      expect(await fits()).toEqual({ sideways: false, overflow: false, outside: false, cardOverflow: false });

      await page.addStyleTag({ content: LARGE_TEXT });
      await page.waitForTimeout(100);
      expect(await fits()).toEqual({ sideways: false, overflow: false, outside: false, cardOverflow: false });
      // The card grew rather than clipping: the byline is still fully inside it.
      const bylineBox = await byline.boundingBox();
      const cardBox = await card.boundingBox();
      expect(bylineBox!.y + bylineBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1);
    });
  }
}

test('changing language in Settings changes both the translation and the byline, and keeps the Korean', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('hangyul_ganada:locale', 'de');
    window.__hangyulQuoteId = 'carlyle-stepping-stone';
  });
  await openApp(page, '/');
  await expect(page.getByTestId('home-quote-translation')).toContainText('Stolperstein');
  await expect(page.getByTestId('home-quote-author')).toContainText('Thomas Carlyle');

  // Through the real picker, the way a learner does it.
  await openApp(page, '/me/language');
  await page.getByRole('searchbox').fill('russian');
  await page.getByRole('button', { name: /Русский/ }).click();
  await openApp(page, '/');
  await expect(page.getByTestId('home-quote-translation')).toContainText('ступенью');
  await expect(page.getByTestId('home-quote-author')).toContainText('Томас Карлейль');
  await expect(page.getByTestId('home-quote-original')).toHaveText(QUOTES['carlyle-stepping-stone'].ko);
});
