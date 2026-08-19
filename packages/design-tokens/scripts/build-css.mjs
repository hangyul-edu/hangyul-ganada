#!/usr/bin/env node
/**
 * Generates `tokens.css` from `src/index.ts`.
 *
 *   node scripts/build-css.mjs           write tokens.css
 *   node scripts/build-css.mjs --check   fail if tokens.css is stale
 *
 * The TS file is parsed rather than imported so this script has no build step
 * and no dependencies. It only understands the flat `export const X = {...}`
 * shape the token file uses — which is deliberate: tokens stay declarative.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src', 'index.ts');
const OUT = join(here, '..', 'tokens.css');

/**
 * Groups emitted to CSS, in order, with their custom-property prefix.
 *
 * `dark` and `darkGradient` are not here: they are emitted separately, into the
 * theme blocks at the end, because they redefine the *same* property names.
 */
const GROUPS = [
  ['orange', 'orange'],
  ['gray', 'gray'],
  ['warm', 'warm'],
  ['accent', ''],
  ['semantic', ''],
  ['gradient', 'gradient'],
  ['fontFamily', 'font'],
  ['fontSize', 'text'],
  ['fontWeight', 'weight'],
  ['lineHeight', 'leading'],
  ['space', 'space'],
  ['radius', 'radius'],
  ['shadow', 'shadow'],
  ['size', 'size'],
  ['zIndex', 'z'],
  ['duration', 'duration'],
  ['easing', 'ease'],
];

const source = readFileSync(SRC, 'utf8');

/** Resolved literal values, keyed `group.key`, so later groups can reference earlier ones. */
const resolved = new Map();

/** Extracts the body of `export const <name> = { ... } as const;`. */
function readGroup(name) {
  const start = source.indexOf(`export const ${name} = {`);
  if (start === -1) throw new Error(`token group "${name}" not found in src/index.ts`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = source.slice(open + 1, end);
  const entries = [];
  // A value is a string literal, a number, or a reference to an already-parsed
  // token such as `orange[900]` / `accent.mint`.
  const re =
    /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_$]+))\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([0-9.]+)|([A-Za-z_$][\w$]*)(?:\[(?:'([^']+)'|"([^"]+)"|(\d+))\]|\.([\w$]+)))\s*,/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    const key = m[1] ?? m[2] ?? m[3];
    let value = m[4] ?? m[5] ?? m[6];
    if (value === undefined) {
      const refGroup = m[7];
      const refKey = m[8] ?? m[9] ?? m[10] ?? m[11];
      value = resolved.get(`${refGroup}.${refKey}`);
      if (value === undefined) {
        throw new Error(
          `${name}.${key} references ${refGroup}.${refKey}, which is not a resolved token. ` +
            'Referenced groups must be listed in GROUPS before the group that uses them.',
        );
      }
    } else {
      value = value.replace(/\\'/g, "'").replace(/\\"/g, '"');
    }
    resolved.set(`${name}.${key}`, value);
    entries.push([key, value]);
  }
  if (entries.length === 0) throw new Error(`token group "${name}" parsed to zero entries`);
  return entries;
}

/** `bgWarm` -> `bg-warm`, `2xl` -> `2xl`, `900` -> `900`. */
function kebab(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

const lines = [
  '/**',
  ' * GENERATED FILE — do not edit.',
  ' * Source: packages/design-tokens/src/index.ts',
  ' * Regenerate: npm run tokens:build',
  ' */',
  ':root {',
];

for (const [group, prefix] of GROUPS) {
  lines.push(`  /* ${group} */`);
  for (const [key, value] of readGroup(group)) {
    const name = prefix ? `--hg-${prefix}-${kebab(key)}` : `--hg-${kebab(key)}`;
    lines.push(`  ${name}: ${value};`);
  }
}

lines.push('}', '');

/**
 * The dark appearance, emitted twice on purpose.
 *
 * A learner's appearance preference has three states, and only two of them put
 * an attribute on the document:
 *
 * ```
 * chosen "dark"    <html data-theme="dark">     ← explicit
 * chosen "light"   <html data-theme="light">    ← explicit
 * chosen "system"  <html>  (no attribute)       ← follow the OS
 * ```
 *
 * So the values are written under `[data-theme="dark"]` for the explicit
 * choice, and under `prefers-color-scheme: dark` guarded by
 * `:not([data-theme="light"])` for the system one. The guard is what stops a
 * learner who has deliberately chosen Light from being dragged back into dark
 * by their phone at sunset.
 */
function themeBlock(selector, indent) {
  const pad = ' '.repeat(indent);
  const out = [`${pad}${selector} {`];
  for (const [group, prefix] of [
    ['dark', ''],
    ['darkGradient', 'gradient'],
  ]) {
    for (const [key, value] of readGroup(group)) {
      const name = prefix ? `--hg-${prefix}-${kebab(key)}` : `--hg-${kebab(key)}`;
      out.push(`${pad}  ${name}: ${value};`);
    }
  }
  out.push(`${pad}}`);
  return out;
}

lines.push('/* --- dark appearance ------------------------------------------------ */');
lines.push(...themeBlock(':root[data-theme="dark"]', 0));
lines.push('');
lines.push('@media (prefers-color-scheme: dark) {');
lines.push(...themeBlock(':root:not([data-theme="light"])', 2));
lines.push('}');
lines.push('');

/*
  `color-scheme` makes the browser's own furniture follow: form controls, the
  scrollbar, the overscroll gutter and the address-bar tint. Without it a
  perfectly themed page still flashes a white scrollbar.
*/
lines.push(':root { color-scheme: light; }');
lines.push(':root[data-theme="dark"] { color-scheme: dark; }');
lines.push('@media (prefers-color-scheme: dark) {');
lines.push('  :root:not([data-theme="light"]) { color-scheme: dark; }');
lines.push('}');
lines.push('');

const css = lines.join('\n');

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    /* missing counts as stale */
  }
  if (current !== css) {
    console.error('tokens.css is out of date with src/index.ts — run `npm run tokens:build`');
    process.exit(1);
  }
  console.log('tokens.css is up to date');
} else {
  writeFileSync(OUT, css);
  console.log(`wrote ${OUT}`);
}
