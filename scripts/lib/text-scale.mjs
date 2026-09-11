/**
 * Emulating a large system font in a desktop Chromium.
 *
 * ## Why `document.documentElement.style.fontSize` is not it
 *
 * Every type size in this product is a design token in **pixels** —
 * `--hg-text-body: 15px` and its neighbours in `packages/design-tokens/tokens.css`
 * — so changing the root font size changes nothing a learner reads. Several QA
 * scripts set `html { font-size: 32px }` and called it "200% text"; measured,
 * the body text stayed at 15 px. Those measurements were of the normal size
 * twice over.
 *
 * On a phone the system font scale is applied by the WebView to *every* CSS
 * pixel of text (Android's `textZoom`, iOS Dynamic Type through
 * `-webkit-text-size-adjust`), which is exactly what a token override
 * reproduces for everything set in tokens. Text set as a bare `clamp()` or a
 * literal px stays put under this override — the Korean glyph sizes on the
 * choice tiles are the main case — and that is stated rather than hidden:
 * those are the sizes a screen deliberately pins.
 *
 * `textScaleCss(2)` returns a stylesheet that multiplies every `--hg-text-*`
 * size token by two. Inject it with `page.addStyleTag({ content })` after
 * load, or via `addInitScript` for the first frame.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'design-tokens', 'tokens.css');

/** The size tokens and their base pixel values, read from the token sheet. */
export function textSizeTokens() {
  const css = readFileSync(TOKENS, 'utf8');
  const out = new Map();
  for (const match of css.matchAll(/(--hg-text-(?:micro|caption|body(?:-sm|-lg)?|title|heading(?:-lg)?|display(?:-lg)?)):\s*(\d+(?:\.\d+)?)px/g)) {
    if (!out.has(match[1])) out.set(match[1], Number(match[2]));
  }
  if (out.size === 0) throw new Error(`no text-size tokens found in ${TOKENS}`);
  return out;
}

/** A stylesheet that scales every text-size token by `scale`. */
export function textScaleCss(scale) {
  if (scale === 1) return '';
  const lines = [...textSizeTokens()].map(([name, px]) => `  ${name}: ${Math.round(px * scale * 100) / 100}px;`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}
