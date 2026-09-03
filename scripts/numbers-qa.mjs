#!/usr/bin/env node
/**
 * Is the Numbers course teachable, honest about progress, and teachable in
 * every language?
 *
 *   node scripts/numbers-qa.mjs           report
 *   node scripts/numbers-qa.mjs --check   exit non-zero on a finding
 *
 * ## What it gates
 *
 * 1. **Structure.** Six modules of at least two lessons; every lesson has an
 *    objective, at least two explanation steps, at least four items, at least
 *    two exercise kinds *that can actually be built* for every item, and a
 *    prerequisite graph that points backwards only.
 * 2. **Meaning.** Every item has a value (Intl) or a gloss (a key); every key a
 *    lesson, module or item names exists in `en/numbers.json`.
 * 3. **Audio.** Every word and every example has a clip in the manifest whose
 *    text is exactly the Korean. No runtime synthesis.
 * 4. **Localisation.** All thirty-two `numbers.json` bundles hold every key,
 *    none blank, and none identical to the English where the English is a
 *    sentence (an untranslated fallback).
 * 5. **Korean.** The counting-form rule in every example: 한 개, never 하나 개,
 *    except in the marked wrong halves of the pitfalls lesson.
 * 6. **Answer positions.** Over the mastery checks, the correct option is not
 *    at one fixed index.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');

const { NUMBER_ITEMS, NUMBER_LESSONS, NUMBER_MODULES, numberLessonItems, spokenExample } = await import(
  '../apps/web/src/data/numbers.ts'
);
const { exerciseCoverage, masteryExercises } = await import('../apps/web/src/features/numbers/exercises.ts');

const LOCALES = readdirSync(join(ROOT, 'apps/web/src/locales'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const bundles = Object.fromEntries(
  LOCALES.map((loc) => {
    const file = join(ROOT, `apps/web/src/locales/${loc}/numbers.json`);
    return [loc, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null];
  }),
);
const en = bundles.en;


const lookup = (bundle, dotted) =>
  dotted.split('.').reduce((node, key) => (node == null ? undefined : node[key]), bundle);

const flatten = (obj, prefix = '') =>
  Object.entries(obj ?? {}).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );

const problems = [];
const notes = [];
const fail = (detail) => problems.push(detail);

// --- 1 structure -------------------------------------------------------------
if (NUMBER_MODULES.length !== 6) fail(`expected 6 modules, found ${NUMBER_MODULES.length}`);
for (const m of NUMBER_MODULES) {
  if (m.lesson_ids.length < 2) fail(`module ${m.id} has ${m.lesson_ids.length} lesson(s); a module is not a lesson with a heading`);
}
const position = new Map(NUMBER_LESSONS.map((l, i) => [l.id, i]));
const usedKeys = new Set();
for (const lesson of NUMBER_LESSONS) {
  for (const pre of lesson.prerequisites) {
    if (!position.has(pre)) fail(`${lesson.id} requires ${pre}, which is not a lesson`);
    else if (position.get(pre) >= position.get(lesson.id)) fail(`${lesson.id} requires ${pre}, which comes later`);
  }
  if (lesson.explanation.length < 2) fail(`${lesson.id} has ${lesson.explanation.length} explanation step(s)`);
  if (lesson.item_ids.length < 4) fail(`${lesson.id} has ${lesson.item_ids.length} item(s)`);
  if (numberLessonItems(lesson).length !== lesson.item_ids.length) fail(`${lesson.id} names an item that does not exist`);
  const coverage = exerciseCoverage(lesson);
  if (coverage.kinds.size < 2) fail(`${lesson.id} builds only ${coverage.kinds.size} exercise kind(s)`);
  for (const id of coverage.thinItems) fail(`${lesson.id}: ${id} can be asked in fewer than two ways`);
  const mastery = masteryExercises(lesson, 0);
  const asked = new Set(mastery.map((e) => e.item_id));
  for (const id of lesson.item_ids) if (!asked.has(id)) fail(`${lesson.id}: mastery never asks ${id}`);

  /*
   * No option may be a label rather than an answer, and no two may mean the same.
   *
   * The screenshot that produced this rule: *what did you hear?* over 조 · 억 ·
   * 만 단위 · 만. 만 and 만 단위 are not two answers a listener can choose
   * between — one is the word, the other is the name of the idea the word
   * illustrates, and nothing that could be played distinguishes them. The
   * offending item is gone, but an item is one commit away from coming back.
   *
   * The rule is *not* containment. 만 원 beside 만 is a fair pair — a learner
   * who hears 만 원 heard the 원 — and a gate that failed it would be forcing
   * the course to stop teaching prices. What cannot be answered is an option
   * that names a category (단위, 방법, 형태, 종류) rather than something a
   * learner would say back, or two options that mean the same thing.
   *
   * Checked over the built exercises rather than over the item list, because
   * the pairing is made by the distractor picker and not by the data.
   */
  for (const exercise of mastery) {
    const seenText = new Map();
    const seenValue = new Map();
    for (const option of exercise.options) {
      const label = option.isKey || option.value !== undefined ? null : option.text;
      if (label && /(단위|방법|형태|종류)$/.test(label)) {
        fail(
          `${lesson.id}: "${label}" is an option for ${exercise.item_id}, but it names a ` +
            'category rather than something a learner says',
        );
      }
      const textKey = option.isKey ? `key:${option.text}` : option.value !== undefined ? null : `ko:${option.text}`;
      if (textKey) {
        if (seenText.has(textKey)) {
          fail(`${lesson.id}: ${exercise.item_id} offers "${option.text}" twice`);
        }
        seenText.set(textKey, true);
      }
      if (option.value !== undefined) {
        if (seenValue.has(option.value)) {
          fail(`${lesson.id}: ${exercise.item_id} offers the value ${option.value} twice`);
        }
        seenValue.set(option.value, true);
      }
    }
  }
}
for (const m of NUMBER_MODULES) for (const key of [m.title, m.goal]) usedKeys.add(key);

// --- 2 meaning ----------------------------------------------------------------
const ids = new Set();
for (const item of NUMBER_ITEMS) {
  if (ids.has(item.id)) fail(`duplicate item id ${item.id}`);
  ids.add(item.id);
  if (!/^num-/.test(item.id)) fail(`${item.id} is not in the num- namespace`);
  if (item.gloss === null && item.value === null) fail(`${item.id} (${item.korean}) has neither a value nor a gloss`);
  if (item.gloss) usedKeys.add(item.gloss);
  if (item.example_gloss) usedKeys.add(item.example_gloss);
}
// keys the UI uses by construction
for (const k of ['system.native', 'system.sino']) usedKeys.add(k);
for (const key of usedKeys) {
  const v = lookup(en, key);
  if (typeof v !== 'string' || v.trim() === '') fail(`[en] missing key ${key}`);
}

// --- 3 audio ------------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(ROOT, 'apps/web/public/audio/manifest.json'), 'utf8'));
const clipText = new Map(manifest.entries.map((e) => [e.id, e.text]));
let clips = 0;
for (const item of NUMBER_ITEMS) {
  if (clipText.get(item.audio.word) !== item.korean) fail(`${item.id}: no clip for "${item.korean}" (${item.audio.word})`);
  else clips += 1;
  if (item.example) {
    if (clipText.get(item.audio.example) !== spokenExample(item)) fail(`${item.id}: no clip for example "${spokenExample(item)}"`);
    else clips += 1;
  }
}

// --- 4 localisation -----------------------------------------------------------
const enFlat = flatten(en);
const enKeys = enFlat.map(([k]) => k);
const sentence = (s) => typeof s === 'string' && /\s/.test(s) && !/^[\p{Script=Hangul}\s·—,.!?()✓✗0-9]+$/u.test(s);
let translatedCells = 0;
let fallbackCells = 0;
for (const locale of LOCALES) {
  if (locale === 'en') continue;
  const bundle = bundles[locale];
  if (!bundle) { fail(`[${locale}] numbers.json is missing`); continue; }
  const flat = new Map(flatten(bundle));
  const missing = enKeys.filter((k) => !flat.has(k));
  const blank = enKeys.filter((k) => flat.has(k) && String(flat.get(k)).trim() === '');
  const extra = [...flat.keys()].filter((k) => !enKeys.includes(k));
  if (missing.length) fail(`[${locale}] ${missing.length} key(s) missing: ${missing.slice(0, 4).join(', ')}`);
  if (blank.length) fail(`[${locale}] ${blank.length} blank key(s): ${blank.slice(0, 4).join(', ')}`);
  if (extra.length) notes.push(`[${locale}] ${extra.length} key(s) not in en: ${extra.slice(0, 3).join(', ')}`);
  /*
   * Placeholders must survive translation — with one equivalence.
   *
   * `{{korean}}`, `{{subject}}` and `{{object}}` are the same word: the second
   * and third arrive with a Korean particle already attached, because 만은 and
   * 하나는 are not a suffix a translation string can pick for itself. English
   * writes "{{korean}} is 10,000"; Korean writes "{{subject}} 10,000이에요".
   * Requiring the English spelling would force every Korean feedback line into
   * the 은(는) parenthesis this product removed on purpose.
   */
  const sameSlot = (name) => (name === '{{subject}}' || name === '{{object}}' ? '{{korean}}' : name);
  for (const [k, v] of enFlat) {
    const ph = (String(v).match(/\{\{\w+\}\}/g) ?? []).map(sameSlot).sort();
    const got = (String(flat.get(k) ?? '').match(/\{\{\w+\}\}/g) ?? []).map(sameSlot).sort();
    if (ph.join() !== got.join()) fail(`[${locale}] ${k} placeholders ${got.join(',') || '∅'} ≠ ${ph.join(',')}`);
  }
  const same = enFlat.filter(([k, v]) => sentence(v) && flat.get(k) === v).map(([k]) => k);
  translatedCells += enKeys.length - same.length;
  fallbackCells += same.length;
  // The interface is shipped in thirty-two languages; a sentence left in
  // English is a fallback the learner sees, so it fails in every locale.
  if (same.length) fail(`[${locale}] ${same.length} sentence(s) identical to English: ${same.slice(0, 3).join(', ')}`);
}

// --- 5 Korean -------------------------------------------------------------------
const plainBeforeCounter = /(하나|둘|셋|넷|스물) (개|명|마리|살|시|잔|병|권|장|대|번|그루|송이|시간|사람|분)/;
for (const item of NUMBER_ITEMS) {
  const text = (item.example ?? '').split('·').filter((half) => !half.includes('✗')).join('·');
  if (plainBeforeCounter.test(text)) fail(`${item.id} writes the plain numeral before a counter: "${item.example}"`);
  // The spacing rule is checked on what the app voices — the right form — so a
  // deliberately wrong half such as 한개 (✗) is allowed to be wrong.
  const spoken = spokenExample(item) ?? '';
  if (/[가-힣](개|명|마리|살|잔|병|권|장)(\s|$)/.test(spoken)) {
    const m = spoken.match(/([가-힣]+)(개|명|마리|살|잔|병|권|장)(\s|$)/);
    if (m && ['한', '두', '세', '네', '스무', '다섯', '여섯', '일곱', '여덟', '아홉', '열'].some((f) => m[1].endsWith(f))) {
      fail(`${item.id} writes "${item.example}" with no space before ${m[2]}`);
    }
  }
}

// --- 6 answer positions -----------------------------------------------------------
const positions = NUMBER_LESSONS.flatMap((l) => masteryExercises(l, 0)).filter((e) => e.options.length === 4).map((e) => e.answer);
const distinct = new Set(positions);
if (distinct.size < 4) fail(`the correct option only ever sits at index ${[...distinct].join(',')}`);

// --- report -------------------------------------------------------------------
const kinds = new Set(NUMBER_LESSONS.flatMap((l) => l.exercise_kinds));
console.log(
  `numbers:qa — ${NUMBER_MODULES.length} modules · ${NUMBER_LESSONS.length} lessons · ${NUMBER_ITEMS.length} items · ${kinds.size} exercise kinds · ${problems.length} problem(s)`,
);
console.log(`  audio clips            ${clips} present, 0 synthesised`);
console.log(`  translated keys        ${enKeys.length} × ${LOCALES.length} languages`);
console.log(`  translated cells       ${translatedCells} translated, ${fallbackCells} identical to English`);
console.log(`  answer positions       ${[0, 1, 2, 3].map((i) => positions.filter((p) => p === i).length).join(' / ')} over ${positions.length} four-option mastery questions`);
if (notes.length) {
  console.log('\n  notes:');
  for (const n of notes) console.log(`    ${n}`);
}
if (problems.length) {
  console.log('\n  problems:');
  for (const p of problems) console.log(`    ✗ ${p}`);
}
if (CHECK && problems.length) process.exit(1);
