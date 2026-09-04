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
 * 7. **The instruction matches the question.** Every exercise carries a
 *    semantic `question_type`, every type has exactly one prompt key, and the
 *    four instructions the course promises are the four it prints.
 * 8. **One answer.** Over every question this engine can build — practice and
 *    mastery, three attempts, nineteen lessons — exactly one option is
 *    defensible, and every other one is wrong for a reason this file can name.
 * 9. **Spacing.** Ordinal dates are written closed (삼월 일일) and counted
 *    quantities open (한 개), everywhere: items, examples, all thirty-two
 *    bundles, and the audio manifest.
 * 10. **Writing is not pronunciation.** An example headed *이렇게 발음해요* is
 *    an example about sound, and one headed *이렇게 써요* is about spelling.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');

const { NUMBER_ITEMS, NUMBER_LESSONS, NUMBER_MODULES, numberLessonItems, spokenExample } = await import(
  '../apps/web/src/data/numbers.ts'
);
const { exerciseCoverage, masteryExercises, practiceExercises } = await import(
  '../apps/web/src/features/numbers/exercises.ts'
);

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


// --- 7 the instruction matches the question -----------------------------------
/**
 * One prompt key per question type, and the type is what the screen switches on.
 *
 * The defect this replaces: `spot_mistake` was headed *어느 쪽이 맞을까요?* —
 * *which one is right?* — over an option list whose **answer is the one that is
 * wrong**. A learner who read the instruction and obeyed it was marked
 * incorrect, on every question of that kind, in all thirty-two languages. The
 * heading came from the exercise *kind*, which is a fact about how the options
 * were assembled, and the kind and the question are not the same thing.
 *
 * So the type is data now, and this table is the contract: the page's switch
 * has one branch per row and nothing else may reach a heading.
 */
const PROMPT_FOR = {
  findIncorrectExpression: 'prompt.findIncorrectExpression',
  chooseCorrectExplanation: 'prompt.chooseCorrectExplanation',
  listenAndChoose: 'prompt.listenAndChoose',
  chooseMeaning: 'prompt.chooseMeaning',
  chooseSystem: 'prompt.chooseSystem',
  sayTheNumber: 'prompt.digitsToKorean.sino',
  writeTheDigits: 'prompt.koreanToDigits',
  chooseCounterForm: 'prompt.counterForm',
  fillTheBlank: 'prompt.fill',
  orderTheParts: 'prompt.orderParts',
};

/**
 * The four instructions the product promises, in the language they were
 * written in. Korean is checked literally because these four sentences are the
 * specification — *find the wrong one* and *choose the right explanation* are
 * opposite instructions, and a bundle that swaps them is not a translation
 * problem, it is a broken lesson.
 */
const KO_PROMPTS = {
  'prompt.findIncorrectExpression': '다음 중 틀린 표현을 고르세요.',
  'prompt.chooseCorrectExplanation': '다음 중 올바른 설명을 고르세요.',
  'prompt.listenAndChoose': '무엇이라고 들렸나요?',
  'prompt.chooseMeaning': '무슨 뜻일까요?',
};
for (const [key, expected] of Object.entries(KO_PROMPTS)) {
  const actual = lookup(bundles.ko, key);
  if (actual !== expected) fail(`[ko] ${key} is "${actual}", not "${expected}"`);
}
/*
 * The retired keys may not come back. `prompt.spotMistake` is the one that
 * asked the opposite question, and `prompt.read` / `prompt.listen` are the two
 * that were chosen by exercise kind rather than by question type; a bundle
 * still carrying one is a bundle the page is no longer reading.
 */
for (const locale of LOCALES) {
  for (const dead of ['prompt.spotMistake', 'prompt.read', 'prompt.listen']) {
    if (lookup(bundles[locale], dead) !== undefined) fail(`[${locale}] ${dead} is retired but still present`);
  }
  for (const key of Object.values(PROMPT_FOR)) {
    const value = lookup(bundles[locale], key);
    if (typeof value !== 'string' || value.trim() === '') fail(`[${locale}] ${key} is missing`);
  }
  for (const kind of ['writing', 'pronunciation', 'example']) {
    const value = lookup(bundles[locale], `exampleLabel.${kind}`);
    if (typeof value !== 'string' || value.trim() === '') fail(`[${locale}] exampleLabel.${kind} is missing`);
  }
}
/**
 * No Korean instruction leaks into a language that is not Korean.
 *
 * The strings a learner is *told what to do* by — the ten prompts, the three
 * example headings, the two verdicts and the buttons — are interface, and
 * interface is translated. The strings a learner is *taught* are Korean in every
 * bundle and must stay Korean: `prompt.digitsToKorean.sino` reads "Say this
 * number with 일, 이, 삼" in English and is right to.
 *
 * So the test is not "contains Hangul". It is "contains nothing but Hangul": a
 * German prompt with no German in it is a bundle where somebody pasted the
 * Korean and moved on, and it is the one failure that a missing-key check and a
 * same-as-English check both walk straight past.
 */
const INSTRUCTION_KEYS = /^(prompt\.|exampleLabel\.|feedback\.|action\.|phase\.|status\.)/;
const ONLY_KOREAN = /^[\p{Script=Hangul}\s0-9.,!?()·—–:;'"{}]+$/u;
for (const locale of LOCALES) {
  if (locale === 'ko') continue;
  for (const [key, value] of flatten(bundles[locale])) {
    if (!INSTRUCTION_KEYS.test(key)) continue;
    const text = String(value);
    if (ONLY_KOREAN.test(text) && /\p{Script=Hangul}/u.test(text)) {
      fail(`[${locale}] ${key} is Korean in a bundle that is not Korean: "${text}"`);
    }
  }
}

if (lookup(bundles.ko, 'exampleLabel.writing') !== '이렇게 써요') fail('[ko] exampleLabel.writing must be 이렇게 써요');
if (lookup(bundles.ko, 'exampleLabel.pronunciation') !== '이렇게 발음해요') {
  fail('[ko] exampleLabel.pronunciation must be 이렇게 발음해요');
}

// --- 8 exactly one answer ------------------------------------------------------
/**
 * Every question this engine can build, over three attempts, both phases.
 *
 * The mastery check is a sample of what `generate` produces; a defect that only
 * appears in guided practice or on the second attempt is a defect a learner
 * meets. There are a few thousand of these and they build in under a second.
 */
const ATTEMPTS = [0, 1, 2];
const everyExercise = NUMBER_LESSONS.flatMap((lesson) =>
  ATTEMPTS.flatMap((attempt) => [...practiceExercises(lesson, attempt), ...masteryExercises(lesson, attempt)]),
);

const itemById = new Map(NUMBER_ITEMS.map((i) => [i.id, i]));

/** The correct half of an example, without a bracketed reading. */
const correctSide = (item) => {
  const half = item.example?.split('·')[0]?.replace(/\(✓\)/, '') ?? '';
  return half.replace(/\s*\([^)]*\)/g, '').trim() || item.korean;
};

/**
 * Korean the course says is Korean, and Korean the course says is not.
 *
 * Both are read out of the curriculum rather than typed here, so a new item
 * arrives in the right set on its own and a `findIncorrectExpression` option
 * that is in *neither* set fails: an option nothing in this repository can
 * classify is an option nobody can defend marking wrong.
 */
const ATTESTED = new Set();
const NOT_KOREAN = new Set();
for (const item of NUMBER_ITEMS) {
  ATTESTED.add(item.korean);
  if (item.example) {
    ATTESTED.add(correctSide(item));
    const bad = item.example.split('·')[1]?.replace(/\(✗\)/, '').trim();
    if (bad) NOT_KOREAN.add(bad);
  }
}
// The two months the rule mispredicts, and the glued and plain forms the
// counting-form and spacing lessons exist to rule out.
for (const wrong of ['육월', '십월']) NOT_KOREAN.add(wrong);
const FORMS = { 한: '하나', 두: '둘', 세: '셋', 네: '넷', 스무: '스물' };
for (const attested of [...ATTESTED]) {
  const [head, ...rest] = attested.split(' ');
  if (rest.length && FORMS[head]) {
    NOT_KOREAN.add([FORMS[head], ...rest].join(' '));
    NOT_KOREAN.add(attested.replace(/\s+/g, ''));
  }
}

const classify = (text) => (NOT_KOREAN.has(text) ? 'wrong' : ATTESTED.has(text) ? 'right' : 'unknown');

/**
 * Gloss keys that name the same thing, stated here rather than read off the
 * data.
 *
 * `NumberItem.gloss_group` is the *fix*; this list is the *finding*, and a gate
 * that checked the fix against itself would go green the moment somebody
 * deleted the declaration. 명 glosses as 사람 and 사람 as 사람 - 일상적인 말;
 * asked what 명 means with both on screen there is no answer a learner can
 * defend, whatever the data says about groups.
 *
 * A pair joins this list when a reader finds two options that cannot be told
 * apart. It is not generated, and it is not supposed to be long.
 */
const SAME_MEANING = [['gloss.counterPeople', 'gloss.counterPeoplePlain']];

/**
 * Expressions that are both Korean in the same hole, stated the same way and
 * for the same reason as `SAME_MEANING`.
 *
 * `NumberItem.slot_group` is the fix and this is the finding. 맥주 한 병 and
 * 맥주 한 잔 are both things a person orders; 책 세 권 is three books and 책 세
 * 장 is three pages; 주말에 만나요, 금요일에 만나요 and 월요일에 만나요 are all
 * arrangements to meet. A blank offering the answer beside its slot-mate has two
 * answers however the grader is configured.
 *
 * Only the *answer* is checked against the list. Two distractors that share a
 * slot with each other are two wrong buttons, which is fine.
 */
const SAME_SLOT = [
  ['병', '잔'],
  ['권', '장'],
  ['월요일', '금요일'],
  ['월요일', '주말'],
  ['금요일', '주말'],
  ['영', '영 점'],
];

/**
 * Does a blanked sentence say what belongs in the hole?
 *
 * Recomputed here rather than imported, for the same reason: the engine's own
 * `hasContextAnchor` is the fix, and a gate that called it would pass on a tree
 * where somebody had deleted the call. A blank after nothing but a numeral -
 * `두 ____`, `삼십 ____`, `삼 ____` - takes every unit in its lesson, so the
 * question has as many answers as it has options.
 */
const NUMBER_SYLLABLES = new Set(
  NUMBER_ITEMS.filter((i) => i.role === 'numeral' || i.role === 'form').flatMap((i) => [...i.korean]),
);
const UNIT_WORDS = new Set(NUMBER_ITEMS.filter((i) => i.role === 'counter').map((i) => i.korean));
const GRAMMATICAL = new Set(['이에요', '예요', '에', '을', '를', '이', '가', '은', '는', '의', '도', '와', '과']);
const saysWhatFits = (blanked) =>
  String(blanked)
    .replace('____', ' ')
    .split(/[\s.,?!\u00b7()]+/)
    .filter(Boolean)
    .some(
      (run) =>
        !GRAMMATICAL.has(run) && !UNIT_WORDS.has(run) && ![...run].every((ch) => NUMBER_SYLLABLES.has(ch)),
    );

const seenQuestions = new Set();
const typesSeen = new Set();
let audited = 0;
for (const exercise of everyExercise) {
  const item = itemById.get(exercise.item_id);
  const fingerprint = `${exercise.question_type}:${exercise.item_id}:${exercise.options
    .map((o) => o.text)
    .sort()
    .join('')}`;
  if (seenQuestions.has(fingerprint)) continue;
  seenQuestions.add(fingerprint);
  audited += 1;
  typesSeen.add(exercise.question_type);
  const where = `${exercise.question_type} - ${exercise.item_id}`;
  const shown = exercise.options.map((o) => o.text);

  if (!PROMPT_FOR[exercise.question_type]) {
    fail(`${where}: no prompt key is declared for this question type`);
  }

  // Distinct options, whatever they are made of. A repeated option is either
  // two right answers or a button that does nothing.
  if (new Set(shown).size !== shown.length) fail(`${where}: repeats an option - ${shown.join(' / ')}`);
  if (exercise.question_type !== 'orderTheParts') {
    // `chooseSystem` is two options because there are two sets; everything else
    // that drops to two has lost a distractor rather than found a binary.
    const floor = exercise.question_type === 'chooseSystem' ? 2 : 3;
    if (exercise.options.length < floor) fail(`${where}: only ${exercise.options.length} option(s)`);
    if (exercise.answer < 0 || exercise.answer >= exercise.options.length) {
      fail(`${where}: the answer index ${exercise.answer} is not an option`);
    }
  }

  const picked = exercise.options[exercise.answer];
  switch (exercise.question_type) {
    case 'findIncorrectExpression': {
      const verdicts = shown.map(classify);
      const wrongOnes = shown.filter((_, i) => verdicts[i] === 'wrong');
      const unknown = shown.filter((_, i) => verdicts[i] === 'unknown');
      if (unknown.length) fail(`${where}: cannot classify "${unknown.join('", "')}" as Korean or not`);
      if (wrongOnes.length !== 1) {
        fail(`${where}: ${wrongOnes.length} of the options are not Korean - ${shown.join(' / ')}`);
      } else if (picked.text !== wrongOnes[0]) {
        fail(`${where}: the answer is "${picked.text}" but the option that is not Korean is "${wrongOnes[0]}"`);
      }
      break;
    }
    case 'chooseMeaning':
    case 'chooseCorrectExplanation': {
      const expected = item.gloss ?? String(item.value);
      if (picked.text !== expected) fail(`${where}: the answer is "${picked.text}", not the item's own gloss`);
      const kinds = new Set();
      /*
       * Only against the *answer*.
       *
       * Two distractors that name the same thing are two wrong answers, which
       * is wasteful but not unanswerable — 개 asked with both 사람 glosses among
       * its distractors is still a question with one right button. What cannot
       * be answered is a distractor that names what the answer names.
       */
      for (const option of exercise.options) {
        const source = NUMBER_ITEMS.find((i) => i.gloss === option.text);
        if (!source) continue;
        kinds.add(source.gloss_kind ?? 'meaning');
        if (option.text !== picked.text && source.gloss_group && source.gloss_group === item.gloss_group) {
          fail(`${where}: "${option.text}" names what the answer names (${item.gloss_group})`);
        }
      }
      if (kinds.size > 1) fail(`${where}: mixes ${[...kinds].join(' and ')} glosses in one option list`);
      for (const [a, b] of SAME_MEANING) {
        if (shown.includes(a) && shown.includes(b)) {
          fail(`${where}: offers ${a} and ${b}, which name the same thing`);
        }
      }
      const wanted = item.gloss_kind === 'explanation' ? 'chooseCorrectExplanation' : 'chooseMeaning';
      if (exercise.question_type !== wanted) fail(`${where}: should be asked as ${wanted}`);
      break;
    }
    case 'listenAndChoose':
    case 'sayTheNumber': {
      if (picked.text !== item.korean) fail(`${where}: the answer is "${picked.text}", not ${item.korean}`);
      if (shown.filter((t) => t === item.korean).length !== 1) fail(`${where}: ${item.korean} appears more than once`);
      break;
    }
    case 'writeTheDigits': {
      if (picked.value !== item.value) fail(`${where}: the answer is ${picked.value}, not ${item.value}`);
      const values = exercise.options.map((o) => o.value);
      if (new Set(values).size !== values.length) fail(`${where}: repeats a value`);
      break;
    }
    case 'chooseSystem': {
      if (exercise.options.length !== 2) fail(`${where}: ${exercise.options.length} options where two were expected`);
      if (picked.text !== `system.${item.system}`) fail(`${where}: the answer does not name the item's own set`);
      break;
    }
    case 'chooseCounterForm': {
      /*
       * Checked by shape rather than by attestation: the phrase this question
       * builds — 두 마리, 한 병 — is a fragment of an example rather than an
       * example, so it is not in the attested set and should not have to be.
       * What has to hold is that exactly one option is `<counting form> <unit>`
       * and every other one is a named way of getting that wrong.
       */
      const [form, ...tail] = picked.text.split(' ');
      if (!FORMS[form] || tail.length === 0) {
        fail(`${where}: the answer "${picked.text}" is not a counting form before a unit`);
      }
      const unit = tail.join(' ');
      const wrongShapes = new Set([
        `${FORMS[form] ?? ''} ${unit}`.trim(),
        picked.text.replace(/\s+/g, ''),
      ]);
      for (const other of shown) {
        if (other === picked.text) continue;
        const [head, ...rest] = other.split(' ');
        const isSino = rest.join(' ') === unit && !FORMS[head] && !wrongShapes.has(other);
        if (!wrongShapes.has(other) && !isSino) {
          fail(`${where}: "${other}" is neither the answer nor a named mistake`);
        }
        if (FORMS[head] && rest.join(' ') === unit) fail(`${where}: "${other}" is also a counting form`);
      }
      break;
    }
    case 'fillTheBlank': {
      if (picked.text !== item.korean) fail(`${where}: the answer is "${picked.text}", not ${item.korean}`);
      if (!saysWhatFits(exercise.prompt.sentence)) {
        fail(`${where}: "${exercise.prompt.sentence}" names nothing that decides the answer`);
      }
      for (const pair of SAME_SLOT) {
        const mate = pair[0] === picked.text ? pair[1] : pair[1] === picked.text ? pair[0] : null;
        if (mate && shown.includes(mate)) {
          fail(`${where}: "${mate}" also fits "${exercise.prompt.sentence}"`);
        }
      }
      for (const option of exercise.options) {
        if (option.text === picked.text) continue;
        const source = NUMBER_ITEMS.find((i) => i.korean === option.text);
        if (source?.slot_group && source.slot_group === item.slot_group) {
          fail(`${where}: "${option.text}" fits the same hole as the answer - "${exercise.prompt.sentence}"`);
        }
      }
      break;
    }
    case 'orderTheParts': {
      if (exercise.parts.join('') !== item.korean) fail(`${where}: the parts do not spell ${item.korean}`);
      break;
    }
    default:
      fail(`${where}: unaudited question type`);
  }
}
for (const type of Object.keys(PROMPT_FOR)) {
  if (!typesSeen.has(type)) notes.push(`no lesson currently builds a ${type} question`);
}

// --- 9 date spacing ------------------------------------------------------------
/**
 * A counted quantity is spaced; an ordinal is closed.
 *
 * Korean orthography spaces a unit noun from its numeral, and closes the same
 * noun when the number is an *order*. A date is an order, and the course
 * shipped 삼월 일 일, 유월 육 일, 시월 십 일 and 십오 일 - each the principle
 * form, none of them written by anybody. The first reads as two ones, on the
 * screen of the lesson explaining that 일 is both.
 *
 * Both directions are gated, because fixing one by hand is how a codebase ends
 * up with 한개 as well.
 */
const BANNED_SPACING = ['삼월 일 일', '삼월 이 일', '유월 육 일', '시월 십 일', '십오 일', '이천이십육 년'];
const REQUIRED_SPACING = ['삼월 일일', '유월 육일', '시월 십일'];
const ORDINAL_OPEN = /(일|이|삼|사|오|육|칠|팔|구|십|백|천|만)\s+(일|년)(?![가-힣])/;

const koreanStrings = [];
for (const item of NUMBER_ITEMS) {
  koreanStrings.push([`item ${item.id}`, item.korean]);
  if (item.example) koreanStrings.push([`item ${item.id} example`, item.example]);
}
for (const locale of LOCALES) {
  for (const [key, value] of flatten(bundles[locale])) koreanStrings.push([`${locale} ${key}`, String(value)]);
}
const manifestTexts = manifest.entries.map((e) => [`clip ${e.id}`, e.text]);
for (const [where, text] of [...koreanStrings, ...manifestTexts]) {
  for (const banned of BANNED_SPACING) {
    if (text.includes(banned)) fail(`${where} still writes "${banned}"`);
  }
}
for (const form of REQUIRED_SPACING) {
  if (!NUMBER_ITEMS.some((i) => i.korean === form || i.example?.includes(form))) {
    fail(`no item writes "${form}" - the corrected date form is not in the curriculum`);
  }
  if (!manifest.entries.some((e) => e.text.includes(form))) fail(`no clip says "${form}"`);
}
for (const item of NUMBER_ITEMS) {
  for (const text of [item.korean, item.example ?? '']) {
    // 삼십 분 and 오천 원 are quantities and stay open; only 일 and 년 as the day
    // and the year of a date are closed.
    if (ORDINAL_OPEN.test(text) && !/분|초|시/.test(text)) {
      fail(`${item.id} writes an ordinal date open: "${text}"`);
    }
  }
}

// --- 10 writing is not pronunciation -------------------------------------------
/**
 * The heading over an example says what the example is *for*.
 *
 * 이렇게 써요 is two sentences in Korean - this is how you write it, and this is
 * how you use it - and every example in the course carried it. On 유월 육일 a
 * learner reads the first, and the card exists to teach the second: that June
 * is *said* 유월 and never 육월. So the kind is declared on the item, and the
 * cards whose whole subject is a sound change are required to declare it.
 */
const MUST_BE_PRONUNCIATION = ['num-d-june', 'num-d-october', 'num-p-phone', 'num-x-simnyuk', 'num-x-june'];
for (const id of MUST_BE_PRONUNCIATION) {
  const item = itemById.get(id);
  if (!item) fail(`${id} is named as a pronunciation example but is not an item`);
  else if (item.example_kind !== 'pronunciation') {
    fail(`${id} teaches a sound change but its example is headed "${item.example_kind}"`);
  }
}
for (const item of NUMBER_ITEMS) {
  if (!item.example) {
    if (item.example_kind) fail(`${item.id} declares an example kind but has no example`);
    continue;
  }
  if (!['writing', 'pronunciation', 'example'].includes(item.example_kind)) {
    fail(`${item.id} has example kind "${item.example_kind}"`);
  }
  // A spelling card is a card about spelling. The only thing this course
  // teaches about how a number phrase is *written* is where the space goes.
  if (item.example_kind === 'writing' && !/✗/.test(item.example)) {
    fail(`${item.id} is headed 이렇게 써요 but shows no written contrast`);
  }
}

// --- report -------------------------------------------------------------------
const kinds = new Set(NUMBER_LESSONS.flatMap((l) => l.exercise_kinds));
console.log(
  `numbers:qa — ${NUMBER_MODULES.length} modules · ${NUMBER_LESSONS.length} lessons · ${NUMBER_ITEMS.length} items · ${kinds.size} exercise kinds · ${problems.length} problem(s)`,
);
console.log(`  audio clips            ${clips} present, 0 synthesised`);
console.log(`  translated keys        ${enKeys.length} × ${LOCALES.length} languages`);
console.log(`  translated cells       ${translatedCells} translated, ${fallbackCells} identical to English`);
console.log(`  answer positions       ${[0, 1, 2, 3].map((i) => positions.filter((p) => p === i).length).join(' / ')} over ${positions.length} four-option mastery questions`);
console.log(`  questions audited      ${audited} distinct, over ${typesSeen.size} question types, ${everyExercise.length} built`);
if (notes.length) {
  console.log('\n  notes:');
  for (const n of notes) console.log(`    ${n}`);
}
if (problems.length) {
  console.log('\n  problems:');
  for (const p of problems) console.log(`    ✗ ${p}`);
}
if (CHECK && problems.length) process.exit(1);
