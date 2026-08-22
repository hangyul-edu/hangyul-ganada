#!/usr/bin/env node
/**
 * The streak and the level, at every value a learner can actually reach.
 *
 *   npm run status:qa            print the measurements
 *   npm run status:qa -- --check fail on a finding
 *
 * ## Why a separate check
 *
 * `screens:audit` renders a fresh profile, and a fresh profile is `0 days` and
 * `Lv. 1` — two of the shortest strings the header will ever hold. §72 asks
 * about the other end: Lv. 30, a hundred-day streak, and the same pair in a
 * language whose word for "day" is long. None of those states is reachable by
 * loading a page, so this writes them into the DOM and measures what happens.
 *
 * ## What it measures
 *
 * The two chips are one status group — §5–§7 — so what matters is not whether
 * each fits but whether they still agree. Same height, same vertical centre,
 * same distance to the header's edge, and both still clearing 44 px of touch
 * target. A pair that stays a pair at `0 days · Lv. 1` and comes apart at
 * `100 days · Lv. 30` was never a pair; it was two chips that happened to be
 * the same size.
 */
import { chromium } from 'playwright';

import { ensurePreview } from './lib/preview.mjs';

const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';

/** The values §72 names, plus the ones between them. */
const STREAKS = [0, 1, 7, 30, 100, 365];
const LEVELS = [1, 9, 10, 20, 30];
/** A narrow phone, the modal one, and a language with long words. */
const CASES = [
  { width: 320, locale: 'en' },
  { width: 390, locale: 'en' },
  { width: 390, locale: 'de' },
  { width: 390, locale: 'ta' },
];

const stopPreview = await ensurePreview(baseUrl);
const browser = await chromium.launch();
const findings = [];

for (const { width, locale } of CASES) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale,
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  for (const streak of STREAKS) {
    for (const level of LEVELS) {
      const measured = await page.evaluate(
        ({ days, lv }) => {
          /*
            Written into the rendered chips rather than into storage.

            Seeding a hundred-day streak means seeding a hundred days of
            activity, and a level means finishing a level test — both would
            make this a test of the store rather than of the header. What the
            header does with a long string is the question, and a long string
            is what it is given.
          */
          const streakChip = document.querySelector('a[href="/me/activity"]');
          const levelChip = document.querySelector('[data-testid="home-status-level"]');
          if (!streakChip || !levelChip) return null;
          const dayLabel = streakChip.querySelector('.hg-numeric');
          const levelNumber = levelChip.querySelector('.hg-numeric');
          if (!dayLabel || !levelNumber) return null;
          /*
            Only the digits, and only the run of them.

            The first attempt also matched the whitespace after the number, so
            it swallowed the space and turned "0 days" into "1days" — a
            *shorter* string that measured differently from anything the
            product renders, and reported clipping that was its own doing. A
            substitution used as a fixture has to leave the sentence it is
            standing in alone.
          */
          dayLabel.textContent = dayLabel.textContent.replace(/[\d,]+/, String(days));
          levelNumber.textContent = String(lv);

          const box = (el) => el.getBoundingClientRect();
          const target = (el) => {
            const r = box(el);
            const after = getComputedStyle(el, '::after');
            const grow = (side) => {
              const v = Number.parseFloat(after[side]);
              return Number.isFinite(v) && v < 0 ? -v : 0;
            };
            return {
              width: r.width + grow('left') + grow('right'),
              height: r.height + grow('top') + grow('bottom'),
            };
          };
          const a = box(streakChip);
          const b = box(levelChip);
          const doc = document.documentElement;
          return {
            heights: [Math.round(a.height), Math.round(b.height)],
            centres: [Math.round(a.top + a.height / 2), Math.round(b.top + b.height / 2)],
            targets: [target(streakChip), target(levelChip)],
            /*
              Clipped, not merely wider than its own box.

              Both chips carry an `::after` that extends the touch target six
              pixels past the visible pill, and an absolutely positioned child
              outside the padding box makes `scrollWidth` exceed `clientWidth`
              on an element that is showing every word it has. Without the
              overflow test this reported all 120 combinations as clipped,
              including "0 days / Lv. 1" — which `screens:audit` renders
              cleanly, and which is what made the disagreement worth chasing.
            */
            clipped: [streakChip, levelChip].some((chip) => {
              const style = getComputedStyle(chip);
              const hides = style.overflow !== 'visible' && style.overflowX !== 'auto';
              return hides && chip.scrollWidth > chip.clientWidth + 2;
            }),
            sideways: doc.scrollWidth > window.innerWidth + 1,
            text: `${streakChip.textContent.trim()} / ${levelChip.textContent.trim()}`,
          };
        },
        { days: streak, lv: level },
      );

      const where = `${locale} ${width}px, ${streak} days, Lv.${level}`;
      if (!measured) {
        findings.push(`${where}: the status group is not on the page`);
        continue;
      }
      const [ha, hb] = measured.heights;
      if (ha !== hb) findings.push(`${where}: heights differ, ${ha} vs ${hb} — "${measured.text}"`);
      const [ca, cb] = measured.centres;
      if (Math.abs(ca - cb) > 1) {
        findings.push(`${where}: vertical centres differ by ${Math.abs(ca - cb)}px`);
      }
      for (const [i, t] of measured.targets.entries()) {
        if (t.width < 43 || t.height < 43) {
          findings.push(
            `${where}: ${i === 0 ? 'streak' : 'level'} target ${Math.round(t.width)}x${Math.round(t.height)}`,
          );
        }
      }
      if (measured.clipped) findings.push(`${where}: a chip clips its own text — "${measured.text}"`);
      if (measured.sideways) findings.push(`${where}: the page scrolls sideways`);
    }
  }
  console.log(`  ${locale} ${String(width).padStart(3)}px   ${STREAKS.length * LEVELS.length} combinations`);
  await context.close();
}

await browser.close();
await stopPreview();

console.log(
  `\nStatus group — ${CASES.length * STREAKS.length * LEVELS.length} ` +
    'combinations of streak, level, width and language',
);
if (findings.length === 0) {
  console.log('  the two chips keep the same height, centre and touch target at every value.');
  process.exit(0);
}
console.log(`\n${findings.length} finding(s):`);
for (const finding of findings.slice(0, 20)) console.log(`  ! ${finding}`);
if (findings.length > 20) console.log(`  … and ${findings.length - 20} more`);
process.exit(CHECK ? 1 : 0);
