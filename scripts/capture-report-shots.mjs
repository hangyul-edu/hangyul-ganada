#!/usr/bin/env node
/**
 * Captures the screenshots `docs/report.md` embeds.
 *
 *   npm run build --workspace @hangyul-ganada/web
 *   npx vite preview --port 4173      # from apps/web
 *   npm run docs:shots
 *
 * Kept separate from `docs:report` on purpose: the report can be rewritten and
 * rebuilt any number of times without a running app, and the pictures only need
 * retaking when the interface actually changes. Both steps are one command so
 * neither becomes the one nobody runs.
 *
 * The profile is seeded straight into IndexedDB rather than driven through the
 * UI. The report needs a *populated* app — a streak, a month of activity, some
 * letters learned — and forty simulated lessons would make every run of this
 * script produce a slightly different document.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'docs', 'report-assets');
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173';

const PHONE = { width: 390, height: 844 };

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function freshPage() {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  return { context, page };
}

/** A learner five weeks in: letters learned, a habit, a couple of gaps. */
async function seed(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open('hangyul-ganada');
      request.onsuccess = () => resolve(request.result);
    });
    const key = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const letters = ['ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ'];
    const now = new Date().toISOString();
    const tx = db.transaction(['activity', 'progress', 'settings', 'memory'], 'readwrite');

    const dates = [];
    for (let back = 34; back >= 0; back -= 1) {
      if (back % 8 === 3) continue;
      const when = new Date();
      when.setDate(when.getDate() - back);
      const date = key(when);
      dates.push(date);
      tx.objectStore('activity').put(
        {
          date,
          first_at: when.toISOString(),
          last_at: when.toISOString(),
          active_ms: (5 + (back % 14)) * 60_000,
          attempts: 3 + ((back * 5) % 24),
          passes: 2 + ((back * 4) % 18),
          characters_learned: back % 4 === 0 ? 1 : 0,
          words_learned: back % 7 === 0 ? 2 : 0,
          reviews: back % 6 === 0 ? 3 : 0,
          items: { 'character:ㅓ': 9, 'character:ㅏ': 6, 'character:ㄱ': 4 },
        },
        date,
      );
    }

    for (const [i, character] of letters.entries()) {
      tx.objectStore('progress').put(
        {
          item_key: character,
          kind: 'character',
          stage: i < 8 ? 'learned' : 'written',
          attempts: 5,
          passes: 4,
          fails: 1,
          trace_passes: 2,
          write_passes: 2,
          recognition_passes: 1,
          heard: true,
          learned: i < 8,
          needs_review: false,
          last_score: 0.92,
          first_seen_at: now,
          last_attempted_at: now,
          learned_at: i < 8 ? now : null,
          review_due_at: null,
        },
        `character:${character}`,
      );
    }

    // Per-skill memory, so the Review screen has something real to render.
    //
    // Written straight into the store the app reads rather than driven through
    // forty review sessions in the UI: the scheduler is deterministic given a
    // profile, so seeding the profile produces the same screen every run, and
    // driving it would produce a slightly different one each time.
    const at = (days) => new Date(Date.now() - days * 86400000).toISOString();
    const due = (days) => new Date(Date.now() + days * 86400000).toISOString();
    const skill = (name, stability, lapses, ago) => ({
      skill: name,
      stability_days: stability,
      difficulty: 0.2 + lapses * 0.12,
      last_reviewed_at: at(ago),
      next_review_at: due(stability - ago),
      streak: lapses ? 0 : 3,
      lapses,
      recent_score: lapses ? 0.4 : 1,
      last_response_ms: null,
      hints: 0,
    });
    const memory = [
      ['ㅓ', { sound_recognition: skill('sound_recognition', 2, 3, 4),
              guided_writing: skill('guided_writing', 9, 0, 2) }, { 'ㅗ': 3 }],
      ['ㅏ', { visual_recognition: skill('visual_recognition', 12, 0, 3) }, {}],
      ['ㄱ', { guided_writing: skill('guided_writing', 3, 1, 5) }, {}],
      ['ㄴ', { sound_recognition: skill('sound_recognition', 6, 0, 1) }, {}],
      ['ㄷ', { guided_writing: skill('guided_writing', 1.5, 2, 3) }, {}],
    ];
    for (const [character, skills, confusions] of memory) {
      tx.objectStore('memory').put(
        {
          item_key: character,
          kind: 'character',
          algorithm_version: 1,
          skills,
          confusions,
          rescued_at: null,
        },
        `character:${character}`,
      );
    }

    const settings = await new Promise((resolve) => {
      const request = tx.objectStore('settings').get('preferences');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });
    tx.objectStore('settings').put({ ...(settings ?? {}), active_days: dates }, 'preferences');
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  });
}

/** A deliberate mess, so a step can be failed on purpose. */
async function scribbleGlyph(page) {
  const rect = await page
    .getByTestId('writing-canvas')
    .first()
    .locator('canvas')
    .first()
    .boundingBox();
  const points = [
    [0.1, 0.15],
    [0.9, 0.35],
    [0.15, 0.5],
    [0.85, 0.7],
    [0.2, 0.85],
    [0.8, 0.2],
  ];
  await page.mouse.move(rect.x + rect.width * 0.1, rect.y + rect.height * 0.15);
  await page.mouse.down();
  for (const [px, py] of points) {
    await page.mouse.move(rect.x + rect.width * px, rect.y + rect.height * py, { steps: 8 });
  }
  await page.mouse.up();
}

/** Traces the reference glyph from its own pixels, so a step can be passed. */
async function traceGlyph(page) {
  const box = page.getByTestId('writing-canvas').first();
  const runs = await box
    .locator('canvas')
    .first()
    .evaluate((canvas) => {
      const context = canvas.getContext('2d');
      const { width, height } = canvas;
      const data = context.getImageData(0, 0, width, height).data;
      const out = [];
      for (let y = 0; y < height; y += Math.max(1, Math.round(height / 26))) {
        let start = -1;
        for (let x = 0; x < width; x += 1) {
          const on = data[(y * width + x) * 4 + 3] > 12;
          if (on && start < 0) start = x;
          if ((!on || x === width - 1) && start >= 0) {
            if (x - start > 2) out.push({ y: y / height, x0: start / width, x1: x / width });
            start = -1;
          }
        }
      }
      return out;
    });
  const rect = await box.locator('canvas').first().boundingBox();
  for (const run of runs) {
    const y = rect.y + run.y * rect.height;
    const x0 = rect.x + run.x0 * rect.width;
    const x1 = rect.x + run.x1 * rect.width;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    const steps = Math.max(2, Math.round((x1 - x0) / 6));
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y);
    }
    await page.mouse.up();
  }
}

const settle = async (page, ms = 450) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
};

const shots = [];
const shoot = async (page, name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  shots.push(name);
};

// --- Tab screens, on a populated profile -------------------------------------
{
  const { context, page } = await freshPage();
  await seed(page);
  for (const [name, path] of [
    ['home', '/'],
    ['letters', '/letters'],
    ['words', '/words'],
    ['activity', '/me/activity'],
    ['settings', '/me'],
    ['privacy', '/me/privacy'],
  ]) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    await settle(page);
    await shoot(page, name);
  }

  // One category, opened. The grid alone does not show that a category is a
  // list of study sets, which is the half of the change worth a picture.
  await page.goto(`${baseUrl}/words`, { waitUntil: 'networkidle' });
  await settle(page);
  await page.getByRole('button', { name: /Animals & Nature/ }).first().click();
  await settle(page, 500);
  await shoot(page, 'words-category');

  // The picker sheet.
  await page.goto(`${baseUrl}/words`, { waitUntil: 'networkidle' });
  await settle(page);
  await page.getByRole('button', { name: /^Category/ }).click();
  await page.waitForTimeout(500);
  await shoot(page, 'words-picker');

  // The calendar and the insights, further down the activity page.
  await page.goto(`${baseUrl}/me/activity`, { waitUntil: 'networkidle' });
  await settle(page);
  await page.locator('[role="gridcell"]:not([disabled])').last().click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelector('#main').scrollTop = 520;
  });
  await page.waitForTimeout(350);
  await shoot(page, 'activity-calendar');
  await page.evaluate(() => {
    const main = document.querySelector('#main');
    main.scrollTop = main.scrollHeight;
  });
  await page.waitForTimeout(350);
  await shoot(page, 'activity-insights');

  // Review: the dashboard, and one exercise from a sitting.
  await page.goto(`${baseUrl}/review`, { waitUntil: 'networkidle' });
  await settle(page, 500);
  await shoot(page, 'review');

  await page.getByRole('button', { name: 'Start review' }).click();
  await settle(page, 800);
  await shoot(page, 'review-exercise');

  // A word, met the way the redesign meets it: word, sound, meaning, sentence.
  await page.goto(`${baseUrl}/words/vocab-food-1`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  await shoot(page, 'word-intro');

  // Writing a long word. 기도하다 is the case the screen was rebuilt around: four
  // syllables used to mean four boxes in a row that did not fit a phone.
  await page.goto(`${baseUrl}/words/vocab-society-13`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  await page.getByRole('button', { name: 'Practise writing' }).click();
  await settle(page, 700);
  await shoot(page, 'word-writing');

  // ...and the one result it produces. Two syllables traced properly and two
  // scribbled, so the summary has something of each to show.
  {
    const chips = page.getByTestId('syllable-chip');
    const count = await chips.count();
    for (let i = 0; i < count; i += 1) {
      await chips.nth(i).click();
      await page.waitForTimeout(250);
      if (i < 2) await traceGlyph(page);
      else await scribbleGlyph(page);
    }
    await page.getByTestId('check-word').click();
    await page.getByTestId('word-feedback').waitFor();
    await settle(page, 600);
    await shoot(page, 'word-feedback');
  }

  // The sound-change lesson.
  await page.goto(`${baseUrl}/letters/sounds`, { waitUntil: 'networkidle' });
  await settle(page, 600);
  await shoot(page, 'sound-changes');

  // The font picker.
  await page.goto(`${baseUrl}/me`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  const list = page.locator('ul').filter({ hasText: 'Standard' }).first();
  await list.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await list.screenshot({ path: join(OUT, 'font-picker.png') });
  shots.push('font-picker');

  await context.close();
}

// --- The first-run screens, on an empty profile ------------------------------
{
  const { context, page } = await freshPage();
  await page.goto(`${baseUrl}/me/activity`, { waitUntil: 'networkidle' });
  await settle(page);
  await shoot(page, 'activity-empty');

  // 마디 — the word this cycle's audio defect was found on, with its card as a
  // learner sees it: the note-free spelling, the meaning, the sentence.
  await page.goto(`${baseUrl}/words`, { waitUntil: 'networkidle' });
  await settle(page);
  const search = page.getByRole('searchbox').or(page.getByPlaceholder(/Search/i)).first();
  if (await search.count()) {
    await search.fill('마디');
    await settle(page, 800);
    await shoot(page, 'words-search-madi');
  }

  await page.goto(`${baseUrl}/letters/lesson-syllables-ca`, { waitUntil: 'networkidle' });
  await settle(page);
  await shoot(page, 'unit-intro-blocks');

  await page.goto(`${baseUrl}/letters/lesson-vowels-core`, { waitUntil: 'networkidle' });
  await settle(page);
  const unitCta = page.getByRole('button', { name: /Got it/ }).first();
  if (await unitCta.count()) {
    await unitCta.click();
    await settle(page);
  }
  await shoot(page, 'character-intro');

  await page.getByRole('button', { name: /Trace it/ }).click();
  await settle(page, 600);
  await shoot(page, 'step-trace');

  await traceGlyph(page);
  await page.getByRole('button', { name: 'Check' }).click();
  await page.waitForTimeout(700);
  await shoot(page, 'step-feedback');

  await page.getByRole('button', { name: /lighter guide/ }).click();
  await settle(page, 600);
  await shoot(page, 'step-practise');

  await traceGlyph(page);
  await page.getByRole('button', { name: 'Check' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Now read it/ }).click();
  await settle(page, 600);
  await shoot(page, 'step-read');

  /*
   * The wrong answer, and what is said about it.
   *
   * Added this cycle because the copy audit is largely an audit of *failure*
   * copy, and failure copy is the half of a product that never appears in a
   * screenshot. The option picked is deliberately not the answer.
   */
  const wrong = page
    .getByRole('button')
    .filter({ hasText: /^[ㄱ-ㅎㅏ-ㅣ]$/ })
    .filter({ hasNotText: 'ㅏ' })
    .first();
  if (await wrong.count()) {
    await wrong.click();
    await settle(page, 700);
    await shoot(page, 'step-read-wrong');
  }

  await context.close();
}

// --- Dark appearance, on the two screens it most has to be right on ----------
{
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    hasTouch: true,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  await shoot(page, 'home-dark');

  await page.goto(`${baseUrl}/letters/lesson-vowels-core`, { waitUntil: 'networkidle' });
  await settle(page);
  const cta = page.getByRole('button', { name: /Got it/ }).first();
  if (await cta.count()) {
    await cta.click();
    await settle(page);
  }
  // Long enough for the demonstration to have drawn the whole character, so
  // the shot shows ink on paper rather than a half-written letter.
  await page.waitForTimeout(2600);
  await shoot(page, 'character-intro-dark');

  await context.close();
}

await browser.close();
console.log(`wrote ${shots.length} screenshots to docs/report-assets:\n  ${shots.join('\n  ')}`);
