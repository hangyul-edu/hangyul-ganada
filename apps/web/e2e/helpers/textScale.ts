import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

/**
 * A large system font, emulated the only way it can be here.
 *
 * Every type size in the product is a pixel token (`--hg-text-body: 15px`),
 * so `document.documentElement.style.fontSize = '32px'` — which several specs
 * did under the name "×2 text" — changed nothing a learner reads: the body
 * text stayed at 15 px and the measurement was of the normal size twice.
 * A phone's font scale is applied to every CSS pixel of text by the WebView;
 * doubling the tokens reproduces that for everything set in tokens. Text set
 * as a bare `clamp()` or literal px (the Korean glyph sizes on the tiles) is
 * pinned by design and stays put.
 */
const TOKENS = join(fileURLToPath(new URL('../../../../packages/design-tokens/tokens.css', import.meta.url)));

export function textScaleCss(scale: number): string {
  if (scale === 1) return '';
  const css = readFileSync(TOKENS, 'utf8');
  const seen = new Map<string, number>();
  for (const m of css.matchAll(/(--hg-text-(?:micro|caption|body(?:-sm|-lg)?|title|heading(?:-lg)?|display(?:-lg)?)):\s*(\d+(?:\.\d+)?)px/g)) {
    if (!seen.has(m[1]!)) seen.set(m[1]!, Number(m[2]));
  }
  if (seen.size === 0) throw new Error(`no text-size tokens found in ${TOKENS}`);
  return `:root{${[...seen].map(([k, v]) => `${k}:${Math.round(v * scale * 100) / 100}px`).join(';')}}`;
}

/** Applies the scale from the first frame: an init script that injects the override. */
/**
 * Applied from an init script, which runs before the document has a `<head>`
 * — or an element at all. The earlier form appended to
 * `document.head ?? document.documentElement` at that moment, threw on null,
 * and the throw was swallowed: four specs measured normal text under "×2"
 * until 13 September 2026. The sheet is appended at `DOMContentLoaded`, after
 * the token sheet it has to outrank, and `textScaleFactor` reads back what
 * applied so a spec can refuse to measure an unscaled page.
 */
export async function emulateTextScale(page: Page, scale: number): Promise<void> {
  if (scale === 1) return;
  await page.addInitScript((css: string) => {
    const inject = () => {
      const style = document.createElement('style');
      style.id = 'qa-text-scale';
      style.textContent = css;
      document.head.appendChild(style);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
    else inject();
  }, textScaleCss(scale));
}

/** The scale the page is really rendering at: the body token as applied over its base. */
export async function textScaleFactor(page: Page): Promise<number> {
  const css = readFileSync(TOKENS, 'utf8');
  const base = Number(/--hg-text-body:\s*(\d+(?:\.\d+)?)px/.exec(css)?.[1]);
  const applied = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hg-text-body')),
  );
  return applied / base;
}
