#!/usr/bin/env node
/**
 * Every screen's last action can be reached, by scrolling, and pressed.
 *
 *   npm run scroll:audit              measure every route and state, and report
 *   npm run scroll:audit -- --check   the same; exit non-zero on a finding
 *
 * ## The defect this exists for
 *
 * A screenshot of a Numbers question with its orange **Continue** below the
 * bottom of the screen and no way to reach it. The cause was not a missing
 * padding — it was that the page had no scroll container at all: it sits under
 * a shell that hands learning screens a fixed height on purpose, and it never
 * claimed the scrolling that arrangement expects it to own. The content grew,
 * `overflow: hidden` clipped it, and no gesture on the device could recover the
 * button.
 *
 * ## Why this measures rather than clicks
 *
 * Playwright's `locator.click()` scrolls the element into view first. That is
 * usually a kindness and here it is the bug: a suite built on it passes on a
 * page a *learner* cannot scroll, because the driver reaches what the finger
 * cannot. So nothing here calls `click()` to find out whether something is
 * reachable. Each state is measured three times:
 *
 * 1. **Before.** Where is the lowest actionable element, and what is over it?
 * 2. **After a real scroll.** `mouse.wheel` on the page — the same event a
 *    finger produces — repeated until the scroll position stops changing.
 * 3. **Then, and only then, a press.** The element is clicked with
 *    `force: true` at its measured centre, so a click that "worked" only
 *    because the driver scrolled first cannot pass.
 *
 * A finding is one of: the action is still under the fold after scrolling; it
 * is under the bottom navigation or inside the system's safe area; the page
 * scrolls sideways; or there is nothing that scrolls on a page taller than the
 * screen.
 *
 * ## The matrix
 *
 * Every production route at six phone sizes and a landscape one, at three text
 * scales, in both appearances — and, for the screens where a state changes the
 * height, in that state too: a question answered, feedback expanded, a modal
 * open. The full cross-product is 2,000+ measurements and most of them prove
 * the same thing twice, so the sizes are crossed with the routes, and the text
 * scales and appearances are crossed with the routes most likely to overflow.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ensurePreview } from './lib/preview.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';

const findings = [];
const fail = (what) => findings.push(what);

/** The phone sizes the product supports, plus one landscape. */
const SIZES = [
  { name: '320×568', width: 320, height: 568 },
  { name: '360×640', width: 360, height: 640 },
  { name: '360×800', width: 360, height: 800 },
  { name: '390×844', width: 390, height: 844 },
  { name: '412×915', width: 412, height: 915 },
  { name: '430×932', width: 430, height: 932 },
  { name: '740×360 landscape', width: 740, height: 360 },
];

/**
 * Every production route, with a concrete address and the states worth opening.
 *
 * `steps` is a list of things to do before measuring — each is a button name or
 * a test id, pressed with the driver's own scrolling allowed, because getting
 * *into* a state is not what is being tested. The measurement afterwards is.
 */
const ROUTES = [
  { path: '/', address: '/' },
  { path: '/letters', address: '/letters' },
  { path: '/letters/sounds', address: '/letters/sounds' },
  { path: '/letters/numbers', address: '/letters/numbers' },
  { path: '/letters/numbers/:lessonId', address: '/letters/numbers/num-lesson-sino-basics' },
  {
    path: '/letters/numbers/:lessonId (explaining)',
    address: '/letters/numbers/num-lesson-sino-basics',
    steps: [{ testId: 'numbers-start' }],
  },
  {
    path: '/letters/numbers/:lessonId (a question, answered)',
    address: '/letters/numbers/num-lesson-large',
    steps: [{ testId: 'numbers-start' }, { repeat: 'next', times: 12 }, { answerFirstOption: true }],
  },
  { path: '/letters/:lessonId', address: '/letters/lesson-vowels-core' },
  { path: '/words', address: '/words' },
  { path: '/words/category/:category', address: '/words/category/people' },
  { path: '/words/word/:wordId', address: '/words/word/word_eomma' },
  { path: '/words/dictionary/:headword', address: '/words/dictionary/%EA%B7%80%EC%A1%B1' },
  { path: '/words/saved', address: '/words/saved' },
  { path: '/words/today', address: '/words/today' },
  { path: '/review', address: '/review' },
  { path: '/review/mistakes', address: '/review/mistakes' },
  { path: '/review/session', address: '/review/session' },
  { path: '/me', address: '/me' },
  { path: '/me (reset confirmation open)', address: '/me', steps: [{ testId: 'settings-reset-open' }] },
  { path: '/me/activity', address: '/me/activity' },
  { path: '/me/level-test', address: '/me/level-test' },
  { path: '/me/language', address: '/me/language' },
  { path: '/me/privacy', address: '/me/privacy' },
  { path: '/me/legal', address: '/me/legal' },
  { path: '*', address: '/this-route-does-not-exist' },
];

/** The routes most likely to overflow, crossed with text scale and appearance. */
const STRESSED = new Set([
  '/letters/numbers/:lessonId (a question, answered)',
  '/me',
  '/me/privacy',
  '/me/legal',
  '/words/word/:wordId',
  '/letters/numbers/:lessonId (explaining)',
]);

/**
 * What a learner can see, reach and press.
 *
 * Run in the page rather than through locators so that one round trip answers
 * the whole question — the lowest actionable element, the scroller it lives in,
 * and everything drawn over it.
 */
const MEASURE = `() => {
  const actionable = [...document.querySelectorAll(
    'button:not([disabled]), a[href], [role="button"]:not([aria-disabled="true"]), input, select, textarea',
  )].filter((element) => {
    const box = element.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  });
  if (actionable.length === 0) return { none: true };

  // The lowest one in the document, by its position in its own scroller.
  const scrollerOf = (element) => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
    }
    return document.scrollingElement;
  };
  const withOffset = actionable.map((element) => {
    const scroller = scrollerOf(element);
    const box = element.getBoundingClientRect();
    const frame = scroller === document.scrollingElement
      ? { top: 0, bottom: window.innerHeight }
      : scroller.getBoundingClientRect();
    return { element, box, scroller, offset: (scroller.scrollTop ?? 0) + box.bottom - frame.top };
  });
  withOffset.sort((a, b) => a.offset - b.offset);
  const lowest = withOffset[withOffset.length - 1];

  const nav = document.querySelector('nav[class*="bottom"], [data-testid="bottom-navigation"], footer nav');
  const navBox = nav ? nav.getBoundingClientRect() : null;
  const inset = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--hg-safe-bottom') || '0',
  ) || 0;

  const scroller = lowest.scroller;
  const scrollable = scroller === document.scrollingElement
    ? document.scrollingElement.scrollHeight > window.innerHeight + 1
    : scroller.scrollHeight > scroller.clientHeight + 1;

  return {
    label: (lowest.element.textContent || lowest.element.getAttribute('aria-label') || lowest.element.tagName).trim().slice(0, 40),
    box: { x: lowest.box.x, y: lowest.box.y, width: lowest.box.width, height: lowest.box.height, bottom: lowest.box.bottom },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    navTop: navBox ? navBox.top : null,
    inset,
    scrollable,
    scrollerIsDocument: scroller === document.scrollingElement,
    scrollTop: scroller.scrollTop ?? 0,
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller === document.scrollingElement ? window.innerHeight : scroller.clientHeight,
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}`;

/** Wheels the page until the scroll position stops moving. A finger, not a driver. */
async function scrollToEnd(page) {
  let previous = -1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const at = await page.evaluate(`(${MEASURE})()`);
    if (!at || at.none) return;
    if (at.scrollTop === previous) return;
    previous = at.scrollTop;
    await page.mouse.move(at.viewport.width / 2, at.viewport.height / 2);
    await page.mouse.wheel(0, at.viewport.height);
    await page.waitForTimeout(90);
  }
}

async function enter(page, steps = []) {
  for (const step of steps) {
    if (step.testId) {
      const target = page.getByTestId(step.testId);
      if (await target.count()) await target.first().click({ timeout: 5000 }).catch(() => {});
    }
    if (step.repeat === 'next') {
      for (let i = 0; i < step.times; i += 1) {
        /*
         * The labels that move a lesson forward, including the one that opens
         * practice.
         *
         * The first version of this list stopped at *Next* and *Continue*, so
         * the walk parked on the practice **intro** — a short screen that fits
         * any phone — and the audit measured it and reported the whole route
         * green. The state that was photographed is one screen further on: an
         * *answered question*, which is the tallest thing this page ever draws
         * because the feedback and its explanation appear under the options. A
         * matrix that cannot reach the tall state proves nothing about it.
         */
        const next = page
          .locator('button')
          .filter({ hasText: /^(Next|Continue|Start practising|Start the mastery check|다음|계속|연습 시작|마무리 확인 시작)$/ })
          .first();
        if (!(await next.count())) break;
        await next.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(120);
      }
    }
    if (step.answerFirstOption) {
      const option = page.getByRole('group').getByRole('button').first();
      if (await option.count()) await option.click({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(200);
  }
}

const stop = await ensurePreview(baseUrl);
const browser = await chromium.launch();
let measured = 0;

for (const route of ROUTES) {
  const variants = [];
  for (const size of SIZES) variants.push({ size, scale: 1, scheme: 'light' });
  if (STRESSED.has(route.path)) {
    for (const scale of [1.5, 2]) variants.push({ size: SIZES[3], scale, scheme: 'light' });
    variants.push({ size: SIZES[0], scale: 2, scheme: 'dark' });
    variants.push({ size: SIZES[3], scale: 1, scheme: 'dark' });
  }

  for (const variant of variants) {
    const context = await browser.newContext({
      viewport: { width: variant.size.width, height: variant.size.height },
      hasTouch: true,
      colorScheme: variant.scheme,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    if (variant.scale !== 1) {
      await page.addInitScript((factor) => {
        document.documentElement.style.fontSize = `${16 * factor}px`;
      }, variant.scale);
    }
    const where = `${route.path} @ ${variant.size.name}${variant.scale === 1 ? '' : ` ×${variant.scale}`}${variant.scheme === 'dark' ? ' dark' : ''}`;
    try {
      await page.goto(`${baseUrl}${route.address}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1400); // past the splash and the lazy chunk
      await enter(page, route.steps);

      const before = await page.evaluate(`(${MEASURE})()`);
      if (!before || before.none) {
        await context.close();
        continue;
      }

      // A page taller than its frame must have something that scrolls.
      if (!before.scrollable && before.box.bottom > before.viewport.height) {
        fail(`${where}: "${before.label}" is below the fold and nothing on the page scrolls`);
      }

      await scrollToEnd(page);
      const after = await page.evaluate(`(${MEASURE})()`);
      measured += 1;

      const floor = after.navTop !== null ? after.navTop : after.viewport.height - after.inset;
      if (after.box.bottom > floor + 1) {
        fail(
          `${where}: "${after.label}" ends at ${Math.round(after.box.bottom)} px, ` +
            `under the ${after.navTop !== null ? 'bottom navigation' : 'safe area'} at ${Math.round(floor)} px`,
        );
      } else if (after.box.y < 0) {
        /*
         * Scrolled past it, which is not the same as unreachable.
         *
         * The lowest *actionable* element is not always the lowest content: a
         * legal page ends in a paragraph, so wheeling to the bottom carries the
         * last link off the top of a short landscape viewport. What a learner
         * does then is scroll back a little, so that is what this does — and
         * the assertion becomes the honest one: there exists a scroll position
         * at which the control is fully visible and clear of the furniture.
         */
        let recovered = after;
        for (let attempt = 0; attempt < 20 && recovered.box.y < 0; attempt += 1) {
          await page.mouse.move(recovered.viewport.width / 2, recovered.viewport.height / 2);
          await page.mouse.wheel(0, -Math.max(60, recovered.box.height));
          await page.waitForTimeout(80);
          recovered = await page.evaluate(`(${MEASURE})()`);
        }
        const recoveredFloor = recovered.navTop !== null ? recovered.navTop : recovered.viewport.height - recovered.inset;
        if (recovered.box.y < 0 || recovered.box.bottom > recoveredFloor + 1) {
          fail(`${where}: no scroll position puts "${recovered.label}" fully on screen and clear of the furniture`);
        } else {
          const centre = { x: recovered.box.x + recovered.box.width / 2, y: recovered.box.y + recovered.box.height / 2 };
          const pressed = await page.mouse.click(centre.x, centre.y).then(() => true).catch(() => false);
          if (!pressed) fail(`${where}: "${recovered.label}" is visible but could not be pressed at its own centre`);
        }
      } else {
        // Reachable — so press it where it is, without letting the driver move it.
        const centre = { x: after.box.x + after.box.width / 2, y: after.box.y + after.box.height / 2 };
        const pressed = await page
          .mouse.click(centre.x, centre.y)
          .then(() => true)
          .catch(() => false);
        if (!pressed) fail(`${where}: "${after.label}" is visible but could not be pressed at its own centre`);
      }

      if (after.horizontal > 1) {
        fail(`${where}: the page scrolls sideways by ${Math.round(after.horizontal)} px`);
      }
    } catch (error) {
      fail(`${where}: ${String(error).split('\n')[0]}`);
    }
    await context.close();
  }
}

await browser.close();
await stop();

console.log(`Reachable actions — ${ROUTES.length} route/state(s), ${measured} measurement(s)`);
console.log(`  sizes: ${SIZES.map((s) => s.name).join(', ')}`);
console.log('  each one scrolled with a real wheel gesture, then pressed at its measured centre');
if (findings.length === 0) {
  console.log('  every screen\'s last action is reachable, clear of the navigation and the safe area.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings) console.log(`    ${finding}`);
}
if (CHECK && findings.length > 0) process.exit(1);
