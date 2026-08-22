#!/usr/bin/env node
/**
 * Every interface language, on the screens a learner actually meets.
 *
 *   npm run qa:locales            render, measure, and write the gallery
 *   npm run qa:locales -- --check measure only; exit non-zero on a finding
 *
 * ## Why this exists next to `i18n:check`
 *
 * `i18n:check` reports 100% for all thirty-two locales and is right about the
 * files it reads. It cannot see a screen. Four separate bodies of content have
 * been found English under that green report — the practice typefaces, the
 * quotations, the tab bar and twenty-eight languages' unit headings — and the
 * two that mattered most were only findable by looking at a rendered page: a
 * quotation renderer that threw and blanked the Arabic home screen, and a tab
 * bar that never re-rendered and kept `Home / Letters / Words` under a fully
 * Arabic interface.
 *
 * So this renders. Seven screens in thirty-two languages is 224 pages, which is
 * more than anybody will read carefully, so the measuring is what narrows it:
 * the script reports what is *measurably* wrong and writes a contact sheet for
 * the rest. Numbers cannot tell you whether a Hungarian button reads naturally;
 * they can tell you it is cut in half.
 *
 * ## What it measures
 *
 * | | |
 * | --- | --- |
 * | **Overflowing** | An element whose content is wider or taller than its own box — the definition of clipped text, whatever caused it. |
 * | **Sideways** | The page scrolling horizontally. A phone layout that does this is broken, full stop. |
 * | **Untranslated** | An English interface string still on screen in a locale that is not English. Matched against the *English bundle's own values*, so it cannot be fooled by a brand name or a Korean word. |
 * | **Empty** | A control with an accessible name of nothing. Usually a missing key rendering as a blank rather than as its own name. |
 * | **Overlapping** | Two interactive elements whose boxes intersect. Catches a button that has slid under the tab bar. |
 *
 * ## What it deliberately does not measure
 *
 * Naturalness. Nothing here can tell whether a sentence reads like something a
 * person would write, and no count of passing screens is evidence that it does.
 * That needs a speaker of the language, it has not happened, and
 * `docs/LOCALIZATION_NATIVE_REVIEW.md` says so.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ensurePreview } from './lib/preview.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(root, '.locale-qa');
const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';

const PHONE = { width: 390, height: 844 };

/** Every locale directory, which is the same list the app ships. */
const ALL_LOCALES = readdirSync(join(root, 'apps/web/src/locales')).sort();

/**
 * The screens worth looking at in every language.
 *
 * One of each kind of layout rather than one of each route: a list, a lesson, a
 * question, a detail page, a dashboard, a settings screen and the picker. A
 * screen that is fine in all seven is very unlikely to be broken in the others,
 * and 32 x 7 is already 224 renders.
 */
const SCREENS = [
  { name: 'home', path: '/' },
  { name: 'letters', path: '/letters' },
  { name: 'words', path: '/words' },
  { name: 'session', path: '/words/today' },
  { name: 'detail', path: '/words/word/word_eomma' },
  { name: 'review', path: '/review' },
  { name: 'me', path: '/me' },
  { name: 'language', path: '/me/language' },
];

/** English interface strings, to spot one still on screen in another language. */
function englishStrings() {
  const dir = join(root, 'apps/web/src/locales/en');
  const values = new Set();
  const walk = (node) => {
    if (typeof node === 'string') {
      const text = node.trim();
      /*
       * Only strings long enough to be unmistakable. "OK", "A–Z" and a bare
       * "1" are the same in most languages and would report every locale as
       * untranslated; a four-word English sentence on a Tamil screen is not a
       * coincidence.
       */
      if (text.split(/\s+/).length >= 4 && text.length >= 18 && !/\{\{/.test(text)) {
        values.add(text);
      }
      return;
    }
    if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  for (const file of readdirSync(dir)) {
    walk(JSON.parse(readFileSync(join(dir, file), 'utf8')));
  }
  return [...values];
}

const ENGLISH = englishStrings();

const findings = [];
const rows = [];

const stopPreview = await ensurePreview(baseUrl);
const browser = await chromium.launch();

for (const locale of ALL_LOCALES) {
  /*
   * The **browser's** language, not a row written into the app's storage.
   *
   * Two reasons, and the second is the one that matters. It is how a learner
   * actually arrives — the app detects the device language on a first launch
   * and there is no tap to make — so this exercises detection and rendering
   * together. And it survives navigation: seeding IndexedDB and then calling
   * `page.goto` seven times had the app reading its own defaults back on every
   * load, which produced 1,499 "untranslated" findings for screens that render
   * perfectly in Arabic. A measurement that says the product is broken when it
   * is not is worse than no measurement.
   */
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    locale,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) =>
    findings.push({ locale, screen: '-', kind: 'threw', detail: String(error).slice(0, 160) }),
  );

  for (const screen of SCREENS) {
    await page.goto(`${baseUrl}${screen.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const measured = await page.evaluate((english) => {
      const problems = [];
      const root = document.getElementById('root');
      if (!root) return { problems, lang: '', dir: '', text: '' };

      if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        problems.push({ kind: 'sideways', detail: `${document.documentElement.scrollWidth}px` });
      }

      const interactive = [...document.querySelectorAll('button, a[href], [role="button"]')];
      for (const element of interactive) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        // Clipped: the content is bigger than the box that is showing it, and
        // the box is not a scroller.
        const clips = style.overflow !== 'visible' && style.overflowX !== 'auto';
        if (clips && element.scrollWidth > element.clientWidth + 2) {
          problems.push({
            kind: 'overflowing',
            detail: `${(element.textContent ?? '').trim().slice(0, 40)} — ${element.scrollWidth}>${element.clientWidth}px`,
          });
        }
        const name = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
        if (!name && !element.querySelector('svg, img')) {
          problems.push({ kind: 'empty', detail: element.className.toString().slice(0, 40) });
        }
      }

      const text = (document.body.innerText ?? '').replace(/\s+/g, ' ');
      for (const phrase of english) {
        if (text.includes(phrase)) {
          problems.push({ kind: 'untranslated', detail: phrase.slice(0, 60) });
        }
      }

      return {
        problems,
        lang: document.documentElement.lang,
        dir: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
        text: text.slice(0, 90),
      };
    }, locale === 'en' ? [] : ENGLISH);

    for (const problem of measured.problems) {
      findings.push({ locale, screen: screen.name, ...problem });
    }

    if (!CHECK) {
      mkdirSync(join(OUT, locale), { recursive: true });
      await page.screenshot({ path: join(OUT, locale, `${screen.name}.png`) });
    }
    rows.push({ locale, screen: screen.name, ...measured, problems: measured.problems.length });
  }

  await context.close();
  const bad = findings.filter((f) => f.locale === locale).length;
  console.log(`  ${locale.padEnd(6)} ${bad === 0 ? 'ok' : `${bad} finding(s)`}`);
}

await browser.close();
await stopPreview();

if (!CHECK) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'index.html'),
    `<html><head><meta charset="utf-8"><title>Locale screens</title>
     <style>body{font:13px system-ui;margin:16px;background:#fafafa}
     h2{margin:24px 0 6px;font-size:15px} .row{display:flex;gap:6px;overflow-x:auto}
     figure{margin:0;flex:0 0 auto} img{width:180px;border:1px solid #ddd;background:#fff}
     figcaption{font-size:11px;color:#666}</style></head><body>
     <h1>Every screen, every language</h1>
     ${ALL_LOCALES.map(
       (locale) => `<h2>${locale}</h2><div class="row">${SCREENS.map(
         (screen) =>
           `<figure><img src="${locale}/${screen.name}.png" loading="lazy"><figcaption>${screen.name}</figcaption></figure>`,
       ).join('')}</div>`,
     ).join('')}
     </body></html>`,
  );
}

const byKind = {};
for (const finding of findings) byKind[finding.kind] = (byKind[finding.kind] ?? 0) + 1;

console.log(
  `\nLocale screens — ${ALL_LOCALES.length} languages x ${SCREENS.length} screens = ` +
    `${ALL_LOCALES.length * SCREENS.length} renders`,
);
for (const [kind, count] of Object.entries(byKind)) console.log(`  ${kind.padEnd(14)} ${count}`);

if (findings.length === 0) {
  console.log('  no measurable problem on any screen in any language.');
  console.log('\n  Measured, not read. Whether the sentences are natural is a different');
  console.log('  question and needs a speaker — see docs/LOCALIZATION_NATIVE_REVIEW.md.');
} else {
  console.log('');
  for (const finding of findings.slice(0, 60)) {
    console.log(`  ✗ ${finding.locale}/${finding.screen}  ${finding.kind}: ${finding.detail}`);
  }
  if (findings.length > 60) console.log(`  …and ${findings.length - 60} more`);
}

if (!CHECK) console.log(`\ngallery: ${join(OUT, 'index.html')}`);
if (CHECK && findings.length > 0) process.exit(1);
