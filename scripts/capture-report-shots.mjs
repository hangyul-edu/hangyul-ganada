#!/usr/bin/env node
/**
 * Captures the screenshots `docs/report.md` embeds.
 *
 *   npm run build --workspace @hangyul-ganada/web
 *   npm run docs:shots                # starts its own preview if one is not up
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

import { ensurePreview } from './lib/preview.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'docs', 'report-assets');
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173';

const PHONE = { width: 390, height: 844 };

await mkdir(OUT, { recursive: true });

const stopPreview = await ensurePreview(baseUrl);
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
const skipped = [];
const shoot = async (page, name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  shots.push(name);
};

/**
 * Runs a block of reference captures, and survives it failing.
 *
 * The blocks below are two different kinds of thing and used to be treated as
 * one. The figures `docs/report.md` embeds are **required**: if one of them
 * cannot be taken, this script has failed at its job and should say so. The
 * rest are reference captures of screens nothing links to, kept because they
 * are occasionally useful to look at.
 *
 * Treating the second kind as required is what broke the first kind. A selector
 * for a screen that had been redesigned threw, the process exited, and every
 * step after it — including all seven of the report's own figures — silently
 * stopped being taken. They were two cycles stale before anybody noticed, and
 * what they were stale *about* was a feature the report says was removed.
 *
 * So an optional block that throws is reported and stepped over. The exit code
 * still reflects it, so it cannot rot unnoticed either — it simply cannot take
 * the required figures down with it.
 */
async function optional(name, run) {
  try {
    await run();
  } catch (error) {
    skipped.push(`${name}: ${String(error).split('\n')[0]}`);
  }
}

/*
 * The figures `docs/report.md` actually embeds.
 *
 * First, and in their own block, for a reason worth stating: everything below
 * this point is captured for reference and is referenced by nothing, and when
 * one of *those* steps broke on a stale selector the script stopped before
 * reaching the seven images the report is built from. They then went two cycles
 * without being retaken, and Figure 6 spent that time showing two vocabulary
 * listening questions a few hundred lines under the prose explaining that no
 * such question can exist.
 *
 * A generated figure that nothing regenerates is a screenshot, and a screenshot
 * in a document that claims to describe the current product is a liability.
 */
{
  const { context, page } = await freshPage();

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await settle(page, 2600);
  await shoot(page, 'audit-home');

  // The first lesson: meeting a letter, then writing it. The writing step is
  // also where the trace guide and the demonstration are compared by eye.
  await page.getByText('Start now').click();
  await settle(page, 1400);
  await page.getByRole('button', { name: /Got it/i }).click();
  await settle(page, 1800);
  await shoot(page, 'audit-letter-intro');
  await page.getByRole('button', { name: /^Write it$/i }).click();
  await settle(page, 1600);
  await shoot(page, 'audit-letter-writing');

  // Review on a clean record: an empty state that routes somewhere, with the
  // learner's own two lists still reachable underneath it.
  await page.goto(`${baseUrl}/review`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  await shoot(page, 'audit-review');

  /*
   * The two lists, empty.
   *
   * Empty is the state every new install is in and the one a screenshot pass
   * usually skips, because it looks like nothing was captured. It is also where
   * the wording matters most: a zero on its own reads as something broken, and
   * what should be there is a sentence naming the action that fills the list
   * and a way to go and do it.
   */
  await page.goto(`${baseUrl}/words/saved`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  await shoot(page, 'audit-saved-words');

  await page.goto(`${baseUrl}/review/mistakes`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  await shoot(page, 'audit-wrong-vocabulary');

  // One word in depth.
  await page.goto(`${baseUrl}/words/word/word_eomma`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  await shoot(page, 'audit-word-detail');

  await context.close();
}

/*
 * Six consecutive screens of a first vocabulary sitting, as one figure.
 *
 * Composed here rather than assembled by hand afterwards, because the point of
 * the figure is *what a first session actually contains* — and the version it
 * replaces was assembled by hand, went stale, and ended up illustrating a
 * question type the product had removed.
 */
{
  const { context, page } = await freshPage();
  await page.goto(`${baseUrl}/words/today`, { waitUntil: 'networkidle' });
  /*
   * Past the placement prompt, which a fresh context always meets — §13.
   *
   * The figure this composes is *a first vocabulary sitting*, and the prompt is
   * a screen before the sitting rather than part of it. It has its own shot.
   */
  const placementSkip = page.getByTestId('placement-skip');
  if (await placementSkip.isVisible().catch(() => false)) {
    await placementSkip.click();
    await settle(page, 600);
  }
  await settle(page, 2600);

  const panels = [];
  for (let i = 0; i < 6; i += 1) {
    panels.push((await page.screenshot()).toString('base64'));
    const forward = page
      .locator('button:visible')
      .filter({ hasText: /Got it|Next|Continue|Finish/i })
      .first();
    const options = page
      .locator('button:visible')
      .filter({ hasText: /^(?!Show a hint|Save|Skip).+/ });
    if (await forward.count()) await forward.click();
    else if (await options.count()) await options.first().click();
    else break;
    await settle(page, 900);
  }

  const sheet = await context.newPage();
  await sheet.setViewportSize({ width: PHONE.width * 3, height: PHONE.height * 2 });
  await sheet.setContent(
    `<html><body style="margin:0;background:#fff;display:grid;` +
      `grid-template-columns:repeat(3,${PHONE.width}px);grid-auto-rows:${PHONE.height}px">` +
      panels
        .map(
          (data) =>
            `<img src="data:image/png;base64,${data}" ` +
            `style="width:${PHONE.width}px;height:${PHONE.height}px;display:block">`,
        )
        .join('') +
      '</body></html>',
  );
  await sheet.waitForTimeout(600);
  await sheet.screenshot({ path: join(OUT, 'audit-session-variety.png'), fullPage: true });
  shots.push('audit-session-variety');
  await context.close();
}

/* Dark mode, on the screen with the most surfaces on it. */
{
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/me`, { waitUntil: 'networkidle' });
  await settle(page, 2400);
  const card = page.locator('button').filter({ hasText: /Sans Serif/ }).first();
  await card.scrollIntoViewIfNeeded();
  await settle(page, 400);
  const box = await card.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await settle(page, 500);
  await shoot(page, 'audit-dark-hover');
  await context.close();
}

// --- Tab screens, on a populated profile -------------------------------------
// Reference captures. Nothing in the report embeds these; see `optional`.
await optional('tab screens', async () => {
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
  // A link, not a button. The category tiles became `<Link to="/words/category/…">`
  // when categories got their own route, and this selector went on asking for a
  // button — which is why the whole script stopped completing, and why the
  // `audit-*` figures the report embeds went two cycles without being retaken.
  /*
    Navigated to, not clicked through.

    Clicking the tile timed out on a seeded profile and not on a fresh one, and
    the difference is the corpus: bands keep arriving, the category list keeps
    growing, and Playwright's actionability check waits for an element that is
    still moving. The tile's own behaviour is covered by `journey.spec.ts`;
    what this block wants is a *picture of the category screen*, and the route
    is the honest way to ask for one.
  */
  await page.goto(`${baseUrl}/words/category/animals-nature`, { waitUntil: 'networkidle' });
  await settle(page, 500);
  await shoot(page, 'words-category');

  /*
   * The category picker sheet used to be captured here and is not any more.
   *
   * There is no picker: `/words` lists the categories directly and each one is
   * a link to its own route. The step sat here asking for a `Category` button
   * long after the button was removed, and because it threw, everything below
   * it — including, until this pass, the figures the report embeds — was never
   * reached. A capture step for a screen that no longer exists is deleted, not
   * left to fail.
   */

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

  /*
    Four captures were removed here, and their removal is the finding.

    They photographed `/words/vocab-food-1` and `/words/vocab-society-13` —
    numbered vocabulary lesson routes that stopped existing when vocabulary
    became a daily plan — and then drove *Practise writing*, syllable chips and
    a word-level grading summary. **Vocabulary has not been handwritten for
    several cycles** (§I-09, and `journey.spec.ts` asserts there is no canvas on
    a word screen), so those buttons render nowhere and the step timed out on
    the first of them.

    That timeout is why this whole block was skipped, and why the reference
    captures after it went stale — the same failure mode, and the same cause, as
    the `lighter guide` step in the first-run block. A capture script that
    photographs a product from two versions ago fails silently until somebody
    reads its output; the `optional` wrapper is what makes it merely quiet
    rather than fatal, and quiet was still too quiet.

    The screens these were meant to show are covered by figures the report
    actually embeds: the word card by `audit-word-detail`, the daily sitting by
    the composed first-session figure.
  */

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
});

// --- The first-run screens, on an empty profile ------------------------------
await optional('first-run screens', async () => {
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

  /*
    The writing step, once.

    This block used to capture four screens — trace, feedback, *practise on a
    lighter guide*, then read — and the middle two have not existed for several
    cycles: §11.3 replaced two writing rungs with one, so `lighter guide` and
    `Now read it` were buttons nothing renders. The step timed out on them and
    took the rest of the block with it, which is why these reference captures
    went stale without anybody noticing.

    What is left is the flow as it is: write over the guide, check, and go on to
    the question. There is no `step-feedback` shot any more either — §12.0 took
    the feedback card out, and a screenshot of a button is not a figure.
  */
  await page.getByRole('button', { name: /^(Write it|Trace it)$/ }).click();
  await settle(page, 600);
  await shoot(page, 'step-write');

  await traceGlyph(page);
  await page.getByRole('button', { name: 'Check' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Try a question/ }).click();
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
});

// --- Dark appearance, on the two screens it most has to be right on ----------
await optional('dark appearance', async () => {
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
});

await browser.close();
await stopPreview();
console.log(`wrote ${shots.length} screenshots to docs/report-assets:\n  ${shots.join('\n  ')}`);

if (skipped.length > 0) {
  console.error(`\n${skipped.length} reference block(s) could not be captured:`);
  for (const line of skipped) console.error(`  ${line}`);
  console.error(
    '\nThe figures the report embeds were taken. These are reference captures of\n' +
      'screens nothing links to — fix the selector or delete the step, but do not\n' +
      'leave it failing.',
  );
  process.exitCode = 1;
}
