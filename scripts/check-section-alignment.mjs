#!/usr/bin/env node
/**
 * Section headings and their text start on one rule, measured as ink.
 *
 *   npm run align:sections              measure every section and report
 *   npm run align:sections:check        the same; exit non-zero on a finding
 *
 * ## The defect this exists for
 *
 * On My Learning, 초기화 sat four pixels to the right of 맨 처음 글자부터 다시
 * 시작해요, and 백업, 앱 and 화면 did the same. Every box measurement said the
 * column was straight, because it was: `.groupTitle` carried
 * `padding-inline-start: var(--hg-space-1)`, which moves the first glyph
 * without moving the element. A reader sees ink.
 *
 * So this measures a `Range` over each element's first text node rather than
 * `getBoundingClientRect()` on the element, which is the only way to see the
 * difference between "the box is aligned" and "the words line up".
 *
 * ## What it checks, and where
 *
 * Every `[data-settings-group]` on My Learning, Privacy and Legal — the three
 * screens built from the shared section primitives — at every supported phone
 * width, at 100/150/200% text, and in a long locale and an RTL one, because a
 * rule that only holds in Korean at 100% is a rule that holds by accident.
 *
 * In RTL the axis is the *inline* start, so the measurement is mirrored rather
 * than skipped: a heading that lines up on the left in Korean and floats in
 * Arabic is the same defect with the page turned around.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ensurePreview } from './lib/preview.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';

const findings = [];
const fail = (what) => findings.push(what);

const WIDTHS = [320, 360, 390, 412, 430];
const CASES = [
  ...WIDTHS.map((width) => ({ width, scale: 1, locale: 'ko' })),
  { width: 390, scale: 1.5, locale: 'ko' },
  { width: 390, scale: 2, locale: 'ko' },
  { width: 320, scale: 2, locale: 'ko' },
  // German is the long one on this screen; Arabic is the mirrored one.
  { width: 390, scale: 1, locale: 'de' },
  { width: 320, scale: 1, locale: 'de' },
  { width: 390, scale: 1, locale: 'ar' },
  { width: 390, scale: 2, locale: 'ar' },
];
const PAGES = ['/me', '/me/privacy', '/me/legal'];

/**
 * The inline-start of the *ink* of every heading, title and paragraph in every
 * settings group, plus the direction the page is laid out in.
 */
const MEASURE = `() => {
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
    || document.documentElement.getAttribute('dir') === 'rtl';
  const inkStart = (element) => {
    const node = [...element.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return null;
    return rtl ? window.innerWidth - box.right : box.left;
  };
  const groups = [];
  for (const group of document.querySelectorAll('[data-settings-group]')) {
    const rows = [];
    for (const element of group.querySelectorAll('h2, h3, p')) {
      if (element.getBoundingClientRect().height === 0) continue;
      const at = inkStart(element);
      if (at === null) continue;
      rows.push({ tag: element.tagName, at, text: (element.textContent || '').trim().slice(0, 24) });
    }
    if (rows.length > 1) groups.push({ id: group.getAttribute('data-settings-group'), rows });
  }
  return { rtl, groups };
}`;

const stop = await ensurePreview(baseUrl);
const browser = await chromium.launch();
let measured = 0;
let groupsSeen = 0;

for (const test of CASES) {
  const context = await browser.newContext({
    viewport: { width: test.width, height: 900 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.addInitScript(
    ([locale, scale]) => {
      localStorage.setItem('hangyul_ganada:locale', locale);
      if (scale !== 1) document.documentElement.style.fontSize = `${16 * scale}px`;
    },
    [test.locale, test.scale],
  );

  for (const path of PAGES) {
    const where = `${path} @ ${test.width}px ×${test.scale} ${test.locale}`;
    try {
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      const { groups } = await page.evaluate(`(${MEASURE})()`);
      for (const group of groups) {
        groupsSeen += 1;
        const axis = group.rows[0].at;
        for (const row of group.rows) {
          measured += 1;
          const drift = Math.abs(row.at - axis);
          if (drift > 1) {
            fail(
              `${where} ${group.id}: ${row.tag} "${row.text}" starts ${drift.toFixed(1)} px off the ` +
                `section axis (${row.at.toFixed(1)} against ${axis.toFixed(1)})`,
            );
          }
        }
      }
    } catch (error) {
      fail(`${where}: ${String(error).split('\n')[0]}`);
    }
  }
  await context.close();
}

await browser.close();
await stop();

console.log(`Section alignment — ${groupsSeen} settings group(s), ${measured} lines of text measured as ink`);
console.log(`  ${CASES.length} case(s): ${WIDTHS.join(', ')} px, 100/150/200% text, ko · de · ar (mirrored)`);
if (findings.length === 0) {
  console.log('  every heading, title and description in a group starts on the same rule, within a pixel.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings.slice(0, 20)) console.log(`    ${finding}`);
  if (findings.length > 20) console.log(`    …and ${findings.length - 20} more`);
}
if (CHECK && findings.length > 0) process.exit(1);
