#!/usr/bin/env node
/**
 * Does every hint the product shows actually rule something out?
 *
 *   npm run hints:qa            report
 *   npm run hints:qa -- --check fail on a useless or leaking hint
 *
 * ## Two properties, and only one of them was checked
 *
 * A hint has to be **safe** — it must not contain the answer — and that has
 * been enforced since the ladder was rewritten. It also has to be **useful**,
 * and nothing was checking that. "It's a verb" over four verbs is perfectly
 * safe and tells a learner nothing: they spend a rung of help and are exactly
 * where they started, which teaches them that help is not worth asking for.
 *
 * So this builds real questions for a large sample of the corpus, in every
 * interface language, and asks of each rung that survives `usableHints`:
 * does at least one option on screen differ from the answer on a property the
 * rung names?
 *
 * ## Every language, not just English
 *
 * A rung is a translation key and the words around the interpolated value
 * belong to the translation, so whether it hands the answer over is a property
 * of the *rendered* string. 배우다 is *học* in Vietnamese and its category is
 * *Học tập & Công việc*; the category hint therefore contains the answer in
 * Vietnamese and does not in English. Checking one language checks one
 * language.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpusForNode } from './lib/corpus.mjs';

// The corpus is fetched, not imported. See `scripts/lib/corpus.mjs`.
await loadCorpusForNode();

import { buildExercise } from '../apps/web/src/features/review/exercises.ts';
import { usableHints } from '../apps/web/src/features/review/hints.ts';
import { VOCABULARY, getWord } from '../apps/web/src/data/vocabulary.ts';
import { ALL_CHARACTERS, getCharacter, getCharacterByGlyph } from '../apps/web/src/data/characters.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');
const LOCALES = readdirSync(join(ROOT, 'apps/web/src/locales')).sort();

/** Interpolates a key the way i18next would, for one locale's bundles. */
function makeLabel(bundles) {
  const read = (key) => {
    const [ns, ...rest] = key.split(':');
    const path = rest.join(':').split('.');
    let node = bundles[ns];
    for (const part of path) node = node?.[part];
    return typeof node === 'string' ? node : undefined;
  };
  return (key) => read(key) ?? read(key.replace(/^learning:/, 'vocabulary:')) ?? key;
}

function render(t, step, answerValues) {
  const template = t(`learning:${step.key}`);
  return template.replace(/\{\{(\w+)[^}]*\}\}/g, (_, name) =>
    String({ ...step.values, ...answerValues }[name] ?? ''),
  );
}

const MODES = ['read', 'produce', 'context', 'listen', 'distinguish'];
/** Enough of the corpus to meet every category and part of speech many times. */
const WORDS = VOCABULARY.filter((_, i) => i % 4 === 0);

let asked = 0;
let leaking = 0;
let useless = 0;
const examples = { leaking: [], useless: [] };

for (const locale of LOCALES) {
  const bundles = {};
  for (const file of readdirSync(join(ROOT, `apps/web/src/locales/${locale}`))) {
    bundles[file.replace('.json', '')] = JSON.parse(
      readFileSync(join(ROOT, `apps/web/src/locales/${locale}`, file), 'utf8'),
    );
  }
  const t = makeLabel(bundles);
  /*
    The word copy, read straight off the generated packs.

    Not through `data/wordCopy`, which reaches for `import.meta.glob` and so
    only exists inside Vite. The packs are positional arrays in corpus order,
    and locales without one fall back to English exactly as the app does.
  */
  const packFile = join(ROOT, `apps/web/src/data/generated/vocabulary.${locale}.json`);
  const pack = existsSync(packFile) ? JSON.parse(readFileSync(packFile, 'utf8')).words : null;
  const english = JSON.parse(
    readFileSync(join(ROOT, 'apps/web/src/data/generated/vocabulary.en.json'), 'utf8'),
  ).words;
  const indexOf = new Map(VOCABULARY.map((w, i) => [w.id, i]));
  const meaningOf = (word) => {
    const at = indexOf.get(word.id);
    const row = (pack && pack[at]) || english[at];
    return { value: row?.[0] ?? '', locale: pack && pack[at] ? locale : 'en' };
  };

  const items = [
    ...WORDS.map((w) => ({ kind: 'word', itemKey: w.id })),
    ...ALL_CHARACTERS.map((c) => ({ kind: 'character', itemKey: c.id })),
  ];

  for (const item of items) {
    for (const mode of MODES) {
      const candidate = { ...item, skill: 'recall', mode, priority: 1, recall: 0.5, partner: null, intervene: false };
      let exercise;
      try {
        exercise = buildExercise(candidate, meaningOf, 7, t);
      } catch {
        continue;
      }
      if (!exercise?.hints?.length) continue;

      const answerOption = (exercise.options ?? []).find((o) => o.id === exercise.answerId);
      const answerValues = {
        answer: answerOption?.label ?? answerOption?.korean ?? '',
        word: exercise.korean ?? '',
      };
      const facts = (exercise.options ?? []).map((option) => {
        const word = getWord(option.id);
        if (word) return { pos: word.part_of_speech, category: word.category };
        const letter = getCharacter(option.id) ?? getCharacterByGlyph(option.korean ?? option.id);
        return letter ? { group: letter.group } : {};
      });

      const shown = usableHints(exercise.hints, (s) => render(t, s, answerValues), answerValues.answer, facts);
      for (const step of shown) {
        asked += 1;
        const text = render(t, step, answerValues);
        /*
          Stricter than `revealsAnswer`, on purpose, and only a little.

          The product matches whole tokens, which is right for Latin text — a
          substring rule flags "a" inside "cat". But German and French build
          compounds, and a category rendered *Geld und Einkaufen* beside an
          option *kaufen* is a steer whether or not the token boundaries agree.
          So this also counts the answer appearing as the tail of a longer word,
          from four letters up, which is long enough that the overlap is a
          shared morpheme rather than a coincidence.
        */
        if (answerValues.answer && step.strength !== 'answer') {
          const a = answerValues.answer.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
          const tokens = text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''));
          const whole = a.length > 1 && tokens.includes(a);
          const suffix = a.length >= 4 && tokens.some((w) => w !== a && w.endsWith(a));
          if (whole || suffix) {
            leaking += 1;
            if (examples.leaking.length < 8) {
              examples.leaking.push(`${locale} ${exercise.answerId} ${mode}: answer "${answerValues.answer}" in — ${text}`);
            }
          }
        }
        if (step.about && facts.length) {
          const keys = Object.keys(step.about);
          const rules = facts.some((f) => keys.some((k) => f[k] !== undefined && f[k] !== step.about[k]));
          if (!rules) {
            useless += 1;
            if (examples.useless.length < 6) examples.useless.push(`${locale} ${exercise.answerId} ${mode}: ${text}`);
          }
        }
      }
    }
  }
}

console.log(`Hints — ${asked.toLocaleString('en')} rungs shown across ${LOCALES.length} languages\n`);
console.log(`  answer-leaking hints shown:    ${leaking}`);
console.log(`  hints that rule nothing out:   ${useless}`);
for (const line of examples.leaking) console.log(`    leak: ${line}`);
for (const line of examples.useless) console.log(`    useless: ${line}`);

if (leaking === 0 && useless === 0) {
  console.log('\nevery hint shown is both safe and useful.');
} else {
  console.log('\nthe ladder is showing help that does not help.');
}
if (CHECK && (leaking > 0 || useless > 0)) process.exit(1);
