import { beforeEach, describe, expect, it } from 'vitest';

import { applyInsets, viewportScale, type NativeInsets } from './insets';

/**
 * Physical pixels are not CSS pixels, and getting that wrong is invisible.
 *
 * A 48 dp navigation bar on a 3× phone is 144 physical pixels. Published as
 * `144px` it pushes the primary action a fifth of the way up the screen;
 * published as `48px` when the WebView is actually running at some other scale
 * it leaves part of the button under the bar. Both look plausible in a
 * screenshot and neither can be checked on the device that would show it, so
 * the arithmetic is checked here instead.
 */

const SAMSUNG: NativeInsets = {
  // What the native side computed with the display density.
  top: 32,
  right: 0,
  bottom: 48,
  left: 0,
  keyboard: 0,
  // What it measured.
  physicalTop: 84,
  physicalRight: 0,
  physicalBottom: 126,
  physicalLeft: 0,
  physicalKeyboard: 0,
  density: 2.625,
  webViewWidth: 1080,
  webViewHeight: 2340,
  navigationMode: 'buttons',
};

function root(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('native insets', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('leaves the density conversion alone when the viewport agrees with it', () => {
    // 1080 physical / 2.625 = 411 CSS px, which is what the layout reports.
    expect(viewportScale(SAMSUNG, 411)).toBeNull();

    const element = root();
    applyInsets(SAMSUNG, element, 411);
    expect(element.style.getPropertyValue('--hg-native-safe-bottom')).toBe('48px');
    expect(element.style.getPropertyValue('--hg-native-safe-top')).toBe('32px');
  });

  it('re-derives the conversion when the WebView is running at another scale', () => {
    // A learner on a large Display size setting: the same 1080 px of glass now
    // reports 360 CSS px wide, so every physical pixel is worth a third of one.
    const scale = viewportScale(SAMSUNG, 360);
    expect(scale).toBeCloseTo(1 / 3, 6);

    const element = root();
    applyInsets(SAMSUNG, element, 360);
    // 126 physical / 3 = 42, not the 48 the density said.
    expect(element.style.getPropertyValue('--hg-native-safe-bottom')).toBe('42px');
    expect(element.style.getPropertyValue('--hg-native-safe-top')).toBe('28px');
  });

  it('treats a sub-pixel disagreement as rounding rather than as a scale', () => {
    // 410.5 CSS px against 411: half a pixel across the whole width.
    expect(viewportScale(SAMSUNG, 410.6)).toBeNull();
  });

  it('publishes nothing it cannot measure', () => {
    const blind = { ...SAMSUNG, webViewWidth: 0 };
    expect(viewportScale(blind, 411)).toBeNull();
    const element = root();
    applyInsets(blind, element, 411);
    expect(element.style.getPropertyValue('--hg-native-safe-bottom')).toBe('48px');
  });

  it('keeps the keyboard out of the safe area', () => {
    const typing: NativeInsets = { ...SAMSUNG, keyboard: 320, physicalKeyboard: 840 };
    const element = root();
    applyInsets(typing, element, 411);
    // The keyboard has its own variable. The bottom safe inset is still the
    // navigation bar and nothing else — a lesson screen with no text input on
    // it must never reserve 320 px because some other screen has a search box.
    expect(element.style.getPropertyValue('--hg-native-keyboard')).toBe('320px');
    expect(element.style.getPropertyValue('--hg-native-safe-bottom')).toBe('48px');
  });
});
