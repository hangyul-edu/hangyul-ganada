import { Capacitor } from '@capacitor/core';

/**
 * The one place the app asks what it is running inside.
 *
 * Everything else imports from here rather than reaching for `Capacitor`
 * directly, for two reasons. The obvious one is that a test can stub a single
 * module. The less obvious one matters more: the same bundle is a website and
 * two store apps, and platform checks scattered through feature code is how a
 * codebase ends up with a native branch nobody has run in months.
 *
 * The rule for using these: branch on a **capability**, not on a platform name,
 * wherever a capability exists to branch on. `hasPlugin('LocalNotifications')`
 * is a better question than `isAndroid`. The named platforms below are for the
 * handful of cases where the difference really is the platform — the Android
 * hardware back button has no web equivalent to feature-detect.
 */

export type NativePlatform = 'android' | 'ios' | 'web';

/** True inside the Android or iOS app; false in any browser, including a PWA. */
export const isNative = Capacitor.isNativePlatform();

export const platform = Capacitor.getPlatform() as NativePlatform;

export const isAndroid = platform === 'android';
export const isIOS = platform === 'ios';

/**
 * Whether a Capacitor plugin is actually present.
 *
 * Plugins have web fallbacks that resolve to nothing or throw `Unimplemented`.
 * Asking first means a missing plugin degrades to the browser behaviour instead
 * of surfacing an error the learner cannot act on.
 */
export function hasPlugin(name: string): boolean {
  return Capacitor.isPluginAvailable(name);
}

/**
 * Leaves the app, as the exit confirmation on Home does.
 *
 * `App.exitApp` and not a route change or `window.close`: the learner said they
 * wanted out of the *app*, and the only layer that can do that is the native
 * one. Android restores the state on relaunch, so nothing is lost by going.
 *
 * Imported lazily so the `@capacitor/app` bundle is not pulled into the web
 * build's first load for a button that only exists on a phone. Off the phone it
 * does nothing at all, which is the honest answer in a browser tab.
 */
export async function exitApp(): Promise<void> {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  await App.exitApp();
}
