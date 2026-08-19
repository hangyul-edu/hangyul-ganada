/**
 * Registers the offline worker.
 *
 * Wrapped rather than inlined into `main.tsx` for one reason: every branch here
 * is a way this can fail, and none of them may take the app down with it. A
 * browser with service workers disabled, a policy that blocks registration, a
 * page served from `file://` — in all of them the learner should get a working
 * app that simply needs the network, and never a blank screen.
 */
import { isNative } from './native/platform';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  // The dev server serves modules the worker's caching would fight with, and a
  // stale cache during development is a bug hunt nobody needs.
  if (import.meta.env.DEV) return;
  // Inside the Android or iOS app there is nothing for it to do and something
  // for it to break. Every asset is already in the app bundle, so the worker
  // caches local files onto local files; but its cache outlives an app update,
  // and a learner who updates the app would get the new binary serving the old
  // JavaScript out of the WebView's cache. The store build ships offline
  // because it is offline, not because a worker made it so.
  if (isNative) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* Offline support is unavailable. Everything else still works. */
    });
  });
}
