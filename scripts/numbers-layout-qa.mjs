#!/usr/bin/env node
/**
 * The Numbers list, measured: one rail, no reserved columns, and a title that
 * keeps the width.
 *
 *   npm run numbers:layout              measure every case and report
 *   npm run numbers:layout:check        the same; exit non-zero on a finding
 *
 * ## The defect this exists for
 *
 * A screenshot of the Numbers course on a phone: every lesson title pushed a
 * thumb's width in from the left, the module headings above them starting
 * somewhere else again, and three-word titles wrapping onto three lines with a
 * quarter of the row empty beside them.
 *
 * The cause was a leading `<span>` 20 px wide that held a tick on a finished
 * lesson and nothing at all on every other — plus the row's 12 px gap after it.
 * 32 px of reserved paper on eighteen cards, taken out of the one column that
 * had something to say. The module heading was padded 4 px and the card 16, so
 * the screen had three left edges; and the status pill would not shrink, so on
 * a narrow phone it took its width out of the title rather than moving.
 *
 * ## Why it measures ink and not boxes
 *
 * An empty box is perfectly aligned. Every box measurement on that screen was
 * correct — `.lessonIcon` really was 20 px wide and really did start where the
 * card said. What a reader sees is where the *letters* start, so every
 * alignment here is a `Range` over an element's first text node, the same
 * technique `check-section-alignment.mjs` uses and for the same reason.
 *
 * ## What is checked
 *
 * | | |
 * | --- | --- |
 * | **Rail** | Everything marked `data-rail="numbers"` — module numbers, module goals, lesson titles, the summary — starts on one vertical rule. |
 * | **Rule** | Everything marked `data-rail-end="numbers"` — chevrons, module lesson counts — ends on one vertical rule. |
 * | **Leading space** | A lesson's title block begins at the card's own content edge. Any gap is a reserved column. |
 * | **Trailing space** | Between the title block and whatever is drawn beside it there is one flex gap and no more. This is the check that fails if the empty icon slot comes back on the other side. |
 * | **Narrow rows** | Where the status cannot fit beside the title, it is on its own line *below* it and the title has the full width — never a squeezed column. |
 * | **Overlap** | Title, caption, status, count and chevron do not intersect. |
 * | **Clipping** | No element's content is wider or taller than the box drawn for it. |
 * | **Sideways** | Nothing scrolls horizontally. |
 * | **Reach** | After a real scroll to the bottom, the last lesson card is fully above the bottom navigation, and every card is a link at least a thumb tall. |
 * | **Fallback** | No visible string is a translation key. |
 *
 * ## The matrix
 *
 * Six phone widths and a landscape one, 100/150/200% text, both appearances,
 * and every one of the thirty-two languages at the tightest width. Long titles
 * are not a hypothetical here: German, Hungarian and Tamil all run past the
 * English ones, and the wrap rule is the thing they exercise.
 *
 * ## The states have to be seeded
 *
 * A fresh profile has no badges at all, and a screen with no badges cannot
 * demonstrate that badges do not squeeze the title. So four lessons are given
 * real evidence — mastered, completed, review due, in progress — written
 * straight into the `numbers` store the app reads. Evidence rather than a
 * `completed` flag because that is all the store will keep: `repairLessonProgress`
 * clears a completion that is not backed up, which is exactly the property
 * `numbers:progress:check` exists to hold.
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { NUMBER_LESSONS } from '../apps/web/src/data/numbers.ts';
import { ensurePreview } from './lib/preview.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';

const findings = [];
const fail = (what) => findings.push(what);

const LOCALES = readdirSync(join(here, '../apps/web/src/locales'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** The sizes in the brief, plus the landscape phone. */
const SIZES = [
  { name: '320×568', width: 320, height: 568 },
  { name: '360×640', width: 360, height: 640 },
  { name: '360×800', width: 360, height: 800 },
  { name: '390×844', width: 390, height: 844 },
  { name: '412×915', width: 412, height: 915 },
  { name: '430×932', width: 430, height: 932 },
  { name: '740×360 landscape', width: 740, height: 360 },
];

const CASES = [
  ...SIZES.map((size) => ({ ...size, scale: 1, locale: 'ko', scheme: 'light' })),
  // Text scaling, on the widths where it hurts.
  { ...SIZES[0], scale: 1.5, locale: 'ko', scheme: 'light' },
  { ...SIZES[0], scale: 2, locale: 'ko', scheme: 'light' },
  { ...SIZES[3], scale: 1.5, locale: 'de', scheme: 'light' },
  { ...SIZES[3], scale: 2, locale: 'de', scheme: 'light' },
  // Both appearances.
  { ...SIZES[3], scale: 1, locale: 'ko', scheme: 'dark' },
  { ...SIZES[0], scale: 1, locale: 'de', scheme: 'dark' },
  // Every language, at the width that leaves the least room for a long title.
  ...LOCALES.map((locale) => ({ ...SIZES[0], scale: 1, locale, scheme: 'light' })),
];

/**
 * Four lessons with real evidence behind them, so the screen has one of each
 * badge to lay out.
 *
 * `mastery.correct === mastery.total` is what makes a lesson *mastered* rather
 * than merely completed, and a `completed_at` a month old is what makes one
 * *review due* — see `domain/numbersProgress`.
 */
function seedRecords() {
  const now = new Date();
  const stamp = now.toISOString();
  const old = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const evidence = (lesson, { completedAt, correctShare }) => ({
    schema: 1,
    lesson_id: lesson.id,
    opened_at: completedAt,
    started_at: completedAt,
    explanation_steps_viewed: lesson.explanation.map((step) => step.text),
    examples_viewed: [...lesson.item_ids],
    practice_completed_at: completedAt,
    mastery: {
      taken_at: completedAt,
      // Ceil, not round: `repairLessonProgress` recomputes `passed` from the
      // ratio, so a rounded 6-of-8 is 75% and the completion it was seeded to
      // demonstrate is cleared on the way in — which is the store working, and
      // is why the seeded review-due row silently came back as "in progress".
      correct: Math.min(lesson.item_ids.length, Math.ceil(lesson.item_ids.length * correctShare)),
      total: lesson.item_ids.length,
      passed: true,
    },
    mastery_attempts: 1,
    reviewed_at: null,
    items: Object.fromEntries(
      lesson.item_ids.map((id) => [id, { correct: 2, incorrect: 0, mastered_at: completedAt }]),
    ),
    attempts: { total: lesson.item_ids.length * 2, correct: lesson.item_ids.length * 2, incorrect: 0 },
    completed_at: completedAt,
    updated_at: completedAt,
  });

  const [a, b, c, d] = NUMBER_LESSONS;
  const rows = [
    evidence(a, { completedAt: stamp, correctShare: 1 }), // mastered
    evidence(b, { completedAt: stamp, correctShare: 0.8 }), // completed
    evidence(c, { completedAt: old, correctShare: 0.8 }), // review due
    {
      // in progress: opened, some of it read, nothing finished
      schema: 1,
      lesson_id: d.id,
      opened_at: stamp,
      started_at: stamp,
      explanation_steps_viewed: d.explanation.slice(0, 1).map((step) => step.text),
      examples_viewed: [],
      practice_completed_at: null,
      mastery: null,
      mastery_attempts: 0,
      reviewed_at: null,
      items: {},
      attempts: { total: 1, correct: 1, incorrect: 0 },
      completed_at: null,
      updated_at: stamp,
    },
  ];
  return rows;
}

/** Writes the seeded rows into the store the app reads, then reloads. */
const SEED = `async (rows) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('hangyul-ganada');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (![...db.objectStoreNames].includes('numbers')) return 'no numbers store';
  await new Promise((resolve, reject) => {
    const tx = db.transaction('numbers', 'readwrite');
    const store = tx.objectStore('numbers');
    for (const row of rows) store.put(row, 'lesson:' + row.lesson_id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return 'seeded';
}`;

/**
 * Everything the checks need, read out of the live page in one round trip.
 *
 * Ink for the alignments; boxes for the geometry; `scrollWidth` against
 * `clientWidth` for the clipping.
 */
const MEASURE = `() => {
  const rtl = document.documentElement.getAttribute('dir') === 'rtl'
    || getComputedStyle(document.documentElement).direction === 'rtl';
  const inkStart = (element) => {
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const node = walk.nextNode();
    if (!node || !node.textContent.trim()) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return null;
    return rtl ? window.innerWidth - box.right : box.left;
  };
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  };

  const rail = [];
  for (const element of document.querySelectorAll('[data-rail="numbers"]')) {
    // Text is measured as ink — where the letters start is what a reader lines
    // up against. A *shape* is measured as a box: the module number is a glyph
    // centred inside a 24 px disc, and it is the disc that sits on the rail.
    const at = element.dataset.railMeasure === 'box'
      ? (rtl ? window.innerWidth - element.getBoundingClientRect().right : element.getBoundingClientRect().left)
      : inkStart(element);
    if (at === null) continue;
    rail.push({ at, text: (element.textContent || '').trim().slice(0, 24), tag: element.tagName });
  }
  const railEnd = [];
  for (const element of document.querySelectorAll('[data-rail-end="numbers"]')) {
    const r = element.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    railEnd.push({ at: rtl ? r.left : window.innerWidth - r.right, text: (element.textContent || '').trim().slice(0, 20) });
  }

  const rows = [];
  for (const item of document.querySelectorAll('[data-testid^="numbers-lesson-"]')) {
    const link = item.querySelector('a');
    if (!link) { rows.push({ id: item.dataset.testid, noLink: true }); continue; }
    const style = getComputedStyle(link);
    const pad = {
      left: parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
      right: parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth),
    };
    const linkBox = boxOf(link);
    const content = {
      left: linkBox.left + (rtl ? pad.right : pad.left),
      right: linkBox.right - (rtl ? pad.left : pad.right),
    };
    const part = (selector) => {
      const el = link.querySelector(selector);
      if (!el) return null;
      const box = boxOf(el);
      if (box.width === 0 && box.height === 0) return null;
      return { ...box, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, text: (el.textContent || '').trim().slice(0, 40) };
    };
    const body = link.firstElementChild;
    const gap = parseFloat(getComputedStyle(body).columnGap) || 0;
    rows.push({
      id: item.dataset.testid,
      status: item.dataset.status,
      link: linkBox,
      item: boxOf(item),
      content,
      gap,
      title: part('[data-rail="numbers"]'),
      textBlock: part('[data-rail="numbers"]') && boxOf(link.querySelector('[data-rail="numbers"]').parentElement),
      meta: part('[data-status], [class*="lessonMeta"]') && boxOf(link.querySelector('[class*="lessonMeta"]') || link),
      metaPresent: !!link.querySelector('[class*="lessonMeta"]'),
      chevron: part('[data-rail-end="numbers"]'),
      caption: (() => {
        const spans = [...link.querySelectorAll('span')];
        const el = spans.find((s) => s.className.includes('lessonSystem'));
        return el ? { ...boxOf(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null;
      })(),
    });
  }

  const clipped = [];
  for (const el of document.querySelectorAll('[data-testid^="numbers-lesson-"] *, [data-testid^="numbers-module-"] h2, [data-testid^="numbers-module-"] p')) {
    if (el.children.length > 0) continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      clipped.push({ text: (el.textContent || '').trim().slice(0, 40), by: el.scrollWidth - el.clientWidth });
    }
  }

  const main = document.querySelector('main') || document.scrollingElement;
  const nav = document.querySelector('nav');
  return {
    rtl,
    rail,
    railEnd,
    rows,
    clipped,
    sideways: {
      doc: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    },
    main: main ? boxOf(main) : null,
    nav: nav ? boxOf(nav) : null,
    fallbacks: [...document.querySelectorAll('[data-testid^="numbers-"] *')]
      .filter((el) => el.children.length === 0)
      .map((el) => (el.textContent || '').trim())
      .filter((text) => /^(numbers|common):/.test(text) || /^[a-z][\\w]*(\\.[\\w]+){1,}$/.test(text)),
  };
}`;

const SCROLL_TO_BOTTOM = `async () => {
  const main = document.querySelector('main') || document.scrollingElement;
  let last = -1;
  for (let i = 0; i < 80 && main.scrollTop !== last; i += 1) {
    last = main.scrollTop;
    main.scrollBy(0, 600);
    await new Promise((r) => setTimeout(r, 16));
  }
  return { top: main.scrollTop, height: main.scrollHeight, client: main.clientHeight };
}`;

const rows = seedRecords();
const stop = await ensurePreview(baseUrl);
const browser = await chromium.launch();
let cases = 0;
let measured = 0;

for (const test of CASES) {
  const context = await browser.newContext({
    viewport: { width: test.width, height: test.height },
    hasTouch: true,
    reducedMotion: 'reduce',
    colorScheme: test.scheme,
  });
  const page = await context.newPage();
  await page.addInitScript(
    ([locale, scale]) => {
      localStorage.setItem('hangyul_ganada:locale', locale);
      if (scale !== 1) document.documentElement.style.fontSize = `${16 * scale}px`;
    },
    [test.locale, test.scale],
  );

  const where = `${test.name} ×${test.scale} ${test.locale} ${test.scheme}`;
  try {
    await page.goto(`${baseUrl}/letters/numbers`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1300);
    await page.evaluate(SEED, rows);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1300);
    await page.waitForSelector('[data-testid^="numbers-lesson-"]', { timeout: 10_000 });

    const m = await page.evaluate(`(${MEASURE})()`);
    cases += 1;

    // --- the rail ----------------------------------------------------------
    if (m.rail.length < 4) fail(`${where}: only ${m.rail.length} element(s) on the rail — the markers are gone`);
    const axis = m.rail.length ? Math.min(...m.rail.map((r) => r.at)) : 0;
    for (const line of m.rail) {
      measured += 1;
      const drift = Math.abs(line.at - axis);
      if (drift > 1.5) {
        fail(`${where}: "${line.text}" starts ${drift.toFixed(1)} px off the rail (${line.at.toFixed(1)} against ${axis.toFixed(1)})`);
      }
    }
    const endAxis = m.railEnd.length ? Math.min(...m.railEnd.map((r) => r.at)) : 0;
    for (const line of m.railEnd) {
      measured += 1;
      const drift = Math.abs(line.at - endAxis);
      if (drift > 1.5) {
        fail(`${where}: "${line.text}" ends ${drift.toFixed(1)} px off the right-hand rule`);
      }
    }

    // --- the rows ----------------------------------------------------------
    for (const row of m.rows) {
      if (row.noLink) {
        fail(`${where}: ${row.id} is not a link`);
        continue;
      }
      measured += 1;

      // The whole row is the target.
      if (Math.abs(row.link.width - row.item.width) > 1 || Math.abs(row.link.height - row.item.height) > 1) {
        fail(`${where}: ${row.id}'s link is ${row.link.width.toFixed(0)}×${row.link.height.toFixed(0)} inside a ${row.item.width.toFixed(0)}×${row.item.height.toFixed(0)} row`);
      }
      if (row.link.height < 44) {
        fail(`${where}: ${row.id} is ${row.link.height.toFixed(0)} px tall — under a thumb`);
      }

      if (!row.textBlock) {
        fail(`${where}: ${row.id} has no title`);
        continue;
      }

      // No leading column. The title block starts at the card's content edge.
      const leading = m.rtl
        ? row.content.right - row.textBlock.right
        : row.textBlock.left - row.content.left;
      if (leading > 1.5) {
        fail(`${where}: ${row.id} reserves ${leading.toFixed(1)} px to the left of its title`);
      }

      // No trailing slack either: between the title block and whatever is drawn
      // beside it there is one flex gap and nothing more.
      const nextOnLine = [row.meta, row.chevron]
        .filter((box) => box && Math.abs(box.top - row.textBlock.top) < row.textBlock.height)
        .sort((a, b) => (m.rtl ? b.left - a.left : a.left - b.left))[0];
      if (nextOnLine) {
        const slack = m.rtl
          ? row.textBlock.left - nextOnLine.right
          : nextOnLine.left - row.textBlock.right;
        if (slack > row.gap + 2) {
          fail(`${where}: ${row.id} leaves ${slack.toFixed(1)} px of unused width beside its title (gap is ${row.gap})`);
        }
      }

      // Nothing overlaps.
      const parts = [
        ['title', row.title],
        ['caption', row.caption],
        ['status', row.metaPresent ? row.meta : null],
        ['chevron', row.chevron],
      ].filter(([, box]) => box);
      for (let a = 0; a < parts.length; a += 1) {
        for (let b = a + 1; b < parts.length; b += 1) {
          const [an, ab] = parts[a];
          const [bn, bb] = parts[b];
          const overlapX = Math.min(ab.right, bb.right) - Math.max(ab.left, bb.left);
          const overlapY = Math.min(ab.bottom, bb.bottom) - Math.max(ab.top, bb.top);
          if (overlapX > 1 && overlapY > 1 && !(an === 'title' && bn === 'caption')) {
            fail(`${where}: ${row.id}'s ${an} and ${bn} overlap by ${overlapX.toFixed(0)}×${overlapY.toFixed(0)} px`);
          }
        }
      }

      // A status that could not fit beside the title is *below* it, full width.
      if (row.metaPresent && row.meta && row.meta.top >= row.textBlock.bottom - 1) {
        const width = row.textBlock.width;
        const available = row.content.right - row.content.left - (row.chevron ? row.chevron.width + row.gap : 0);
        if (width < available - 2) {
          fail(`${where}: ${row.id} wrapped its status below the title but left the title ${(available - width).toFixed(0)} px short of the row`);
        }
      }
    }

    // --- clipping and sideways scroll ---------------------------------------
    for (const clip of m.clipped) {
      fail(`${where}: "${clip.text}" is clipped by ${clip.by.toFixed(0)} px`);
    }
    if (m.sideways.doc > 1) fail(`${where}: the document scrolls ${m.sideways.doc.toFixed(0)} px sideways`);
    if (m.sideways.main > 1) fail(`${where}: the page scrolls ${m.sideways.main.toFixed(0)} px sideways`);
    for (const text of new Set(m.fallbacks)) {
      fail(`${where}: an untranslated key is on screen — "${text}"`);
    }

    // --- reach --------------------------------------------------------------
    await page.evaluate(`(${SCROLL_TO_BOTTOM})()`);
    await page.waitForTimeout(150);
    const after = await page.evaluate(`(${MEASURE})()`);
    const last = after.rows[after.rows.length - 1];
    if (!last) {
      fail(`${where}: no lesson rows after scrolling`);
    } else {
      const floor = after.nav ? Math.min(after.nav.top, after.main.bottom) : after.main.bottom;
      if (last.link.bottom > floor + 1) {
        fail(`${where}: the last lesson ends ${(last.link.bottom - floor).toFixed(0)} px below what the learner can reach`);
      }
    }
  } catch (error) {
    fail(`${where}: ${String(error).split('\n')[0]}`);
  }
  await context.close();
}

await browser.close();
await stop();

console.log(`Numbers list layout — ${cases}/${CASES.length} case(s) measured, ${measured} element(s)`);
console.log(`  ${SIZES.length} sizes · 100/150/200% text · light and dark · ${LOCALES.length} languages`);
if (findings.length === 0) {
  console.log('  one rail, no reserved columns, no overlap, nothing clipped, every lesson reachable.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings.slice(0, 40)) console.log(`    ${finding}`);
  if (findings.length > 40) console.log(`    …and ${findings.length - 40} more`);
}
if (CHECK && findings.length > 0) process.exit(1);
