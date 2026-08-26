#!/usr/bin/env node
/**
 * The mid-day Level Test retake, on a running Android app.
 *
 *   node scripts/qa-level-change-android.mjs [--package <id>] [--shots <dir>]
 *
 * ## What this proves that nothing else can
 *
 * The rule — a measured level change immediately regenerates the unresolved
 * new-study targets while preserving every mastered word — is held by domain
 * fixtures, provider tests, a Playwright spec against the built dist, and the
 * synthetic journey harness. All of them run over IndexedDB or memory. The
 * installed app stores its day in **SQLite through the HangyulStore plugin**,
 * which is a different driver, a different serialisation path and a different
 * process boundary; a defect in any of those would leave every other gate
 * green while the phone in a customer's hand kept teaching 엄마.
 *
 * So this drives the same journey against the running app: read the Level-1
 * plan the app built, write the three-words-mastered + Level-30-result state
 * through the app's own storage plugin (the rows exactly as the store writes
 * them), reload, and require the app to come back at 3/10 with every
 * unresolved target inside the Level-30 zone.
 *
 * Needs the debug build (`webContentsDebuggingEnabled`), installed and on
 * screen, on an adb-visible device or emulator.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const PACKAGE = flag('--package', 'com.talkhangyul.ganada.debug');
const SHOTS = flag('--shots');
const ADB = process.env.ADB ?? join(process.env.ANDROID_HOME ?? '', 'platform-tools', 'adb');
const PORT = 9223;

const adb = (...argv) =>
  execFileSync(ADB, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

const CORPUS = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/data/generated/vocabulary.json'), 'utf8'),
).words;
const LEVEL_OF = new Map(CORPUS.map((word) => [word.id, word.level]));
const SURFACE_OF = new Map(CORPUS.map((word) => [word.id, word.word]));
const BEGINNER_FILLER = new Set(['남자', '여자', '엄마', '아빠', '나', '너']);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

let socket;
let nextId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = (nextId += 1);
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out`));
    }, 20000);
  });
}

async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  }
  return result.value;
}

async function waitFor(expression, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await evaluate(`return Boolean(${expression});`)) return true;
    } catch (error) {
      if (!/timed out/.test(String(error.message))) throw error;
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

function screenshot(name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(join(SHOTS, `${name}.png`), png);
}

/** Reads the settings row through the app's own storage plugin. */
const READ_SETTINGS = `
  const got = await window.Capacitor.Plugins.HangyulStore.get({ store: 'settings', key: 'preferences' });
  return got && got.value ? JSON.parse(got.value) : null;
`;

async function connect() {
  const pid = adb('shell', 'pidof', PACKAGE);
  if (!pid) throw new Error(`${PACKAGE} is not running — install and launch it first`);
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const target = targets.find((entry) => entry.type === 'page');
  if (!target) throw new Error('no WebView page is attached — is the app on screen?');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', reject);
  });
}

async function main() {
  await connect();

  // A clean slate, so the plan the app builds is the default-level plan every
  // new learner gets.
  await evaluate(`await window.Capacitor.Plugins.HangyulStore.clearAll(); return true;`);
  await evaluate(`location.href = '/words/today'; return true;`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await connect(); // the reload replaced the page target

  // Past the placement prompt, as a learner declining it.
  await waitFor(`document.querySelector('[data-testid="placement-skip"]')`, 20000);
  await evaluate(`document.querySelector('[data-testid="placement-skip"]')?.click(); return true;`);

  // The Level-1 plan, built by the app and persisted through SQLite.
  const built = await waitFor(
    `(${'await (async () => {' + READ_SETTINGS + '})()'})?.daily_plan?.words?.length > 0`,
    20000,
  );
  check('the app builds and persists a default-level plan', built);
  const before = await evaluate(READ_SETTINGS);
  const plan = before.daily_plan;
  check('the plan records Level 1', plan.level === 1, `level ${plan.level}`);
  screenshot('01-level1-day');

  const mastered = plan.words.slice(0, 3).map((word) => word.wordId);
  const oldUnresolved = plan.words.slice(3).map((word) => word.wordId);

  // Three words mastered, then a Level-30 measurement — the rows exactly as
  // completeDailyWord and saveLevelTestResult write them.
  const seeded = {
    ...before,
    daily_plan: { ...plan, completed: mastered },
    level_test: {
      level: 30,
      low: 28,
      high: 30,
      items: 30,
      takenAt: new Date().toISOString(),
      recentItems: [],
    },
  };
  await evaluate(
    `await window.Capacitor.Plugins.HangyulStore.put({ store: 'settings', key: 'preferences', value: ${JSON.stringify(
      JSON.stringify(seeded),
    )} }); return true;`,
  );

  // Return the same day: a cold reload over the written rows.
  await evaluate(`location.href = '/words'; return true;`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await connect();

  const rebuilt = await waitFor(
    `(${'await (async () => {' + READ_SETTINGS + '})()'})?.daily_plan?.level === 30`,
    25000,
  );
  check('the returning day is rebuilt for Level 30', rebuilt);
  const after = (await evaluate(READ_SETTINGS)).daily_plan;

  check(
    'the three mastered words keep their credit',
    JSON.stringify(after.completed) === JSON.stringify(mastered),
    `completed ${after.completed.length}`,
  );
  check('the goal does not move', after.goal === plan.goal, `${after.goal}`);
  check('the day is the same day', after.date === plan.date);

  const ids = after.words.map((word) => word.wordId);
  const carried = oldUnresolved.filter((id) => ids.includes(id));
  check(
    'no unresolved Level-1 target survives',
    carried.length === 0,
    carried.map((id) => SURFACE_OF.get(id)).join(', '),
  );
  const unresolved = after.words.filter((word) => !mastered.includes(word.wordId));
  const outOfZone = unresolved.filter((word) => (LEVEL_OF.get(word.wordId) ?? 0) < 27);
  check(
    `every regenerated target is in the Level-30 zone (${unresolved.length} words)`,
    unresolved.length > 0 && outOfZone.length === 0,
    outOfZone.map((word) => `${SURFACE_OF.get(word.wordId)} L${LEVEL_OF.get(word.wordId)}`).join(', '),
  );
  const fillers = unresolved.filter((word) => BEGINNER_FILLER.has(SURFACE_OF.get(word.wordId)));
  check('no beginner filler among them', fillers.length === 0);

  // And the screen the learner sees agrees with the store.
  const cardShows = await waitFor(
    `document.querySelector('[data-testid="today-card"]')?.textContent?.replace(/\\s+/g, ' ')?.includes('3 / ${plan.goal}')`,
    15000,
  );
  check(`the Today card reads 3 / ${plan.goal}`, cardShows);
  screenshot('02-level30-day');

  const failed = results.filter((row) => !row.ok);
  console.log(
    `\n${results.length} check(s), ${failed.length} failed — mid-day retake on device ${
      failed.length ? 'FAIL' : 'PASS'
    }`,
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  process.exit(1);
});
