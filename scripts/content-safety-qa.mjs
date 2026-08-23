#!/usr/bin/env node
/**
 * What a learner can be shown, checked on the composed sentence.
 *
 *   npm run content:safety:qa
 *   npm run content:safety:qa -- --check
 *
 * ## Two failures, and only one of them is a word list
 *
 * The first is a word. 보지 reached the Level Test as an answer choice: the
 * taught pack had refused it with the reason written on the entry, but the
 * anchor pool also draws on the dictionary, and there it sits glossed
 * "preservation". A list catches that, and `content/vocabulary/learner-safety.json`
 * is the list.
 *
 * The second cannot be caught by any list, because every word in it is
 * innocent. 여자 is *woman*. 타다 is *to ride*. 여자를 타요 is a sentence this
 * product must never put in front of anybody, and no vocabulary check that
 * looks at one word at a time can see it. The distractor generator substitutes
 * a noun into a real sentence, so the check has to run on the sentence that
 * comes out and know what kind of noun went in.
 *
 * So this composes. For every contextual Level Test item it builds all four
 * sentences, and for every daily and review question it builds the options the
 * runtime would build, then reads each result against the frame rules —
 * a predicate plus the noun classes that must not fill its object slot.
 *
 * ## What it deliberately does not do
 *
 * It does not touch the dictionary. A dictionary is allowed to contain adult
 * vocabulary and a learner who searches for a word has asked for it. The risk
 * this file exists for is the beginner who did not ask.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { conjugate, FORMS } from '../packages/korean-morphology/src/index.ts';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const safety = read('content/vocabulary/learner-safety.json');
const classes = read('content/vocabulary/noun-classes.json').classes;
const vocabulary = read('apps/web/src/data/generated/vocabulary.json');
const manifest = read('apps/web/public/level-test/manifest.json');
const bank = read(join('apps/web/public/level-test', manifest.bank));

const flatten = (section) =>
  new Set(
    Object.entries(section)
      .filter(([name]) => name !== '_comment')
      .flatMap(([, terms]) => terms),
  );
const EXCLUDED = flatten(safety.excluded);
const NOT_STANDALONE = flatten(safety.notStandalone);
const FRAMES = safety.frames.rules;

const findings = [];
const report = (kind, where, detail) => findings.push({ kind, where, detail });

/** The classes a noun belongs to, or an empty list. */
const classOf = (word) => classes[word] ?? [];

/**
 * Does this sentence put a forbidden noun class in a forbidden slot?
 *
 * Two things have to be right or the check is noise, and the first draft of
 * this function got both wrong.
 *
 * **The noun has to be the object.** 혀가 아파서 밥을 못 먹어요 has a body part
 * and 먹다 in it and is a perfectly ordinary sentence, because 혀 is the subject
 * and the thing being eaten is 밥. Only 을/를 counts.
 *
 * **The predicate has to be the predicate.** Matching the stem as a substring
 * made 회사에 가요 an instance of 사다 and 숨이 차요 an instance of 차다. The
 * predicate is matched as one of its conjugated surfaces instead, which is what
 * `conjugate` is for.
 */
const PREDICATE_SURFACES = new Map();
for (const rule of FRAMES) {
  for (const predicate of rule.predicates) {
    const forms = new Set([predicate]);
    for (const form of FORMS) {
      const value = conjugate(predicate, form, { partOfSpeech: 'verb' });
      if (value) forms.add(value);
    }
    PREDICATE_SURFACES.set(predicate, [...forms]);
  }
}

function unsafeComposition(sentence, inserted) {
  const insertedClasses = classOf(inserted);
  if (insertedClasses.length === 0) return null;
  const at = sentence.indexOf(inserted);
  if (at < 0) return null;
  const rest = sentence.slice(at + inserted.length);
  // Object position only: 을/를, and nothing else.
  if (!/^(을|를)/.test(rest)) return null;
  for (const rule of FRAMES) {
    if (!rule.forbidObject.some((c) => insertedClasses.includes(c))) continue;
    for (const predicate of rule.predicates) {
      for (const surface of PREDICATE_SURFACES.get(predicate) ?? []) {
        if (surface.length >= 2 && rest.includes(surface)) return rule.why;
      }
    }
  }
  return null;
}

// --- 1. No excluded term is reachable ----------------------------------------
for (const word of vocabulary.words) {
  if (EXCLUDED.has(word.word)) {
    report('taught', word.word, 'an excluded term is in the taught corpus');
  }
}

const contexts = (bank.items ?? bank).filter((item) => item.kind === 'context');
for (const item of bank.items ?? bank) {
  for (const option of item.options ?? []) {
    if (EXCLUDED.has(option)) {
      report('option', item.id, `${option} is an excluded term`);
    }
    /*
     * The standalone tier is about a word dropped into a *sentence*, which is
     * where 년이 요리를 해요 came from. On a produce question the four options
     * are words being taught and 명 is a word: refusing it there would mean the
     * curriculum could never test a counter it teaches.
     */
    /*
     * `form: 'noun'` matters. 채 is the counter for houses and also the
     * infinitive of 채다, and 가방을 채 갔어요 is a verb item whose option merely
     * looks like the counter. A check that reads the string and not the slot
     * reports it, and reporting a verb as a bound noun is how a gate teaches
     * people to skip it.
     */
    if (item.kind === 'context' && item.form === 'noun' && NOT_STANDALONE.has(option)) {
      report('standalone', item.id, `${option} may not stand alone inside a sentence`);
    }
  }
}

// --- 2. No composed sentence is unsafe ---------------------------------------
for (const item of contexts) {
  for (const option of item.options ?? []) {
    const sentence = item.prompt.replace('____', option);
    const why = unsafeComposition(sentence, option);
    if (why) report('composed', item.id, `${sentence} — ${why}`);
  }
}

// --- 3. The taught examples themselves ---------------------------------------
for (const word of vocabulary.words) {
  const example = word.example ?? '';
  if (!example) continue;
  for (const term of EXCLUDED) {
    /*
     * Whole word, not substring. 씹 is on the list and 씹다 is *to chew*, whose
     * example is 천천히 씹어요 — a sentence about eating slowly that the first
     * draft of this check reported as sexual content.
     */
    const boundary = new RegExp(`(^|[^가-힣])${term}([^가-힣]|$)`);
    if (boundary.test(example)) {
      report('example', word.word, `the example contains ${term}: ${example}`);
    }
  }
}

const byKind = new Map();
for (const finding of findings) byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);

console.log('Learner safety — the word, and the sentence it makes\n');
console.log(`  excluded terms            ${EXCLUDED.size}`);
console.log(`  never standalone          ${NOT_STANDALONE.size}`);
console.log(`  classified nouns          ${Object.keys(classes).length}`);
console.log(`  frame rules               ${FRAMES.length}`);
console.log(`  taught words read         ${vocabulary.words.length.toLocaleString('en')}`);
console.log(`  bank items read           ${(bank.items ?? bank).length.toLocaleString('en')}`);
console.log(`  contextual sentences composed  ${contexts.length * 4}`);

if (findings.length === 0) {
  console.log('\nnothing a learner can reach at random is unsafe, as a word or as a sentence.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const [kind, count] of byKind) console.log(`  ${count} ${kind}`);
  for (const finding of findings.slice(0, 40)) {
    console.log(`  ${finding.kind.padEnd(11)} ${finding.where.padEnd(28)} ${finding.detail}`);
  }
}

if (CHECK && findings.length > 0) process.exit(1);
