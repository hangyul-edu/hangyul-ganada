#!/usr/bin/env node
/**
 * Emits docs/native-review/<locale>/ — one compact package per learner
 * language for an eventual native reviewer: the register policy, the
 * vocabulary rows as CSV, the usage notes, and the strings a machine flagged
 * as high-risk. Generating these does NOT mean native review happened.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const v = read('apps/web/src/data/generated/vocabulary.json');
const style = read('content/vocabulary/locale-style.json').locales;
const exceptions = read('content/vocabulary/semantics-exceptions.json').rows;
const csvEscape = (s) => `"${String(s ?? '').replaceAll('"', '""')}"`;
for (const loc of Object.keys(style)) {
  if (loc === 'ko' || loc === 'en') continue;
  const dir = join(ROOT, 'docs/native-review', loc);
  mkdirSync(dir, { recursive: true });
  const conf = style[loc];
  let rows = new Map();
  const copyPath = `content/vocabulary/copy/${loc}.json`;
  if (existsSync(join(ROOT, copyPath))) {
    for (const [id, r] of Object.entries(read(copyPath).words)) rows.set(id, r);
  } else if (existsSync(join(ROOT, `apps/web/src/data/generated/vocabulary.${loc}.json`))) {
    const pack = read(`apps/web/src/data/generated/vocabulary.${loc}.json`).words;
    v.words.forEach((w, i) => rows.set(w.id, pack[i]));
  }
  let csv = 'korean,pos,level,korean_example,meaning,example_translation,usage_note\n';
  for (const w of v.words) {
    const r = rows.get(w.id) ?? [];
    csv += [w.word, w.part_of_speech, w.level, w.example ?? '', r[0] ?? '', r[1] ?? '', r[2] ?? '']
      .map(csvEscape).join(',') + '\n';
  }
  writeFileSync(join(dir, 'vocabulary.csv'), csv);
  const flagged = Object.entries(exceptions).filter(([k]) => k.startsWith(`${loc}/`));
  writeFileSync(join(dir, 'README.md'), `# Native review pack — ${conf.language}

**Status: NOT native-reviewed.** Everything here is model-written and
model-reviewed only.

Register policy: ${conf.register}. Second person: ${conf.secondPerson}.
Variant: ${conf.variant}. Punctuation: terminal ${JSON.stringify(conf.terminal)}, question ${JSON.stringify(conf.question ?? '?')}.
Known traps for this language: ${(conf.traps ?? []).join('; ') || '—'}.

Files: vocabulary.csv (every taught word: Korean, the taught sense as this
pack renders it, the example and its translation, and the usage note where
one exists). Machine-flagged rows accepted with a written reason:
${flagged.length ? flagged.map(([k, v2]) => `\n- ${k}: ${v2}`).join('') : ' none'}

What to check first: the usage notes; the rows for address terms and
politeness formulas; any row where the translation reads like English word
order; register consistency against the policy above.
`);
}
console.log('wrote docs/native-review/<locale>/ packs');
