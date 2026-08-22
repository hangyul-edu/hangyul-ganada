#!/usr/bin/env node
/**
 * The Vocabulary Level Test's item bank.
 *
 *   node scripts/content/build_level_test.mjs
 *   node scripts/content/build_level_test.mjs --check
 *
 * Stage two. `build_level_test.py` ranks the anchors — every word the test may
 * ask about, with the level its corpus frequency puts it at — and this turns
 * them into questions.
 *
 * ## Why the split
 *
 * Because building a *context* item means conjugating a verb, and there is one
 * conjugator in this repository: `@hangyul-ganada/korean-morphology`, in
 * TypeScript, because the word cards and the dictionary need it at runtime. A
 * second implementation in Python would be a second answer to the same
 * question, and the two would disagree on the day somebody fixed one of them.
 *
 * ## The item this file exists to stop shipping
 *
 * The previous bank asked:
 *
 *     천천히 ____ 주세요.
 *     돌보다 · 말씀하다 · 수고하다 · 털다
 *
 * Two things are wrong with it and they are independent.
 *
 * **The options are dictionary forms in a slot that needs a conjugated one.**
 * 말씀하다 cannot go in front of 주세요; 말씀해 can. A learner who knows the
 * word still cannot answer, and one who does not can sometimes answer anyway by
 * reading the grammar — which is the opposite of what a vocabulary test is for.
 *
 * **The context constrains nothing.** 천천히 is an adverb. "Slowly ____ please"
 * accepts 말씀해, 읽어, 걸어 and a dozen more. A placement test with two right
 * answers measures nothing.
 *
 * So: every option is conjugated into the *same* form as the answer, and a
 * sentence that does not contain a particle-marked argument is not used at all.
 * `scripts/level-test-ambiguity-qa.mjs` re-checks both from the finished bank.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { conjugate, FORMS, stemOf } from '../../packages/korean-morphology/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ANCHORS = join(ROOT, 'content-cache', 'level-test-anchors.json');
const OUT = join(ROOT, 'apps', 'web', 'public', 'level-test');
const CHECK = process.argv.includes('--check');

/** Four options, one right. */
const OPTIONS = 4;
/** How far from the item's own level a distractor may be drawn. */
const SPREAD = 2;
/** Items kept per level per kind. Enough that a sitting never repeats one. */
const PER_LEVEL_PER_KIND = 60;

/**
 * The particles that make a noun an argument of the verb.
 *
 * This list is the whole of the context-quality rule, so it is worth saying
 * what it is doing. A sentence constrains its verb through the things the verb
 * acts on: 국을 ____ (soup, so 끓여요 and not 걸어요), 편지를 ____ (a letter, so
 * 써요). An adverb does not: 천천히 ____ leaves everything open. Requiring a
 * particle-marked noun somewhere in the sentence is a cheap, checkable stand-in
 * for "there is enough here to pin the meaning down".
 *
 * Subjects and datives are deliberately **not** in the list, and finding that
 * out cost a bank. A first version accepted any particle and produced
 * 선생님께 ____ with 인사했어요 as the answer and 답했어요 among the wrong ones —
 * both of which are things one does 선생님께 — and 아이가 ____ with four
 * adjectives, all of which a child can be. What pins a verb down is the thing
 * it acts *on*, so a sentence whose only argument is its subject is not used.
 */
const ARGUMENT_PARTICLE = /[가-힣]{1,6}(을|를|에서|에|으로|로|와|과|랑)(\s|$)/;

const anchorFile = JSON.parse(readFileSync(ANCHORS, 'utf8'));
const LEVELS = anchorFile.levels;
const anchors = anchorFile.anchors;

/** Deterministic: the same corpus must produce the same bank, twice. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const STOP = new Set([
  'to', 'a', 'an', 'the', 'be', 'is', 'of', 'in', 'on', 'at', 'or', 'and', 'for', 'with',
  'something', 'someone', 'one', 'it', 'that', 'this', 'do', 'make', 'get', 'have',
]);

function contentWords(gloss) {
  return new Set(
    gloss
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );
}

/** Two glosses that share a content word are two ways of saying one thing. */
function sharesMeaning(a, b) {
  const left = contentWords(a);
  for (const word of contentWords(b)) if (left.has(word)) return true;
  return false;
}

/** The particle-marked nouns in a sentence — what the verb is acting on. */
function arguments_(sentence) {
  const out = new Set();
  for (const match of sentence.matchAll(/([가-힣]{1,6})(을|를|이|가|은|는|에게|한테|께|에서|에|으로|로|와|과|랑)(\s|$)/g)) {
    out.add(match[1]);
  }
  return out;
}

const byLevel = new Map();
for (const anchor of anchors) {
  const list = byLevel.get(anchor.level) ?? [];
  list.push(anchor);
  byLevel.set(anchor.level, list);
}

function pool(level) {
  const out = [];
  for (let l = level - SPREAD; l <= level + SPREAD; l += 1) out.push(...(byLevel.get(l) ?? []));
  return out;
}

/**
 * Which of the generated forms this word's example sentence actually uses.
 *
 * Null when the sentence uses an ending the conjugator does not generate —
 * 연락할게요, 오래된 — and the item is skipped rather than guessed at. There are
 * plenty of sentences; there is no reason to build a question on a form this
 * code cannot put the distractors into.
 */
function formOfSurface(anchor) {
  const shape = { partOfSpeech: anchor.pos };
  for (const form of FORMS) {
    if (conjugate(anchor.word, form, shape) === anchor.surface) return form;
  }
  return null;
}

const random = rng(20260822);
const items = [];
const rejected = { weakContext: 0, noForm: 0, noDistractors: 0, sharedArgument: 0 };

for (const anchor of anchors) {
  const level = anchor.level;
  const others = pool(level).filter((other) => other.id !== anchor.id && other.pos === anchor.pos);

  // --- Korean shown, meaning chosen -----------------------------------------
  const glosses = [];
  for (const other of shuffled(others, random)) {
    if (glosses.length === OPTIONS - 1) break;
    if (other.gloss === anchor.gloss || glosses.includes(other.gloss)) continue;
    if (sharesMeaning(other.gloss, anchor.gloss)) continue;
    glosses.push(other.gloss);
  }
  if (glosses.length === OPTIONS - 1) {
    items.push({
      id: `${anchor.id}:meaning`,
      kind: 'meaning',
      level,
      prompt: anchor.word,
      answer: anchor.gloss,
      options: [anchor.gloss, ...glosses].sort(),
    });
  }

  // --- Meaning shown, Korean chosen ------------------------------------------
  const koreans = [];
  for (const other of shuffled(others, random)) {
    if (koreans.length === OPTIONS - 1) break;
    if (other.word === anchor.word || koreans.includes(other.word)) continue;
    if (sharesMeaning(other.gloss, anchor.gloss)) continue;
    koreans.push(other.word);
  }
  if (koreans.length === OPTIONS - 1) {
    items.push({
      id: `${anchor.id}:produce`,
      kind: 'produce',
      level,
      prompt: anchor.gloss,
      answer: anchor.word,
      options: [anchor.word, ...koreans].sort(),
    });
  }

  // --- The word in a sentence -------------------------------------------------
  if (!anchor.example || !anchor.surface || !anchor.example.includes(anchor.surface)) continue;
  /*
   * Nouns, verbs and adjectives only.
   *
   * A determiner or an adverb in a blank is a question about style rather than
   * about vocabulary: "____ 친구를 만났어요" takes 오랜 (an old friend) and 여러
   * (several friends) equally well, and a learner who knows both words still
   * cannot choose. The other three parts of speech are the ones a sentence's
   * arguments actually constrain.
   */
  if (!['noun', 'verb', 'adjective'].includes(anchor.pos)) continue;

  const blanked = anchor.example.replace(anchor.surface, '____');
  const rest = blanked.replace('____', ' ');
  if (!ARGUMENT_PARTICLE.test(rest)) {
    // "천천히 ____ 주세요." Nothing here says which verb. "선생님께 ____."
    // has a particle and still says nothing about which verb.
    rejected.weakContext += 1;
    continue;
  }
  // Three eojeol including the blank: two words of context, which is the
  // shortest amount that has ever pinned a verb down.
  if (blanked.trim().split(/\s+/).filter(Boolean).length < 3) {
    rejected.weakContext += 1;
    continue;
  }

  const inflects = anchor.pos === 'verb' || anchor.pos === 'adjective';
  let surfaces = null;
  if (inflects) {
    const form = formOfSurface(anchor);
    if (!form) {
      rejected.noForm += 1;
      continue;
    }
    surfaces = { form };
  }

  const mine = arguments_(anchor.example);
  const choices = [];
  /*
   * Curated words first.
   *
   * The anchor pool is ranked by corpus frequency and the dictionary half of it
   * is not curated, so a rare verb that happens to be spelled like a common
   * particle lands at a low level: 마다, "to smash", ranks with level-1
   * vocabulary because 마다 is also the suffix meaning "every". As a distractor
   * it produced 맜어요 — impeccable morphology, and a string no learner has met
   * or will. Teaching-corpus words are hand-picked for being worth knowing, so
   * they go first and the dictionary fills in only when they run out.
   */
  const ranked = shuffled(others, random).sort(
    (a, b) => (a.source === 'corpus' ? 0 : 1) - (b.source === 'corpus' ? 0 : 1),
  );
  for (const other of ranked) {
    if (choices.length === OPTIONS - 1) break;
    if (other.id === anchor.id) continue;
    if (sharesMeaning(other.gloss, anchor.gloss)) continue;
    /*
     * A distractor from the same semantic category is the one most likely to
     * fit the sentence too. 내밀다 and 뻗다 are both *actions of the hand* and
     * both make "손을 ____" true; their English glosses do not share a word, so
     * the gloss guard above lets them through and this catches them. The
     * categories are the ones the browse screen uses, computed by
     * `scripts/content/categories.py` from the taught sense.
     */
    if (anchor.category && other.category === anchor.category) continue;
    let surface;
    if (inflects) {
      if (!stemOf(other.word)) continue;
      surface = conjugate(other.word, surfaces.form, { partOfSpeech: other.pos });
      if (!surface) continue;
    } else {
      surface = other.word;
    }
    if (surface === anchor.surface || choices.some((c) => c.surface === surface)) continue;
    // Already in the sentence, so substituting it would repeat a word.
    if (anchor.example.includes(surface)) continue;
    /*
     * The collocation guard, and the only one a machine can actually make.
     *
     * If the distractor's own hand-written example acts on the same noun this
     * sentence does — both about 밥, both about 편지 — then the distractor
     * plausibly fits this sentence too, and the question has two answers. It is
     * evidence from the editorial pack rather than a judgement about Korean,
     * which is the only kind of evidence available here.
     */
    if (other.example && [...arguments_(other.example)].some((noun) => mine.has(noun))) {
      rejected.sharedArgument += 1;
      continue;
    }
    choices.push({ surface, gloss: other.gloss, id: other.id });
  }
  if (choices.length !== OPTIONS - 1) {
    rejected.noDistractors += 1;
    continue;
  }

  items.push({
    id: `${anchor.id}:context`,
    kind: 'context',
    level,
    prompt: blanked,
    answer: anchor.surface,
    options: [anchor.surface, ...choices.map((c) => c.surface)].sort(),
    /* Kept so the ambiguity check can reason about the item without the corpus. */
    lemma: anchor.word,
    senseId: anchor.senseId ?? anchor.id,
    form: surfaces?.form ?? 'noun',
    distractorIds: choices.map((c) => c.id),
  });
}

/** Thin each level, keeping a spread rather than a prefix. */
const kept = [];
for (let level = 1; level <= LEVELS; level += 1) {
  for (const kind of ['meaning', 'produce', 'context']) {
    const band = items.filter((item) => item.level === level && item.kind === kind);
    if (band.length <= PER_LEVEL_PER_KIND) {
      kept.push(...band);
      continue;
    }
    const step = band.length / PER_LEVEL_PER_KIND;
    for (let i = 0; i < PER_LEVEL_PER_KIND; i += 1) kept.push(band[Math.floor(i * step)]);
  }
}

const perLevel = {};
const perKind = {};
for (const item of kept) {
  perLevel[item.level] = (perLevel[item.level] ?? 0) + 1;
  perKind[item.kind] = (perKind[item.kind] ?? 0) + 1;
}

const bank = {
  _comment:
    'GENERATED by scripts/content/build_level_test.mjs from content-cache/level-test-anchors.json. ' +
    'The Vocabulary Level Test item bank — separate from the learning corpus, fetched at runtime, ' +
    'never scheduled and never counted as progress.',
  levels: LEVELS,
  options: OPTIONS,
  items: kept,
  perLevel,
};

const rendered = `${JSON.stringify(bank)}\n`;
const digest = createHash('sha256').update(rendered).digest('hex').slice(0, 8);
const name = `bank-${digest}.json`;
const manifest = {
  _comment:
    'GENERATED by scripts/content/build_level_test.mjs. `bank` names a content-hashed file, so ' +
    'the offline worker can cache it for good.',
  levels: LEVELS,
  options: OPTIONS,
  items: kept.length,
  bank: name,
  perLevel,
};
const files = { [name]: rendered, 'manifest.json': `${JSON.stringify(manifest)}\n` };

const stale = [];
for (const [filename, text] of Object.entries(files)) {
  const target = join(OUT, filename);
  if (!existsSync(target) || readFileSync(target, 'utf8') !== text) {
    stale.push(filename);
    if (!CHECK) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(target, text);
    }
  }
}
if (existsSync(OUT)) {
  for (const orphan of readdirSync(OUT)) {
    if (!(orphan in files)) {
      stale.push(`${orphan} (removed)`);
      if (!CHECK) unlinkSync(join(OUT, orphan));
    }
  }
}

const counts = Object.values(perLevel);
console.log(`Level test bank — ${kept.length.toLocaleString('en')} items across ${LEVELS} levels\n`);
console.log(`  per level   min ${Math.min(...counts)}, max ${Math.max(...counts)}`);
console.log(
  `  kinds       ${['meaning', 'produce', 'context']
    .map((kind) => `${kind} ${(perKind[kind] ?? 0).toLocaleString('en')}`)
    .join(', ')}`,
);
console.log(`  size        ${(rendered.length / 1024).toFixed(0)} kB raw`);
console.log('\n  context sentences rejected:');
console.log(`    ${rejected.weakContext.toLocaleString('en')}  nothing in the sentence pins the meaning down`);
console.log(`    ${rejected.noForm.toLocaleString('en')}  the sentence uses an ending the conjugator does not generate`);
console.log(`    ${rejected.noDistractors.toLocaleString('en')}  fewer than three usable distractors`);
console.log(`    ${rejected.sharedArgument.toLocaleString('en')}  a distractor acts on the same noun, so it would fit too`);

const thin = [];
for (let level = 1; level <= LEVELS; level += 1) {
  if ((perLevel[level] ?? 0) < 30) thin.push(level);
}
if (thin.length) console.log(`\n  levels with fewer than 30 items: ${thin.join(', ')}`);

if (CHECK && stale.length) {
  console.error(`\nstale: ${stale.join(', ')} — run \`npm run content:leveltest\``);
  process.exit(1);
}
if (stale.length) console.log(`\nwrote ${stale.length} file(s) to ${relative(ROOT, OUT)}`);
else console.log('\nbank up to date');
