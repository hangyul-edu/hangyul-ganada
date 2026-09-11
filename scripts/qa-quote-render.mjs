#!/usr/bin/env node
/**
 * Both requested quotations, rendered through the real home screen in every
 * interface language, at every phone width the release is held to, at normal
 * and doubled text size — measured, not eyeballed.
 *
 *   npm run quotes:render            write docs/quote-render-audit.json and the contact sheets
 *   npm run quotes:render:check      the same, and exit non-zero on any finding
 *
 * Needs a production build (`npm run build`); it serves `dist` through
 * `vite preview` like the other screen QA scripts.
 *
 * ## What is measured, per locale × quotation × width × scale
 *
 * * the card is on screen and its three parts are there: the Korean original
 *   (non-Korean locales), the translation, the byline;
 * * nothing inside the card is wider than the card — `scrollWidth` against
 *   `clientWidth` on the card and on each text element;
 * * no text element extends past the card's box or past the viewport;
 * * the translation does not overlap the byline (their boxes do not intersect);
 * * the page does not scroll sideways;
 * * in Korean the Korean line appears once;
 * * in a right-to-left locale the document is `rtl`, the translation is laid
 *   out right-to-left and the Korean line is pinned `ltr`.
 *
 * Widths: 320, 360, 375, 390, 412, 430 — the set the choice-layout and tab-bar
 * suites use. Scales: 1 and 2, applied by doubling the pixel type tokens —
 * see `lib/text-scale.mjs` for why the root font size is not the lever.
 *
 * The page is loaded **once per locale**; the quotation is switched through
 * the `__hangyulQuoteId` seam and a client-side navigation remounts Home, and
 * width and scale are changed in place. Thirty-two loads instead of seven
 * hundred and sixty-eight.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ensurePreview } from './lib/preview.mjs';
import { textScaleCss } from './lib/text-scale.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';
const OUT_JSON = join(root, 'docs/quote-render-audit.json');
const SHEETS = join(root, 'docs/report-assets');

const LOCALES = readdirSync(join(root, 'apps/web/src/locales')).sort();
const QUOTES = ['dream-big-pieces', 'carlyle-stepping-stone'];
const WIDTHS = [320, 360, 375, 390, 412, 430];
const SCALES = [1, 2];
const RTL = new Set(['ar']);

const findings = [];
/** locale → quote → { widths: [...], scales: [...], rtl, ok } */
const results = {};

const stop = await ensurePreview(baseUrl);
const browser = await chromium.launch();
try {
  for (const locale of LOCALES) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
      locale,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) =>
      findings.push({ locale, quote: '-', width: 0, scale: 1, kind: 'threw', detail: String(error).slice(0, 160) }),
    );
    await page.addInitScript((code) => {
      window.localStorage.setItem('hangyul_ganada:locale', code);
    }, locale);
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="launch-splash"]', { state: 'detached', timeout: 15_000 }).catch(() => {});

    results[locale] = {};
    for (const quoteId of QUOTES) {
      // Remount Home with the wanted quotation: set the seam, leave, come back.
      await page.evaluate((id) => {
        window.__hangyulQuoteId = id;
      }, quoteId);
      await page.evaluate(() => window.history.pushState({}, '', '/me'));
      await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
      await page.waitForTimeout(150);
      await page.evaluate(() => window.history.pushState({}, '', '/'));
      await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
      await page.waitForSelector('[data-testid="home-quote"]', { timeout: 10_000 });

      const record = { widths: {}, rtl: RTL.has(locale) ? {} : null, ok: true };
      results[locale][quoteId] = record;

      for (const scale of SCALES) {
        // The type tokens are pixels, so the root font size is not the lever;
        // see lib/text-scale.mjs. One `<style id>` per scale, replaced in place.
        await page.evaluate((css) => {
          let style = document.getElementById('qa-text-scale');
          if (!style) {
            style = document.createElement('style');
            style.id = 'qa-text-scale';
            document.head.appendChild(style);
          }
          style.textContent = css;
        }, textScaleCss(scale));
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 844 });
          await page.waitForTimeout(80);
          const measured = await page.evaluate(
            ({ wantKorean, isKo, isRtl }) => {
              const problems = [];
              const card = document.querySelector('[data-testid="home-quote"]');
              if (!card) return { problems: [{ kind: 'missing', detail: 'no quotation card' }] };
              card.scrollIntoView({ block: 'center' });
              const box = card.getBoundingClientRect();
              const clientW = document.documentElement.clientWidth;
              if (document.documentElement.scrollWidth > clientW + 1) {
                problems.push({ kind: 'sideways', detail: `${document.documentElement.scrollWidth}>${clientW}px` });
              }
              if (card.scrollWidth > card.clientWidth + 1) {
                problems.push({ kind: 'card-overflow', detail: `${card.scrollWidth}>${card.clientWidth}px` });
              }
              const part = (name) => card.querySelector(`[data-testid="${name}"]`);
              const original = part('home-quote-original');
              const translation = part('home-quote-translation');
              const text = part('home-quote-text');
              const author = part('home-quote-author');
              if (!author || !(author.textContent ?? '').trim()) problems.push({ kind: 'no-byline', detail: '' });
              if (wantKorean) {
                if (!original) problems.push({ kind: 'no-korean', detail: 'Korean original missing' });
                if (!translation) problems.push({ kind: 'no-translation', detail: 'translation missing' });
                if (text) problems.push({ kind: 'wrong-shape', detail: 'single-line shape in a non-Korean locale' });
              } else if (isKo) {
                if (original || translation) problems.push({ kind: 'korean-twice', detail: 'original and translation both present in ko' });
                if (!text) problems.push({ kind: 'no-text', detail: '' });
              }
              const parts = [original, translation, text, author].filter(Boolean);
              for (const element of parts) {
                const r = element.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) problems.push({ kind: 'collapsed', detail: element.dataset.testid });
                if (element.scrollWidth > element.clientWidth + 1) {
                  problems.push({ kind: 'text-overflow', detail: `${element.dataset.testid} ${element.scrollWidth}>${element.clientWidth}px` });
                }
                if (r.right > box.right + 1 || r.left < box.left - 1) {
                  problems.push({ kind: 'outside-card', detail: element.dataset.testid });
                }
                if (r.right > clientW + 1 || r.left < -1) {
                  problems.push({ kind: 'outside-viewport', detail: element.dataset.testid });
                }
                const style = getComputedStyle(element);
                if (style.overflow !== 'visible' && element.scrollHeight > element.clientHeight + 1) {
                  problems.push({ kind: 'clipped', detail: element.dataset.testid });
                }
              }
              // Nothing overlaps: each part sits fully above the next.
              for (let i = 0; i + 1 < parts.length; i += 1) {
                const a = parts[i].getBoundingClientRect();
                const b = parts[i + 1].getBoundingClientRect();
                if (a.bottom > b.top + 1) {
                  problems.push({ kind: 'overlap', detail: `${parts[i].dataset.testid} over ${parts[i + 1].dataset.testid}` });
                }
              }
              const rtl = {};
              if (isRtl) {
                rtl.documentDir = document.documentElement.dir || getComputedStyle(document.documentElement).direction;
                rtl.translationDir = translation ? getComputedStyle(translation).direction : null;
                rtl.originalDir = original ? getComputedStyle(original).direction : null;
                rtl.authorDir = author ? getComputedStyle(author).direction : null;
                if (rtl.documentDir !== 'rtl') problems.push({ kind: 'rtl', detail: `document is ${rtl.documentDir}` });
                if (translation && rtl.translationDir !== 'rtl') problems.push({ kind: 'rtl', detail: `translation is ${rtl.translationDir}` });
                if (original && rtl.originalDir !== 'ltr') problems.push({ kind: 'rtl', detail: `Korean is ${rtl.originalDir}` });
              }
              const fontSize = parseFloat(getComputedStyle(translation ?? text ?? author).fontSize);
              return { problems, rtl, fontSize, cardHeight: Math.round(box.height) };
            },
            { wantKorean: locale !== 'ko', isKo: locale === 'ko', isRtl: RTL.has(locale) },
          );
          record.widths[`${width}@${scale}x`] = {
            ok: measured.problems.length === 0,
            fontSize: measured.fontSize,
            cardHeight: measured.cardHeight,
          };
          if (measured.rtl && Object.keys(measured.rtl).length) record.rtl = measured.rtl;
          for (const problem of measured.problems) {
            record.ok = false;
            findings.push({ locale, quote: quoteId, width, scale, ...problem });
          }
          // Two representative shots per locale and quotation for the contact sheet.
          if ((width === 360 && scale === 1) || (width === 320 && scale === 2)) {
            const card = page.locator('[data-testid="home-quote"]');
            mkdirSync(join(SHEETS, 'quotes'), { recursive: true });
            await card.screenshot({
              path: join(SHEETS, 'quotes', `${quoteId}-${locale}-${width}-${scale}x.png`),
            });
          }
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  stop();
}

writeFileSync(
  OUT_JSON,
  `${JSON.stringify(
    {
      _comment:
        'Written by scripts/qa-quote-render.mjs from the rendered home screen. Read by scripts/build-quote-audit.mjs for the UI-wrapping and RTL columns of docs/QUOTE_TRANSLATION_AUDIT.md. Do not edit by hand.',
      renderedAt: new Date().toISOString(),
      widths: WIDTHS,
      scales: SCALES,
      locales: LOCALES,
      quotes: QUOTES,
      results,
      findings,
    },
    null,
    1,
  )}\n`,
);

const cells = LOCALES.length * QUOTES.length * WIDTHS.length * SCALES.length;
console.log(`\nQuotation rendering — ${LOCALES.length} locales × ${QUOTES.length} quotations × ${WIDTHS.length} widths × ${SCALES.length} scales = ${cells} measurements`);
if (findings.length === 0) {
  console.log('  every card wraps inside its box, nothing clips or overlaps, Korean once in Korean and first everywhere else, Arabic right-to-left with the Korean pinned.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const f of findings.slice(0, 60)) console.log(`  ! ${f.locale} ${f.quote} ${f.width}px ×${f.scale} — ${f.kind}: ${f.detail}`);
  if (findings.length > 60) console.log(`  … and ${findings.length - 60} more`);
}
if (CHECK && findings.length > 0) process.exit(1);
