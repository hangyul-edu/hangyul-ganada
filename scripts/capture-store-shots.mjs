#!/usr/bin/env node
/**
 * Store screenshots, taken from the app running on Android.
 *
 *   node scripts/capture-store-shots.mjs [--out dir] [--package id]
 *
 * ## Why from a device and not from a browser
 *
 * A store listing is a promise about what the customer will see when they
 * install the thing. A browser at a phone-shaped viewport is a good enough
 * likeness for a document; it is not the app. `adb screencap` returns the frame
 * Android actually composited — the status bar, the gesture bar, the real
 * fonts, the real device pixel ratio — which is what a reviewer compares
 * against when they open the build.
 *
 * ## Why the debug variant
 *
 * The screenshots are of `…ganada.debug`, which is the same web bundle, the
 * same assets and the same code with two differences: the application id has a
 * suffix, and WebView debugging is on. The second is why: a release build
 * refuses a debugger, and seeding a plausible learner profile through the UI
 * would mean writing forty lessons of synthetic handwriting and would produce a
 * slightly different document every run.
 *
 * Nothing about the *interface* differs between the two variants, and
 * `store/README.md` says all of this so nobody has to take it on trust.
 *
 * ## The profile
 *
 * Written straight into the app's own native store through its own plugin, so
 * the app reads it exactly as it reads a real learner's: five weeks of
 * practice, a streak with two gaps in it, eleven letters met and eight learned.
 * A screenshot of an empty app sells nothing and tells a reviewer nothing.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const OUT = flag('--out', 'docs/store-assets/android');
const PACKAGE = flag('--package', 'com.talkhangyul.ganada.debug');
const PORT = 9222;
const ADB = join(process.env.ANDROID_HOME ?? '', 'platform-tools', 'adb');

const adb = (...rest) => execFileSync(ADB, rest, { encoding: 'utf8' }).trim();

let socket;
let nextId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out`));
    }, 20000);
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression: `(async function(){${expression}})()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
  }
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await evaluate(`return Boolean(${expression});`)) return true;
    } catch {
      /* not yet */
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function shot(name) {
  mkdirSync(OUT, { recursive: true });
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(join(OUT, `${name}.png`), png);
  console.log(`  ${name}.png`);
}

/** Five weeks of practice, written through the app's own native store. */
const SEED = `
  const store = window.Capacitor.Plugins.HangyulStore;
  const key = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  const now = new Date().toISOString();

  const activity = [];
  const dates = [];
  for (let back = 34; back >= 0; back -= 1) {
    if (back % 8 === 3) continue;
    const when = new Date();
    when.setDate(when.getDate() - back);
    const date = key(when);
    dates.push(date);
    activity.push({ key: date, value: JSON.stringify({
      date,
      first_at: when.toISOString(),
      last_at: when.toISOString(),
      active_ms: (5 + (back % 14)) * 60000,
      attempts: 3 + ((back * 5) % 24),
      passes: 2 + ((back * 4) % 18),
      characters_learned: back % 4 === 0 ? 1 : 0,
      words_learned: back % 7 === 0 ? 2 : 0,
      reviews: back % 6 === 0 ? 3 : 0,
      items: { 'character:ㅓ': 9, 'character:ㅏ': 6, 'character:ㄱ': 4 },
    })});
  }

  const letters = ['ㅏ','ㅓ','ㅗ','ㅜ','ㅡ','ㅣ','ㄱ','ㄴ','ㄷ','ㄹ','ㅁ'];
  const progress = letters.map((character, i) => ({ key: 'character:' + character, value: JSON.stringify({
    item_key: character, kind: 'character', stage: i < 8 ? 'learned' : 'written',
    attempts: 5, passes: 4, fails: 1, trace_passes: 2, write_passes: 2, recognition_passes: 1,
    heard: true, learned: i < 8, needs_review: false, last_score: 0.92,
    first_seen_at: now, last_attempted_at: now, learned_at: i < 8 ? now : null, review_due_at: null,
  })}));
  // Two words waiting in Review, so the screen has something in it.
  progress.push({ key: 'word:word_sagwa', value: JSON.stringify({
    item_key: 'word_sagwa', kind: 'word', stage: 'written', attempts: 3, passes: 2, fails: 1,
    trace_passes: 1, write_passes: 1, recognition_passes: 0, heard: true, learned: false,
    needs_review: true, last_score: 0.71, first_seen_at: now, last_attempted_at: now,
    learned_at: null, review_due_at: now,
  })});

  // Per-skill memory, so Review has real counts rather than an empty state.
  // See \`domain/memory.ts\`: the row shape is the scheduler's own.
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const due = (d) => new Date(Date.now() + d * 86400000).toISOString();
  const sk = (name, stability, lapses, seen) => ({
    skill: name, stability_days: stability, difficulty: 0.2 + lapses * 0.12,
    last_reviewed_at: ago(seen), next_review_at: due(stability - seen),
    streak: lapses ? 0 : 3, lapses, recent_score: lapses ? 0.4 : 1,
    last_response_ms: null, hints: 0,
  });
  const memory = [
    ['ㅓ', { sound_recognition: sk('sound_recognition', 2, 3, 4),
            guided_writing: sk('guided_writing', 9, 0, 2) }, { 'ㅗ': 3 }],
    ['ㅏ', { visual_recognition: sk('visual_recognition', 12, 0, 3) }, {}],
    ['ㄱ', { guided_writing: sk('guided_writing', 3, 1, 5) }, {}],
    ['ㄴ', { sound_recognition: sk('sound_recognition', 6, 0, 1) }, {}],
    ['ㄷ', { guided_writing: sk('guided_writing', 1.5, 2, 3) }, {}],
    ['ㄹ', { visual_recognition: sk('visual_recognition', 2, 2, 3) }, {}],
  ].map(([character, skills, confusions]) => ({
    key: 'character:' + character,
    value: JSON.stringify({
      item_key: character, kind: 'character', algorithm_version: 1,
      skills, confusions, rescued_at: null,
    }),
  }));

  await store.open({ name: 'hangyul-ganada' });
  await store.putMany({ store: 'activity', entries: activity });
  await store.putMany({ store: 'progress', entries: progress });
  await store.putMany({ store: 'memory', entries: memory });
  // The plugin stores JSON text, so values cross the bridge already encoded.
  const existing = await store.get({ store: 'settings', key: 'preferences' });
  const settings = existing && existing.value ? JSON.parse(existing.value) : {};
  await store.put({ store: 'settings', key: 'preferences',
    value: JSON.stringify(Object.assign({}, settings, { active_days: dates })) });
  return { days: dates.length, letters: letters.length };
`;

async function main() {
  const pid = adb('shell', 'pidof', PACKAGE);
  if (!pid) throw new Error(`${PACKAGE} is not running — install and launch it first`);
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);

  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const target = targets.find((entry) => entry.type === 'page');
  if (!target) throw new Error('no WebView page attached');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('DevTools socket refused')), {
      once: true,
    });
  });
  await send('Runtime.enable');

  const seeded = await evaluate(SEED);
  console.log(`seeded ${seeded.days} days and ${seeded.letters} letters`);

  // Reload so the app reads the store it was just given.
  await evaluate("location.href = '/'; return true;");
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await waitFor("document.querySelector('#root')?.childElementCount > 0");
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const screens = [
    ['01-home', '/'],
    ['02-letters', '/letters'],
    ['03-words', '/words'],
    ['04-review', '/review'],
    ['05-activity', '/me/activity'],
    ['06-settings', '/me'],
    ['07-sounds', '/letters/sounds'],
    ['08-word', '/words/vocab-food-1'],
  ];

  console.log('screens:');
  for (const [name, path] of screens) {
    await evaluate(`history.pushState(null, '', '${path}');
      dispatchEvent(new PopStateEvent('popstate')); return true;`);
    await waitFor(`location.pathname === '${path}'`);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    shot(name);
  }

  // A lesson in progress: the screen the product is actually about.
  await evaluate(`history.pushState(null, '', '/letters/lesson-vowels-core');
    dispatchEvent(new PopStateEvent('popstate')); return true;`);
  await waitFor("location.pathname.startsWith('/letters/')");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await evaluate(`
    const start = [...document.querySelectorAll('button')]
      .find((b) => /Got it/.test(b.textContent ?? ''));
    if (start) start.click();
    return true;
  `);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  shot('09-letter-intro');
  await evaluate(`
    const go = [...document.querySelectorAll('button')]
      .find((b) => /Trace it|Write it/.test(b.textContent ?? ''));
    if (go) go.click();
    return true;
  `);
  await waitFor(`document.querySelector('[data-testid="writing-canvas"]') !== null`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  shot('10-writing');

  socket.close();
  console.log(`\nwrote ${screens.length + 2} screenshots to ${OUT}`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
