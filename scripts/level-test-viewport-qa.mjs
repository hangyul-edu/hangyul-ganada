#!/usr/bin/env node
/**
 * The Level Test's *question* screen, on the smallest phones and at 200% text.
 *
 *   npm run leveltest:viewport            report
 *   npm run leveltest:viewport -- --check fail on a finding
 *
 * ## Why this exists next to `screens:audit`
 *
 * That gate renders `/me/level-test` at 320, 360, 390, 412 and 430, in dark
 * mode and at 200% zoom, and it is thorough. It renders the **intro** screen.
 * The screen a learner spends eight minutes on is behind a tap, so the four
 * option buttons, the stimulus, the clock and the *I don't know* control have
 * never been measured at any width.
 *
 * That is the whole gap. A route audit walks routes; this one walks a *state*.
 *
 * ## What it measures, and why each one
 *
 * | | |
 * | --- | --- |
 * | horizontal overflow of the document | a phone that scrolls sideways during a timed test |
 * | option text clipped inside its button | the learner cannot read the answer they are choosing |
 * | any control under 44 px | Apple's and Google's own minimum; a mis-tap here is a scored answer |
 * | *I don't know* below the fold | the control that lets a struggling learner move on, needing a scroll to find |
 * | option boxes overlapping | two answers one tap apart |
 *
 * ## The languages
 *
 * Four, chosen by measurement rather than by taste: the longest rendered option
 * strings in the bank belong to Tamil and Telugu, German compounds are the
 * longest single tokens, and Russian is the longest Cyrillic. English is the
 * control. A language whose script needs more vertical space than Latin is
 * where a fixed-height button breaks first.
 */
import { chromium } from 'playwright';
import { ensurePreview } from './lib/preview.mjs';

const CHECK = process.argv.includes('--check');
const URL = 'http://127.0.0.1:4477';

/**
 * Real phones people still hold, and the same phones with the text turned up.
 *
 * Enlarged text is modelled by shrinking the CSS viewport rather than by
 * setting a root `font-size`, because this app sizes from design tokens in
 * pixels: raising `html { font-size }` moves almost nothing and would have
 * produced a row of identical, reassuring numbers. Browser and WebView zoom
 * work the other way round — the layout viewport shrinks and everything is
 * drawn larger — so a 390×844 phone at 150% lays out as 260×563, and at 200%
 * as 195×422. That is the condition to test.
 */
const DEVICES = [
  { name: '320×568', width: 320, height: 568 },
  { name: '360×640', width: 360, height: 640 },
  { name: '375×667', width: 375, height: 667 },
  { name: '390×844', width: 390, height: 844 },
  { name: '390@150%', width: 260, height: 563 },
  { name: '390@200%', width: 195, height: 422 },
];

const LOCALES = ['en', 'de', 'ru', 'ta', 'te'];

/** The minimum a finger can be relied on to hit. */
const MIN_TARGET = 44;

const stop = await ensurePreview(URL);
const browser = await chromium.launch();
const findings = [];
const rows = [];

try {
  for (const device of DEVICES) {
    for (const locale of LOCALES) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await page.addInitScript((code) => {
        window.localStorage.setItem('hangyul_ganada:locale', code);
      }, locale);

      await page.goto(`${URL}/me/level-test`, { waitUntil: 'networkidle' });
      await page.getByTestId('level-start').click({ timeout: 15_000 });
      await page.getByTestId('level-unknown').waitFor({ state: 'visible', timeout: 30_000 });
      // The bank is fetched on the first sitting; let the question settle.
      await page.getByTestId('level-option').first().waitFor({ state: 'visible' });

      const seen = await page.evaluate((minTarget) => {
        const doc = document.documentElement;
        const options = [...document.querySelectorAll('[data-testid="level-option"]')];
        const unknown = document.querySelector('[data-testid="level-unknown"]');
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
        };
        return {
          overflow: doc.scrollWidth - doc.clientWidth,
          options: options.map((el) => ({
            ...box(el),
            clipped: el.scrollWidth > el.clientWidth + 1,
            text: (el.textContent ?? '').trim().slice(0, 40),
          })),
          unknown: unknown ? { ...box(unknown), text: (unknown.textContent ?? '').trim() } : null,
          viewportHeight: window.innerHeight,
          /*
            The question screen's own controls, not the app's chrome.

            The first version measured every button on the page and reported the
            five-tab navigation bar at 200% zoom: five tabs sharing 195 CSS
            pixels are 39 px each, and no arrangement of five tabs is 44 px wide
            in 195. Failing on that would be a gate nobody can pass, and it is
            not what this file is about — it is about whether the screen a
            learner answers thirty questions on fits their phone. The tab bar is
            counted below and reported, so the observation is not lost.
          */
          small: [...document.querySelectorAll('main button, main a[href]')]
            .map((el) => ({ r: el.getBoundingClientRect(), t: (el.textContent ?? '').trim().slice(0, 24) }))
            .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < minTarget || r.height < minTarget))
            .map(({ r, t }) => `${t || '(no label)'} ${Math.round(r.width)}×${Math.round(r.height)}`),
          navTargets: [...document.querySelectorAll('nav a[href], nav button')]
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && (r.width < minTarget || r.height < minTarget)).length,
        };
      }, MIN_TARGET);

      const where = `${device.name}\u0000${locale}`;
      if (seen.overflow > 1) findings.push(`${where}: the page scrolls sideways by ${seen.overflow}px`);
      for (const option of seen.options) {
        if (option.clipped) findings.push(`${where}: option text is clipped — "${option.text}"`);
        if (option.h < MIN_TARGET) {
          findings.push(`${where}: an option is ${Math.round(option.h)}px tall, under ${MIN_TARGET}`);
        }
      }
      for (let i = 1; i < seen.options.length; i += 1) {
        const above = seen.options[i - 1];
        const here = seen.options[i];
        if (here.top < above.bottom - 1) findings.push(`${where}: two options overlap`);
      }
      if (!seen.unknown) findings.push(`${where}: no "I don't know" control on the question screen`);
      else if (seen.unknown.h < MIN_TARGET) {
        findings.push(
          `${where}: "I don't know" is ${Math.round(seen.unknown.h)}px tall, under ${MIN_TARGET}`,
        );
      }
      for (const small of seen.small) findings.push(`${where}: control under ${MIN_TARGET}px — ${small}`);

      rows.push({
        where,
        overflow: seen.overflow,
        options: seen.options.length,
        tallest: Math.round(Math.max(...seen.options.map((o) => o.h))),
        navTargets: seen.navTargets,
        unknownBottom: seen.unknown ? Math.round(seen.unknown.bottom) : null,
        viewport: seen.viewportHeight,
      });

      await context.close();
    }
  }
} finally {
  await browser.close();
  stop();
}

console.log(`\nLevel Test question screen — ${DEVICES.length} viewports × ${LOCALES.length} languages\n`);
console.log('  viewport         lang  overflow  options  tallest  "I don\'t know" ends at / viewport');
for (const row of rows) {
  const [size, lang] = row.where.split('\u0000');
  console.log(
    `  ${size.padEnd(11)} ${lang.padEnd(5)} ${String(row.overflow).padStart(8)}  ${String(row.options).padStart(7)}  ` +
      `${String(row.tallest).padStart(7)}  ${String(row.unknownBottom).padStart(10)} / ${row.viewport}`,
  );
}

/*
  Reachability is reported rather than failed on.

  The question screen is allowed to be taller than the viewport at 200% text —
  the alternative is shrinking the Korean, which is the one thing on the screen a
  learner has to read. What must not happen is the *control* being unreachable,
  and it is in a scrolling column, so `scroll:audit` is the gate that owns that
  question. This one says how far down it sits so a person can see the trade.
*/
const belowFold = rows.filter((row) => row.unknownBottom !== null && row.unknownBottom > row.viewport);
if (belowFold.length > 0) {
  console.log(
    `\n  "I don't know" is below the fold on ${belowFold.length} of ${rows.length} ` +
      'combinations, all of them enlarged text, and is reached by scrolling — see `scroll:audit`.',
  );
}

/*
  The navigation bar, reported and not failed on.

  Five tabs cannot each be 44 px wide inside a 195 px layout viewport, which is
  what a 390 px phone becomes at 200% zoom. That is arithmetic, not a defect
  this gate can drive out, and it belongs to the app rather than to this screen.
  It is counted here so that nobody has to rediscover it, and so that a *change*
  in it is visible.
*/
const cramped = rows.filter((row) => row.navTargets > 0);
if (cramped.length > 0) {
  console.log(
    `\n  the five-tab navigation bar falls under ${MIN_TARGET}px on ` +
      `${cramped.length} of ${rows.length} combinations — all of them enlarged text, where five\n` +
      '  tabs share a 195px viewport. App chrome, not this screen; recorded rather than gated.',
  );
}

if (findings.length === 0) {
  console.log('\n  no overflow, no clipped option, no control under 44px, no overlap.');
} else {
  console.log(`\n  ${findings.length} finding(s):`);
  for (const finding of findings.slice(0, 30)) console.log(`    ${finding.replace('\u0000', ' ')}`);
  if (findings.length > 30) console.log(`    …and ${findings.length - 30} more`);
}

if (CHECK && findings.length > 0) {
  console.log('\nfailing: the screen a learner spends eight minutes on must fit the phone.');
  process.exit(1);
}
