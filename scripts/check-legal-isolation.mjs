#!/usr/bin/env node
/**
 * Privacy, Terms, About and Licences end where they say they end.
 *
 *   npm run legal:isolation            render and report
 *   npm run legal:isolation -- --check the same; exit non-zero on a finding
 *
 * ## The reported defect
 *
 * A screenshot of the Privacy screen with the **Pronunciation voice** setting
 * printed under it: the two voice options, the sample, the provider line. A
 * legal page with somebody else's settings pasted onto the bottom is not a
 * cosmetic fault — it is the screen a store reviewer opens, and a learner
 * reading it cannot tell which of the sentences on it are the commitment.
 *
 * `pages/legalIsolation.test.tsx` holds the structural half of this rule and
 * runs in milliseconds. This is the half it cannot do:
 *
 * * **The real bundle.** A production build with its own route splitting, its
 *   own lazy chunks and its own portals, rather than one route mounted in
 *   jsdom. If nesting or a shared layout is what leaks, this is where it shows.
 * * **A real viewport.** Content under the fixed bottom navigation is invisible
 *   and perfectly present in the DOM, so no DOM assertion can find it. It needs
 *   two boxes and a comparison.
 * * **The devices, the themes and the reading size.** 320 px through 430 px,
 *   light and dark, and 200% text — because "the last paragraph clears the
 *   navigation" is true at one size and false at another, and the size where it
 *   fails is the small phone with the large type.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';

import { chromium } from 'playwright';

import { ensurePreview } from './lib/preview.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, '..', 'apps/web/src');
const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';

/** The screens that must carry nothing but their own subject. */
const PAGES = [
  { name: 'privacy', path: '/me/privacy' },
  { name: 'licences', path: '/me/legal' },
];

/**
 * Widths, themes and reading sizes, as a small matrix rather than a large one.
 *
 * The narrow phone and the doubled text are where a page runs into the
 * navigation; the wide phone is where a fixed footer stops being fixed; dark is
 * where a token defined for one theme goes missing. 430 px in light at 100% is
 * the case nothing has ever failed at, and it is here because a matrix with no
 * control in it cannot tell "passes everywhere" from "the harness is broken".
 */
const PROFILES = [
  { name: '320 light', width: 320, dark: false, text: 1 },
  { name: '360 dark', width: 360, dark: true, text: 1 },
  { name: '390 light', width: 390, dark: false, text: 1 },
  { name: '390 light · 200% text', width: 390, dark: false, text: 2 },
  { name: '412 dark · 200% text', width: 412, dark: true, text: 2 },
  { name: '430 light', width: 430, dark: false, text: 1 },
];

/** Every language's name for the pronunciation-voice setting. */
const voiceHeadings = readdirSync(join(WEB, 'locales'))
  .map((locale) => {
    try {
      const settings = JSON.parse(readFileSync(join(WEB, 'locales', locale, 'settings.json'), 'utf8'));
      return { locale, title: settings?.voice?.title };
    } catch {
      return { locale, title: undefined };
    }
  })
  .filter((entry) => typeof entry.title === 'string' && entry.title.trim() !== '');

const findings = [];
const fail = (what) => findings.push(what);

const stop = await ensurePreview(baseUrl);
const browser = await chromium.launch();

let measured = 0;
for (const profile of PROFILES) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    colorScheme: profile.dark ? 'dark' : 'light',
  });
  const page = await context.newPage();
  if (profile.text !== 1) {
    await page.addInitScript((factor) => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.fontSize = `${16 * factor}px`;
      });
    }, profile.text);
  }

  for (const target of PAGES) {
    await page.goto(`${baseUrl}${target.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    const where = `${target.name} at ${profile.name}`;
    measured += 1;

    const seen = await page.evaluate(() => {
      const main = document.querySelector('main');
      const nav = document.querySelector('nav');
      const content = main?.firstElementChild ?? null;
      const last = content?.lastElementChild ?? null;
      const box = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      };
      return {
        settingsGroups: document.querySelectorAll('[data-settings-group]').length,
        childrenOfMain: main ? main.children.length : -1,
        text: document.body.innerText,
        last: box(last),
        nav: box(nav),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });

    if (seen.settingsGroups > 0) {
      fail(`${where}: ${seen.settingsGroups} settings group(s) rendered on a legal page`);
    }
    if (seen.childrenOfMain !== 1) {
      fail(`${where}: <main> holds ${seen.childrenOfMain} screens, not 1`);
    }
    for (const { locale, title } of voiceHeadings) {
      if (seen.text.includes(title)) {
        fail(`${where}: shows the pronunciation-voice heading (${locale}: "${title}")`);
      }
    }
    if (seen.scrollWidth > seen.clientWidth + 1) {
      fail(`${where}: the page scrolls sideways (${seen.scrollWidth} > ${seen.clientWidth})`);
    }
    /*
     * The last thing on the page has to finish above the navigation.
     *
     * Scrolled to the very bottom first, because the question is not whether
     * the content *starts* clear of the bar — it is whether a learner who
     * scrolls as far as the page goes can read its final line. A page with too
     * little bottom padding looks perfect until you reach the end of it.
     */
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = main.scrollHeight;
    });
    await page.waitForTimeout(250);
    const end = await page.evaluate(() => {
      const main = document.querySelector('main');
      const nav = document.querySelector('nav');
      if (!main || !nav) return null;
      /*
       * The last *ink*, not the last box.
       *
       * Measuring the last element's rectangle measures its padding too, and
       * the padding is the thing keeping the text clear of the navigation — so
       * a page with exactly the right bottom padding reports its box touching
       * the bar and looks like the defect. What a learner cannot read is a
       * glyph, so the glyphs are what is measured: every text node in the
       * screen, through a Range, and the lowest rectangle any of them draws.
       */
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let lowest = null;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width === 0 && rect.height === 0) continue;
          if (lowest === null || rect.bottom > lowest) lowest = rect.bottom;
        }
      }
      return lowest === null ? null : { bottom: lowest, navTop: nav.getBoundingClientRect().top };
    });
    /*
     * A clear gap, not merely "not overlapping".
     *
     * Text whose descender stops one pixel above a solid bar is text a learner
     * reads as cut off, and on a rounded phone screen it may genuinely be under
     * the home indicator. Eight pixels is the smallest gap that still reads as
     * a margin.
     */
    const CLEARANCE = 8;
    if (end && end.bottom > end.navTop - CLEARANCE) {
      const short = Math.round(end.bottom - (end.navTop - CLEARANCE));
      fail(`${where}: the last line comes ${short} px too close to the navigation`);
    }
  }
  await context.close();
}

/*
 * And the ways a learner actually arrives, rather than only the deep link.
 *
 * Everything above opens the address directly, which is one of five routes to
 * this screen and the only one with no history behind it. The reported
 * screenshot is of somebody who *walked* there — out of My Learning, where the
 * pronunciation-voice setting lives — so the walk is worth doing: tap through,
 * come back, go forward again, reload on the spot. Each of those is a different
 * mounting, and a leak that needs a shared layout, a stale scroll container or
 * a restored history entry to appear will not appear in a cold load.
 */
const journey = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
});
const walk = await journey.newPage();

/** What the privacy screen is carrying that it should not be. */
async function inspect(page, where) {
  const seen = await page.evaluate(() => ({
    groups: document.querySelectorAll('[data-settings-group]').length,
    screens: document.querySelector('main')?.children.length ?? -1,
    text: document.body.innerText,
    path: location.pathname,
  }));
  if (seen.path !== '/me/privacy') {
    fail(`${where}: ended up on ${seen.path} rather than the privacy screen`);
    return;
  }
  if (seen.groups > 0) fail(`${where}: ${seen.groups} settings group(s) on the privacy screen`);
  if (seen.screens !== 1) fail(`${where}: <main> holds ${seen.screens} screens, not 1`);
  for (const { locale, title } of voiceHeadings) {
    if (seen.text.includes(title)) {
      fail(`${where}: shows the pronunciation-voice heading (${locale}: "${title}")`);
    }
  }
  measured += 1;
}

await walk.goto(`${baseUrl}/me`, { waitUntil: 'networkidle' });
await walk.waitForTimeout(1400);
// All the way down My Learning first, so the voice setting has been mounted and
// scrolled past before the learner leaves — the state the screenshot was taken
// in, as near as a script can put it.
await walk.evaluate(() => {
  const main = document.querySelector('main');
  if (main) main.scrollTop = main.scrollHeight;
});
await walk.waitForTimeout(300);

const privacyLink = walk.locator('a[href="/me/privacy"]');
if ((await privacyLink.count()) === 0) {
  fail('My Learning has no link to the privacy screen');
} else {
  await privacyLink.first().click();
  await walk.waitForTimeout(1200);
  await inspect(walk, 'walked from My Learning');

  await walk.goBack({ waitUntil: 'networkidle' });
  await walk.waitForTimeout(800);
  await walk.goForward({ waitUntil: 'networkidle' });
  await walk.waitForTimeout(1200);
  await inspect(walk, 'returned to by browser forward');

  await walk.reload({ waitUntil: 'networkidle' });
  await walk.waitForTimeout(1400);
  await inspect(walk, 'reloaded on the spot');

  // And in another language, since switching locale remounts the tree.
  await walk.goto(`${baseUrl}/me/language`, { waitUntil: 'networkidle' });
  await walk.waitForTimeout(1200);
  const korean = walk.locator('button', { hasText: '한국어' });
  if (await korean.count()) {
    await korean.first().click();
    await walk.waitForTimeout(1200);
    await walk.goto(`${baseUrl}/me/privacy`, { waitUntil: 'networkidle' });
    await walk.waitForTimeout(1400);
    await inspect(walk, 'after switching the interface to Korean');
  }
}

await journey.close();
await browser.close();
await stop();

console.log(
  `Legal isolation — ${PAGES.length} pages x ${PROFILES.length} device profiles, plus the walk from My Learning; ${measured} renders`,
);
console.log(`  ${voiceHeadings.length} locales' voice heading checked for on every one`);
if (findings.length === 0) {
  console.log('  every legal page carries its own content, ends above the navigation, and nothing else.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings) console.log(`    ${finding}`);
}
if (CHECK && findings.length > 0) process.exit(1);
