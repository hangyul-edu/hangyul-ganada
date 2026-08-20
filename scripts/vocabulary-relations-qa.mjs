#!/usr/bin/env node
/**
 * The gate on every synonym and antonym the product shows.
 *
 *     npm run vocabulary:relations:qa
 *
 * ## What this is for
 *
 * Word Detail used to carry a section headed *비슷한 낱말* whose contents were
 * computed — the four words nearest this one in the same category. Under 고기
 * that printed 사과, 음식, 먹다, 우유 under a heading claiming they were alike.
 * Nothing failed; there was nothing to fail. The data was internally consistent
 * and wrong, and a learner has no way to tell a computed neighbour from a
 * dictionary fact.
 *
 * So the check is not "is the file well-formed". It is **can any relation on
 * the screen be traced to a dictionary that states it, as that relation**, and
 * every rule below exists because its absence is a way of quietly getting back
 * to a category list with a synonym heading over it.
 *
 * Exits non-zero on the first failing rule, listing every violation it found.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

const SOURCE = 'content/vocabulary/relations.json';
const BUNDLED = 'apps/web/src/data/generated/relations.json';
const CORPUS = 'apps/web/src/data/generated/vocabulary.json';
const CACHE = 'content-cache/relations-wikitext.jsonl';

/** The only two relations that may reach a customer. §2.2, §2.6. */
const ALLOWED = ['synonyms', 'antonyms'];

const failures = [];
const fail = (rule, detail) => failures.push({ rule, detail });

const source = read(SOURCE);
const bundled = read(BUNDLED);
const corpus = read(CORPUS);

const words = new Map(corpus.words.map((word) => [word.id, word]));
const entries = source.entries;

// --- The shape of a relation ------------------------------------------------

// Every relation carries its type explicitly. A bag of "related words" is what
// this replaced, and one untyped list is all it takes to have it back.
for (const [wordId, relations] of Object.entries(entries)) {
  for (const key of Object.keys(relations)) {
    if (!ALLOWED.includes(key)) fail('relation type', `${wordId}: "${key}" is not a relation type`);
  }
  if (!ALLOWED.some((key) => (relations[key] ?? []).length > 0)) {
    // An entry with two empty lists renders two headings over nothing. §2.4
    // says an empty relation set means no section, so it must not be stored.
    fail('empty entry', `${wordId} is listed with no relations at all`);
  }
}

// --- Every target is real, distinct, and not the word itself ----------------

for (const [wordId, relations] of Object.entries(entries)) {
  if (!words.has(wordId)) fail('unknown word', `${wordId} is not in the shipping vocabulary`);
  for (const key of ALLOWED) {
    const targets = relations[key] ?? [];
    for (const target of targets) {
      // §2.7: every relation shown is tappable, so a target that does not ship
      // would be a dead link on the screen.
      if (!words.has(target))
        fail('dangling target', `${wordId} → ${target} (${key}) does not ship`);
      if (target === wordId) fail('self-reference', `${wordId} lists itself as ${key}`);
    }
    if (new Set(targets).size !== targets.length) {
      fail('duplicate', `${wordId} lists the same ${key} twice`);
    }
  }
  const overlapping = (relations.synonyms ?? []).filter((id) =>
    (relations.antonyms ?? []).includes(id),
  );
  for (const id of overlapping) {
    fail('contradiction', `${wordId} lists ${id} as both a synonym and an antonym`);
  }
}

// --- Both ends agree --------------------------------------------------------

// The sense check that does not involve guessing: 남자 says 여자 is its
// antonym *and* 여자 says 남자. A one-sided relation is where sense drift
// lives — a page lists a synonym belonging to its third meaning and the target
// never claims it back.
for (const [wordId, relations] of Object.entries(entries)) {
  for (const key of ALLOWED) {
    for (const target of relations[key] ?? []) {
      if (!(entries[target]?.[key] ?? []).includes(wordId)) {
        fail('one-sided', `${wordId} → ${target} (${key}) is not stated back`);
      }
    }
  }
}

// --- Nothing was invented ---------------------------------------------------

/*
 * The rule the old section broke, checked against the fetched dictionary pages
 * rather than against the builder: every shipped relation must appear as a
 * literal 유의어/반의어 statement in the source wikitext for that headword.
 *
 * Deliberately a *coarse* check — it looks for the target inside the relation
 * lines of the page, not inside the sense block the builder scoped to. Sense
 * scoping is the builder's job and is tested there; this one answers the
 * cruder and more important question, "is there a dictionary saying this at
 * all", which a category fallback or a similarity model could never pass.
 */
let cache;
try {
  cache = readFileSync(resolve(ROOT, CACHE), 'utf8');
} catch {
  cache = null;
}

if (cache === null) {
  console.log(`  (skipping the provenance check — ${CACHE} is not present)`);
} else {
  const stated = new Map();
  for (const line of cache.split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const found = { synonyms: new Set(), antonyms: new Set() };
    const pattern = /^(?:\*\s*(유의어|반의어)\s*[:：]?\s*(.*)|=+\s*(유의어|반의어)\s*=+)$/gm;
    let match;
    while ((match = pattern.exec(row.wikitext)) !== null) {
      const kind = (match[1] ?? match[3]) === '유의어' ? 'synonyms' : 'antonyms';
      // An inline line carries its targets; a heading is followed by a list.
      const body = match[2] ?? row.wikitext.slice(match.index, match.index + 600);
      for (const link of body.matchAll(/\[\[([^\]|#]+)/g)) found[kind].add(link[1].trim());
    }
    stated.set(row.w, found);
  }

  for (const [wordId, relations] of Object.entries(entries)) {
    const word = words.get(wordId);
    if (!word) continue;
    const page = stated.get(word.word);
    if (!page) {
      fail('no source page', `${word.word} has relations but no fetched dictionary page`);
      continue;
    }
    for (const key of ALLOWED) {
      for (const target of relations[key] ?? []) {
        const targetWord = words.get(target)?.word;
        if (targetWord && !page[key].has(targetWord)) {
          fail(
            'unstated',
            `${word.word} → ${targetWord} (${key}) is not stated on the dictionary page`,
          );
        }
      }
    }
  }
}

// --- The bundled copy is the same data --------------------------------------

if (JSON.stringify(bundled.entries) !== JSON.stringify(entries)) {
  fail('stale bundle', `${BUNDLED} does not match ${SOURCE} — run npm run vocabulary:relations`);
}

// --- The old system is gone -------------------------------------------------

/*
 * A regression guard on the *absence* of the thing that was wrong, because it
 * is easy to re-add: a component that falls back to same-category words when a
 * word has no relations would pass every rule above and put 사과 back under
 * 고기. `nearby` was the key it was shown under.
 */
const LEGACY = [
  // The translation key, the locale entry, and the styles the old rows used.
  // Matched as code rather than as prose, so the comment explaining why the
  // section was removed does not trip its own guard.
  ['apps/web/src/pages/WordDetailPage.tsx', /detail\.nearby|styles\.nearby/],
  ['apps/web/src/pages/WordDetailPage.module.css', /^\.nearby/m],
];
for (const locale of ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'zh-CN']) {
  LEGACY.push([`apps/web/src/locales/${locale}/vocabulary.json`, /"nearby"/]);
}
for (const [path, pattern] of LEGACY) {
  if (pattern.test(readFileSync(resolve(ROOT, path), 'utf8'))) {
    fail('legacy section', `${path} still carries the "words like this" section`);
  }
}

// --- 고기, the fixture ------------------------------------------------------

const GOGI = corpus.words.find((word) => word.word === '고기');
if (GOGI) {
  const forbidden = ['사과', '음식', '먹다', '우유'];
  const shown = [...(entries[GOGI.id]?.synonyms ?? []), ...(entries[GOGI.id]?.antonyms ?? [])].map(
    (id) => words.get(id)?.word,
  );
  for (const word of forbidden) {
    if (shown.includes(word)) fail('고기 regression', `고기 shows ${word} as a lexical relation`);
  }
}

// --- Report -----------------------------------------------------------------

const relationCount = Object.values(entries).reduce(
  (total, entry) => total + (entry.synonyms?.length ?? 0) + (entry.antonyms?.length ?? 0),
  0,
);

if (failures.length > 0) {
  console.error(`vocabulary relations: ${failures.length} problem(s)\n`);
  for (const { rule, detail } of failures) console.error(`  [${rule}] ${detail}`);
  process.exit(1);
}

console.log(
  `vocabulary relations OK — ${Object.keys(entries).length} of ${corpus.words.length} words ` +
    `carry ${relationCount} verified relations (${ALLOWED.join(', ')}); ` +
    `${corpus.words.length - Object.keys(entries).length} words show no relation section.`,
);
