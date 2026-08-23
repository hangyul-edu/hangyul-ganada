#!/usr/bin/env node
/**
 * Every screen, at every size a phone actually is, in both themes.
 *
 *   npm run screens:audit            render, measure, write the contact sheet
 *   npm run screens:audit -- --check measure only; exit non-zero on a finding
 *
 * ## Why this sits beside `qa:locales`
 *
 * That script varies the *language* and holds the device still: one viewport,
 * one theme, one text size, thirty-two translations. It is the right shape for
 * finding a Hungarian button cut in half and the wrong shape for everything
 * §54–§57 asks about, which is what happens to one language when the device
 * changes underneath it.
 *
 * So this varies the device and holds the language still. Four axes, and each
 * of them is a real customer rather than a hypothetical:
 *
 * | | |
 * | --- | --- |
 * | **320 px** | An iPhone SE, and the narrowest width still worth supporting. |
 * | **360 px** | The commonest Android width in the world. |
 * | **390 px** | The modal iPhone. |
 * | **412 px** | The commonest large Android width. |
 * | **430 px** | A Pro Max, where the risk is not clipping but a layout that stops filling the screen. |
 * | **Dark** | `prefers-color-scheme: dark`, which about half of all phones are set to. |
 * | **200% text** | WCAG 1.4.4. A learner who needs it is a learner who cannot read the app without it. |
 *
 * ## What it measures, and why each one is a defect and not a preference
 *
 * **Clipped** — content wider than the box showing it, where the box is not a
 * scroller. Text a learner cannot finish reading.
 *
 * **Sideways** — the page scrolling horizontally. A phone layout that does this
 * is broken however it got there.
 *
 * **Small targets** — an interactive element under 44 px in either direction,
 * which is the floor §7 names and the one both platforms publish.
 *
 * **Overlapping** — two interactive elements whose boxes intersect. A button
 * that has slid under the tab bar takes taps meant for the other one.
 *
 * **Dead space** — a screen that does not scroll and whose content ends more
 * than a third of the way up the viewport. §52 is explicit that the fix is
 * never a new card, so this reports the composition and does not suggest one.
 *
 * **Low contrast** — a foreground and background below WCAG 1.4.3. Cheap to check
 * per theme, and the failure it catches is a token that was only defined for
 * one of the two.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ensurePreview } from './lib/preview.mjs';
/*
  The e2e suite's own tracer, imported rather than reimplemented.

  The first version of this file had its own copy that read ink out of
  `canvas` — and read the wrong canvas, so the attempt never passed and the
  recognition state was reported unreachable at every width. A second
  implementation of "draw the letter" is a second thing that can be subtly
  wrong, and this repository has been bitten by that twice before.
*/
import { drawScribble, traceReferenceGlyph } from '../apps/web/e2e/helpers/trace';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(root, '.visual-qa/screens');
const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';

/*
  Routes, and the states behind them.

  A `path` screen is a route: navigate, wait, measure. A `state` screen is
  something a learner has to *do* something to see — a modal, a graded answer, a
  populated list — and it carries an `arrive` that does it.

  The distinction is the whole reason this list grew. Everything here was a
  route, so the placement modal shipped with a button hanging outside it and
  this check reported nothing: a modal is not a route, and neither is "the
  screen after you got it wrong". §51.

  `lesson` was also wrong in a quieter way — it pointed at
  `/letters/lesson-vowels-1`, which does not exist. The lesson ids are
  `lesson-vowels-core`, `lesson-consonants-first` and so on, so for however long
  that entry has been there this audit has been measuring the not-found page and
  reporting it as a clean lesson screen. A route in a fixture is a claim like
  any other.
*/
const SCREENS = [
  { name: 'home', path: '/' },
  { name: 'letters', path: '/letters' },
  { name: 'lesson', path: '/letters/lesson-vowels-core' },
  { name: 'sounds', path: '/letters/sounds' },
  { name: 'words', path: '/words' },
  { name: 'session', path: '/words/today' },
  { name: 'detail', path: '/words/word/word_eomma' },
  { name: 'dictionary', path: '/words/dictionary/%EA%B7%80%EC%A1%B1' },
  { name: 'saved', path: '/words/saved' },
  { name: 'review', path: '/review' },
  { name: 'mistakes', path: '/review/mistakes' },
  { name: 'me', path: '/me' },
  { name: 'activity', path: '/me/activity' },
  { name: 'leveltest', path: '/me/level-test' },
  { name: 'language', path: '/me/language' },
  { name: 'legal', path: '/me/legal' },
  { name: 'privacy', path: '/me/privacy' },
];

/**
 * The states a learner reaches by doing something.
 *
 * Measured on fewer device profiles than the routes are, and deliberately: each
 * of these costs a walk through the product, and what they are being asked is a
 * *layout* question — does anything clip, overlap or escape — which the narrow
 * width, the doubled text and the dark palette answer between them. A fifth
 * profile would cost minutes and repeat what 390 already said.
 */
const STATES = [
  {
    name: 'placement modal',
    async arrive(page, url) {
      await page.goto(`${url}/words/today`, { waitUntil: 'networkidle' });
      await page.getByTestId('placement-skip').waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    name: 'writing accepted',
    async arrive(page, url) {
      await reachTheWritingBox(page, url);
      await traceReferenceGlyph(page, page.getByTestId('writing-canvas').first());
      await page.getByRole('button', { name: /Check|확인/ }).click();
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'writing rejected',
    async arrive(page, url) {
      await reachTheWritingBox(page, url);
      await drawScribble(page, page.getByTestId('writing-canvas').first());
      await page.getByRole('button', { name: /Check|확인/ }).click();
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'recognition answered',
    async arrive(page, url) {
      await reachTheWritingBox(page, url);
      await traceReferenceGlyph(page, page.getByTestId('writing-canvas').first());
      await page.getByRole('button', { name: /Check|확인/ }).click();
      await page.getByRole('button', { name: /Try a question|문제 풀어 보기/ }).click();
      await page.waitForTimeout(700);
      const tile = page.getByRole('button').filter({ hasText: /^[\u3130-\u318f\uac00-\ud7a3]$/ });
      await tile.first().waitFor({ state: 'visible', timeout: 8000 });
      await tile.first().click();
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'level test question',
    async arrive(page, url) {
      await page.goto(`${url}/me/level-test`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await page.locator('main button:visible').last().click();
      await page.waitForTimeout(1500);
    },
  },
  {
    name: 'vocabulary answered',
    async arrive(page, url) {
      await page.goto(`${url}/words/today`, { waitUntil: 'networkidle' });
      const skip = page.getByTestId('placement-skip');
      await skip.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
      if (await skip.isVisible().catch(() => false)) await skip.click();
      // Past the introduction, then answer whatever question comes up.
      for (let step = 0; step < 6; step += 1) {
        const options = page.getByRole('group').first().getByRole('button');
        if (await options.count()) {
          await options.first().click();
          await page.waitForTimeout(700);
          return;
        }
        const onward = page.locator('main button:visible:not([disabled])').last();
        if (!(await onward.count())) return;
        await onward.click();
        await page.waitForTimeout(600);
      }
    },
  },
];

/** Past the unit card and the letter's introduction, to the writing box. */
async function reachTheWritingBox(page, url) {
  await page.goto(`${url}/letters/lesson-vowels-core?from=start`, { waitUntil: 'networkidle' });
  const unit = page.getByRole('button', { name: /Got it/ });
  const intro = page.getByRole('button', { name: /Trace it|Write it/ });
  const box = page.getByTestId('writing-canvas').first();
  await unit.or(intro).or(box).first().waitFor({ state: 'visible', timeout: 10_000 });
  if (await unit.isVisible().catch(() => false)) await unit.click();
  if (await intro.isVisible().catch(() => false)) await intro.click();
  await page.evaluate(() => document.fonts.ready);
  await box.locator('canvas').first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(400);
}

const DEVICES = [
  { name: '320', width: 320, height: 568, scheme: 'light', zoom: 1 },
  { name: '360', width: 360, height: 800, scheme: 'light', zoom: 1 },
  { name: '390', width: 390, height: 844, scheme: 'light', zoom: 1 },
  { name: '412', width: 412, height: 915, scheme: 'light', zoom: 1 },
  { name: '430', width: 430, height: 932, scheme: 'light', zoom: 1 },
  { name: '390-dark', width: 390, height: 844, scheme: 'dark', zoom: 1 },
  { name: '390-200%', width: 390, height: 844, scheme: 'light', zoom: 2 },
];

/** See `e2e/accessibility.spec.ts` for why these two are allowed, and disclosed. */
const BRAND_PAIRS = new Set(['#ffffff on #ff6700', '#ff6700 on #ffffff']);

const findings = [];
const stopPreview = await ensurePreview(baseUrl);
const browser = await chromium.launch();

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    colorScheme: device.scheme,
    locale: 'en',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) =>
    findings.push({ device: device.name, screen: '-', kind: 'threw', detail: String(error).slice(0, 140) }),
  );

  /*
   * 200% text as a *text* zoom, not a page zoom.
   *
   * `deviceScaleFactor` and browser zoom scale the viewport with the text, so
   * everything stays in proportion and nothing is learned. What WCAG 1.4.4 asks
   * about is text growing inside a layout that does not, which is what doubling
   * the root font size does — every `rem` follows and every `px` stays put,
   * exactly as it would for a learner who has set a larger system size.
   */
  if (device.zoom !== 1) {
    await page.addInitScript((factor) => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.fontSize = `${16 * factor}px`;
      });
    }, device.zoom);
  }

  /*
    The routes on every profile, the states on the ones that decide layout:
    the narrowest width, the modal one, the doubled text and the dark palette.
  */
  const STATE_PROFILES = new Set(['320', '390', '390-dark', '390-200%']);
  const here = [
    ...SCREENS,
    ...(STATE_PROFILES.has(device.name) ? STATES : []),
  ];

  for (const screen of here) {
    if (screen.arrive) {
      try {
        await screen.arrive(page, baseUrl);
      } catch {
        findings.push({ device: device.name, screen: screen.name, kind: 'unreachable', detail: 'the state could not be reached' });
        continue;
      }
    } else {
      await page.goto(`${baseUrl}${screen.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1400);
    }

    const measured = await page.evaluate(() => {
      const problems = [];
      const visible = (element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        /*
          Screen-reader-only text is not on screen, whatever its box says.

          The `hg-sr-only` pattern is a 1×1 absolutely positioned element with
          `clip: rect(0,0,0,0)`, so it has a non-zero rectangle and passes every
          naive visibility test. The stroke counter is one, and this check
          duly reported it as 1.11:1 contrast — #f6f0ea on the canvas paper —
          which is true of two colours that are never both painted.
        */
        if (element.closest('.hg-sr-only')) return false;
        const box = element.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1) return false;
        return box.width > 0 && box.height > 0;
      };
      /*
        A disabled control is exempt from WCAG 1.4.3 by name, and the criterion
        says so: "text or images of text that are part of an inactive user
        interface component". The step tabs are disabled until the writing is
        accepted, and greying them out is how they say so.
      */
      const inactive = (element) =>
        !!element.closest('[disabled], [aria-disabled="true"], fieldset:disabled');

      if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        problems.push({
          kind: 'sideways',
          detail: `${document.documentElement.scrollWidth}px in a ${window.innerWidth}px window`,
        });
      }

      const interactive = [...document.querySelectorAll('button, a[href], [role="button"], input, select')]
        .filter(visible);

      for (const element of interactive) {
        const style = getComputedStyle(element);
        const clips = style.overflow !== 'visible' && style.overflowX !== 'auto';
        if (clips && element.scrollWidth > element.clientWidth + 2) {
          problems.push({
            kind: 'clipped',
            detail: `${(element.textContent ?? '').trim().slice(0, 34)} — ${element.scrollWidth}>${element.clientWidth}px`,
          });
        }

        /*
         * The touch target, including whatever the element pushes out with a
         * pseudo-element. Several controls in this app are visually small on
         * purpose and carry an `::after` that extends the hit area, which is
         * the pattern §7 asked for — measuring the visible box alone would
         * report those as failures and teach everyone to ignore the check.
         */
        const box = element.getBoundingClientRect();
        let { width, height } = box;
        for (const which of ['::before', '::after']) {
          const pseudo = getComputedStyle(element, which);
          if (pseudo.content === 'none' || pseudo.position !== 'absolute') continue;
          const grow = (side) => {
            const value = Number.parseFloat(pseudo[side]);
            return Number.isFinite(value) ? -value : 0;
          };
          width += Math.max(0, grow('left')) + Math.max(0, grow('right'));
          height += Math.max(0, grow('top')) + Math.max(0, grow('bottom'));
        }
        /*
         * A link inside a sentence is exempt, and says so in WCAG 2.5.8: its
         * size is determined by the text it sits in, and padding it to 44 px
         * would break the paragraph around it. The attribution line under a
         * dictionary entry is the case here.
         */
        const inline = element.tagName === 'A' &&
          getComputedStyle(element).display.startsWith('inline') &&
          !!element.closest('p, li');
        if (!inline && (width < 43 || height < 43)) {
          problems.push({
            kind: 'small target',
            detail: `${(element.getAttribute('aria-label') ?? element.textContent ?? element.className).toString().trim().slice(0, 30)} — ${Math.round(width)}x${Math.round(height)}`,
          });
        }
      }

      /*
       * An overlay is *supposed* to sit on top of the page.
       *
       * The tab bar is fixed to the bottom and the page scrolls behind it, so
       * every card long enough to reach the fold intersects it. That is the
       * design, not a collision, and counting it buried the one case this
       * check exists for — a button that has slid *under* the bar. So a pair
       * is only a collision when neither side is pinned.
       */
      const pinned = (element) => {
        for (let node = element; node && node !== document.body; node = node.parentElement) {
          const position = getComputedStyle(node).position;
          if (position === 'fixed' || position === 'sticky') return true;
        }
        return false;
      };
      /*
       * And the scroll container, for the same reason.
       *
       * The shell is a flex column: a scrolling `<main>` above a tab bar that
       * is in normal flow beneath it. Content scrolled past the fold keeps
       * its viewport rectangle *behind* the bar, so every card long enough
       * intersects every tab — 121 collisions, none of them reachable, all of
       * them from comparing two elements that cannot be on screen together.
       * A collision only means anything within one scrolling region.
       */
      const scroller = (element) => {
        for (let node = element; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (/auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 4) {
            return node;
          }
        }
        return document.body;
      };
      const loose = interactive.filter((element) => !pinned(element));
      for (let i = 0; i < loose.length; i += 1) {
        for (let j = i + 1; j < loose.length; j += 1) {
          const a = loose[i];
          const b = loose[j];
          if (a.contains(b) || b.contains(a)) continue;
          if (scroller(a) !== scroller(b)) continue;
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          const overlap =
            Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)) *
            Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
          if (overlap > 16) {
            problems.push({
              kind: 'overlapping',
              detail: `${(a.textContent ?? '').trim().slice(0, 18)} / ${(b.textContent ?? '').trim().slice(0, 18)}`,
            });
          }
        }
      }

      // Dead space: a page that fits, whose content stops well short of the fold.
      const scrolls = document.documentElement.scrollHeight > window.innerHeight + 4;
      if (!scrolls) {
        let lowest = 0;
        for (const element of document.querySelectorAll('#root *')) {
          if (!visible(element) || !(element.textContent ?? '').trim()) continue;
          lowest = Math.max(lowest, element.getBoundingClientRect().bottom);
        }
        const empty = window.innerHeight - lowest;
        if (empty > window.innerHeight / 3) {
          problems.push({
            kind: 'dead space',
            detail: `${Math.round(empty)}px below the last content, ${Math.round((empty / window.innerHeight) * 100)}% of the screen`,
          });
        }
      }

      const luminance = (colour) => {
        const [r, g, b] = (colour.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
        const channel = (value) => {
          const v = value / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const behind = (element) => {
        for (let node = element; node; node = node.parentElement) {
          const colour = getComputedStyle(node).backgroundColor;
          if (colour && !colour.includes('rgba(0, 0, 0, 0)')) return colour;
        }
        return 'rgb(255, 255, 255)';
      };
      const hex = (colour) => {
        const [r, g, b] = (colour.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
        return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
      };
      for (const element of document.querySelectorAll('#root p, #root span, #root h1, #root h2, #root h3, #root li')) {
        if (!visible(element) || inactive(element) || !(element.textContent ?? '').trim()) continue;
        if ([...element.children].some((child) => (child.textContent ?? '').trim())) continue;
        const style = getComputedStyle(element);
        const front = luminance(style.color);
        const back = luminance(behind(element));
        const ratio = (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
        /*
         * 4.5:1, or 3:1 for large text — WCAG 1.4.3's own two thresholds
         * rather than one guess. Large is 24 px, or 18.66 px when bold.
         */
        const size = Number.parseFloat(style.fontSize);
        const bold = Number.parseInt(style.fontWeight, 10) >= 700;
        const large = size >= 24 || (bold && size >= 18.66);
        if (ratio < (large ? 3 : 4.5)) {
          problems.push({
            kind: 'low contrast',
            pair: `${hex(style.color)} on ${hex(behind(element))}`,
            detail: `${(element.textContent ?? '').trim().slice(0, 22)} — ${hex(style.color)} on ${hex(behind(element))} at ${ratio.toFixed(2)}:1, needs ${large ? '3' : '4.5'}`,
          });
        }
      }

      /*
       * §58 — the same thing said twice on one screen.
       *
       * Two shapes, both found by reading rendered screens rather than the
       * bundles, because neither is visible in a string on its own.
       *
       * **A sentence rendered twice.** Two components, each correct, each
       * saying it. The learner reads it once and then reads it again.
       *
       * **A number rendered twice inside one card.** "Today's words · 0/10 · A
       * short set of 10 words." is three lines and two of them carry the ten.
       * Scoped to a card rather than the page, because a count legitimately
       * appears in a list header and again on a row.
       *
       * Both are limited to text of substance — three words or more for the
       * sentence, two digits or a number inside a sentence for the count — so
       * that "Start", "5", "10" and the goal chips do not trip it.
       */
      const own = (element) =>
        [...element.childNodes]
          .filter((node) => node.nodeType === 3)
          .map((node) => node.textContent.trim())
          .filter(Boolean)
          .join(' ');
      const blocks = [...document.querySelectorAll('#root p, #root h1, #root h2, #root h3, #root li')]
        .filter((element) => visible(element))
        .map((element) => ({ element, text: own(element) }))
        .filter((block) => block.text.split(/\s+/).length >= 3);
      const seenText = new Map();
      for (const block of blocks) {
        const key = block.text.toLowerCase().replace(/\s+/g, ' ');
        seenText.set(key, (seenText.get(key) ?? 0) + 1);
      }
      for (const [text, count] of seenText) {
        if (count > 1) {
          problems.push({ kind: 'said twice', detail: `"${text.slice(0, 48)}" appears ${count} times` });
        }
      }

      for (const card of document.querySelectorAll('#root [class*="card" i], #root section, #root article')) {
        if (!visible(card)) continue;
        if (card.querySelector('[class*="card" i], section, article')) continue;
        const numbers = new Map();
        /*
         * `strong` and `b` are in the list because the count is usually in one.
         * Leaving them out is how the first version of this check passed the
         * card it was written for: "0/10" lives in a <strong> inside the <p>,
         * so the <p> has no text of its own and nothing was collected.
         */
        for (const element of card.querySelectorAll('p, h1, h2, h3, span, div, strong, b, em, li')) {
          if (!visible(element)) continue;
          const text = own(element);
          if (!text) continue;
          for (const match of text.matchAll(/\d+/g)) {
            const value = match[0];
            if (value.length < 2 && text.split(/\s+/).length < 3) continue;
            const where = numbers.get(value) ?? new Set();
            where.add(text.slice(0, 40));
            numbers.set(value, where);
          }
        }
        for (const [value, where] of numbers) {
          if (where.size < 2) continue;
          /*
           * A list of rows built from one template is not a repetition.
           *
           * The licences screen prints "Pretendard · OFL 1.1", "Nanum Gothic ·
           * OFL 1.1" and four more, so the 1 is on the screen six times and
           * every one of them belongs there. What they share is a suffix; a
           * card that genuinely says its count twice does not.
           */
          const texts = [...where];
          let shared = 0;
          while (
            shared < texts[0].length &&
            texts.every((text) => text[text.length - 1 - shared] === texts[0][texts[0].length - 1 - shared])
          ) {
            shared += 1;
          }
          if (shared >= 5) continue;
          problems.push({
            kind: 'counted twice',
            detail: `${value} appears in ${texts.map((t) => `"${t}"`).join(' and ')}`,
          });
        }
      }

      return problems;
    });

    for (const problem of measured) {
      /*
       * The one pair this product ships knowingly below AA.
       *
       * White on #ff6700 measures 2.92:1, and the mirror — the brand orange as
       * text on a white card — measures the same. `e2e/accessibility.spec.ts`
       * carries the reasoning and the disclosure; repeating the decision here
       * would be two places to change it, so this repeats only the pair.
       */
      if (problem.kind === 'low contrast' && BRAND_PAIRS.has(problem.pair)) continue;
      findings.push({ device: device.name, screen: screen.name, ...problem });
    }

    if (!CHECK) {
      mkdirSync(join(OUT, device.name), { recursive: true });
      await page.screenshot({ path: join(OUT, device.name, `${screen.name}.png`), fullPage: true });
    }
  }

  const mine = findings.filter((f) => f.device === device.name).length;
  console.log(
    `  ${device.name.padEnd(9)} ${here.length} screen(s)   ${mine === 0 ? 'ok' : `${mine} finding(s)`}`,
  );
  await context.close();
}

await browser.close();
await stopPreview();

if (!CHECK) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'index.html'),
    `<html><head><meta charset="utf-8"><title>Screens</title>
     <style>body{font:13px system-ui;margin:16px;background:#fafafa}
     h2{margin:24px 0 6px;font-size:15px}.row{display:flex;gap:6px;overflow-x:auto}
     figure{margin:0;flex:0 0 auto}img{width:170px;border:1px solid #ddd;background:#fff}
     figcaption{font-size:11px;color:#666}</style></head><body>
     <h1>Every screen, every size</h1>
     ${DEVICES.map(
       (device) =>
         `<h2>${device.name}</h2><div class="row">${SCREENS.map(
           (screen) =>
             `<figure><img loading="lazy" src="${device.name}/${screen.name}.png"><figcaption>${screen.name}</figcaption></figure>`,
         ).join('')}</div>`,
     ).join('')}
     </body></html>`,
  );
}

const renders = DEVICES.reduce(
  (total, device) => total + SCREENS.length + (['320', '390', '390-dark', '390-200%'].includes(device.name) ? STATES.length : 0),
  0,
);
console.log(
  `\nScreens — ${SCREENS.length} routes and ${STATES.length} states across ` +
    `${DEVICES.length} device profiles = ${renders} renders`,
);
if (findings.length === 0) {
  console.log('  nothing clipped, nothing overlapping, nothing unreadable, at any size.');
  process.exit(0);
}

const byKind = new Map();
for (const finding of findings) {
  const key = `${finding.kind}`;
  byKind.set(key, [...(byKind.get(key) ?? []), finding]);
}
console.log(`\n${findings.length} finding(s):`);
for (const [kind, rows] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${kind} — ${rows.length}`);
  const seen = new Set();
  for (const row of rows.filter((r) => !seen.has(`${r.screen} ${r.detail}`) && seen.add(`${r.screen} ${r.detail}`))) {
    console.log(`    ${row.device.padEnd(9)} ${row.screen.padEnd(11)} ${row.detail}`);
  }

}
process.exit(CHECK ? 1 : 0);
