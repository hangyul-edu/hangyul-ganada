#!/usr/bin/env node
/**
 * Does a customer-critical control ever end up underneath Android's own UI?
 *
 *   npm run mobile:qa:safe-area
 *   node scripts/qa-safe-area-android.mjs --package com.talkhangyul.ganada.debug
 *   node scripts/qa-safe-area-android.mjs --shots .visual-qa/safe-area
 *
 * ## The bug this exists because of
 *
 * A physical Samsung photographed the ㄱ lesson with the bottom of its orange
 * **Trace it** button inside the three-button navigation bar. Nothing in this
 * repository had caught it, and it is worth being precise about why, because
 * every one of the reasons is a habit rather than an oversight:
 *
 * * The browser suite screenshots a viewport that has no system bars in it, so
 *   there is nothing for a button to be underneath.
 * * The native suite asserted `document.scrollHeight` and that the *header* was
 *   not under the status bar — true, and not the same question.
 * * The QA emulator ships WebView 133, and Capacitor's inset plugin takes a
 *   completely different path below WebView 140: it insets the whole WebView
 *   and publishes a zero, so the emulator never had an inset to get wrong.
 *
 * So this script asks the question directly and asks it of the composited
 * frame, in both navigation modes, in both appearances, at two text sizes.
 *
 * ## What "correct" means here
 *
 *     control.bottom  ≤  innerHeight − bottom system inset
 *
 * measured in the page's own CSS pixels, against the inset the native plugin
 * reports for the configuration that is live at that moment. Not against a
 * constant, and not against `innerHeight`.
 *
 * ## What it needs
 *
 * An emulator or device on `adb` with the **debug** build installed and
 * running: `webContentsDebuggingEnabled` is true there and false in release,
 * which is the correct way round and means QA runs against a debug-signed build
 * of the same source rather than against the release binary.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  adb,
  attach,
  screencap,
  setFontScale,
  setNavigationMode,
  setNightMode,
  sleep,
} from './lib/android-webview.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const PACKAGE = flag('--package', 'com.talkhangyul.ganada.debug');
const SHOTS = flag('--shots', '.visual-qa/safe-area');
const REPORT = flag('--report', join(SHOTS, 'safe-area-qa.json'));

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * The screens a customer cannot finish a lesson without, and the control on
 * each that they have to be able to press.
 *
 * `/letters/lesson-consonants-first` is the exact screen from the failure
 * photograph. The others are here because §19 of the brief is right: fixing one
 * button is not fixing the layout.
 */
const SCREENS = [
  {
    id: 'consonant-intro',
    path: '/letters/lesson-consonants-first',
    control: 'Trace it',
    // ㄱ's lesson opens on a unit explainer; the screen under test is the one
    // after it.
    pastUnitIntro: true,
  },
  { id: 'vowel-unit-intro', path: '/letters/lesson-vowels-core', control: "Got it" },
  { id: 'sound-changes', path: '/letters/sounds', control: null },
  { id: 'home', path: '/', control: null },
];

/**
 * Everything the page can say about where its controls are.
 *
 * Runs inside the WebView, so the numbers are in the same CSS pixels the layout
 * used — which is the only coordinate system in which the question means
 * anything. The bottom inset is resolved by *measuring* an element given that
 * height rather than by reading the custom property: a custom property's
 * computed value is an unevaluated token stream, so reading `--hg-safe-bottom`
 * hands back the literal string `max(48px, 0px)` and parsing it yields `NaN`,
 * which silently becomes zero and makes every assertion below pass.
 */
const measureScript = (scrollToEnd) => `
  const SCROLL_TO_END = ${scrollToEnd ? 'true' : 'false'};
  const probe = (name) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:-9999px;width:1px;height:var(' + name + ');';
    document.body.append(el);
    const height = el.getBoundingClientRect().height;
    el.remove();
    return height;
  };
  if (SCROLL_TO_END) {
    for (const scroller of document.querySelectorAll('*')) {
      if (scroller.scrollHeight > scroller.clientHeight + 1) scroller.scrollTop = scroller.scrollHeight;
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  const buttons = [...document.querySelectorAll('button, a[href]')]
    .filter((el) => el.offsetParent !== null)
    .map((el) => {
      const box = el.getBoundingClientRect();
      return {
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        left: Math.round(box.left),
        right: Math.round(box.right),
      };
    })
    .filter((entry) => entry.bottom > entry.top);
  const native = window.Capacitor?.Plugins?.HangyulInsets
    ? await window.Capacitor.Plugins.HangyulInsets.getInsets()
    : null;
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    safeTop: probe('--hg-safe-top'),
    safeBottom: probe('--hg-safe-bottom'),
    safeLeft: probe('--hg-safe-left'),
    safeRight: probe('--hg-safe-right'),
    path: location.pathname,
    native,
    buttons,
  };
`;

/**
 * Opens a screen the way the app's own navigation would.
 *
 * Through Home first, always. Two lesson screens share one route pattern, so
 * pushing straight from one lesson to another leaves React Router holding the
 * same component instance and the lesson opens on whatever step the *previous*
 * lesson had reached. A learner cannot do that — every route into a lesson
 * comes from the lesson list, which unmounts the one before it — so a script
 * that does it is testing a state the product does not have, and it spent a
 * whole run reporting that a unit explainer had no button on it.
 */
async function go(page, path) {
  const push = async (to) => {
    const quoted = JSON.stringify(to);
    await page.evaluate(`
      history.pushState({}, '', ${quoted});
      dispatchEvent(new PopStateEvent('popstate'));
      return true;
    `);
    await page.waitFor(`location.pathname === ${quoted}`);
  };
  if (path !== '/') {
    await push('/');
    await sleep(400);
  }
  await push(path);
  // One paint for the router, one for the lazily-loaded chunk.
  await sleep(1200);
}

/** Steps past the unit explainer, if this lesson opens on one. */
async function pastUnitIntro(page) {
  const moved = await page.evaluate(`
    const button = [...document.querySelectorAll('button')]
      .find((el) => /Got it/.test(el.textContent ?? ''));
    if (!button) return false;
    button.click();
    return true;
  `);
  if (moved) await sleep(900);
  return moved;
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  const density = Number(adb('shell', 'wm', 'density').match(/(\d+)/)?.[1] ?? 0);
  const size = adb('shell', 'wm', 'size');
  console.log(`device: ${adb('shell', 'getprop', 'ro.product.model')}, ${size}, ${density}dpi`);
  console.log(`android ${adb('shell', 'getprop', 'ro.build.version.release')}`);

  const matrix = [];

  for (const navigation of ['buttons', 'gesture']) {
    await setNavigationMode(navigation);
    for (const appearance of ['light', 'dark']) {
      await setNightMode(appearance);
      for (const fontScale of appearance === 'light' ? [1.0, 1.3] : [1.0]) {
        await setFontScale(fontScale);

        // Reattach each time: a configuration change recreates the WebView's
        // page target, and a socket to the old one answers nothing.
        const page = await attach(PACKAGE);
        const tag = `${navigation}-${appearance}-${fontScale}x`;

        for (const screen of SCREENS) {
          await go(page, screen.path);
          if (screen.pastUnitIntro) await pastUnitIntro(page);

          const measured = await page.evaluate(measureScript(false));
          const limit = measured.innerHeight - measured.safeBottom;

          if (screen.control) {
            const control = measured.buttons.find((button) =>
              button.label.includes(screen.control),
            );
            record(
              `${tag} · ${screen.id} · "${screen.control}" is on screen`,
              Boolean(control),
              control ? `${control.top}–${control.bottom}px` : 'not found',
            );
            if (control) {
              record(
                `${tag} · ${screen.id} · "${screen.control}" ends above the system navigation`,
                control.bottom <= limit,
                `ends at ${control.bottom}px, usable to ${limit}px (inset ${measured.safeBottom}px)`,
              );
              record(
                `${tag} · ${screen.id} · "${screen.control}" starts below the status bar`,
                control.top >= measured.safeTop,
                `starts at ${control.top}px, status bar ${measured.safeTop}px`,
              );
            }
          }

          /*
           * The composited frame, at rest, before anything is scrolled.
           *
           * `adb screencap` and not a DevTools screenshot: a DevTools capture
           * is the web contents only, which renders the app *without* the
           * status bar and *without* the navigation bar — so a button
           * underneath the navigation bar photographs as a button. This is the
           * frame the customer is looking at.
           */
          const shot = `${tag}-${screen.id}.png`;
          writeFileSync(join(SHOTS, shot), screencap());

          /*
           * And every other control on the screen, because the guarantee is
           * about the layout and not about one button.
           *
           * Measured with every scroll region driven to its end, and counting
           * only controls that are on screen at that moment. Both halves matter.
           * A speaker button eight screens down a reference page has a
           * `getBoundingClientRect().bottom` of 2,089 px and is not "inside the
           * navigation bar" — it is simply not on the screen, and flagging it
           * would make this check noise. What the scroll-to-end does is put the
           * *last* control in the region at the worst position it can occupy,
           * which is the position the bottom reservation exists to protect.
           */
          const scrolled = await page.evaluate(measureScript(true));
          const scrolledLimit = scrolled.innerHeight - scrolled.safeBottom;
          const onScreen = scrolled.buttons.filter(
            (button) => button.bottom > 0 && button.top < scrolled.innerHeight,
          );
          const trespassing = onScreen.filter((button) => button.bottom > scrolledLimit + 1);
          record(
            `${tag} · ${screen.id} · nothing tappable is inside the system navigation`,
            trespassing.length === 0,
            trespassing.map((b) => `"${b.label}" to ${b.bottom}px`).join(', ') ||
              `${onScreen.length} on-screen controls at the end of the scroll`,
          );


          matrix.push({
            navigation,
            appearance,
            fontScale,
            screen: screen.id,
            path: measured.path,
            innerHeight: measured.innerHeight,
            safeTop: measured.safeTop,
            safeBottom: measured.safeBottom,
            nativeInsets: measured.native,
            screenshot: shot,
          });
        }

        page.close();
      }
    }
  }

  // Leave the device the way it was found.
  await setFontScale(1.0);
  await setNightMode('light');
  await setNavigationMode('gesture');

  const failed = results.filter((result) => !result.ok);
  writeFileSync(
    REPORT,
    `${JSON.stringify({ device: adb('shell', 'getprop', 'ro.product.model'), matrix, results }, null, 2)}\n`,
  );
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`screenshots and inset record in ${SHOTS}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
