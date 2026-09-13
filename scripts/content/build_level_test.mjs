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

import { evaluateSurface, isBlocked, POLICY_VERSION, verdictOf } from '../../packages/content-safety/src/index.ts';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyse, conjugate, FORMS, finalOf, hasFinal, stemOf } from '../../packages/korean-morphology/src/index.ts';
import {
  GENERAL_VERBS,
  consumableWords,
  isActivityNoun,
  isAgentSubjectFrame,
  isConsumptionObjectFrame,
  isHadaFrame,
  isOpenEvaluativeFrame,
  isUnconstrainedPredicateFrame,
  personNouns,
} from '../lib/level-test-rules.mjs';

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

/*
 * The learner-safety layer, and the coarse noun classes it needs.
 *
 * Two of the four rules a word list cannot express. 미아 is *a lost child* and
 * 바나나's sentence is 아침에 ____를 하나 먹어요, so substituting one into the
 * other produced 아침에 미아를 하나 먹어요 — I eat a lost child for breakfast.
 * 그분 is *that person* and 약's sentence ends 드세요, which gave 밥을 먹고
 * 그분을 드세요. Every word involved is innocent and the sentences are not, so
 * the check has to run on the composition and know that 미아 and 그분 are people.
 *
 * The other tier is words that are fine as words and wrong alone in a slot:
 * 년 is the counter for years, and 년이 요리를 해요 reads as an insult.
 */
const SAFETY = JSON.parse(
  readFileSync(join(ROOT, 'content', 'vocabulary', 'learner-safety.json'), 'utf8'),
);
const NOUN_CLASS_FILE = JSON.parse(
  readFileSync(join(ROOT, 'content', 'vocabulary', 'noun-classes.json'), 'utf8'),
);
const NOUN_CLASSES = NOUN_CLASS_FILE.classes;
/** People, for the agent-subject frame rule. See `isAgentSubjectFrame`. */
const PERSON_NOUNS = personNouns(NOUN_CLASSES);
/**
 * Reviewed pairs that may not meet, however the draw falls.
 *
 * `content/vocabulary/answer-conflicts.json` — sixteen pairs found by reading
 * the shipped bank rather than by a rule, because what they share is a
 * selectional class the pack does not record. Symmetric, so it is stored as a
 * set of both orderings and looked up once.
 */
const ANSWER_CONFLICTS = (() => {
  const file = JSON.parse(
    readFileSync(join(ROOT, 'content', 'vocabulary', 'answer-conflicts.json'), 'utf8'),
  );
  const set = new Set();
  for (const pair of file.pairs) {
    set.add(`${pair.a}\u0000${pair.b}`);
    set.add(`${pair.b}\u0000${pair.a}`);
  }
  return set;
})();
const conflicts = (a, b) => ANSWER_CONFLICTS.has(`${a}\u0000${b}`);
/** Classes that compete with each other as well as with themselves. */
const CLASS_CONFLICTS = NOUN_CLASS_FILE.conflicts.groups;
function classesCompete(a, b) {
  if (a.some((kind) => b.includes(kind))) return true;
  return CLASS_CONFLICTS.some(
    (group) => a.some((kind) => group.includes(kind)) && b.some((kind) => group.includes(kind)),
  );
}
const NOT_STANDALONE = new Set(
  Object.entries(SAFETY.notStandalone)
    .filter(([name]) => name !== '_comment')
    .flatMap(([, terms]) => terms),
);
/**
 * Terms that may not be put in front of a learner at all, in any slot.
 *
 * The builder had no idea this list existed. `notStandalone` was consulted and
 * `excluded` was not, so the only thing standing between the coarsest words in
 * Korean and a multiple-choice option was `content-safety-qa.mjs` noticing
 * afterwards — which it did, twice, for 닥쳐.
 *
 * 닥쳐 is how the list gets in. 닥치다 is an ordinary verb meaning for a
 * deadline to draw near, and nothing about the entry is unsafe; but the
 * infinitive slot asks for 닥쳐, and 닥쳐 standing alone is not a conjugation, it
 * is *shut up*. An inflected form can be a word the corpus never contains, so
 * checking the headword — which is what every other guard here does — cannot
 * see it. This checks the surface actually printed.
 *
 * The list is no longer a list. `excluded` in `learner-safety.json` held
 * 섹스 and compared whole headwords, so 섹스하다 walked past it into a
 * level-12 question. Every surface is now read through the child-safe content
 * policy (`packages/content-safety`), as an *option* — which is a random
 * surface, so CONTEXT_BLOCK words (사망, 무덤) are refused here too — and the
 * same evaluator reads the finished items again before they are written.
 */
const excluded = (surface) => isBlocked(surface, 'ko', 'option', { random: true });
/** Conjugated surfaces of every predicate a frame rule names. */
const FRAME_RULES = SAFETY.frames.rules.map((rule) => ({
  forbid: rule.forbidObject,
  surfaces: rule.predicates.flatMap((predicate) => {
    const forms = new Set([predicate]);
    for (const form of FORMS) {
      const value = conjugate(predicate, form, { partOfSpeech: 'verb' });
      if (value) forms.add(value);
    }
    return [...forms].filter((f) => f.length >= 2);
  }),
}));

/** Whether putting `surface` in this sentence's blank composes something unsafe. */
function unsafeInFrame(blanked, surface) {
  // The composed sentence itself, through the policy: 넘어진 아이를 괴롭혔어요
  // is two innocent words and one sentence a beginner must not be shown.
  if (isBlocked(blanked.replace('____', surface), 'ko', 'sentence', { random: true })) return true;
  const kinds = NOUN_CLASSES[surface];
  if (!kinds) return false;
  const at = blanked.indexOf('____');
  if (at < 0) return false;
  const rest = blanked.slice(at + 4);
  // Object position only. As a subject a person noun is ordinary.
  if (!/^(을|를)/.test(rest)) return false;
  return FRAME_RULES.some(
    (rule) =>
      rule.forbid.some((kind) => kinds.includes(kind)) &&
      rule.surfaces.some((form) => rest.includes(form)),
  );
}

/**
 * Verbs of going, for the destination rule.
 *
 * Deliberately short and named rather than pattern-matched: a rule that
 * deletes every 에-slot in the bank would be worse than the items it removes.
 */
const DESTINATION_VERBS = new Set(['가다', '오다', '다니다', '들어가다', '들어오다', '나가다', '나오다']);

/** Verbs of existing, appearing and being plentiful — see the frame rule. */
const EXISTENTIAL_VERBS = new Set([
  '있다', '없다', '많다', '적다', '생기다', '나오다', '나다', '보이다', '들리다',
]);

/**
 * The particle allomorph pairs, consonant form first.
 *
 * Module scope rather than inside the build loop, because the curated items at
 * the end of this file check agreement against the same table. Two copies of
 * this list would be two answers to which form 으로 takes.
 */
const PARTICLE_PAIRS = [
  ['은', '는'], ['이', '가'], ['을', '를'], ['과', '와'], ['으로', '로'],
  ['이나', '나'], ['이랑', '랑'], ['아', '야'], ['이에요', '예요'],
];

const anchorFile = JSON.parse(readFileSync(ANCHORS, 'utf8'));
const LEVELS = anchorFile.levels;
const anchors = anchorFile.anchors;
/** Every lemma the ranking knows, so `축구하다` can be looked up from `축구`. */
const LEMMAS = new Set(anchors.map((anchor) => anchor.word));
/**
 * Everything that can be swallowed, for the rule in `isConsumptionObjectFrame`.
 *
 * The `food` category is most of it; the class file supplies what the category
 * files elsewhere — 약 sits under body-health because that is the shelf a
 * learner looks on for it.
 */
const CONSUMABLES = consumableWords(anchors, NOUN_CLASSES);

/**
 * Dictionary anchors whose *rank* belongs to a different word.
 *
 * Every anchor is levelled by the frequency of its own spelling. For a
 * dictionary headword that is the only evidence there is, and it silently
 * becomes the wrong evidence whenever the spelling is also an inflected form of
 * something else — because the frequency measure folds verbs and adjectives to
 * their stems, so every occurrence of 위하다 in the corpus counts toward the
 * *noun* 위해 that Wiktionary glosses as "harm".
 *
 * That is what put 위해 at level 1 with "harm" as the correct answer, 그래 at
 * level 1 with "like this", 좋아요 at level 2 with "like" and 보고 at level 2
 * with "report". Each is a real dictionary entry; none of them earned its rank.
 *
 * `analyse` settles it exactly rather than by pattern. It guesses a dictionary
 * form from the shape of the surface and then **conjugates the guess back**,
 * keeping only guesses that round-trip — so a surface it reports on genuinely
 * is a form of a lemma this bank knows, and the rank is genuinely contaminated.
 * There is one conjugator in this repository and this uses it; a second
 * implementation of Korean morphology would be a second answer to the question.
 *
 * Only dictionary anchors are tested. A taught word carries the level the
 * curriculum gave it, so a collision cannot mislevel it — and 자다 is a taught
 * word whose surface is also a suffix, which a rule applied to both halves would
 * have thrown away.
 */
const isKnownLemma = (lemma) => LEMMAS.has(lemma);
function borrowsItsRank(anchor) {
  if (anchor.source !== 'dictionary') return null;
  const [reading] = analyse(anchor.word, isKnownLemma);
  return reading ? `${reading.lemma}/${reading.form}` : null;
}

/*
 * The verified relation graph, used here to keep a word away from its own
 * synonym and its own antonym.
 *
 * A synonym in the options is two right answers by definition. An antonym is
 * subtler and just as bad: 불을 켜 주세요 and 불을 꺼 주세요 are both ordinary
 * requests, so a sentence built around one of them never rules out the other.
 * Both relations are in `content/vocabulary/relations.json`, and both are only
 * there because two Wiktionary headwords state them about the sense this app
 * teaches — so this is evidence rather than similarity.
 */
const RELATED = new Map();
{
  const graph = JSON.parse(
    readFileSync(join(ROOT, 'apps', 'web', 'src', 'data', 'generated', 'relations.json'), 'utf8'),
  ).entries;
  for (const [id, entry] of Object.entries(graph)) {
    RELATED.set(id, new Set([...(entry.synonyms ?? []), ...(entry.antonyms ?? [])]));
  }
}

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

/**
 * The lemma of the sentence's final predicate, or null.
 *
 * Used to tell two frames apart that differ only in their argument. `analyse`
 * guesses a dictionary form from the shape of a surface and conjugates the
 * guess back, keeping only guesses that round-trip, so this is the same
 * morphology the rest of the build uses rather than a second answer to it.
 */
const PREDICATE_CACHE = new Map();
function predicateOf(sentence) {
  if (!sentence) return null;
  if (PREDICATE_CACHE.has(sentence)) return PREDICATE_CACHE.get(sentence);
  const eojeol = sentence.replace(/[.?!]+$/u, '').trim().split(/\s+/).filter(Boolean);
  const last = eojeol[eojeol.length - 1] ?? '';
  const [reading] = analyse(last, isKnownLemma);
  const value = reading ? reading.lemma : null;
  PREDICATE_CACHE.set(sentence, value);
  return value;
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

/**
 * Every taught word's meaning, in every language, before a single item is built.
 *
 * ## The defect this exists for
 *
 * A distractor was rejected when its **English** gloss was the answer's, or
 * shared a content word with it. That is the right rule read in one language,
 * and thirty-one learners are reading a different one. Fifteen items shipped
 * with two options that render as the *same string* somewhere:
 *
 * | item | language | what the learner saw |
 * | --- | --- | --- |
 * | 좋다 | Turkish | *iyi olmak* · kısa olmak · **iyi olmak** · istemek |
 * | 정확히 | Uzbek | ehtimol · qachondir · **aniq** · **aniq** |
 * | 귀엽다 | German | **schwer sein** · süß sein · **schwer sein** · billig sein |
 * | 택시 | Ukrainian | **село** · **село** · мить · таксі |
 *
 * The last two are the shape that matters: 확실히 and 정확히 are *definitely*
 * and *exactly* in English and one word in Uzbek, so an Uzbek learner met a
 * question with two identical correct answers and no way to pass it. Nothing
 * caught this, because everything that read the options read them in English.
 *
 * So the collision test runs over every language a meaning exists in, and a
 * distractor that collides anywhere is not used anywhere. That is deliberately
 * stricter than it has to be — the item would have been fine in the other
 * thirty-one — and it is the right trade: the alternative is a per-language
 * bank, and the bank is one artefact that every language shares.
 */
const MEANINGS_BY_LOCALE = (() => {
  const generated = join(ROOT, 'apps', 'web', 'src', 'data', 'generated');
  const vocabulary = JSON.parse(readFileSync(join(generated, 'vocabulary.json'), 'utf8'));
  const ids = vocabulary.words.map((word) => word.id);
  const out = new Map();
  for (const locale of vocabulary.locales) {
    const rows = JSON.parse(
      readFileSync(join(generated, `vocabulary.${locale}.json`), 'utf8'),
    ).words;
    const table = new Map();
    rows.forEach((row, index) => {
      const meaning = row?.[0]?.trim();
      if (meaning) table.set(ids[index], meaning);
    });
    out.set(locale, table);
  }
  /*
    English also carries the dictionary anchors, and it has to.

    `collideInAnyLocale` compares meanings, and it silently passed every pair in
    which either side was a dictionary headword — because this map was built
    from the taught corpus and dictionary glosses are not in it, so the lookup
    missed and the check returned "no collision". The audit that reads the
    finished bank found what that let through: `데모` shipped offering *demo ·
    personality · feedback · a personality*, two of which are the same answer.

    Dictionary glosses exist in English only, which is why this is one language
    rather than thirty-two — and one language is where the gap was.
  */
  const english = out.get('en');
  if (english) {
    for (const anchor of anchors) {
      if (anchor.source === 'dictionary' && anchor.gloss) english.set(anchor.id, anchor.gloss);
    }
  }
  return out;
})();

/**
 * Meanings folded to what a learner would read as the same answer.
 *
 * Case, surrounding punctuation and a leading article or infinitive marker are
 * removed, because "a boat" against "boat" is not a distinction a vocabulary
 * question is measuring — it is two right answers with different typography.
 */
function foldMeaning(text) {
  return text
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/^(to|a|an|the)\s+/u, '')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Whether two anchors read as the same meaning in any language that has both. */
function collideInAnyLocale(a, b) {
  for (const table of MEANINGS_BY_LOCALE.values()) {
    const left = table.get(a);
    const right = table.get(b);
    if (!left || !right) continue;
    if (foldMeaning(left) === foldMeaning(right)) return true;
  }
  return false;
}

const random = rng(20260822);
const items = [];
/** Validated gap-fills for taught words, for the rest of the product. */
const cloze = {};
const rejected = {
  borrowedRank: 0,
  weakContext: 0,
  noForm: 0,
  noDistractors: 0,
  collidingMeaning: 0,
  sharedArgument: 0,
  generalVerb: 0,
  activityNoun: 0,
  sharedPrompt: 0,
  related: 0,
  implausible: 0,
  sharedPredicate: 0,
  everyOptionFits: 0,
  bareModifier: 0,
};

/** Whether the graph records the two as synonyms or antonyms, either way round. */
function isRelated(a, b) {
  return Boolean(RELATED.get(a)?.has(b) || RELATED.get(b)?.has(a));
}

const borrowed = [];
for (const anchor of anchors) {
  const lender = borrowsItsRank(anchor);
  if (lender) {
    rejected.borrowedRank += 1;
    borrowed.push(`${anchor.word} (L${anchor.level}, ${lender}) "${anchor.gloss}"`);
    continue;
  }
  const level = anchor.level;
  const others = pool(level).filter((other) => other.id !== anchor.id && other.pos === anchor.pos);

  // --- Korean shown, meaning chosen -----------------------------------------
  const chosen = [];
  for (const other of shuffled(others, random)) {
    if (chosen.length === OPTIONS - 1) break;
    if (other.gloss === anchor.gloss || chosen.some((c) => c.gloss === other.gloss)) continue;
    if (sharesMeaning(other.gloss, anchor.gloss)) continue;
    // Two glosses that the dictionary says mean the same thing are two right
    // answers however differently they are worded. See `RELATED`.
    if (isRelated(anchor.id, other.id)) continue;
    // …and two that are different in English and identical in Uzbek are two
    // right answers for a learner reading Uzbek. See `collideInAnyLocale`.
    if ([anchor, ...chosen].some((option) => collideInAnyLocale(option.id, other.id))) {
      rejected.collidingMeaning += 1;
      continue;
    }
    chosen.push(other);
  }
  if (chosen.length === OPTIONS - 1) {
    /*
      Ids, not English.

      This item used to carry `answer: "to divide, to share"` and three more
      English strings, and every one of the thirty-two languages rendered them
      verbatim: a Korean learner was asked 나누다 and offered *to divide, to
      share* / *to do wrong* / *to gather*. The bank had made English the
      canonical object, so no amount of interface translation could reach it.

      What is language-neutral stays here — the Korean headword, which is what
      the question is *about* — and what is a meaning becomes an anchor id that
      `meanings-<locale>.json` resolves at render time. §4.
    */
    items.push({
      id: `${anchor.id}:meaning`,
      kind: 'meaning',
      level,
      prompt: anchor.word,
      answerId: anchor.id,
      optionIds: [anchor.id, ...chosen.map((other) => other.id)].sort(),
    });
  }

  // --- Meaning shown, Korean chosen ------------------------------------------
  const koreans = [];
  for (const other of shuffled(others, random)) {
    if (koreans.length === OPTIONS - 1) break;
    if (other.word === anchor.word || koreans.includes(other.word)) continue;
    if (sharesMeaning(other.gloss, anchor.gloss)) continue;
    if (isRelated(anchor.id, other.id)) continue;
    /*
      The same rule, and it bites harder here. A produce item shows one meaning
      and asks for the Korean, so a distractor that means the same thing as the
      *prompt* in some language is a second correct answer to the question as
      that learner reads it — 좋다 offered against 괜찮다 under the Turkish
      prompt *iyi olmak*.
    */
    if (collideInAnyLocale(anchor.id, other.id)) {
      rejected.collidingMeaning += 1;
      continue;
    }
    koreans.push(other.word);
  }
  if (koreans.length === OPTIONS - 1) {
    // The mirror of the above: here the *prompt* is the meaning, so it is the
    // id, and the options are Korean words and stay as they are.
    items.push({
      id: `${anchor.id}:produce`,
      kind: 'produce',
      level,
      promptId: anchor.id,
      answer: anchor.word,
      options: [anchor.word, ...koreans].sort(),
    });
  }

  // --- The word in a sentence -------------------------------------------------
  if (!anchor.example || !anchor.surface || !anchor.example.includes(anchor.surface)) continue;
  /*
   * A teaching example that has been read and refused as a gap-fill.
   *
   * The two are different assets. 힘찬 목소리로 말했어요 is the right sentence on
   * 힘차다's card and an unanswerable question, because 활기찬 목소리 and 공손한
   * 목소리 are also things people say. `ctx: 0` on the pack row is that judgement
   * written down, and the word keeps its meaning and produce items.
   */
  if (anchor.context_ok === false) {
    rejected.refusedAsContext = (rejected.refusedAsContext ?? 0) + 1;
    continue;
  }
  /*
   * A blank followed by 님 can never have three good distractors.
   *
   * ____님이 강의를 하세요 was keyed 교수 and offered 서울, 정상 and 최대한, so
   * the screen read 서울님, 정상님, 최대한님 — none of them words. 님 attaches to
   * people and to nothing else, which is the same shape as the particle problem:
   * the suffix is baked into the frame and hands the answer to anybody who knows
   * what 님 is for.
   *
   * Requiring person distractors would fix the grammar and break the item a
   * different way, because a frame that wants a person accepts any person. So
   * the sentence keeps its place on the card and stops being a question.
   */
  if (/^님/.test(anchor.example.slice(anchor.example.indexOf(anchor.surface) + anchor.surface.length))) {
    rejected.honorificSuffixFrame = (rejected.honorificSuffixFrame ?? 0) + 1;
    continue;
  }
  const blanked = anchor.example.replace(anchor.surface, '____');
  const rest = blanked.replace('____', ' ');
  /*
   * Which particle allomorph the blank is followed by, if any.
   *
   * The sentence is authored with its particle already attached — ____는 회사에
   * 가요 — and the options are bare words dropped into the gap. So a distractor
   * whose last syllable ends in a consonant lands in front of 는 and produces
   * 거짓말는, which is not Korean, and 197 composed sentences across 113 items
   * looked like that. None of them was ever the keyed answer, which is worse
   * than it sounds: it means a quarter of the contextual bank could be answered
   * by picking the option whose particle agreed, without reading the sentence
   * or knowing a single word.
   *
   * The fix is not to rewrite the particle. §12 of the review brief is right
   * that the authored sentence is the authority and a generic repairer would
   * turn good Korean into bad. It is to require the *distractors to agree with
   * the answer*, so all four read grammatically and none of them gives the game
   * away.
   */
  /*
   * A blank glued to the syllable in front of it is inside a word.
   *
   * 삼____에 학교에 가요 asks for 월 — March — and offered 본래, 오렌지 and
   * 유니폼, so the screen read 삼본래, 삼오렌지, 삼유니폼. Nothing there is a
   * word, and a learner who has never met 삼월 can still answer.
   */
  {
    const at = blanked.indexOf('____');
    if (at > 0 && /[가-힣]/.test(blanked[at - 1])) {
      rejected.gluedToPrefix = (rejected.gluedToPrefix ?? 0) + 1;
      continue;
    }
  }
  /*
   * A noun blank glued to 하다 fails whichever way the distractor falls.
   *
   * 친구가 병원에 ____했어요 asks for 입원 and offered 반찬, 엽서 and 팝콘 —
   * 반찬했어요 is not a word, so the item is answerable without Korean. Give it
   * distractors that *are* 하다 nouns and the other failure arrives instead:
   * 시험 전에 ____했어요 asks for 긴장 and offered 연습, and 시험 전에
   * 연습했어요 is a perfectly ordinary sentence.
   */
  if (!['verb', 'adjective'].includes(anchor.pos)) {
    const at = blanked.indexOf('____');
    if (/^[하했해]/.test(blanked.slice(at + 4))) {
      rejected.gluedToHada = (rejected.gluedToHada ?? 0) + 1;
      continue;
    }
  }
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

  const afterBlank = blanked.slice(blanked.indexOf('____') + 4);
  /** True when `surface` can take the particle this sentence already carries. */
  let particleFits = () => true;
  for (const [consonantForm, vowelForm] of PARTICLE_PAIRS) {
    const takesConsonantForm = afterBlank.startsWith(consonantForm);
    const takesVowelForm = afterBlank.startsWith(vowelForm);
    if (!takesConsonantForm && !takesVowelForm) continue;
    // Longest match wins: 이에요 before 이, 으로 before 으.
    const attached =
      takesConsonantForm && (!takesVowelForm || consonantForm.length >= vowelForm.length)
        ? consonantForm
        : vowelForm;
    particleFits = (surface) => {
      const last = surface[surface.length - 1];
      if (!last) return false;
      // ㄹ takes 로, not 으로 — the one place a final behaves like a vowel.
      const wants =
        consonantForm === '으로' && finalOf(last) === 'ㄹ'
          ? vowelForm
          : hasFinal(last)
            ? consonantForm
            : vowelForm;
      return wants === attached;
    };
    break;
  }
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
  /*
   * A particle is not a constraint.
   *
   * `일곱 시에 ____.` carries 에 and so satisfied the test above, and says only
   * *when*: 일곱 시에 연습해요 is as ordinary a sentence as 일곱 시에 일어나요,
   * and a reader photographed the item with both among its four options. Four
   * more of the same shape shipped beside it. See
   * `isUnconstrainedPredicateFrame`.
   */
  /*
   * `blanked`, not `anchor.example`.
   *
   * Both of these frame tests begin `if (!sentence.includes('____')) return
   * false`, and both were being handed the sentence with the answer still in
   * it. They have therefore returned false for every item ever built. The
   * time-only rule is the fix I-185 was written for — the photographed
   * `일곱 시에 ____` — and it has never once fired; the consumption rule is
   * I-172's. Both were believed on the strength of the item disappearing from
   * the bank, and both items disappeared for another reason.
   *
   * Nothing in the two gates over this file could see it. `leveltest:ambiguity`
   * re-derives the frames from the *shipped* bank, where the prompt does carry
   * `____`, so it computed them correctly and found nothing — because the
   * distractor rule of the day was already keeping the offending options out
   * for an unrelated reason. Inverting that rule (see the subject-area comment
   * above) removed the accidental cover and four items came straight through.
   */
  if (inflects && isUnconstrainedPredicateFrame(blanked)) {
    rejected.timeOnlyFrame = (rejected.timeOnlyFrame ?? 0) + 1;
    continue;
  }
  /*
   * And a predicate that rules out no noun. `____이 마음에 들어요.` — a road, a
   * present, a bus stop. See `isOpenEvaluativeFrame`.
   */
  if (!inflects && isOpenEvaluativeFrame(blanked)) {
    rejected.openFrame = (rejected.openFrame ?? 0) + 1;
    continue;
  }
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
  /* The frame's own predicate, for the shared-predicate rule below. */
  const myPredicate = predicateOf(anchor.example);
  /* 밥을 먹고 ____을 드세요 — the blank is swallowed. See `isConsumptionObjectFrame`. */
  const eatingFrame = isConsumptionObjectFrame(blanked);
  /* 친구와 ____를 해요 — the blank is the object of 하다. */
  const hadaFrame = isHadaFrame(blanked);
  /* ____이 문을 열었어요 — the blank is a human agent. */
  const agentSubjectFrame = isAgentSubjectFrame(blanked);
  /*
   * A bare noun blank standing in front of another noun.
   *
   *     ____ 가방을 샀어요.     갈색 · 녹색 · 속도 · 흰색
   *     ____ 공항에 갔어요.     국제 · 살인 · 스포츠 · 재수
   *     ____ 위에 책이 있어요.  바지 · 선물 · 책상 · 침대
   *
   * The blank is a *modifier*, not an argument, and a modifier slot fails in
   * both directions at once. Where the options are the same kind of word it has
   * several right answers — a green bag and a white bag are both bought. Where
   * they are not, the item is decided by which option can stand in front of a
   * noun at all, which is a question about Korean syntax that a learner can
   * answer without knowing any of the four words: 살인 공항 is not a phrase, so
   * 국제 wins.
   *
   * There is no distractor set that rescues either shape, so the frame goes.
   * Nothing is lost from the *card* — 갈색 keeps its sentence — only from the
   * contextual bank, which needs a slot the sentence constrains.
   */
  if (!inflects && /^\s+[가-힣]/.test(afterBlank)) {
    rejected.bareModifier = (rejected.bareModifier ?? 0) + 1;
    continue;
  }

  /*
   * A frame whose every plausible option is a right answer.
   *
   * Three rules below refuse a *distractor*: a person where the frame wants an
   * agent, a doable noun where the verb is 하다, something swallowable where
   * the verb is 드시다. Each was written to stop a second right answer, and
   * each did — by pushing the draw outward until the three wrong options were
   * things that could not go in the slot at all:
   *
   *     ____가 그림을 그려요.   화가 · 가요 · 대화 · 소개
   *     ____가 길을 물어요.     아가씨 · 관계 · 냄새 · 상태
   *     친구와 ____를 해요.     축구 · 경기 · 배우 · 평화
   *
   * A pop song does not draw and a relationship does not ask directions. The
   * rule was doing its job and the item was still worthless, because when the
   * answer *itself* is the kind of thing the frame accepts, every plausible
   * option is a right answer and every remaining option is nonsense. There is
   * no distractor set that fixes it.
   *
   * So the frame goes, rather than the distractor. What is left of `____가
   * 노래를 해요` is a question with no wrong answer, and a bank is better
   * without it.
   */
  if (!inflects) {
    /*
     * A time noun in a 에 slot. `____에 바다에 가요` was keyed 여름 and offered
     * 월요일, and going to the sea on a Monday is not a wrong answer. The
     * sentence says *when* about an activity that can happen whenever, so every
     * word of the same kind is right — the mirror image of
     * `isUnconstrainedPredicateFrame`, which caught the version of this where
     * the *predicate* was blank.
     */
    if (anchor.category === 'time-numbers' && /^에(\s|$)/.test(afterBlank)) {
      rejected.everyOptionFits += 1;
      continue;
    }
    /*
     * The three frames whose predicate accepts the answer's whole kind, read
     * off the sentence's own verb rather than off a pattern. `predicateOf`
     * settles the lemma with the repository's conjugator, so 갔어요, 가요 and
     * 가서 are one verb and the rule does not have to list endings.
     */
    const frameVerb = myPredicate;
    /*
     * A destination. `일요일에 ____에 가요` accepts every place there is, and
     * with the plausibility rule above the three wrong options are now all
     * places — so the item has four right answers rather than one.
     */
    if (frameVerb && DESTINATION_VERBS.has(frameVerb) && /^에(\s|$)/.test(afterBlank)) {
      rejected.everyOptionFits += 1;
      continue;
    }
    /*
     * A subject slot under a verb of existing or happening. `오늘 저녁에 ____이
     * 있어요`, `그림에 ____가 있어요`, `영화에 ____이 나와요`, `교실에 ____이
     * 많아요` — a gathering, an angel, a monster and a student are each true,
     * and so is anything else of the same kind. `isOpenEvaluativeFrame` had the
     * blank-initial version of this written as two patterns; this is the same
     * rule stated about the verb, so it catches the frames that put an adjunct
     * in front of the blank.
     */
    if (frameVerb && EXISTENTIAL_VERBS.has(frameVerb) && /^(이|가|은|는)(\s|$)/.test(afterBlank)) {
      rejected.everyOptionFits += 1;
      continue;
    }
    /*
     * An object slot under a verb that takes any object at all, where the blank
     * is the sentence's *only* argument. `____을 새로 샀어요` and `생일에 받은
     * ____을 열어 봤어요` — a toothbrush, a knife, a desk and a pair of shoes
     * are all bought new, and all of them get opened.
     *
     * The condition that the blank be the only argument is what keeps this from
     * deleting the bank: `____을 씻어서 밥을 지어요` has 밥을 behind it and 밥
     * is what decides the answer, so 사다 being general does not matter there.
     * An earlier pass declined to write this rule for exactly that reason — see
     * §10.9 — and it is writable now only because the argument test makes it
     * narrow.
     */
    if (frameVerb && GENERAL_VERBS.has(frameVerb) && /^(을|를)(\s|$)/.test(afterBlank)) {
      /*
       * Only 을/를/에/에서 count here. `arguments_` also reads 으로/로, and
       * 새로 — an adverb — parses as 새 + 로, so `____을 새로 샀어요` looked as
       * though it had a second argument and kept an item with four right
       * answers. 서로, 따로 and 함부로 have the same shape.
       */
      const others = [...anchor.example.matchAll(/([가-힣]{1,6})(을|를|에서|에)(\s|$)/g)]
        .map((match) => match[1])
        .filter((noun) => noun !== anchor.surface);
      if (others.length === 0) {
        rejected.everyOptionFits += 1;
        continue;
      }
    }
    if (agentSubjectFrame && PERSON_NOUNS.has(anchor.word)) {
      rejected.everyOptionFits = (rejected.everyOptionFits ?? 0) + 1;
      continue;
    }
    if (hadaFrame && isActivityNoun(anchor.word, LEMMAS)) {
      rejected.everyOptionFits = (rejected.everyOptionFits ?? 0) + 1;
      continue;
    }
    if (eatingFrame && CONSUMABLES.has(anchor.word)) {
      rejected.everyOptionFits = (rejected.everyOptionFits ?? 0) + 1;
      continue;
    }
  }

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
    {
      /*
       * The subject-area rule, and it runs in **opposite directions** for a
       * predicate blank and a noun blank.
       *
       * ## Why it was one direction, and what that cost
       *
       * It used to forbid a shared category outright, for both. The reason was
       * sound for predicates: 내밀다 and 뻗다 are both *actions of the hand* and
       * both make `손을 ____` true, so a distractor from the answer's own
       * subject area is the one most likely to be a second right answer.
       *
       * Applied to nouns it produced this, at level 15, and a reader
       * photographed it:
       *
       *     창문으로 아침 ____이 들어와요.
       *     목적 · 비빔밥 · 빛 · 환경
       *
       * A purpose, a bibimbap and an environment do not come in through a
       * window. Nothing is being tested: three of the four options are absurd,
       * so the item is answerable by elimination without knowing what 빛 means,
       * and a learner who does know it learns nothing from being right. It was
       * not a bad draw. **Every one of the 625 contextual items in the shipped
       * bank had all three distractors from a different category than its
       * answer**, because that is what the rule required, and the further apart
       * two words are the more certainly they satisfy it. The rule was
       * selecting for absurdity.
       *
       * ## What replaces it
       *
       * For a noun blank the requirement is inverted: a distractor must share
       * the answer's category or one of its tags. `____에서 채소를 사요` then
       * offers 시장 against 도서관, 은행 and 약국 — four places, and only one of
       * them sells vegetables. That is a question about Korean.
       *
       * The obvious objection is that a plausible distractor is closer to being
       * a second right answer, and it is. Nothing here decides that: the frame
       * rules below (`isAgentSubjectFrame`, `isHadaFrame`,
       * `isConsumptionObjectFrame`, `isOpenEvaluativeFrame`), the relation
       * graph, the reviewed conflict pairs, the shared-argument rule and the
       * new shared-predicate rule remove the classes a program can see, and
       * every surviving item is then **read by a person and recorded** in
       * `content/vocabulary/context-review.json`. An item nobody has approved
       * does not ship. See `docs/CONTENT_GENERATION_AND_REVIEW_PIPELINE.md`.
       *
       * The categories are only usable for this because they were audited: the
       * same pass found 화가 filed under Body & Health and 창문 under Animals &
       * Nature. A plausibility rule reading wrong metadata is worse than no
       * rule. See `scripts/content/categories.py`.
       */
      const family = new Set([anchor.category, ...(anchor.category_tags ?? [])].filter(Boolean));
      const theirs = [other.category, ...(other.category_tags ?? [])].filter(Boolean);
      const shares = theirs.some((tag) => family.has(tag));
      if (inflects) {
        // A verb from the answer's own subject area usually fits the frame too.
        if (shares) continue;
      } else if (!shares) {
        // A noun from outside it is not a distractor, it is scenery.
        rejected.implausible = (rejected.implausible ?? 0) + 1;
        continue;
      }
    }
    /*
     * Two sentences with the same predicate, so the blank is the same slot.
     *
     * The shared-*argument* rule below catches a distractor whose own example
     * acts on the same noun. This catches the other half: 시장 and 가게 have
     * different arguments and the same verb — `____에서 채소를 사요` and
     * `____에서 우유를 샀어요` — and a shop sells vegetables as readily as a
     * market does. Where both examples end in the same lemma the frames are the
     * same frame, so the distractor fits it.
     *
     * `analyse` settles the lemma with the repository's one conjugator rather
     * than by comparing endings, so 샀어요 and 사요 are recognised as 사다.
     */
    if (!inflects && predicateOf(other.example) && predicateOf(other.example) === myPredicate) {
      rejected.sharedPredicate = (rejected.sharedPredicate ?? 0) + 1;
      continue;
    }
    /*
     * And the same *class*, which the category cannot see.
     *
     * The browse categories are topical, because that is where a learner looks
     * for a word: 의사 is filed under body-health beside 배 and 약. So the rule
     * above happily offered 의사 against 거지, and 선생님 against 형, and 아이
     * against 그녀 — and 길에 의사가 있었어요, 선생님이 밥을 사 줬어요 and
     * 아이는 노래를 잘해요 are all ordinary Korean. Reading the first fifty noun
     * items found four of these; a frame that wants a person accepts any person.
     *
     * `noun-classes.json` is the coarse layer the category is not: person,
     * animal, body part, food.
     */
    const answerClasses = NOUN_CLASSES[anchor.word];
    const otherClasses = NOUN_CLASSES[other.word];
    if (answerClasses && otherClasses && classesCompete(answerClasses, otherClasses)) {
      rejected.sameNounClass = (rejected.sameNounClass ?? 0) + 1;
      continue;
    }
    /*
     * A general verb fits any object, so it can never be ruled out by reading
     * the sentence. See `GENERAL_VERBS`.
     */
    if (isRelated(anchor.id, other.id)) {
      rejected.related += 1;
      continue;
    }
    if (inflects && GENERAL_VERBS.has(other.word)) {
      rejected.generalVerb += 1;
      continue;
    }
    /*
     * A reviewed pair that produces two right answers wherever it meets.
     * See `content/vocabulary/answer-conflicts.json`.
     */
    if (conflicts(anchor.word, other.word)) {
      rejected.reviewedConflict = (rejected.reviewedConflict ?? 0) + 1;
      continue;
    }
    /*
     * `____이 문을 열었어요.` shipped keyed 은행 with 학생 and 형 beside it, and
     * a student opening a door is not a wrong answer. An action with an object
     * accepts any human agent, whatever the keyed answer happens to be — which
     * is why this reads the *frame* and not the answer's class, exactly as the
     * consumable rule does. See `isAgentSubjectFrame`.
     */
    if (!inflects && agentSubjectFrame && PERSON_NOUNS.has(other.word)) {
      rejected.personAgent = (rejected.personAgent ?? 0) + 1;
      continue;
    }
    /*
     * 친구와 ____를 해요 took 축구 and offered 낚시 beside it, and fishing with
     * a friend is as good an answer as football. When the sentence's verb is
     * 하다 and the blank is a noun, every noun that can be *done* fits.
     */
    if (!inflects && hadaFrame && isActivityNoun(other.word, LEMMAS)) {
      rejected.activityNoun += 1;
      continue;
    }
    /*
     * 밥을 먹고 ____을 드세요 offered 물 beside the keyed 약, and both are
     * ordinary Korean. 드시다 constrains the *manner* of the object and not the
     * object, so every consumable fits the sentence equally — the same shape as
     * the 하다 rule above. This one does not consult the answer's class, which
     * is the point: 약 carried no class at all, and the class guard above only
     * fires when both words have one, so it let 물 straight through.
     */
    if (!inflects && eatingFrame && CONSUMABLES.has(other.word)) {
      rejected.consumable = (rejected.consumable ?? 0) + 1;
      continue;
    }
    let surface;
    if (inflects) {
      if (!stemOf(other.word)) continue;
      surface = conjugate(other.word, surfaces.form, { partOfSpeech: other.pos });
      if (!surface) continue;
    } else {
      surface = other.word;
    }
    if (surface === anchor.surface || choices.some((c) => c.surface === surface)) continue;
    // Never, in any slot, inflected or not — see `excluded`.
    if (excluded(surface)) {
      rejected.excludedTerm = (rejected.excludedTerm ?? 0) + 1;
      continue;
    }
    // Agrees with the particle the sentence already carries — see above.
    if (!particleFits(surface)) {
      rejected.particleMismatch = (rejected.particleMismatch ?? 0) + 1;
      continue;
    }
    // A word that is fine as a word and wrong alone in a sentence slot. Only
    // where the slot takes a noun: 채 is a counter and also 채다's infinitive.
    if (!inflects && NOT_STANDALONE.has(surface)) {
      rejected.notStandalone = (rejected.notStandalone ?? 0) + 1;
      continue;
    }
    // And the composition itself — see `unsafeInFrame`.
    if (unsafeInFrame(blanked, surface)) {
      rejected.unsafeComposition = (rejected.unsafeComposition ?? 0) + 1;
      continue;
    }
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

  /*
   * The same item, kept for the rest of the product.
   *
   * Today's Vocabulary and Review were building their own gap-fills in the
   * browser, and building them differently: `splitSentence` blanked the *stem*
   * of a verb and left its ending on screen — 빵을 ___어요 — while the four
   * options were dictionary forms, so the learner was asked to put 만들다 into a
   * slot that needed 만들. Nothing in that path knew about particle agreement,
   * about person nouns, or about which compositions are unsafe, so 여자를 안
   * 마셔요 was reachable there while the Level Test had been fixed.
   *
   * Three copies of the rules is three sets of bugs. This is the one place that
   * decides what a valid gap-fill is; everything else reads the answer.
   */
  if (anchor.source === 'corpus') {
    const at = blanked.indexOf('____');
    cloze[anchor.id] = {
      before: blanked.slice(0, at),
      target: anchor.surface,
      after: blanked.slice(at + 4),
      form: surfaces?.form ?? 'noun',
      options: [
        { id: anchor.id, surface: anchor.surface },
        ...choices.map((c) => ({ id: c.id, surface: c.surface })),
      ].sort((a, b) => a.surface.localeCompare(b.surface)),
    };
  }

  /*
   * A contextual item is levelled by its *sentence*, not by its answer.
   *
   * `level` above is the anchor's — the frequency rank of the word that was
   * removed. It says nothing about the frame the learner has to read to reach
   * it, and for 629 of 629 items it was the only thing that decided difficulty:
   * `지갑에 ____이 있어요` was level 1 with a level-9 word in it, and `물을 안
   * 줘서 화분의 꽃이 ____` was level 7 with a level-28 word, a negation and a
   * causal connective. `scripts/content/sentence_demand.py` computes the
   * frame's demand when the anchors are built, because that is where the
   * word→level table is complete; here it is read off and used.
   */
  const contextLevel = anchor.context_level ?? level;

  items.push({
    id: `${anchor.id}:context`,
    kind: 'context',
    level: contextLevel,
    /* What made it that level, so the gate and a reader can both see why. */
    demand: anchor.context_demand ?? null,
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

/*
 * Two words with the same sentence.
 *
 * 불을 ____ 주세요 was built twice, once from 끄다 and once from 켜다, and the
 * bank shipped both — the same six characters asking for opposite verbs. So
 * were 소리를 ____ 주세요 (줄이다, 낮추다), 둘에 셋을 ____ (더하다, 곱하다) and
 * eleven more. Each item is answerable on its own, because the other verb is
 * not among its four options; but the bank is its own proof that the sentence
 * does not pin the meaning down, and that is the whole requirement for a
 * contextual item. Where the evidence exists, it is used: every item sharing a
 * prompt with another goes, not just the later one.
 */
/*
 * The hand-written items, held to the same rules as the generated ones.
 *
 * ## Why there are any
 *
 * The frame rules above removed 174 contextual items, and they were right to:
 * every one of them was answerable by elimination, had a second right answer,
 * or both. What went with them was the *beginner band*. A contextual item needs
 * a sentence with an argument in it and a predicate that rules something out,
 * and a level-2 sentence is three words long — so after the pass only 15 of the
 * taught words below level 6 kept an item, down from 50, and Today's Vocabulary
 * and Review lost the gap-fill exercise almost entirely for a new learner. The
 * `context` mode simply stopped being offered to the people who need the most
 * variety.
 *
 * A generator cannot write those sentences. It can only take an example written
 * for a card and hope the frame constrains the blank, and at level 2 it does
 * not. So they are written by hand, in
 * `content/vocabulary/context-items.json`, with the reason each one has a
 * single answer recorded beside it.
 *
 * ## Why they are validated rather than trusted
 *
 * Because "curated" is how the previous distractor rule survived: a decision
 * nobody re-checked. Each item below goes through the *same* frame tests the
 * generated ones do — the bare modifier, the time slot, the destination verb,
 * the existential verb, the general verb with no other argument — plus particle
 * agreement, option uniqueness, the category rule and the safety lists. A
 * curated item that fails is a **build failure**, not an exception, because an
 * exception is a rule with a hole in it.
 */
const curatedFile = JSON.parse(
  readFileSync(join(ROOT, 'content', 'vocabulary', 'context-items.json'), 'utf8'),
);
const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
const curatedProblems = [];
let curatedKept = 0;
for (const entry of curatedFile.items) {
  const answer = anchorById.get(entry.answer);
  const where = `${entry.before}____${entry.after}`;
  const fail = (why) => curatedProblems.push(`${where} — ${why}`);
  if (!answer) {
    fail(`${entry.answer} is not a taught word`);
    continue;
  }
  if (answer.pos !== 'noun') {
    fail(`${answer.word} is a ${answer.pos}; curated items are noun blanks`);
    continue;
  }
  const prompt = `${entry.before}____${entry.after}`;
  const after = entry.after;
  const surfaces = [answer.surface];
  const chosen = [];
  for (const id of entry.options) {
    const other = anchorById.get(id);
    if (!other) {
      fail(`${id} is not a taught word`);
      continue;
    }
    const family = new Set([answer.category, ...(answer.category_tags ?? [])].filter(Boolean));
    const theirs = [other.category, ...(other.category_tags ?? [])].filter(Boolean);
    if (!theirs.some((tag) => family.has(tag))) {
      fail(`${other.word} is ${other.category}, the answer is ${answer.category}`);
    }
    if (Math.abs((other.level ?? 0) - (answer.level ?? 0)) > SPREAD * 3) {
      fail(`${other.word} is level ${other.level} against ${answer.level}`);
    }
    if (excluded(other.surface) || NOT_STANDALONE.has(other.surface)) {
      fail(`${other.surface} may not stand alone in a slot`);
    }
    if (prompt.includes(other.surface)) fail(`${other.surface} is already in the sentence`);
    surfaces.push(other.surface);
    chosen.push(other);
  }
  if (new Set(surfaces).size !== OPTIONS) fail('the four options are not four distinct strings');
  // Particle agreement, exactly as the generated path checks it.
  for (const [consonantForm, vowelForm] of PARTICLE_PAIRS) {
    const takesConsonantForm = after.startsWith(consonantForm);
    const takesVowelForm = after.startsWith(vowelForm);
    if (!takesConsonantForm && !takesVowelForm) continue;
    const attached =
      takesConsonantForm && (!takesVowelForm || consonantForm.length >= vowelForm.length)
        ? consonantForm
        : vowelForm;
    for (const surface of surfaces) {
      const last = surface[surface.length - 1];
      const wants =
        consonantForm === '으로' && finalOf(last) === 'ㄹ'
          ? vowelForm
          : hasFinal(last)
            ? consonantForm
            : vowelForm;
      if (wants !== attached) fail(`${surface} does not take ${attached}`);
    }
    break;
  }
  // And every frame rule the generated path applies.
  if (/^\s+[가-힣]/.test(after)) fail('the blank modifies the noun behind it');
  if (answer.category === 'time-numbers' && /^에(\s|$)/.test(after)) fail('a time noun in a 에 slot');
  const verb = predicateOf(prompt.replace('____', answer.surface));
  if (verb && DESTINATION_VERBS.has(verb) && /^에(\s|$)/.test(after)) fail(`every place fits ${verb}`);
  if (verb && EXISTENTIAL_VERBS.has(verb) && /^(이|가|은|는)(\s|$)/.test(after)) {
    fail(`every noun fits ${verb}`);
  }
  if (verb && GENERAL_VERBS.has(verb) && /^(을|를)(\s|$)/.test(after)) {
    const others = [...prompt.matchAll(/([가-힣]{1,6})(을|를|에서|에)(\s|$)/g)].map((m) => m[1]);
    if (others.length === 0) fail(`${verb} takes any object and nothing else is said`);
  }
  if (!ARGUMENT_PARTICLE.test(prompt.replace('____', ' '))) fail('nothing pins the blank down');
  if (prompt.trim().split(/\s+/).filter(Boolean).length < 3) fail('fewer than three eojeol');
  if (isOpenEvaluativeFrame(prompt)) fail('a predicate that rules out no noun');
  if (isAgentSubjectFrame(prompt) && PERSON_NOUNS.has(answer.word)) fail('every person fits');
  if (isHadaFrame(prompt) && isActivityNoun(answer.word, LEMMAS)) fail('every activity fits');
  if (isConsumptionObjectFrame(prompt) && CONSUMABLES.has(answer.word)) fail('every consumable fits');
  for (const surface of surfaces) {
    if (unsafeInFrame(prompt, surface)) fail(`${surface} composes something unsafe here`);
  }

  if (curatedProblems.length > 0 && curatedProblems[curatedProblems.length - 1].startsWith(where)) {
    continue;
  }

  curatedKept += 1;
  cloze[answer.id] = {
    before: entry.before,
    target: answer.surface,
    after: entry.after,
    form: 'noun',
    /*
     * Written for this question rather than taken from the card.
     *
     * The runtime used to play `word.audio.example` under every gap-fill,
     * because the gap-fill *was* the card's sentence. A curated item is a
     * different sentence, so that clip would be a recording of something
     * other than what is on the screen. Each curated sentence now carries its
     * own clip id, derived from its text exactly as the card examples derive
     * theirs; `scripts/export-speech-plan.mjs` reads these entries as a second
     * source of Korean sentences, so the audio build records them, and the
     * runtime plays the clip only when the manifest actually holds it. Until
     * then it plays nothing rather than the wrong thing (C-008).
     */
    curated: true,
    audioId: `ex_${[...(entry.before + answer.surface + entry.after)]
      .map((ch) => ch.codePointAt(0).toString(16))
      .join('')}`,
    options: [
      { id: answer.id, surface: answer.surface },
      ...chosen.map((other) => ({ id: other.id, surface: other.surface })),
    ].sort((a, b) => a.surface.localeCompare(b.surface)),
  };
  items.push({
    id: `${answer.id}:context`,
    kind: 'context',
    // Levelled by the curated sentence, not the card's — see build_level_test.py.
    level: answer.curated_context_level ?? answer.context_level ?? answer.level,
    demand: answer.curated_context_demand ?? answer.context_demand ?? null,
    prompt,
    answer: answer.surface,
    options: surfaces.slice().sort(),
    lemma: answer.word,
    senseId: answer.senseId ?? answer.id,
    form: 'noun',
    distractorIds: chosen.map((other) => other.id),
    curated: true,
  });
}
if (curatedProblems.length > 0) {
  console.error('\ncurated contextual items that do not hold to the rules:');
  for (const line of curatedProblems) console.error(`  ${line}`);
  process.exit(1);
}

const promptCount = new Map();
for (const item of items) {
  if (item.kind !== 'context') continue;
  promptCount.set(item.prompt, (promptCount.get(item.prompt) ?? 0) + 1);
}
for (let i = items.length - 1; i >= 0; i -= 1) {
  const item = items[i];
  if (item.kind !== 'context') continue;
  if ((promptCount.get(item.prompt) ?? 0) > 1) {
    items.splice(i, 1);
    rejected.sharedPrompt += 1;
  }
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

/*
  The meanings, one file per language.

  ## Why this file exists at all

  Because the bank cannot hold them. An item is a question about a Korean word;
  the *meaning* of that word is a different fact in each of thirty-two
  languages, and baking one of them into the item is what produced an English
  Level Test inside a Korean interface. So the bank holds ids and this holds
  the strings, and the renderer puts them together knowing which language it is
  in.

  ## Where the strings come from, and where they do not

  **Taught words** have a hand-written meaning in every language the curriculum
  has one for — `vocabulary.<locale>.json`, the same file the word cards read.
  Nothing is generated here and nothing is translated here.

  **Dictionary anchors** carry the upper levels of the scale, and their gloss is
  Wiktionary's English. There is no other language for them, so they appear in
  `en` and in no other file. A locale that cannot resolve an item does not ask
  it — see `resolveItem` — which is the whole point: the alternative is asking
  it in English, and that is the defect.

  The consequence is a *ceiling* per language rather than a fallback, and the
  ceiling is measured and printed below rather than discovered by a learner.
*/
const GENERATED = join(ROOT, 'apps', 'web', 'src', 'data', 'generated');
const corpus = JSON.parse(readFileSync(join(GENERATED, 'vocabulary.json'), 'utf8'));
const corpusIds = corpus.words.map((word) => word.id);
const locales = corpus.locales;

/** Every anchor id the kept items need a meaning for, in any language. */
const neededMeanings = new Set();
for (const item of items) {
  if (item.kind === 'meaning') for (const id of item.optionIds) neededMeanings.add(id);
  if (item.kind === 'produce') neededMeanings.add(item.promptId);
}

const meanings = {};
for (const locale of locales) {
  const rows = JSON.parse(readFileSync(join(GENERATED, `vocabulary.${locale}.json`), 'utf8')).words;
  const table = {};
  rows.forEach((row, index) => {
    const id = corpusIds[index];
    if (!neededMeanings.has(id)) return;
    const meaning = row?.[0]?.trim();
    if (meaning) table[id] = meaning;
  });
  meanings[locale] = table;
}
/*
  English also gets the dictionary anchors, which is not a favour to English —
  it is the only language those glosses exist in. Every other language reaches
  as far up the scale as its written content does, and no further.
*/
for (const anchor of anchors) {
  if (anchor.source !== 'dictionary' || !neededMeanings.has(anchor.id)) continue;
  meanings.en[anchor.id] = anchor.gloss;
}

/*
  The publication gate: every finished item, every string a learner can see.

  Everything above chose words and composed sentences one guard at a time.
  This reads the result the way the screen will show it — the Korean prompt,
  the Korean answer and options, and the meaning of every option in every
  language that has one — and refuses the item if any of it fails the policy.
  It is deliberately redundant with the guards above: a guard is a promise
  about one path, and this is a check on the thing shipped.
*/
const refusedByPolicy = [];
const headwordOf = new Map(anchors.map((anchor) => [anchor.id, anchor.word]));
const publishable = kept.filter((item) => {
  const random = { random: true };
  const own = { random: true, headword: headwordOf.get(item.id.split(':')[0]) };
  const findings = [];
  if (item.prompt) {
    findings.push(...evaluateSurface({ text: item.prompt, lang: 'ko', role: item.kind === 'meaning' ? 'headword' : 'sentence', field: 'prompt' }, own));
  }
  if (item.answer) findings.push(...evaluateSurface({ text: item.answer, lang: 'ko', role: 'option', field: 'answer' }, own));
  // An option is its own word: 무덤 as a choice is judged as the card 무덤. A
  // contextual option is a conjugated surface (죽었어요), so it is judged as
  // the lemma it was conjugated from — the item's own, or one of its
  // distractors' — and passes if it passes as any of them.
  const lemmas = [item.lemma, ...(item.distractorIds ?? []).map((id) => headwordOf.get(id))].filter(Boolean);
  for (const option of item.options ?? []) {
    const candidates = [option, ...lemmas];
    const attempts = candidates.map((headword) =>
      evaluateSurface({ text: option, lang: 'ko', role: 'option', field: 'option' }, { random: true, headword }),
    );
    const passing = attempts.find((list) => verdictOf(list, random) === 'ok');
    if (!passing) findings.push(...attempts[0]);
  }
  // A meaning belongs to the word it defines, so the policy's allow lists
  // apply by that word: 죽다's "to die" is allowed because the card is named,
  // and a dictionary anchor glossed "the deceased" is not.
  const ids = [...(item.optionIds ?? []), ...(item.promptId ? [item.promptId] : [])];
  for (const id of ids) {
    const facts = { random: true, headword: headwordOf.get(id) };
    for (const [locale, table] of Object.entries(meanings)) {
      const text = table[id];
      if (text) findings.push(...evaluateSurface({ text, lang: locale, role: 'option', field: `meaning:${locale}` }, facts));
    }
  }
  if (verdictOf(findings, random) === 'ok') return true;
  refusedByPolicy.push({ id: item.id, findings: findings.slice(0, 3).map((f) => `${f.lang}:${f.category}:${f.term}`) });
  return false;
});
kept.length = 0;
kept.push(...publishable);

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
  childSafety: { policyVersion: POLICY_VERSION, refusedItems: refusedByPolicy.length },
};

const rendered = `${JSON.stringify(bank)}\n`;
const digest = createHash('sha256').update(rendered).digest('hex').slice(0, 8);
const name = `bank-${digest}.json`;

const files = { [name]: rendered };
const meaningFiles = {};
/** How far up the scale each language can actually ask, and with how much. */
const reach = {};
for (const locale of locales) {
  const table = meanings[locale];
  const text = `${JSON.stringify({ locale, meanings: table })}\n`;
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 8);
  const file = `meanings-${locale}-${hash}.json`;
  files[file] = text;
  meaningFiles[locale] = file;

  // An item is askable in this language when every meaning it needs resolves.
  const perLevelHere = {};
  for (const item of kept) {
    const needed =
      item.kind === 'meaning' ? item.optionIds
      : item.kind === 'produce' ? [item.promptId]
      : [];
    if (!needed.every((id) => table[id])) continue;
    perLevelHere[item.level] = (perLevelHere[item.level] ?? 0) + 1;
  }
  const askable = Object.values(perLevelHere).reduce((a, b) => a + b, 0);
  /*
    The ceiling is where the scale stops being *continuously* askable.

    Not the highest level with enough items — that reads 30 for a language whose
    levels 26 to 29 are empty, which is a ladder with the top four rungs
    missing described as a whole ladder. An adaptive test climbs; it cannot skip
    a gap. So the ceiling is the last level such that every level below it also
    has enough, and six is that floor because a sitting asks a handful at any
    one level and repeating a question inside one test is worse than stopping.
  */
  let ceiling = 0;
  for (let level = 1; level <= LEVELS; level += 1) {
    if ((perLevelHere[level] ?? 0) < 6) break;
    ceiling = level;
  }
  reach[locale] = { items: askable, ceiling, perLevel: perLevelHere };
}

const manifest = {
  _comment:
    'GENERATED by scripts/content/build_level_test.mjs. `bank` names a content-hashed file, so ' +
    'the offline worker can cache it for good. `meanings` names one file per language: the bank ' +
    'holds ids and those hold the strings, because a meaning is a different fact in each language ' +
    'and baking one of them into an item is what put an English Level Test inside a Korean app.',
  levels: LEVELS,
  options: OPTIONS,
  items: kept.length,
  bank: name,
  meanings: meaningFiles,
  reach: Object.fromEntries(
    Object.entries(reach).map(([locale, r]) => [locale, { items: r.items, ceiling: r.ceiling }]),
  ),
  perLevel,
};
files['manifest.json'] = `${JSON.stringify(manifest)}\n`;

/*
 * The gap-fills, written where the app imports rather than fetches.
 *
 * `apps/web/src/data/generated/` is bundled, and this is small — only the words
 * whose sentence survived every rule, which is a few hundred of the corpus, not
 * all of it. A word without an entry here simply has no gap-fill question, and
 * that is the correct outcome for a sentence that cannot have one answer.
 */
const clozeOut = join(ROOT, 'apps', 'web', 'src', 'data', 'generated', 'cloze.json');
const clozeText = `${JSON.stringify({
  _comment:
    'GENERATED by scripts/content/build_level_test.mjs. Validated gap-fills: the blank spans a ' +
    'whole surface form, every option is conjugated into that same form or agrees with the ' +
    "sentence's particle, and the composition has passed the safety frames. The runtime must not " +
    'build its own — see the note beside `cloze[anchor.id]` in the builder.',
  words: cloze,
})}\n`;
if (CHECK) {
  if (!existsSync(clozeOut) || readFileSync(clozeOut, 'utf8') !== clozeText) {
    console.error('cloze.json is out of date — run the level test build');
    process.exitCode = 1;
  }
} else {
  writeFileSync(clozeOut, clozeText);
}

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
console.log(
  `    ${rejected.borrowedRank.toLocaleString('en')}  a dictionary headword whose rank belongs to an inflected form of another word`,
);
if (borrowed.length > 0) {
  // Printed rather than counted, because each is a question that would have
  // been keyed to a sense the rank never measured. See `borrowsItsRank`.
  for (const line of borrowed.slice(0, 12)) console.log(`      ${line}`);
  if (borrowed.length > 12) console.log(`      … and ${borrowed.length - 12} more`);
}
console.log(`    ${rejected.weakContext.toLocaleString('en')}  nothing in the sentence pins the meaning down`);
console.log(`    ${rejected.noForm.toLocaleString('en')}  the sentence uses an ending the conjugator does not generate`);
console.log(`    ${rejected.noDistractors.toLocaleString('en')}  fewer than three usable distractors`);
console.log(
  `    ${rejected.collidingMeaning.toLocaleString('en')}  a distractor reads as the same meaning as another option, in some language`,
);
console.log(`    ${rejected.sharedArgument.toLocaleString('en')}  a distractor acts on the same noun, so it would fit too`);
console.log(`    ${rejected.related.toLocaleString('en')}  a distractor is the answer's recorded synonym or antonym`);
console.log(`    ${rejected.generalVerb.toLocaleString('en')}  a distractor is a verb that fits any object`);
console.log(`    ${rejected.activityNoun.toLocaleString('en')}  a distractor is another thing you can simply do`);
console.log(`    ${rejected.sharedPrompt.toLocaleString('en')}  the same sentence was built for two different words`);
console.log(
  `    ${(rejected.implausible ?? 0).toLocaleString('en')}  a noun from outside the answer's subject area, which is scenery rather than a distractor`,
);
console.log(
  `    ${(rejected.sharedPredicate ?? 0).toLocaleString('en')}  a distractor whose own sentence has the same verb, so the frame is the same frame`,
);
console.log(
  `    ${(rejected.everyOptionFits ?? 0).toLocaleString('en')}  the frame accepts the answer's whole kind, so every plausible option is right`,
);
console.log(
  `    ${(rejected.bareModifier ?? 0).toLocaleString('en')}  the blank modifies the noun behind it rather than filling an argument slot`,
);

const thin = [];
for (let level = 1; level <= LEVELS; level += 1) {
  if ((perLevel[level] ?? 0) < 30) thin.push(level);
}
if (thin.length) console.log(`\n  levels with fewer than 30 items: ${thin.join(', ')}`);
console.log(
  `\n  child-safe content policy ${POLICY_VERSION}: ${refusedByPolicy.length} finished item(s) refused at publication` +
    (refusedByPolicy.length ? ` — ${refusedByPolicy.slice(0, 60).map((r) => `${r.id} (${r.findings.join(', ')})`).join('; ')}` : ''),
);

console.log('\n  how far each language can ask, and with how many items:\n');
const ordered = [...locales].sort((a, b) => reach[b].ceiling - reach[a].ceiling || a.localeCompare(b));
for (const locale of ordered) {
  const r = reach[locale];
  const bar = r.ceiling === LEVELS ? 'the whole scale' : `levels 1–${r.ceiling}`;
  console.log(`    ${locale.padEnd(6)} ${String(r.items).padStart(5)} items   ${bar}`);
}

if (CHECK && stale.length) {
  console.error(`\nstale: ${stale.join(', ')} — run \`npm run content:leveltest\``);
  process.exit(1);
}
if (stale.length) console.log(`\nwrote ${stale.length} file(s) to ${relative(ROOT, OUT)}`);
else console.log('\nbank up to date');
