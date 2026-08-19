#!/usr/bin/env node
/**
 * Drives the real Android app and reports what it finds.
 *
 *   node scripts/qa-native-android.mjs                     run the checks
 *   node scripts/qa-native-android.mjs --shots <dir>       also save screenshots
 *   node scripts/qa-native-android.mjs --package <id>      default: …ganada.debug
 *
 * ## Why not Playwright
 *
 * The web suite already covers the layout in a browser. What a browser cannot
 * answer is whether the *app* works: whether the splash comes down, whether
 * SQLite is really the storage engine, whether the status bar is being drawn
 * over, whether the hardware back button goes back instead of quitting. Those
 * are properties of the installed APK on a running Android, so this talks to
 * one.
 *
 * Playwright's `connectOverCDP` refuses an Android WebView — it asks for
 * browser-context management the WebView does not implement — so this speaks
 * the DevTools protocol directly. That is a smaller surface than it sounds:
 * `Runtime.evaluate` and `Input.dispatchKeyEvent` are the whole of it.
 *
 * Screenshots are taken with `adb screencap` rather than through the protocol,
 * on purpose. A CDP screenshot is the web contents only; `screencap` is the
 * actual frame, including the status bar and the gesture bar — which is what a
 * store listing has to show and what proves the safe-area work is real.
 *
 * ## What it needs
 *
 * An emulator or device on `adb` with the app installed and running, and
 * `webContentsDebuggingEnabled` — true in the debug build, false in release,
 * which is the correct way round.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const PACKAGE = flag('--package', 'com.talkhangyul.ganada.debug');
const SHOTS = flag('--shots');
const ADB = process.env.ADB ?? join(process.env.ANDROID_HOME ?? '', 'platform-tools', 'adb');
const PORT = 9222;

const adb = (...argv) =>
  execFileSync(ADB, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

const results = [];
/** Console errors and page exceptions seen since the socket opened. */
const pageErrors = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// --- DevTools plumbing -------------------------------------------------------

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

/** Evaluates an expression in the page and returns its value. */
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

/** Waits until `expression` is truthy, or gives up. */
async function waitFor(expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await evaluate(`return Boolean(${expression});`)) return true;
    } catch (error) {
      // A timed-out evaluate is "not yet", not a failure of the run.
      //
      // Pressing the hardware back button on Android 16 starts the predictive
      // back animation, and the WebView stops servicing the DevTools protocol
      // for as long as it lasts. Treating that as a fatal error made the
      // back-button check report "Runtime.evaluate timed out" for behaviour
      // that was working correctly — which is a worse bug than the one it was
      // looking for, because it hides every check after it.
      if (!/timed out/.test(String(error.message))) throw error;
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function screenshot(name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(join(SHOTS, `${name}.png`), png);
}

// --- The checks --------------------------------------------------------------

async function main() {
  const pid = adb('shell', 'pidof', PACKAGE);
  if (!pid) throw new Error(`${PACKAGE} is not running — install and launch it first`);

  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const target = targets.find((entry) => entry.type === 'page');
  if (!target) throw new Error('no WebView page is attached — is the app on screen?');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    // Errors are collected from the protocol rather than from a counter in the
    // app: shipping a global just so a test can read it would put test
    // scaffolding in a customer's binary.
    if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(message.params.exceptionDetails?.exception?.description ?? 'exception');
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      pageErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
      return;
    }
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

  // The app is a native app, not a page in a browser.
  check(
    'Capacitor reports a native platform',
    (await evaluate('return window.Capacitor?.getPlatform();')) === 'android',
  );

  // Everything is in the bundle. A single request off-device would mean the app
  // does not really work on a plane.
  const origins = await evaluate(`
    return performance.getEntriesByType('resource')
      .map(entry => new URL(entry.name).origin)
      .filter((origin, index, all) => all.indexOf(origin) === index);
  `);
  check(
    'every asset was served from the app bundle',
    origins.every((origin) => origin === 'https://localhost'),
    origins.join(', '),
  );

  // The splash is dismissed by the app after first paint, not by a timeout.
  check('the launch screen is gone and the app is drawn', await waitFor("document.querySelector('#root')?.childElementCount > 0"));

  // Storage is the native database, not the WebView's.
  const engine = await evaluate(`
    const el = document.querySelector('[data-storage-engine]');
    return el ? el.dataset.storageEngine : null;
  `);
  check('progress is stored in native SQLite', engine === 'sqlite', engine ?? 'not reported');

  // Edge-to-edge is enforced from Android 15; the app has to know the insets.
  /*
   * Read by the names the app actually publishes.
   *
   * These two checks were reading `--safe-area-inset-top`, which nothing in
   * this product sets: the Android plugin writes `--hg-native-safe-*` from
   * Java, and `safe-area.css` folds that together with the browser's own
   * `env(safe-area-inset-*)` into `--hg-safe-*`. Reading a variable that does
   * not exist gave an empty string and a zero, so the checks reported the
   * plugin as silent and the shell as padding itself for no reason — on a build
   * where both were correct. A check whose failure means "the check is looking
   * in the wrong place" is worse than no check, because somebody eventually
   * believes it.
   */
  const insets = await evaluate(`
    const style = getComputedStyle(document.documentElement);
    return {
      top: style.getPropertyValue('--hg-native-safe-top').trim(),
      bottom: style.getPropertyValue('--hg-native-safe-bottom').trim(),
      resolved: style.getPropertyValue('--hg-safe-top').trim(),
      resolvedBottom: style.getPropertyValue('--hg-safe-bottom').trim(),
    };
  `);
  /*
   * The native side publishes the insets at all.
   *
   * This used to assert the top inset was *non-zero*, on the reasoning that an
   * app targeting Android 16 is drawn edge-to-edge and therefore always has a
   * status bar to avoid. Running it against the real thing showed that
   * reasoning is not safe: on this API 36 image the system insets the WebView
   * itself — `innerHeight` is 839 CSS px against a 915 px screen — so the
   * window already sits between the bars and the correct inset for the web
   * layer is exactly zero. Demanding a non-zero one would have had the app pad
   * itself a second time and leave a band of empty warm ground under the clock.
   *
   * So what is checked is what actually matters: the plugin is publishing the
   * numbers, and the shell honours whichever numbers it publishes.
   */
  check(
    'the native window insets reached the layout',
    insets.top !== '' && insets.bottom !== '',
    `top ${insets.top || 'unset'}, bottom ${insets.bottom || 'unset'}`,
  );

  // Knowing the inset is not the same as honouring it: the shell has to pad by
  // it, or the app's own header is drawn under the clock on any device where
  // the platform *does* hand the window the whole screen.
  const padding = await evaluate(`
    const shell = document.querySelector('[data-storage-engine]');
    /*
     * The resolved inset, measured rather than read.
     *
     * \`--hg-safe-top\` is \`max(var(--hg-native-safe-top), env(safe-area-inset-top))\`
     * and a custom property does not resolve its own arithmetic:
     * \`getPropertyValue\` hands back that expression as a *string*, which
     * \`parseFloat\` turns into NaN and a \`|| 0\` turns into a confident zero. So
     * the value is given to an element as a height and the element is measured,
     * which is what the shell's padding is doing too.
     */
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--hg-safe-top)';
    document.body.appendChild(probe);
    const inset = probe.getBoundingClientRect().height;
    probe.remove();
    return { padded: parseFloat(getComputedStyle(shell).paddingTop) || 0, inset };
  `);
  check(
    'the app pads itself by exactly the inset the platform reported',
    Math.abs(padding.padded - padding.inset) < 2,
    `padding ${padding.padded}px for a ${padding.inset}px inset`,
  );

  // And, whichever way the window was sized, nothing the learner reads is
  // underneath a system bar. This is the property the two checks above exist
  // to protect, asked directly.
  const clearance = await evaluate(`
    const header = document.querySelector('header');
    const nav = document.querySelector('nav');
    return {
      headerTop: header ? Math.round(header.getBoundingClientRect().top) : -1,
      navBottom: nav ? Math.round(innerHeight - nav.getBoundingClientRect().bottom) : -1,
    };
  `);
  check(
    'no content is drawn underneath the system bars',
    clearance.headerTop >= 0 && clearance.navBottom >= 0,
    `header starts ${clearance.headerTop}px in, nav ends ${clearance.navBottom}px from the foot`,
  );

  screenshot('01-home');

  // Navigation works, and the router — not the WebView — owns the history.
  await evaluate(`
    document.querySelector('a[href="/letters"], a[href$="/letters"]')?.click();
    return true;
  `);
  await waitFor("location.pathname === '/letters'");
  check('tapping the navigation moves between screens', await evaluate("return location.pathname === '/letters';"));
  screenshot('02-letters');

  /*
   * Android's hardware back must go back, not quit.
   *
   * Checked only when the app actually owns the input focus. On a loaded
   * software-GL emulator SystemUI occasionally ANRs, and its dialog takes the
   * focus — at which point `input keyevent` goes to the dialog, the app never
   * sees the key, and this reported "the hardware back button does not go back"
   * about a build where it does. A check that cannot tell "the app is wrong"
   * from "the key never arrived" is worse than one that says which.
   */
  const focus = adb('shell', 'dumpsys', 'window')
    .split('\n')
    .find((line) => line.includes('mCurrentFocus')) ?? '';
  if (!focus.includes(PACKAGE)) {
    check(
      'the hardware back button goes back rather than quitting',
      false,
      `not asked — the input focus is ${focus.trim() || 'unknown'}, so no key reaches the app`,
    );
  } else {
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  const wentBack = await waitFor("location.pathname === '/'", 20000);
  const stillRunning = adb('shell', 'pidof', PACKAGE) !== '';
  check('the hardware back button goes back rather than quitting', wentBack && stillRunning);
  }
  screenshot('03-after-back');

  /*
   * The four behaviours this cycle changed, asked of the installed app.
   *
   * Every one of them has unit and browser coverage already. They are asked
   * again here because the thing that went wrong was never visible in a
   * browser: the clip that plays is the clip the *device* has, out of the cache
   * the *device* built, and a fix that does not reach that cache has not
   * shipped.
   */

  // What the app asks to play, recorded by replacing Audio for the rest of the
  // run. The interesting fact is which utterance and how many times.
  await evaluate(`
    window.__played = [];
    const Native = window.Audio;
    window.Audio = class extends Native {
      play() { window.__played.push(new URL(this.src, location.href).pathname); return super.play(); }
    };
    return true;
  `);

  await evaluate("history.pushState({}, '', '/letters/lesson-vowels-core'); dispatchEvent(new PopStateEvent('popstate')); return true;");
  await waitFor("document.body.innerText.includes('Trace it') || document.body.innerText.includes(\"Got it\")");
  await evaluate(`
    const cta = [...document.querySelectorAll('button')].find((b) => /Got it/.test(b.textContent));
    if (cta) cta.click();
    return true;
  `);
  const heard = await waitFor("window.__played.length > 0", 15000);
  const clips = await evaluate('return window.__played;');
  check(
    'a learning screen plays its clip on arrival, once',
    heard && clips.length === 1 && /\/audio\/letters\//.test(clips[0]),
    clips.join(', ') || 'nothing played',
  );
  screenshot('04-letter-intro');

  // The corrected 마디 recording, out of whatever the device has cached. The
  // repaired clip is longer than the one it replaced, so the byte length is
  // enough to tell them apart without listening.
  const madi = await evaluate(`
    const response = await fetch('/audio/vocabulary/male/word_b9c8b514.mp3');
    const bytes = (await response.arrayBuffer()).byteLength;
    const manifest = await (await fetch('/audio/manifest.json')).json();
    const entry = manifest.entries.find((e) => e.id === 'word_b9c8b514');
    return { bytes, expected: entry?.male?.bytes ?? 0, text: entry?.text, version: manifest.version };
  `);
  check(
    'the device serves the corrected 마디 recording, not a cached older one',
    madi.text === '마디' && madi.bytes === madi.expected && madi.bytes > 0,
    `${madi.bytes} bytes, manifest says ${madi.expected}, audio build ${madi.version}`,
  );

  /*
   * …and on *this* platform it came out of the APK rather than out of a cache,
   * which is the reason it is guaranteed to be current.
   *
   * The service worker is deliberately not registered inside the native app
   * (see `offline.ts`): every asset is already in the bundle, and a cache that
   * outlives an app update is exactly how a corrected recording would fail to
   * reach a learner who already has the app. On the web build, where the worker
   * *is* the offline story, the same problem is solved by keying its audio
   * cache to the audio build's version. Two platforms, two mechanisms, one
   * property — so this asks Android for its half.
   */
  const workers = await evaluate(`
    const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    return { count: registrations.length, caches: await window.caches.keys() };
  `);
  check(
    'no cache can outlive an app update: the native build registers no worker',
    workers.count === 0 && workers.caches.length === 0,
    `${workers.count} worker(s), ${workers.caches.length} cache(s)`,
  );

  // A new item starts at the top, measured on the container that really scrolls.
  const scroll = await evaluate(`
    const region = document.querySelector('[data-scroll-region="focus"]');
    if (!region) return { ok: false, why: 'no focus scroll region' };
    region.scrollTop = region.scrollHeight;
    const before = region.scrollTop;
    const cta = [...document.querySelectorAll('button')].find((b) => /Trace it|Write it/.test(b.textContent));
    if (!cta) return { ok: false, why: 'no step control' };
    cta.click();
    return { before, ok: true };
  `);
  const atTop = await waitFor(
    "document.querySelector('[data-scroll-region=\"focus\"]')?.scrollTop === 0",
    10000,
  );
  check(
    'moving to the next step starts at the top of the new screen',
    scroll.ok && atTop,
    scroll.ok ? `was ${scroll.before}px down` : scroll.why,
  );
  screenshot('05-next-step');

  // Last, so it covers everything the run touched.
  check(
    'no console errors or uncaught exceptions during the walk-through',
    pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | '),
  );

  socket.close();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
