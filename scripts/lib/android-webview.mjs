/**
 * Talking to the app that is actually installed on an Android.
 *
 * Two scripts need this — `qa-native-android.mjs` walks the app and
 * `qa-safe-area-android.mjs` measures where its buttons land — and a second
 * copy of the DevTools plumbing is a second place for the socket handling to
 * be subtly wrong.
 *
 * ## Why the DevTools protocol and not Playwright
 *
 * Playwright's `connectOverCDP` refuses an Android WebView: it asks for
 * browser-context management the WebView does not implement. Spoken directly
 * the protocol is small — `Runtime.evaluate` is nearly all of it.
 *
 * ## Why screenshots come from `screencap` and not from the protocol
 *
 * A CDP screenshot is the web contents and nothing else, which is exactly the
 * blind spot this project is closing: it renders the app *without* the status
 * bar and *without* the navigation bar, so a button underneath the navigation
 * bar photographs as a button. `adb exec-out screencap` is the composited
 * frame the customer is looking at, system bars included.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const PORT = 9222;

export const ADB =
  process.env.ADB ?? join(process.env.ANDROID_HOME ?? '/root/android-sdk', 'platform-tools', 'adb');

export function adb(...argv) {
  return execFileSync(ADB, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** The composited frame, PNG bytes, system bars included. */
export function screencap() {
  return execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Attaches to the running app's WebView.
 *
 * Needs `webContentsDebuggingEnabled`, which is true in the debug build and
 * false in release — the correct way round, and the reason QA runs against a
 * debug-signed build of the same source.
 */
export async function attach(packageName) {
  const pid = adb('shell', 'pidof', packageName);
  if (!pid) throw new Error(`${packageName} is not running — install and launch it first`);

  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);

  // The page target appears a moment after the process does.
  let target = null;
  for (let attempt = 0; attempt < 20 && !target; attempt += 1) {
    const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
    target = targets.find((entry) => entry.type === 'page');
    if (!target) await sleep(500);
  }
  if (!target) throw new Error('no WebView page is attached — is the app on screen?');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const pageErrors = [];
  let nextId = 0;

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
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

  const send = (method, params = {}) => {
    const id = (nextId += 1);
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 20000);
    });
  };

  await send('Runtime.enable');

  /** Evaluates an expression in the page and returns its value. */
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value;
  };

  /** Waits until `expression` is truthy, or gives up. */
  const waitFor = async (expression, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        if (await evaluate(`return Boolean(${expression});`)) return true;
      } catch (error) {
        // A timed-out evaluate is "not yet", not a failure of the run: pressing
        // back on Android 16 starts the predictive-back animation and the
        // WebView stops servicing the protocol for as long as it lasts.
        if (!/timed out/.test(String(error.message))) throw error;
      }
      if (Date.now() > deadline) return false;
      await sleep(250);
    }
  };

  return { send, evaluate, waitFor, pageErrors, close: () => socket.close() };
}

/**
 * How the learner navigates, switched from the shell.
 *
 * These two overlays are the platform's own, and enabling one is what the
 * Settings toggle does. Real devices have the same pair, which is what makes a
 * three-button run on an emulator a genuine three-button run rather than an
 * approximation of one.
 */
export const NAVIGATION_MODES = {
  buttons: 'com.android.internal.systemui.navbar.threebutton',
  gesture: 'com.android.internal.systemui.navbar.gestural',
};

export async function setNavigationMode(mode) {
  const overlay = NAVIGATION_MODES[mode];
  if (!overlay) throw new Error(`unknown navigation mode ${mode}`);
  adb('shell', 'cmd', 'overlay', 'enable-exclusive', overlay);
  // The window is re-laid-out asynchronously; the inset arrives with it.
  await sleep(2500);
}

/** Light or dark, as the learner's phone would be set. */
export async function setNightMode(mode) {
  adb('shell', 'cmd', 'uimode', 'night', mode === 'dark' ? 'yes' : 'no');
  await sleep(2000);
}

/** Android's Font size slider, as a scale factor. 1.0 is the default. */
export async function setFontScale(scale) {
  adb('shell', 'settings', 'put', 'system', 'font_scale', String(scale));
  await sleep(2000);
}
