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

import { conjugate, FORMS, finalOf, hasFinal, stemOf } from '../../packages/korean-morphology/src/index.ts';
import { GENERAL_VERBS, isActivityNoun, isHadaFrame } from '../lib/level-test-rules.mjs';

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

const anchorFile = JSON.parse(readFileSync(ANCHORS, 'utf8'));
const LEVELS = anchorFile.levels;
const anchors = anchorFile.anchors;
/** Every lemma the ranking knows, so `축구하다` can be looked up from `축구`. */
const LEMMAS = new Set(anchors.map((anchor) => anchor.word));

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
const rejected = {
  weakContext: 0,
  noForm: 0,
  noDistractors: 0,
  sharedArgument: 0,
  generalVerb: 0,
  activityNoun: 0,
  sharedPrompt: 0,
  related: 0,
};

/** Whether the graph records the two as synonyms or antonyms, either way round. */
function isRelated(a, b) {
  return Boolean(RELATED.get(a)?.has(b) || RELATED.get(b)?.has(a));
}

for (const anchor of anchors) {
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
  const PARTICLE_PAIRS = [
    ['은', '는'], ['이', '가'], ['을', '를'], ['과', '와'], ['으로', '로'],
    ['이나', '나'], ['이랑', '랑'], ['아', '야'], ['이에요', '예요'],
  ];
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
  /* 친구와 ____를 해요 — the blank is the object of 하다. */
  const hadaFrame = isHadaFrame(blanked);
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
     * 친구와 ____를 해요 took 축구 and offered 낚시 beside it, and fishing with
     * a friend is as good an answer as football. When the sentence's verb is
     * 하다 and the blank is a noun, every noun that can be *done* fits.
     */
    if (!inflects && hadaFrame && isActivityNoun(other.word, LEMMAS)) {
      rejected.activityNoun += 1;
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
console.log(`    ${rejected.related.toLocaleString('en')}  a distractor is the answer's recorded synonym or antonym`);
console.log(`    ${rejected.generalVerb.toLocaleString('en')}  a distractor is a verb that fits any object`);
console.log(`    ${rejected.activityNoun.toLocaleString('en')}  a distractor is another thing you can simply do`);
console.log(`    ${rejected.sharedPrompt.toLocaleString('en')}  the same sentence was built for two different words`);

const thin = [];
for (let level = 1; level <= LEVELS; level += 1) {
  if ((perLevel[level] ?? 0) < 30) thin.push(level);
}
if (thin.length) console.log(`\n  levels with fewer than 30 items: ${thin.join(', ')}`);

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
