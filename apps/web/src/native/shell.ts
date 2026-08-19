import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';

import { bindSafeAreaInsets } from './insets';
import { isAndroid, isNative } from './platform';

/**
 * The native shell's runtime behaviour.
 *
 * `capacitor.config.ts` decides what the app *is* at launch — bundled, portrait,
 * edge-to-edge. This file is what it *does* once it is running: dismiss the
 * splash at the right moment, answer the hardware back button, notice when the
 * learner leaves and comes back, and tell the layout how tall the keyboard is.
 *
 * These are the differences between an app and a website in a box, and none of
 * them have a browser equivalent to feature-detect, so each one is guarded by
 * `isNative` and does nothing at all on the web.
 */

/** Undo functions from every listener attached here. */
type Teardown = () => void;

/**
 * Dismisses the launch screen once the app has something worth showing.
 *
 * `launchAutoHide` is off in the Capacitor config, so nothing hides this but
 * us. A fixed timeout is the usual approach and it is wrong in both directions:
 * too short and the learner watches the app assemble itself, too long and they
 * stare at a static mark after the app is ready. Waiting for the browser's own
 * paint signal means the splash lifts on the first frame that has content in
 * it, whatever the device's speed.
 *
 * The timeout is a backstop, not a schedule: if `requestAnimationFrame` never
 * fires — a WebView that failed to load, a JavaScript error before this point —
 * the splash must still come down, because a learner who force-quits a stuck
 * launch screen is a one-star review that never mentions the actual bug.
 */
async function dismissSplash(): Promise<void> {
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    const backstop = window.setTimeout(done, 3000);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.clearTimeout(backstop);
        done();
      }),
    );
  });
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    /* Already hidden, or no splash plugin. Either way the app is up. */
  }
}

/**
 * Wires Android's hardware and gesture back to the app's own navigation.
 *
 * ## Why this does not use `canGoBack`
 *
 * It did, and it was wrong on a real device. Capacitor reports
 * `WebView.canGoBack()`, which is the WebView's own back-forward list — and on
 * Android 16 that list stays empty for the same-document `pushState`
 * navigations a single-page router makes. Emulator QA caught the result: from
 * the Letters screen, with two entries in `window.history`, the hardware back
 * button closed the app. It had been doing that on every device running
 * Android 13 or newer, because the same reading also decides what the *native*
 * default does.
 *
 * The web layer knows the answer without asking the WebView anything: how many
 * entries `window.history` has gained since launch is the honest measure of
 * whether this app has anywhere to go back *to*.
 *
 * ## The rule
 *
 * Back retraces the app's own steps, and leaves the app at the screen it opened
 * on. That is what back means on Android in a single-activity app, and it is
 * the behaviour a bottom bar needs: someone who went Home → Letters → a lesson
 * gets the lesson list, then Home, then out.
 *
 * `exitApp` rather than `minimizeApp`: a learner who backs out of a lesson app
 * expects it gone from the foreground, and Android restores the state on
 * relaunch anyway.
 */
function bindAndroidBack(): Teardown {
  // Where the app started, so "has this app navigated anywhere" can be asked
  // later. `history.length` alone cannot answer it: the number never decreases,
  // so after going back it still reports the depth it reached.
  const startedAt = window.history.length;

  const handle = App.addListener('backButton', () => {
    if (window.history.length > startedAt) {
      // React Router listens for `popstate`, so this is a real navigation and
      // not a URL change the app has to be told about separately.
      window.history.back();
      return;
    }
    void App.exitApp();
  });
  return () => void handle.then((listener) => listener.remove());
}

/**
 * Publishes the keyboard's height to CSS.
 *
 * `Keyboard.resize: 'body'` shrinks the document, which handles most layouts,
 * but anything positioned against the bottom of the viewport — the language
 * search box's results, the session's primary action — needs the number itself.
 * `--keyboard-height` is 0 whenever the keyboard is down, so a rule can add it
 * unconditionally.
 */
function bindKeyboard(): Teardown {
  const set = (height: number) =>
    document.documentElement.style.setProperty('--keyboard-height', `${height}px`);

  const shown = Keyboard.addListener('keyboardWillShow', (info) => set(info.keyboardHeight));
  const hidden = Keyboard.addListener('keyboardWillHide', () => set(0));
  set(0);

  return () => {
    void shown.then((listener) => listener.remove());
    void hidden.then((listener) => listener.remove());
  };
}

/**
 * Tells the app when the learner comes back to it.
 *
 * Two things go stale while an app is in the background, and both of them are
 * visible on the first screen. The date can have changed, which moves today's
 * streak and today's row in the activity chart; and the learner may have been
 * away long enough that the session they were in the middle of should no longer
 * be counted as continuous practice.
 *
 * Rather than deciding either of those here, this dispatches a DOM event and
 * lets the parts of the app that own that logic decide. `visibilitychange`
 * covers the browser, but it does not fire reliably when an Android app is
 * resumed from the recents screen, which is precisely the case that matters.
 */
function bindLifecycle(): Teardown {
  const handle = App.addListener('appStateChange', ({ isActive }) => {
    window.dispatchEvent(
      new CustomEvent('hangyul:appstate', { detail: { active: isActive } }),
    );
  });
  return () => void handle.then((listener) => listener.remove());
}

/**
 * Starts everything above. Safe to call in a browser, where it does nothing.
 *
 * Returns a teardown so a test — or a future multi-window build — can unwind
 * the listeners. Nothing in the app calls it today, and that is fine: a
 * teardown that exists is cheaper than one retrofitted after a leak.
 */
export function startNativeShell(): Teardown {
  if (!isNative) return () => {};

  void dismissSplash();

  const teardowns: Teardown[] = [bindKeyboard(), bindLifecycle(), bindSafeAreaInsets()];
  if (isAndroid) teardowns.push(bindAndroidBack());

  return () => {
    for (const teardown of teardowns) teardown();
  };
}
