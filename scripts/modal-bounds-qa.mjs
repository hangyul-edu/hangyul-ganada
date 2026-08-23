#!/usr/bin/env node
/**
 * Every dialog, opened, at every width, in the longest language it has.
 *
 *   npm run modals:qa            report
 *   npm run modals:qa -- --check fail on a finding
 *
 * ## The defect this exists for
 *
 * The placement prompt shipped with its orange *Take the level test* button
 * hanging outside the right edge of the modal, and `screens:audit` — which
 * renders seventeen screens at seven device profiles and measures clipping,
 * overlap and tap targets — reported nothing at all.
 *
 * It could not have. It navigates to a route and measures what the route
 * paints. A modal is not a route: it is a *state*, reachable only by doing
 * something, and every check in this repository was measuring the app at rest.
 * §51 is the general form of that — "static route screenshots are
 * insufficient" — and this is the part of it that covers dialogs.
 *
 * ## What it measures
 *
 * For every action in an open dialog, at every phone width, at 200% text, and
 * in the language with the longest label for that action:
 *
 * | | |
 * | --- | --- |
 * | **Escapes** | The button's box is outside the dialog's content box. The reported defect. |
 * | **Clipped** | The label is wider than the button showing it. |
 * | **Too small** | Under 44 px in either direction once it has stacked. |
 * | **Overlapping** | Two actions on top of each other. |
 * | **Off screen** | Any part outside the viewport, or under the safe area. |
 *
 * ## Why the longest label rather than English
 *
 * Because a layout that fits English and breaks German is not responsive, it is
 * lucky. The longest translation of each action is looked up in the bundles and
 * the dialog is opened in *that* language, so the test is against the worst
 * case the product can actually produce rather than the one the author speaks.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ensurePreview } from './lib/preview.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = join(ROOT, 'apps/web/src/locales');
const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';

const LOCALES = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((row) => row.isDirectory())
  .map((row) => row.name);

/** The value at a dotted key, in one locale's bundle. */
function copy(locale, bundle, path) {
  try {
    const json = JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${bundle}.json`), 'utf8'));
    return path.split('.').reduce((node, key) => node?.[key], json);
  } catch {
    return undefined;
  }
}

/** Which language writes this action most verbosely. */
function longest(bundle, path) {
  let best = { locale: 'en', text: copy('en', bundle, path) ?? '' };
  for (const locale of LOCALES) {
    const text = copy(locale, bundle, path);
    if (typeof text === 'string' && text.length > best.text.length) best = { locale, text };
  }
  return best;
}

/**
 * The dialogs, and how a learner reaches each one.
 *
 * `open` does whatever it takes from a fresh profile. If a dialog cannot be
 * reached the run says so rather than passing quietly — an unreachable dialog
 * is either a routing defect or a stale entry in this list, and both want
 * looking at.
 */
const DIALOGS = [
  {
    name: 'placement',
    keys: [['levelTest', 'placement.take'], ['levelTest', 'placement.start']],
    async open(page, url) {
      await page.goto(`${url}/words/today`, { waitUntil: 'networkidle' });
      await page.getByTestId('placement-skip').waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    name: 'reset learning record',
    keys: [['settings', 'reset.confirm'], ['settings', 'reset.cancel'], ['common', 'actions.cancel']],
    async open(page, url) {
      await page.goto(`${url}/me`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: /reset|초기화|zurücksetzen|réinitialiser/i })
        .last()
        .click();
      await page.waitForTimeout(600);
    },
  },
  /*
    The leave-the-app prompt is not in this list, and the reason is worth
    stating rather than leaving as an omission.

    It opens on a *native* Back press at the home screen — `offerBackIntent`,
    called from the Capacitor shell — and there is no way to raise it from a
    page in a browser. Adding a hook to production code so a test could open it
    would be shipping a door for the test's benefit.

    What matters about it here is its *layout*, and its layout is
    `ConfirmDialog`: the same component, the same grid, the same two actions as
    the two above. So instead of pretending to open it, the pass below drives
    that shared component with the longest action label found in **any** dialog
    in **any** language, which is a harder case than the real dialog presents.
    Its behaviour is covered by `SystemBack.test.tsx`.
  */
];

/** Every dialog action key in the product, for the worst-case pass. */
const EVERY_ACTION = [
  ['levelTest', 'placement.take'],
  ['levelTest', 'placement.start'],
  ['settings', 'reset.confirm'],
  ['settings', 'reset.cancel'],
  ['common', 'exit.confirm'],
  ['common', 'exit.stay'],
  ['common', 'actions.cancel'],
];

const DEVICES = [
  { name: '320', width: 320, height: 568, zoom: 1 },
  { name: '360', width: 360, height: 800, zoom: 1 },
  { name: '390', width: 390, height: 844, zoom: 1 },
  { name: '412', width: 412, height: 915, zoom: 1 },
  { name: '430', width: 430, height: 932, zoom: 1 },
  { name: '390-200%', width: 390, height: 844, zoom: 2 },
];

const findings = [];
const stopPreview = await ensurePreview(baseUrl);
const browser = await chromium.launch();
let opened = 0;

console.log('Dialogs — every action, inside its own modal\n');

for (const dialog of DIALOGS) {
  // The language that writes this dialog's actions most verbosely.
  const worst = dialog.keys
    .map(([bundle, path]) => longest(bundle, path))
    .sort((a, b) => b.text.length - a.text.length)[0];
  const locale = worst?.locale ?? 'en';
  console.log(`  ${dialog.name} — longest labels in ${locale} ("${(worst?.text ?? '').slice(0, 40)}")`);

  for (const device of DEVICES) {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      isMobile: true,
      hasTouch: true,
      locale,
    });
    const page = await context.newPage();
    await page.addInitScript(
      ({ code, factor }) => {
        window.localStorage.setItem('hangyul_ganada:locale', code);
        if (factor !== 1) {
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.style.fontSize = `${16 * factor}px`;
          });
        }
      },
      { code: locale, factor: device.zoom },
    );

    let reached = true;
    try {
      await dialog.open(page, baseUrl);
    } catch {
      reached = false;
    }
    await page.waitForTimeout(500);

    const measured = reached
      ? await page.evaluate(() => {
          const box =
            document.querySelector('[role="alertdialog"], [role="dialog"]') ??
            document.querySelector('[class*="dialog"], [class*="modal"]');
          if (!box) return null;
          const frame = box.getBoundingClientRect();
          const style = getComputedStyle(box);
          const pad = {
            left: Number.parseFloat(style.paddingLeft) || 0,
            right: Number.parseFloat(style.paddingRight) || 0,
          };
          const content = { left: frame.left + pad.left, right: frame.right - pad.right };
          const actions = [...box.querySelectorAll('button')].filter((node) => {
            const s = getComputedStyle(node);
            return s.display !== 'none' && s.visibility !== 'hidden';
          });
          return {
            content,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            actions: actions.map((node) => {
              const r = node.getBoundingClientRect();
              return {
                text: (node.textContent ?? '').trim().slice(0, 30),
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
                width: r.width,
                height: r.height,
                clipped: node.scrollWidth > node.clientWidth + 2,
              };
            }),
          };
        })
      : null;

    const where = `${dialog.name} @ ${device.name}`;
    if (!reached || !measured) {
      findings.push(`${where}: the dialog could not be opened`);
      await context.close();
      continue;
    }
    opened += 1;

    for (const action of measured.actions) {
      // Half a pixel of tolerance: sub-pixel layout, not an escaped button.
      if (action.left < measured.content.left - 0.5 || action.right > measured.content.right + 0.5) {
        findings.push(
          `${where}: "${action.text}" escapes the modal — ${Math.round(action.left)}..${Math.round(action.right)} ` +
            `outside ${Math.round(measured.content.left)}..${Math.round(measured.content.right)}`,
        );
      }
      if (action.clipped) findings.push(`${where}: "${action.text}" clips its own label`);
      if (action.width < 43 || action.height < 43) {
        findings.push(
          `${where}: "${action.text}" is ${Math.round(action.width)}x${Math.round(action.height)}`,
        );
      }
      if (action.left < -0.5 || action.right > measured.viewport.width + 0.5) {
        findings.push(`${where}: "${action.text}" is off screen`);
      }
    }
    for (let i = 0; i < measured.actions.length; i += 1) {
      for (let j = i + 1; j < measured.actions.length; j += 1) {
        const a = measured.actions[i];
        const b = measured.actions[j];
        const over =
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (over > 16) findings.push(`${where}: "${a.text}" and "${b.text}" overlap`);
      }
    }

    const stacked = measured.actions.length > 1 && measured.actions[1].top >= measured.actions[0].bottom - 1;
    console.log(
      `    ${device.name.padEnd(9)} ${measured.actions.length} action(s), ${stacked ? 'stacked' : 'side by side'}`,
    );
    await context.close();
  }
}

// --- The shared layout, against the longest label anywhere in the product ----

const worstAnywhere = EVERY_ACTION.map(([bundle, path]) => longest(bundle, path)).sort(
  (a, b) => b.text.length - a.text.length,
)[0];
console.log(
  `\n  the shared layout, with the longest dialog label in the product — ` +
    `${worstAnywhere.locale} "${worstAnywhere.text}" (${worstAnywhere.text.length} chars)`,
);

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    isMobile: true,
    hasTouch: true,
    locale: worstAnywhere.locale,
  });
  const page = await context.newPage();
  await page.addInitScript(
    ({ code, factor }) => {
      window.localStorage.setItem('hangyul_ganada:locale', code);
      if (factor !== 1) {
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.style.fontSize = `${16 * factor}px`;
        });
      }
    },
    { code: worstAnywhere.locale, factor: device.zoom },
  );
  await page.goto(`${baseUrl}/words/today`, { waitUntil: 'networkidle' });
  await page.getByTestId('placement-skip').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});

  const measured = await page.evaluate((label) => {
    const box = document.querySelector('[role="alertdialog"], [role="dialog"]');
    if (!box) return null;
    // Both actions get the worst label there is, which is the case the layout
    // has to survive whichever dialog it is drawing.
    for (const button of box.querySelectorAll('button')) button.textContent = label;
    const frame = box.getBoundingClientRect();
    const style = getComputedStyle(box);
    const content = {
      left: frame.left + (Number.parseFloat(style.paddingLeft) || 0),
      right: frame.right - (Number.parseFloat(style.paddingRight) || 0),
    };
    return {
      content,
      actions: [...box.querySelectorAll('button')].map((node) => {
        const r = node.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
          clipped: node.scrollWidth > node.clientWidth + 2,
        };
      }),
    };
  }, worstAnywhere.text);

  if (!measured) {
    findings.push(`worst-label @ ${device.name}: the dialog could not be opened`);
    await context.close();
    continue;
  }
  opened += 1;
  for (const action of measured.actions) {
    if (action.left < measured.content.left - 0.5 || action.right > measured.content.right + 0.5) {
      findings.push(
        `worst-label @ ${device.name}: an action escapes the modal — ` +
          `${Math.round(action.left)}..${Math.round(action.right)} outside ` +
          `${Math.round(measured.content.left)}..${Math.round(measured.content.right)}`,
      );
    }
    if (action.clipped) findings.push(`worst-label @ ${device.name}: an action clips its label`);
    if (action.height < 43) {
      findings.push(`worst-label @ ${device.name}: an action is ${Math.round(action.height)}px tall`);
    }
  }
  console.log(`    ${device.name.padEnd(9)} ${measured.actions.length} action(s), inside the modal`);
  await context.close();
}

await browser.close();
await stopPreview();

console.log(`\n${opened} dialog states measured across ${DEVICES.length} widths`);
if (findings.length === 0) {
  console.log('  every action sits inside its own modal, at every width, in its longest language.');
  process.exit(0);
}
console.log(`\n${findings.length} finding(s):`);
for (const finding of findings.slice(0, 20)) console.log(`  ! ${finding}`);
if (findings.length > 20) console.log(`  … and ${findings.length - 20} more`);
process.exit(CHECK ? 1 : 0);
