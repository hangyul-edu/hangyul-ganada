#!/usr/bin/env node
/**
 * Is every Level Test question about a word that belongs at the level it sits at,
 * and does it have exactly one defensible answer in all thirty-two languages?
 *
 *   npm run leveltest:bank            print the audit
 *   npm run leveltest:bank -- --check fail the build on any finding
 *
 * ## Why this exists next to the two audits that were already here
 *
 * `leveltest:ambiguity` reads the *contextual* items for thirteen structural
 * rules and passes. `leveltest:locale` reads every item in every language and
 * checks that each string came from the pack it should have. Between them they
 * were green while the bank shipped this, at **level 1**, to beginners:
 *
 * | word | what the rank measured | what the question keyed as correct |
 * | --- | --- | --- |
 * | 누가 | 누가 — *who*, rank 107 | "nougat" |
 * | 내 | 내 — *my*, rank 3 | "smell" |
 * | 위해 | 위하다 — *for the sake of*, rank 131 | "harm" |
 * | 거야 | a sentence ending, rank 19 | "last night" |
 *
 * Neither audit could have caught it, and neither was wrong to miss it. The
 * ambiguity audit reads contextual items and these are `meaning` and `produce`.
 * The locale audit asks whether a string resolved from the right language, and
 * "nougat" is impeccable English. The question neither of them asks is the one
 * a learner asks: **is this the word's meaning, and is this a level-1 word?**
 *
 * So this audit reads the bank against its own sources — the anchors it was
 * built from, the frequency rank each level came from, and the conjugator — and
 * asks four things no other gate asks.
 *
 * ## What it checks
 *
 * | | |
 * | --- | --- |
 * | a dictionary headword below the beginner floor | `DICTIONARY_LEVEL_FLOOR` |
 * | a dictionary headword whose rank belongs to an inflected form of another word | 부탁해요 glossed "please" |
 * | a one-syllable dictionary headword | 자 is a *ruler* and a verbal suffix |
 * | a gloss that is truncated, or describes grammar | "Past tense of in the plain style. Formed from the…" |
 * | two options that mean the same thing, in any of 32 languages | two right answers |
 * | a duplicated option | three choices wearing four labels |
 * | no correct option, or more than one | unanswerable, or two answers |
 * | the answer visible in the prompt | the question answers itself |
 * | a level with too few items or too few distinct words | a retake that repeats itself |
 *
 * ## What it cannot check
 *
 * Whether a Korean speaker would agree that this gloss is *the* meaning of this
 * word. Every rule above is structural. The judgement is a person's, and §5 of
 * the brief is explicit that no document may claim it has happened.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyse } from '../packages/korean-morphology/src/index.ts';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const LT = join(ROOT, 'apps', 'web', 'public', 'level-test');
const CHECK = process.argv.includes('--check');

const manifest = JSON.parse(readFileSync(join(LT, 'manifest.json'), 'utf8'));
const items = JSON.parse(readFileSync(join(LT, manifest.bank), 'utf8')).items;
const anchorFile = JSON.parse(
  readFileSync(join(ROOT, 'content-cache', 'level-test-anchors.json'), 'utf8'),
);
const anchors = anchorFile.anchors;
const byWordId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
const LEMMAS = new Set(anchors.map((anchor) => anchor.word));

/**
 * The floor, read from the builder rather than repeated.
 *
 * A constant copied into a gate is a gate that keeps passing after somebody
 * lowers the thing it guards.
 */
const FLOOR = Number(
  /^DICTIONARY_LEVEL_FLOOR = (\d+)$/m.exec(
    readFileSync(join(ROOT, 'scripts', 'content', 'build_level_test.py'), 'utf8'),
  )?.[1] ?? '0',
);

/** The lowest number of items, and of distinct words, a level may be asked from. */
const MIN_ITEMS_PER_LEVEL = 60;
const MIN_WORDS_PER_LEVEL = 30;

const BROKEN_GLOSS =
  /…|\.\.\.|\b(tense|participle|conjugation|declension|stem|ending|particle|suffix|prefix|infix) of\b|\bformed from\b|\bplain style\b/i;

const findings = [];
const note = (rule, detail) => findings.push({ rule, detail });

// --- the anchor a question is about ------------------------------------------

const asked = new Map();
for (const item of items) {
  const wordId = item.id.split(':')[0];
  const anchor = byWordId.get(wordId);
  if (!anchor) {
    note('unknown anchor', `${item.id} — no anchor with id ${wordId}`);
    continue;
  }
  if (anchor.level !== item.level) {
    note('level disagrees', `${item.id} is at level ${item.level}; its anchor says ${anchor.level}`);
  }
  const seen = asked.get(wordId) ?? { anchor, items: [] };
  seen.items.push(item);
  asked.set(wordId, seen);
}

for (const { anchor } of asked.values()) {
  if (anchor.source !== 'dictionary') continue;
  if (anchor.level < FLOOR) {
    note(
      'dictionary word below the beginner floor',
      `${anchor.word} at level ${anchor.level} (floor ${FLOOR}) — "${anchor.gloss}"`,
    );
  }
  if (anchor.word.length < 2) {
    note('one-syllable dictionary word', `${anchor.word} at level ${anchor.level} — "${anchor.gloss}"`);
  }
  const [reading] = analyse(anchor.word, (lemma) => LEMMAS.has(lemma));
  if (reading) {
    note(
      'rank borrowed from an inflected form',
      `${anchor.word} at level ${anchor.level} is ${reading.lemma}/${reading.form} — "${anchor.gloss}"`,
    );
  }
}

for (const { anchor } of asked.values()) {
  if (BROKEN_GLOSS.test(anchor.gloss)) {
    note('truncated or grammatical gloss', `${anchor.word} (L${anchor.level}) — "${anchor.gloss}"`);
  }
}

// --- one answer, and only one -------------------------------------------------

/**
 * Meanings, folded to what a learner would read as the same answer.
 *
 * Articles, the infinitive "to", case and surrounding punctuation are all
 * removed: a learner choosing between "a boat" and "boat" is choosing between
 * two right answers, and the fact that one carries an article is not a
 * distinction the test is measuring.
 */
function normaliseMeaning(text) {
  return text
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/^(to|a|an|the)\s+/u, '')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const meaningPacks = new Map();
for (const [locale, file] of Object.entries(manifest.meanings ?? {})) {
  const table = JSON.parse(readFileSync(join(LT, file), 'utf8')).meanings;
  meaningPacks.set(locale, table);
}

for (const item of items) {
  if (item.kind === 'meaning') {
    const ids = item.optionIds ?? [];
    if (new Set(ids).size !== ids.length) note('duplicate option', `${item.id} repeats an anchor`);
    if (!ids.includes(item.answerId)) note('no correct option', `${item.id}`);
    if (ids.filter((id) => id === item.answerId).length > 1) {
      note('more than one correct option', `${item.id}`);
    }
    /*
      The duplicate-meaning check runs in **every** language, not in English.
      Two anchors whose English glosses differ can share a word in Vietnamese,
      and the learner reading Vietnamese is the one who meets two right answers.
    */
    for (const [locale, table] of meaningPacks) {
      const texts = ids.map((id) => table[id]).filter(Boolean);
      if (texts.length !== ids.length) continue; // not askable in this language
      const folded = texts.map(normaliseMeaning);
      const duplicated = folded.filter((text, i) => folded.indexOf(text) !== i);
      if (duplicated.length > 0) {
        note(
          'two options mean the same thing',
          `${item.id} in ${locale}: ${texts.join(' · ')}`,
        );
      }
    }
  } else {
    const options = item.options ?? [];
    if (new Set(options).size !== options.length) {
      note('duplicate option', `${item.id} — ${options.join(' · ')}`);
    }
    if (!options.includes(item.answer)) note('no correct option', `${item.id}`);
    if (options.filter((option) => option === item.answer).length > 1) {
      note('more than one correct option', `${item.id}`);
    }
  }

  if (item.kind === 'context' && item.prompt && item.answer) {
    if (item.prompt.includes(item.answer)) {
      note('the prompt contains its own answer', `${item.id} — ${item.prompt}`);
    }
  }
  if (item.kind === 'produce') {
    const prompt = meaningPacks.get('en')?.[item.promptId];
    // A produce prompt is a meaning and its answer is Korean, so a leak would be
    // a gloss carrying the Korean word — 밥 glossed "bap, cooked rice".
    if (prompt && item.answer && prompt.includes(item.answer)) {
      note('the prompt contains its own answer', `${item.id} — ${prompt}`);
    }
  }
}

// --- every level can carry a sitting -----------------------------------------

const perLevel = new Map();
for (const item of items) {
  const row = perLevel.get(item.level) ?? { items: 0, words: new Set(), kinds: new Set() };
  row.items += 1;
  row.words.add(item.id.split(':')[0]);
  row.kinds.add(item.kind);
  perLevel.set(item.level, row);
}
for (let level = 1; level <= manifest.levels; level += 1) {
  const row = perLevel.get(level);
  if (!row) {
    note('empty level', `level ${level} has no items`);
    continue;
  }
  if (row.items < MIN_ITEMS_PER_LEVEL) {
    note('thin level', `level ${level} has ${row.items} items, under ${MIN_ITEMS_PER_LEVEL}`);
  }
  if (row.words.size < MIN_WORDS_PER_LEVEL) {
    note(
      'thin level',
      `level ${level} has ${row.words.size} distinct words, under ${MIN_WORDS_PER_LEVEL}`,
    );
  }
}

// --- report -------------------------------------------------------------------

const sources = new Map();
for (const { anchor } of asked.values()) {
  const row = sources.get(anchor.level) ?? { corpus: 0, dictionary: 0 };
  row[anchor.source] += 1;
  sources.set(anchor.level, row);
}

console.log(
  `\nLevel Test bank — ${items.length.toLocaleString('en')} items, ` +
    `${asked.size.toLocaleString('en')} distinct words, ${manifest.levels} levels\n`,
);
console.log(`  dictionary headwords are not asked below level ${FLOOR}\n`);
console.log('    level  items  words  taught  dictionary  kinds');
for (let level = 1; level <= manifest.levels; level += 1) {
  const row = perLevel.get(level) ?? { items: 0, words: new Set(), kinds: new Set() };
  const source = sources.get(level) ?? { corpus: 0, dictionary: 0 };
  console.log(
    `    ${String(level).padStart(5)}  ${String(row.items).padStart(5)}  ` +
      `${String(row.words.size).padStart(5)}  ${String(source.corpus).padStart(6)}  ` +
      `${String(source.dictionary).padStart(10)}  ${[...row.kinds].sort().join(',')}`,
  );
}

const byRule = new Map();
for (const { rule, detail } of findings) {
  const list = byRule.get(rule) ?? [];
  list.push(detail);
  byRule.set(rule, list);
}

if (findings.length === 0) {
  console.log(
    `\n  no item is mis-levelled, unanswerable, or has two answers in any of ` +
      `${meaningPacks.size} languages.`,
  );
} else {
  console.log(`\n  ${findings.length} finding(s):\n`);
  for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${String(list.length).padStart(5)}  ${rule}`);
    for (const detail of list.slice(0, 8)) console.log(`             ${detail}`);
    if (list.length > 8) console.log(`             … and ${list.length - 8} more`);
  }
}

if (CHECK && findings.length > 0) {
  console.log('\nfailing: the bank must not ship an item a learner cannot answer.');
  process.exit(1);
}
