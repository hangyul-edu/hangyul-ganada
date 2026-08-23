#!/usr/bin/env node
/**
 * The Level Test, in the learner's language, read off the screen.
 *
 *   npm run leveltest:locale            report
 *   npm run leveltest:locale -- --check fail on a finding
 *
 * ## The defect this exists for
 *
 * A learner set the interface to Korean, opened the Vocabulary Level Test, and
 * was asked 이 단어는 무슨 뜻일까요? above 나누다 with four choices reading *to
 * divide, to share* / *to do wrong* / *to gather* / *to look up at, to stare
 * at*. Every check in the repository was green, and the report said "Vocabulary
 * Level Test — 32 of 32".
 *
 * That number was true and measured the wrong thing. It counted the *interface*
 * strings — the title, the prompt, the timer, the buttons, the result — which
 * are in the translation bundles and were complete. The **answers** were not in
 * the translation bundles at all: the item bank baked them in as English text,
 * so no amount of interface translation could reach them. §2 asks for the two
 * to be counted separately and never merged, and this is the second count.
 *
 * ## Why the script and not the strings
 *
 * §6 rules out Latin-character detection, and rightly: half the supported
 * languages are written in Latin, so "no Latin letters" says nothing about
 * Czech, and 32 fixtures of expected translations would be a second copy of the
 * corpus, stale within a week.
 *
 * So every option carries `data-resolved-locale` — the language the resolver
 * actually pulled that string from — and this asserts it equals the language
 * the learner chose. A Korean word inside a Korean question is `ko` and
 * correct; a *meaning* that resolved from anywhere but the learner's own pack
 * is a defect whatever alphabet it happens to be in.
 *
 * ## Two layers, because rendering 32 languages deeply is slow
 *
 * **Rendered** — every locale, opened for real, several questions walked, the
 * DOM read. This is what catches a renderer that ignores the resolver.
 *
 * **Resolved** — every item in the bank at every level, run through the same
 * `resolveItem` the app uses. This is what catches an item at level 27 that
 * nobody's sitting happened to reach.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ensurePreview } from './lib/preview.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/web/public/level-test');
const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';

const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
const bank = JSON.parse(readFileSync(join(OUT, manifest.bank), 'utf8'));
const LOCALES = readdirSync(join(ROOT, 'apps/web/src/locales'), { withFileTypes: true })
  .filter((row) => row.isDirectory())
  .map((row) => row.name)
  .sort();

const findings = [];

// --- Layer 1: every item, every level, through the app's own resolver --------

const { resolveItem } = await import('../apps/web/src/data/levelTest.ts');

console.log('Level Test — the answers, in the learner\'s language\n');
console.log('  resolved, every item at every level:\n');
console.log('    locale   askable  ceiling  levels thinner than 6');

const reachTable = {};
for (const locale of LOCALES) {
  const file = manifest.meanings?.[locale];
  const meanings = new Map();
  if (file) {
    const table = JSON.parse(readFileSync(join(OUT, file), 'utf8'));
    for (const [id, text] of Object.entries(table.meanings)) meanings.set(id, text);
  }

  const perLevel = {};
  let askable = 0;
  for (const item of bank.items) {
    const rendered = resolveItem(item, meanings, locale);
    if (!rendered) continue;
    askable += 1;
    perLevel[item.level] = (perLevel[item.level] ?? 0) + 1;
    /*
      The invariant, asserted on the resolver's own output rather than on the
      text: a semantic string must carry the learner's locale, and a Korean one
      must carry `ko`. Nothing else is allowed, which is what makes "no
      fallback" checkable instead of aspirational.
    */
    for (const option of rendered.options) {
      if (option.resolvedLocale !== locale && option.resolvedLocale !== 'ko') {
        findings.push(
          `${locale}: ${item.id} has an option resolved from ${option.resolvedLocale}`,
        );
      }
    }
    if (rendered.promptLocale !== locale && rendered.promptLocale !== 'ko') {
      findings.push(`${locale}: ${item.id} has a prompt resolved from ${rendered.promptLocale}`);
    }
  }

  // Contiguous, for the reason `build_level_test.mjs` states: an adaptive test
  // climbs and cannot step over a level with nothing in it.
  let ceiling = 0;
  let broken = false;
  const thin = [];
  for (let level = 1; level <= bank.levels; level += 1) {
    if ((perLevel[level] ?? 0) < 6) {
      thin.push(level);
      broken = true;
    } else if (!broken) {
      ceiling = level;
    }
  }
  reachTable[locale] = { askable, ceiling };
  const thinNote = thin.length === 0 ? 'none' : thin.length > 8 ? `${thin.length} levels` : thin.join(' ');
  console.log(
    `    ${locale.padEnd(8)} ${String(askable).padStart(6)}  ${String(ceiling).padStart(7)}  ${thinNote}`,
  );

  // The manifest's own claim has to match what the resolver actually does.
  const claimed = manifest.reach?.[locale]?.ceiling;
  if (claimed !== ceiling) {
    findings.push(`${locale}: the manifest claims a ceiling of ${claimed}, the resolver gives ${ceiling}`);
  }
}

// --- Layer 2: rendered, in a browser, in every language ----------------------

const stopPreview = await ensurePreview(baseUrl);
const browser = await chromium.launch();
console.log('\n  rendered, opened as a learner in each language:\n');

for (const locale of LOCALES) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale,
  });
  const page = await context.newPage();
  await page.addInitScript((code) => {
    window.localStorage.setItem('hangyul_ganada:locale', code);
  }, locale);
  page.on('pageerror', (error) =>
    findings.push(`${locale}: the level test threw — ${String(error).slice(0, 120)}`),
  );

  await page.goto(`${baseUrl}/me/level-test`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('main button:visible').last().click().catch(() => {});
  await page.waitForTimeout(1200);

  let asked = 0;
  const kinds = new Set();
  for (let step = 0; step < 8; step += 1) {
    const seen = await page.evaluate(() => {
      const options = [...document.querySelectorAll('[data-resolved-locale]')];
      if (options.length === 0) return null;
      return options.map((node) => ({
        text: (node.textContent ?? '').trim(),
        locale: node.getAttribute('data-resolved-locale'),
      }));
    });
    if (!seen) break;
    asked += 1;
    for (const option of seen) {
      kinds.add(option.locale);
      if (option.locale !== locale && option.locale !== 'ko') {
        findings.push(`${locale}: an option on screen resolved from ${option.locale} — "${option.text}"`);
      }
      if (!option.text) findings.push(`${locale}: an option rendered empty`);
    }
    await page.locator('[data-resolved-locale]').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  if (asked === 0) findings.push(`${locale}: no question appeared`);
  console.log(
    `    ${locale.padEnd(8)} ${String(asked).padStart(2)} question(s), option languages: ${[...kinds].sort().join(', ') || '—'}`,
  );
  await context.close();
}

await browser.close();
await stopPreview();

const full = LOCALES.filter((l) => reachTable[l].ceiling === bank.levels).length;
console.log(
  `\n${LOCALES.length} languages: ${full} reach the whole scale, ` +
    `${LOCALES.length - full} reach a lower ceiling and the result says so.`,
);

if (findings.length === 0) {
  console.log('No answer option, in any language, resolved from anywhere but that language.');
  process.exit(0);
}
console.log(`\n${findings.length} finding(s):`);
for (const finding of findings.slice(0, 25)) console.log(`  ! ${finding}`);
if (findings.length > 25) console.log(`  … and ${findings.length - 25} more`);
process.exit(CHECK ? 1 : 0);
