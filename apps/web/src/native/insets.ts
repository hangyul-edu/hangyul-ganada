import { registerPlugin } from '@capacitor/core';

import { hasPlugin, isNative } from './platform';

/**
 * The web half of the safe area.
 *
 * The native half — `HangyulInsetsPlugin` — measures how much of Android's
 * status bar, navigation bar and cutout the WebView is drawn underneath, and
 * writes the answer straight onto the document element as
 * `--hg-native-safe-*`. It does that itself, from Java, so that the very first
 * frame after launch is already correct; a JavaScript listener that attaches
 * after the bundle has parsed would paint at least one frame of a primary
 * button sitting in the navigation bar, which is the bug all of this exists to
 * remove.
 *
 * So this file is not how the numbers arrive. It is the part that checks them.
 */

export interface NativeInsets {
  /** CSS pixels, as the native side converted them. */
  top: number;
  right: number;
  bottom: number;
  left: number;
  keyboard: number;
  /** The same measurement before conversion, in physical device pixels. */
  physicalTop: number;
  physicalRight: number;
  physicalBottom: number;
  physicalLeft: number;
  physicalKeyboard: number;
  density: number;
  /** The WebView's own size in physical pixels. */
  webViewWidth: number;
  webViewHeight: number;
  /** `gesture`, `buttons`, `none` or `unknown` — recorded by QA, never branched on. */
  navigationMode: string;
}

export interface HangyulInsetsPlugin {
  getInsets(): Promise<NativeInsets>;
  addListener(
    event: 'insetsChanged',
    handler: (insets: NativeInsets) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const HangyulInsets = registerPlugin<HangyulInsetsPlugin>('HangyulInsets');

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/**
 * How many CSS pixels one physical pixel is worth, checked rather than assumed.
 *
 * The native side divides by `DisplayMetrics.density`, which is right whenever
 * the WebView is at scale 1 — and this app asks for exactly that with
 * `width=device-width, initial-scale=1`. But "whenever" is not "always": a
 * learner who has set a large **Display size** in Android's accessibility
 * settings, a WebView with a text-zoom or initial-scale of its own, or an OEM
 * shell that hands the WebView a scaled viewport all break the identity, and
 * they break it silently — a 126 px navigation bar published as 48 CSS px is
 * plausible-looking and wrong, and the symptom is a button half under the bar
 * on some phones and floating above nothing on others.
 *
 * The WebView is the only side that knows what a CSS pixel is here, so the
 * check belongs here: compare the width the layout sees against the width the
 * view actually occupies, and if they disagree by more than a pixel, that ratio
 * — not the density — is the conversion. Returns `null` when there is nothing
 * to correct, which is the ordinary case.
 */
export function viewportScale(insets: NativeInsets, cssWidth: number): number | null {
  if (!insets.webViewWidth || !cssWidth || !insets.density) return null;
  const measured = cssWidth / insets.webViewWidth;
  const assumed = 1 / insets.density;
  // A pixel of disagreement across the whole width is rounding, not a scale.
  if (Math.abs(measured - assumed) * insets.webViewWidth < 1) return null;
  return measured;
}

/**
 * Re-publishes the insets in the CSS pixels this document is actually using.
 *
 * Exported for the unit test, which is the only place the arithmetic can be
 * exercised — every device that would take the corrective branch is a device
 * this project cannot put in CI.
 */
export function applyInsets(
  insets: NativeInsets,
  root: HTMLElement,
  cssWidth: number,
): void {
  const scale = viewportScale(insets, cssWidth);
  const value = (side: (typeof SIDES)[number]) => {
    const physical = insets[
      `physical${side[0]!.toUpperCase()}${side.slice(1)}` as
        | 'physicalTop'
        | 'physicalRight'
        | 'physicalBottom'
        | 'physicalLeft'
    ];
    return scale === null ? insets[side] : Math.round(physical * scale);
  };

  for (const side of SIDES) {
    root.style.setProperty(`--hg-native-safe-${side}`, `${value(side)}px`);
  }
  const keyboard =
    scale === null ? insets.keyboard : Math.round(insets.physicalKeyboard * scale);
  root.style.setProperty('--hg-native-keyboard', `${keyboard}px`);
}

/**
 * Subscribes to the native measurement for as long as the app is running.
 *
 * Does nothing in a browser and nothing on a platform without the plugin — iOS
 * answers the same question through `env(safe-area-inset-*)`, which
 * `safe-area.css` already reads, so there is nothing for this to add there.
 */
export function bindSafeAreaInsets(): () => void {
  if (!isNative || !hasPlugin('HangyulInsets')) return () => {};

  const root = document.documentElement;
  const apply = (insets: NativeInsets) => applyInsets(insets, root, window.innerWidth);

  const handle = HangyulInsets.addListener('insetsChanged', apply);
  // The listener only fires when a number moves, and the first move happened
  // before the bundle parsed. Ask once so the correction is applied to what is
  // already on screen.
  void HangyulInsets.getInsets().then(apply).catch(() => {});

  return () => void handle.then((listener) => void listener.remove());
}

/** The current measurement, for automated QA. Never called by the interface. */
export function readNativeInsets(): Promise<NativeInsets> {
  return HangyulInsets.getInsets();
}
