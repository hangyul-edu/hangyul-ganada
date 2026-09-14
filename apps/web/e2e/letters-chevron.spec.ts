import { expect, test, type Page } from '@playwright/test';

import { openApp } from './helpers/launch';

/*
 * The chevrons on the Letters screen share one trailing guideline.
 *
 * The screenshot that opened this: on the study-selection screen the lesson
 * rows drew their chevron 16 px from the card's edge, the Numbers card drew
 * it 46 px in, and 소리가 만날 때 drew it 78 px in — because the two foot cards
 * were a flex row whose text column had no `flex: 1`, so the chevron sat
 * wherever the title ended. Every navigation card is now the same two-column
 * grid (`LettersPage.module.css`, `.rowHead` / `.sounds`), and this spec
 * measures the *rendered* chevrons rather than trusting the class names: the
 * old layout fails it by 30–62 px.
 *
 * What it holds, per locale, width and text size:
 *
 * * every card that shows a chevron puts it at the same trailing inset
 *   (±1 px), and that inset is the card's own padding plus the slot — not
 *   somewhere inside the text column;
 * * in Arabic the trailing edge is the left one, and the chevron is there
 *   (and mirrored by `.hg-icon-directional`), so direction is a decision,
 *   not an accident;
 * * the chevron slot is at least 24 px square, the card link at least 44 px
 *   tall, the text column never overlaps the slot, and nothing scrolls
 *   sideways;
 * * the chevron is decorative (`aria-hidden`), and the link's accessible
 *   name is the card's title — the arrow is never announced on its own.
 */
const WIDTHS = [320, 360, 390, 412, 430];
const LOCALES = ['ko', 'en', 'ar'] as const;
const LARGE_TEXT =
  ':root{--hg-text-caption:26px;--hg-text-body-sm:28px;--hg-text-body:30px;--hg-text-body-lg:32px;--hg-text-title:34px}';

type Row = {
  href: string;
  name: string;
  inset: number | null;
  slot: { width: number; height: number } | null;
  linkHeight: number;
  overlap: boolean;
  hidden: boolean;
};

async function measure(page: Page): Promise<{ rows: Row[]; rtl: boolean; sideways: boolean }> {
  return page.evaluate(() => {
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    const rows = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/letters/"]')].map((a) => {
      const svg = a.querySelector('svg');
      const slot = svg?.parentElement;
      const card = a.firstElementChild as HTMLElement | null;
      const box = (card ?? a).getBoundingClientRect();
      const text = a.querySelector('h2, h3');
      const textBox = text?.parentElement?.getBoundingClientRect();
      const c = svg?.getBoundingClientRect();
      const s = slot?.getBoundingClientRect();
      const inset = c ? (rtl ? c.left - box.left : box.right - c.right) : null;
      const overlap = Boolean(c && textBox && (rtl ? textBox.left < c.right : textBox.right > c.left));
      return {
        href: a.getAttribute('href') ?? '',
        name: (a.getAttribute('aria-label') ?? a.textContent ?? '').trim(),
        inset: inset === null ? null : Math.round(inset),
        slot: s ? { width: Math.round(s.width), height: Math.round(s.height) } : null,
        linkHeight: Math.round(a.getBoundingClientRect().height),
        overlap,
        hidden: svg?.getAttribute('aria-hidden') === 'true',
      };
    });
    const sideways = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return { rows, rtl, sideways };
  });
}

for (const locale of LOCALES) {
  test(`${locale}: every Letters card puts its chevron on the same trailing guideline`, async ({ page }) => {
    test.slow();
    await page.addInitScript((code) => {
      window.localStorage.setItem('hangyul_ganada:locale', code);
    }, locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, '/letters');
    await expect(page.locator('a[href="/letters/sounds"]')).toBeVisible();

    for (const scale of [1, 2]) {
      if (scale === 2) await page.addStyleTag({ content: LARGE_TEXT });
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 844 });
        await page.waitForTimeout(150);
        const { rows, rtl, sideways } = await measure(page);
        const where = `${locale} ${width}px ×${scale}`;

        expect(rtl, `${where}: direction follows the locale`).toBe(locale === 'ar');
        expect(sideways, `${where}: the page does not scroll sideways`).toBe(false);

        const withChevron = rows.filter((row) => row.inset !== null);
        // The two foot cards always carry a chevron; a lesson row does too
        // until it has progress, and a fresh profile has none.
        expect(withChevron.length, `${where}: cards with a chevron`).toBeGreaterThanOrEqual(3);
        expect(withChevron.map((row) => row.href), `${where}: the foot cards are measured`).toEqual(
          expect.arrayContaining(['/letters/sounds', '/letters/numbers']),
        );

        const insets = withChevron.map((row) => row.inset as number);
        const guideline = insets[0];
        for (const row of withChevron) {
          expect(
            Math.abs((row.inset as number) - guideline),
            `${where}: ${row.href} chevron inset ${row.inset} vs guideline ${guideline}`,
          ).toBeLessThanOrEqual(1);
          // Card padding (16 px at `md`) plus at most half the slot: the
          // chevron sits in the trailing slot, not inside the text column.
          expect(row.inset as number, `${where}: ${row.href} inset is the card's own edge`).toBeLessThanOrEqual(24);
          expect(row.slot?.width ?? 0, `${where}: ${row.href} slot width`).toBeGreaterThanOrEqual(24);
          expect(row.slot?.height ?? 0, `${where}: ${row.href} slot height`).toBeGreaterThanOrEqual(24);
          expect(row.overlap, `${where}: ${row.href} text column stays clear of the slot`).toBe(false);
          expect(row.hidden, `${where}: ${row.href} chevron is decorative`).toBe(true);
          expect(row.linkHeight, `${where}: ${row.href} tap target`).toBeGreaterThanOrEqual(44);
          expect(row.name.length, `${where}: ${row.href} link is named by its title`).toBeGreaterThan(0);
        }
      }
    }
  });
}
