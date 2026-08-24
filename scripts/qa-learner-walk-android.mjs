#!/usr/bin/env node
/**
 * The walk, on the device, looking for the things that were photographed.
 *
 *   ANDROID_HOME=/root/android-sdk npm run mobile:walk
 *
 * ## What this is for, and what `mobile:qa` is for
 *
 * `qa-native-android.mjs` asks whether the native shell works: insets, back
 * button, offline assets, audio, no service worker. It would pass on a build
 * whose every Korean question had two right answers.
 *
 * This asks the other question. Each check below is one screen somebody
 * photographed and one defect that was on it, driven through the app in the
 * order a learner meets them. They are *rendering* checks — the content gates
 * already hold the content — so each one reads the DOM the WebView actually
 * produced, on a real Android WebView, at a real device width.
 *
 * ## What it cannot tell you
 *
 * That the app is good. It is a list of specific past failures, and a list of
 * past failures is the weakest kind of test there is: it says only that the
 * same thing has not come back. Everything not on the list is unchecked by
 * this file, and no run of it is a substitute for looking at the screen.
 *
 * It is also an **emulator**, not a phone. Nothing here is evidence about a
 * physical device.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { adb, attach, screencap, sleep } from './lib/android-webview.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SHOTS = join(ROOT, '.walk-shots');
const PACKAGE = 'com.talkhangyul.ganada.debug';

const results = [];
const pass = (what, detail = '') => results.push({ ok: true, what, detail });
const fail = (what, detail = '') => results.push({ ok: false, what, detail });

mkdirSync(SHOTS, { recursive: true });

const page = await attach(PACKAGE);

/** Goes to a route through the app's own router, then settles. */
async function go(path) {
  await page.evaluate(`
    window.history.pushState({}, '', ${JSON.stringify(path)});
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  `);
  await sleep(1500);
}

async function shot(name) {
  writeFileSync(join(SHOTS, `${name}.png`), screencap());
}

/** Clicks the first visible control whose text matches, and reports whether it did. */
async function tap(pattern) {
  return page.evaluate(`
    const wanted = ${pattern};
    const button = [...document.querySelectorAll('button, a[href], [role="button"]')]
      .find((node) => wanted.test((node.textContent ?? '').trim()));
    if (!button) return false;
    button.click();
    await new Promise((r) => setTimeout(r, 700));
    return true;
  `);
}

/**
 * Gets past the placement prompt.
 *
 * A fresh install asks, on the way into the first session, whether to take the
 * level test. Every check below is about the screen behind it, and a walk that
 * does not answer it photographs a modal five times. See the note in
 * `docs/BEGINNER_TEST_PROTOCOL.md`.
 */
async function dismissPlacement() {
  await tap('/Level 1|레벨 1|1단계/');
  await sleep(1200);
}

/** Every visible text node's box, so a check can ask what wrapped where. */
const TEXT_BOXES = `
  const boxes = [];
  for (const node of document.querySelectorAll('button, a, h1, h2, p, span, label, li')) {
    if (node.children.length > 0) continue;
    const text = (node.textContent ?? '').trim();
    if (!text) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    boxes.push({
      text,
      lines: range.getClientRects().length,
      width: rect.width,
      clipped: node.scrollWidth > node.clientWidth + 2,
      tag: node.tagName.toLowerCase(),
    });
  }
  return boxes;
`;

// --- A. Home ------------------------------------------------------------------
await go('/');
await shot('a-home');
{
  const boxes = await page.evaluate(TEXT_BOXES);
  const empty = boxes.filter((box) => box.tag === 'button' && box.text.length === 0);
  if (empty.length === 0) pass('A · home draws, and no control is nameless');
  else fail('A · home', `${empty.length} unnamed control(s)`);
}

// --- B. Korean buttons do not split words -------------------------------------
//
// §9–10. 레벨 1부/터 and 레벨 테/스트 — Korean broken mid-word across two lines,
// because `word-break` was the browser default. Checked here rather than only in
// `modals:qa` because the Android WebView is a different engine from the one the
// gate drives, and this is exactly the kind of rule an engine differs on.
//
// Switched through the language screen rather than by writing storage: the
// point is the interface a learner would actually be looking at.
{
  await go('/me/language');
  await sleep(1500);
  const switched = await tap('/^한국어/');
  await sleep(2500);
  await go('/me/level-test');
  await sleep(2500);
  await shot('b-level-test-intro');
  const boxes = await page.evaluate(TEXT_BOXES);
  const korean = boxes.filter((box) => /[가-힣]/.test(box.text));
  const split = korean.filter((box) => box.lines > 1 && !/\s/.test(box.text));
  if (!switched) fail('B · Korean interface', 'the language screen has no 한국어 row');
  else if (korean.length === 0) fail('B · Korean button text', 'no Korean text on the screen to check');
  else if (split.length === 0) pass('B · no Korean word is broken across lines', `${korean.length} run(s) read`);
  else fail('B · Korean word broken across lines', split.map((box) => box.text).join(' / '));
}

// --- C. The header says the whole thing ---------------------------------------
//
// §47. இன்றைய சொற்... — the screen's own name truncated. The header wraps now;
// this asks the device whether it does.
{
  await go('/words/today');
  await sleep(2500);
  await dismissPlacement();
  await sleep(1500);
  await shot('c-session');
  const clipped = await page.evaluate(`
    const out = [];
    for (const node of document.querySelectorAll('h1, h2')) {
      if (node.scrollWidth > node.clientWidth + 2) out.push((node.textContent ?? '').trim());
    }
    return out;
  `);
  if (clipped.length === 0) pass('C · no heading is cut off');
  else fail('C · heading cut off', clipped.join(' / '));
}

// --- D. The session bar is the session's ---------------------------------------
//
// §25–35. The header counted the day and the bar counted the session, and they
// were photographed disagreeing. Whatever the numbers are on this device today,
// the two must be reading the same fraction as each other.
{
  const readings = await page.evaluate(`
    const bar = document.querySelector('[role="progressbar"]');
    const counter = [...document.querySelectorAll('*')]
      .filter((n) => n.children.length === 0)
      .map((n) => (n.textContent ?? '').trim())
      .find((t) => /^\\d+\\s*\\/\\s*\\d+$/.test(t));
    return {
      counter: counter ?? null,
      now: bar ? Number(bar.getAttribute('aria-valuenow')) : null,
      max: bar ? Number(bar.getAttribute('aria-valuemax')) : null,
    };
  `);
  if (!readings.counter) {
    fail('D · session counter', 'no “n / m” counter found on the session screen');
  } else {
    const [done, total] = readings.counter.split('/').map((part) => Number(part.trim()));
    const barShare = readings.max ? readings.now / readings.max : null;
    const counterShare = total ? done / total : null;
    const agree = barShare === null || Math.abs(barShare - counterShare) < 0.02;
    if (agree) pass('D · the counter and the bar measure the same thing', `${readings.counter}`);
    else fail('D · counter and bar disagree', `${readings.counter} against ${readings.now}/${readings.max}`);
  }
}

// --- E. Feedback says the verdict and stops ------------------------------------
//
// §20–21. 정답은 "…"예요 printed under a list that had already marked the answer.
{
  // Past the introduction card first. Meeting a word is not a question, and
  // §25's whole point is that pressing 알겠어요 credits nothing — so the walk
  // has to press it to reach anything with options on it.
  for (let step = 0; step < 4; step += 1) {
    const hasOptions = await page.evaluate(`
      return [...document.querySelectorAll('button')]
        .some((b) => b.className && /option/i.test(b.className));
    `);
    if (hasOptions) break;
    if (!(await tap('/알겠어요|다음|Next|Got it/'))) break;
    await sleep(1200);
  }

  const answered = await page.evaluate(`
    const options = [...document.querySelectorAll('button')]
      .filter((b) => b.className && /option/i.test(b.className));
    if (options.length === 0) return null;
    const before = options.map((b) => (b.textContent ?? '').trim());
    options[0].click();
    await new Promise((r) => setTimeout(r, 900));
    const card = document.querySelector('[role="status"]');
    return { before, card: card ? (card.textContent ?? '').replace(/\\s+/g, ' ').trim() : null };
  `);
  await shot('e-feedback');
  if (!answered) {
    fail('E · answer feedback', 'no option buttons on the session screen');
  } else if (!answered.card) {
    fail('E · answer feedback', 'no feedback card appeared after answering');
  } else {
    const repeated = answered.before.filter(
      (label) => label.length > 1 && answered.card.includes(label),
    );
    if (repeated.length === 0) pass('E · the feedback card does not repeat an option', answered.card);
    else fail('E · the feedback card repeats an option', repeated.join(' / '));
  }
}

// --- F. The level result names one level ---------------------------------------
//
// §14–16. `15~21` on the result screen, and 23단계까지…아직 번역되지 않았어요
// underneath it. Reaching that screen means answering the test, so the walk
// answers it — first option every time, which is a learner's score of roughly
// nothing and lands the result at the bottom of the scale. The number is not
// what is being checked; its *shape* is.
{
  await go('/me/level-test');
  await sleep(2000);
  await tap('/시작하기|Start/');
  // The bank is fetched per locale, and until it lands the screen is a status
  // line with nothing to click. Waiting for the first option is waiting for the
  // test to exist.
  await page.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.className && /option/i.test(b.className))`,
    30000,
  );

  let reachedResult = false;
  let idle = 0;
  const seenRanges = [];
  for (let step = 0; step < 60 && !reachedResult; step += 1) {
    const screen = await page.evaluate(`
      const text = (document.body.innerText ?? '').replace(/\\s+/g, ' ');
      const options = [...document.querySelectorAll('button')]
        .filter((b) => b.className && /option/i.test(b.className));
      const next = [...document.querySelectorAll('button')]
        .find((b) => /계속|다음|마치기|결과|Continue|Finish/.test((b.textContent ?? '').trim()));
      if (options.length > 0) { options[0].click(); }
      else if (next) { next.click(); }
      await new Promise((r) => setTimeout(r, 600));
      return {
        text,
        had: options.length > 0 || Boolean(next),
        result: Boolean(document.querySelector('[data-testid="level-result"]')),
      };
    `);
    const range = /(?:^|[^\\d])(\\d{1,2})\\s*[~–—-]\\s*(\\d{1,2})(?:[^\\d]|$)/.exec(screen.text);
    if (range) seenRanges.push(range[0].trim());
    if (screen.result) reachedResult = true;
    if (!screen.had && !reachedResult) idle += 1;
    else idle = 0;
    if (idle >= 5) break;
    await sleep(400);
  }

  await sleep(1200);
  await shot('f-level-result');
  const text = await page.evaluate(`return (document.body.innerText ?? '').replace(/\\s+/g, ' ');`);
  const range = /(?:^|[^\\d])(\\d{1,2})\\s*[~–—-]\\s*(\\d{1,2})(?:[^\\d]|$)/.exec(text);
  const untranslated = /번역되지 않았어요|not been translated|아직 번역/.test(text);

  if (!reachedResult) fail('F · level test result', 'the walk did not reach a result screen');
  else if (range) fail('F · the result shows a range', range[0].trim());
  else if (seenRanges.length > 0) fail('F · a range appeared during the test', seenRanges.join(' / '));
  else if (untranslated) fail('F · the result admits missing translations', 'the 번역되지 않았어요 line is on screen');
  else pass('F · one level, no range, no translation apology');
}

await page.close();

const failed = results.filter((result) => !result.ok);
console.log('\nA learner walk on the emulator — the photographed screens, re-read\n');
for (const result of results) {
  console.log(`  ${result.ok ? '✓' : '✗'} ${result.what}${result.detail ? ` — ${result.detail}` : ''}`);
}
console.log(`\n  ${results.length - failed.length}/${results.length} checks passed`);
console.log(`  screenshots in ${SHOTS.replace(ROOT + '/', '')}`);
console.log('\n  An emulator, not a phone. Nothing here is evidence about a physical device.');

if (failed.length > 0) process.exit(1);
