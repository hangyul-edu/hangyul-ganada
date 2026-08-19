/**
 * Visual-QA capture. Drives the running app and writes screenshots so each
 * screen can be compared against the reference pages in docs/design-refs/.
 *
 *   node scripts/screenshot.mjs [outDir] [baseUrl]
 *
 * This pass is the design-fidelity check and runs in the default locale.
 * `screenshot-locales.mjs` is the localization pass and covers the rest.
 */
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from '@playwright/test';

const outDir = process.argv[2] ?? '../../.visual-qa/pass1';
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:4173';

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: 'desktop', width: 1440, height: 900 },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    ...(vp.name === 'desktop' ? {} : devices['iPhone 13'].isMobile ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();

  const shot = async (name, path, prepare) => {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (prepare) await prepare(page);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/${vp.name}-${name}.png`, fullPage: false });
    console.log(`  ${vp.name}-${name}.png`);
  };

  console.log(`[${vp.name}]`);
  await shot('home', '/');
  await shot('letters', '/letters');
  await shot('words', '/words');
  await shot('review', '/review');
  await shot('me', '/me');
  await shot('sources', '/me/sources');
  await shot('language', '/me/language');
  // The unit explainer, which is the first thing a new learner ever sees.
  await shot('unit-intro', '/letters/lesson-vowels-core');
  // Meeting a consonant: the case with a name *and* a sound.
  await shot('letter-intro', '/letters/lesson-consonants-first');
  await shot('letter-session', '/letters/lesson-vowels-core', async (p) => {
    await p.getByRole('button', { name: /Got it/ }).click();
    await p.getByRole('button', { name: /Trace it|Write it/ }).click();
    await p.evaluate(() => document.fonts.ready);
  });

  // A genuinely correct attempt, so the shots show the success state. The path
  // is read out of the guide canvas's own pixels rather than guessed, which is
  // the same technique the E2E suite uses — a hard-coded path traces the wrong
  // place the moment a glyph, font or layout changes.
  await shot('letter-session-drawn', '/letters/lesson-vowels-core', async (p) => {
    await p.getByRole('button', { name: /Got it/ }).click();
    await p.getByRole('button', { name: /Trace it|Write it/ }).click();
    await p.evaluate(() => document.fonts.ready);
    const canvas = p.locator('[data-testid="writing-canvas"] canvas').first();
    const rect = await canvas.boundingBox();
    if (!rect) return;

    const runs = await canvas.evaluate((el) => {
      const ctx = el.getContext('2d');
      if (!ctx) return [];
      const { width, height } = el;
      const { data } = ctx.getImageData(0, 0, width, height);
      const out = [];
      const step = Math.max(1, Math.round(height / 26));
      for (let y = 0; y < height; y += step) {
        let start = -1;
        for (let x = 0; x <= width; x += 1) {
          const inked = x < width && data[(y * width + x) * 4 + 3] > 96;
          if (inked && start === -1) start = x;
          if (!inked && start !== -1) {
            if (x - start > width * 0.02) {
              out.push({ y: (y + 0.5) / height, x0: (start + 0.5) / width, x1: (x - 0.5) / width });
            }
            start = -1;
          }
        }
      }
      return out;
    });

    for (const run of runs) {
      const y = rect.y + run.y * rect.height;
      const x0 = rect.x + run.x0 * rect.width;
      const x1 = rect.x + run.x1 * rect.width;
      await p.mouse.move(x0, y);
      await p.mouse.down();
      await p.mouse.move(x1, y, { steps: Math.max(2, Math.round((x1 - x0) / 6)) });
      await p.mouse.up();
    }

    // English, because a fresh context has no stored preference and English
    // is the default. Locale-specific captures live in screenshot-locales.mjs.
    await p.getByRole('button', { name: 'Check' }).click();
    await p.waitForTimeout(400);
  });

  // The recognition step, which is where reading is actually tested.
  await shot('recognition', '/letters/lesson-vowels-core', async (p) => {
    await p.getByRole('button', { name: /Got it/ }).click();
    await p.getByRole('button', { name: /Trace it|Write it/ }).click();
    await p.evaluate(() => document.fonts.ready);
    await traceAndCheck(p);
    await p.getByRole('button', { name: /Now write it/ }).click();
    await traceAndCheck(p);
    await p.getByRole('button', { name: /Now find it/ }).click();
    await p.waitForTimeout(300);
  });

  await shot('word-intro', '/words/vocab-1-1');
  await shot('word-session', '/words/vocab-1-1', async (p) => {
    await p.getByRole('button', { name: 'Write it' }).click();
    await p.evaluate(() => document.fonts.ready);
  });

  await context.close();
}

/** Traces the guide and submits it, so a shot can show a later step. */
async function traceAndCheck(p) {
  const canvas = p.locator('[data-testid="writing-canvas"] canvas').first();
  const rect = await canvas.boundingBox();
  if (!rect) return;
  const runs = await canvas.evaluate((el) => {
    const ctx = el.getContext('2d');
    if (!ctx) return [];
    const { width, height } = el;
    const { data } = ctx.getImageData(0, 0, width, height);
    const out = [];
    const step = Math.max(1, Math.round(height / 26));
    for (let y = 0; y < height; y += step) {
      let start = -1;
      for (let x = 0; x <= width; x += 1) {
        const inked = x < width && data[(y * width + x) * 4 + 3] > 96;
        if (inked && start === -1) start = x;
        if (!inked && start !== -1) {
          if (x - start > width * 0.02) {
            out.push({ y: (y + 0.5) / height, x0: (start + 0.5) / width, x1: (x - 0.5) / width });
          }
          start = -1;
        }
      }
    }
    return out;
  });
  for (const run of runs) {
    const y = rect.y + run.y * rect.height;
    const x0 = rect.x + run.x0 * rect.width;
    const x1 = rect.x + run.x1 * rect.width;
    await p.mouse.move(x0, y);
    await p.mouse.down();
    await p.mouse.move(x1, y, { steps: Math.max(2, Math.round((x1 - x0) / 6)) });
    await p.mouse.up();
  }
  await p.getByRole('button', { name: 'Check' }).click();
  await p.waitForTimeout(300);
}

await browser.close();
console.log(`\nwrote to ${outDir}`);
