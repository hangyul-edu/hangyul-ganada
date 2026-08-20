/**
 * Splits the letter explanations into one file per language.
 *
 *   npm run letters:copy
 *   npm run letters:copy:check     fails if the emitted files are out of date
 *
 * ## Why they are not just in the module
 *
 * A sound hint and a mnemonic for 73 letters in 32 languages is a quarter of a
 * megabyte, and a learner reads one language. Left in `characterCopy.ts` the
 * whole set was imported by `characters.ts`, which every screen imports, so all
 * thirty-two arrived before the first paint — 61 kB gzipped of it on the
 * critical path to serve about 2 kB of it. That is the same argument the
 * interface bundles and the word packs already lost, and this is the third
 * piece of content to be moved off the same path for the same reason.
 *
 * English and Korean stay inline in `characters.ts`: they are written beside
 * the letters they describe, English ends every fallback chain, and a course
 * whose source languages arrive over the network can render a key path before
 * it has anything to say.
 *
 * The source of truth is `content/letters/<locale>.json`, one file per
 * language, keyed by the letter itself rather than by position — a positional
 * file silently reassigns every hint the day a character is inserted.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', 'content', 'letters');
const OUT = join(here, '..', 'apps', 'web', 'src', 'data', 'generated');
const CHECK = process.argv.includes('--check');

const problems = [];
let written = 0;

for (const file of readdirSync(SOURCE).sort()) {
  if (!file.endsWith('.json')) continue;
  const locale = file.replace(/\.json$/, '');
  const rows = JSON.parse(readFileSync(join(SOURCE, file), 'utf8'));
  const body = JSON.stringify({ locale, letters: rows }) + '\n';
  const target = join(OUT, `letters.${locale}.json`);
  let current = null;
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    current = null;
  }
  if (current === body) continue;
  if (CHECK) {
    problems.push(`${locale}: ${current === null ? 'missing' : 'out of date'}`);
  } else {
    writeFileSync(target, body);
    written += 1;
  }
}

if (CHECK) {
  if (problems.length) {
    console.error('Letter copy is out of date — run `npm run letters:copy`:');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log('Letter copy is up to date.');
} else {
  console.log(`Letter copy: ${written} file(s) written to ${OUT}`);
}
