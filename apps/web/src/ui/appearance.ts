import { useEffect, useState } from 'react';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import type { Appearance } from '@hangyul-ganada/shared-types';

import { isNative } from '../native/platform';

/**
 * Puts the learner's appearance choice on the document.
 *
 * The whole theme is CSS custom properties — see `packages/design-tokens` — so
 * the only thing JavaScript has to do is say which set applies:
 *
 * ```
 * light    <html data-theme="light">    stop following the device
 * dark     <html data-theme="dark">     stop following the device
 * system   <html>            (nothing)  keep following the device
 * ```
 *
 * "System" removes the attribute rather than writing `data-theme="system"`,
 * because the token sheet's dark block is a `prefers-color-scheme` media query
 * guarded by `:not([data-theme="light"])`. With no attribute at all the media
 * query decides, which is exactly what following the device means — including
 * when the device changes its mind at sunset, with no reload and no listener.
 *
 * ## The status bar
 *
 * `theme-color` is what a phone paints behind the notch and the address bar,
 * and it is not a custom property — it is a meta tag. Left alone it stays warm
 * white, so a dark page gets a bright band above it. Updated here, from the
 * computed page background, so the two can never disagree.
 */
export function useAppearance(appearance: Appearance): void {
  useEffect(() => {
    const root = document.documentElement;
    if (appearance === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', appearance);

    // Read back rather than mapped from `appearance`: under "system" the answer
    // depends on the device, and the browser has already worked it out.
    const paint = () => {
      const background = getComputedStyle(root).getPropertyValue('--hg-bg-warm').trim();
      if (!background) return;
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        meta.content = background;
      }
    };
    paint();

    if (appearance !== 'system' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', paint);
    return () => query.removeEventListener('change', paint);
  }, [appearance]);
}

/**
 * Keeps the phone's status-bar glyphs readable against the app behind them.
 *
 * Android 16 enforces edge-to-edge, so the bars sit *over* the app and their
 * background is whatever the app is painting. Dark glyphs on Hangyul's dark
 * page are unreadable, and light glyphs on its cream page are worse. The style
 * therefore follows the app's own resolved appearance rather than the system's
 * — those differ exactly when the learner has chosen Light on a phone that is
 * in dark mode, which is the case a system-following bar gets wrong.
 *
 * A no-op in a browser, where the app has no system bars to own.
 */
export function useSystemBarStyle(): void {
  const dark = useIsDarkAppearance();

  useEffect(() => {
    if (!isNative) return;
    // Typed locally rather than through the plugin's own interface: Capacitor
    // declares `setStyle` twice — once on the plugin and once, argument-less,
    // on the web stub — and the union of the two is not callable. The call
    // itself is the documented one.
    const bars = SystemBars as unknown as {
      setStyle(options: { style: string }): Promise<void>;
    };
    void bars
      .setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
      .catch(() => {
        // An older shell without the plugin. The bars keep their build-time
        // style, which is legible; there is nothing to recover from.
      });
  }, [dark]);
}

/**
 * Whether the dark palette is currently in force.
 *
 * Answers the question the CSS cannot: which *image* to load. The theme itself
 * needs no JavaScript — it is custom properties all the way down — but the logo
 * is a raster, and a near-black wordmark on a dark page is an invisible logo.
 *
 * Read from `color-scheme` on the document rather than recomputed from the
 * preference, because the token sheet already sets it on all three paths
 * (explicit dark, explicit light, and system following the device). One source
 * of truth, and it is the same one the browser uses for its own furniture.
 */
export function useIsDarkAppearance(): boolean {
  const [dark, setDark] = useState(read);

  useEffect(() => {
    setDark(read());
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    if (typeof window.matchMedia !== 'function') return () => observer.disconnect();
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(read());
    query.addEventListener('change', onChange);
    return () => {
      observer.disconnect();
      query.removeEventListener('change', onChange);
    };
  }, []);

  return dark;
}

function read(): boolean {
  if (typeof document === 'undefined') return false;
  return getComputedStyle(document.documentElement).colorScheme.includes('dark');
}
