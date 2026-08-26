#!/usr/bin/env node
/**
 * How much of the exercise surface each learner language actually has.
 *
 *   npm run exercise:availability
 *
 * The mixed-language rule (learner's own pack or nothing) means an
 * incomplete pack does not leak English — it silently loses exercises. This
 * measures the loss per language and per exercise kind, word by word:
 *
 *   meaning/produce/match  need the word's meaning in this language
 *   context                needs a validated cloze frame (language-neutral)
 *   build                  needs 2–4 syllables (language-neutral)
 *
 * plus the two headline rates: words fully askable, and words a learner in
 * this language can only meet as an introduction card.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const v = read('apps/web/src/data/generated/vocabulary.json');
const cloze = new Set(Object.keys(read('apps/web/src/data/generated/cloze.json').words ?? {}));
const style = read('content/vocabulary/locale-style.json').locales;
const buildable = (w) => { const n = w.word.length; return n >= 2 && n <= 4; };
const rows = [];
for (const loc of Object.keys(style)) {
  if (loc === 'ko') continue;
  let meanings = 0;
  const has = new Set();
  const copyPath = `content/vocabulary/copy/${loc}.json`;
  if (existsSync(join(ROOT, copyPath))) {
    for (const [id, r] of Object.entries(read(copyPath).words)) if (r && r[0]) has.add(id);
  } else {
    const pack = read(`apps/web/src/data/generated/vocabulary.${loc}.json`).words;
    v.words.forEach((w, i) => { if (pack[i] && pack[i][0]) has.add(w.id); });
  }
  let ctx = 0, build = 0, introOnly = 0;
  for (const w of v.words) {
    const m = has.has(w.id);
    if (m) meanings += 1;
    const c = cloze.has(w.id) || cloze.has(w.word);
    if (c) ctx += 1;
    if (buildable(w)) build += 1;
    if (!m && !c && !buildable(w)) introOnly += 1;
  }
  rows.push({ loc, meanings, ctx, build, introOnly });
}
console.log('Exercise availability — per learner language, over the whole corpus\n');
console.log(`  corpus ${v.words.length} words · context frames ${[...cloze].length} · buildable ${rows[0].build}\n`);
console.log('  locale   meaning/produce/match   context   build   intro-only words');
for (const r of rows) {
  console.log(`  ${r.loc.padEnd(7)}  ${String(r.meanings).padStart(8)} (${Math.round((r.meanings / v.words.length) * 100)}%)         ${String(r.ctx).padStart(5)}   ${String(r.build).padStart(5)}   ${String(r.introOnly).padStart(5)}`);
}
const incomplete = rows.filter((r) => r.meanings < v.words.length);
console.log(`\n  languages with the full meaning surface: ${rows.length - incomplete.length} of ${rows.length}`);
if (incomplete.length) console.log(`  still short: ${incomplete.map((r) => `${r.loc} (${v.words.length - r.meanings})`).join(', ')}`);
