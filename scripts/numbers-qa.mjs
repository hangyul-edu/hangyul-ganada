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
 * 9. **Spacing.** Dates are written closed (삼월 일일) and counted quantities
 *    open (한 개), everywhere: items, examples, all thirty-two bundles, and the
 *    audio manifest. Not *ordinals* closed — §43's 다만 clause permits it for a
 *    date and 번째 is a dependent noun that stays apart; see §18.
 * 10. **Writing is not pronunciation.** An example headed *이렇게 발음해요* is
 *    an example about sound, and one headed *이렇게 써요* is about spelling.
 * 11. **A learner who cannot hear can finish.** Built sound-free, every lesson
 *    still asks every item, in guided practice and in the mastery check.
 * 12. **Nothing is tested before it is taught.** No question is *about* an item
 *    a later lesson introduces, and any option that comes from a later lesson
 *    is a declared misconception rather than a stray.
 * 13. **No question is asked twice in one sitting.** Within one phase of one
 *    run, no two questions are the same question.
 * 14. **A listening question plays its own answer.** The clip's text is the
 *    option the grader accepts, exactly.
 * 15. **Nothing is written that nothing can show.** Every `rationale.*` key is
 *    reachable from `exercises.ts`, and an `example_gloss` belongs to an item
 *    that has an example — `ItemCard` draws it inside `{item.example && …}`.
 * 16. **Korean picks its particles.** No bundle writes 은(는) or 을(를): the
 *    app has a formatter for that, and the parenthesis is the register this
 *    product removed on purpose.
 * 17. **Completion is evidence.** The state machine in `domain/numbersProgress`
 *    is walked over the sequences that matter, including the ones that used to
 *    complete a lesson and must not.
 * 18. **Ordinals.** 한 번째, 일 번째, 이 번째, 첫번째 and 첫 째 are not Korean.
 *    None of them may be an item, the right half of an example, a clip, an
 *    accepted answer, or a string in any of the thirty-two bundles — *except*
 *    where the course is showing the learner what not to write, which is a
 *    thing this gate can tell apart rather than guess at.
 * 19. **Romanisation is the reading.** Every item's `romanization` is the
 *    Revised Romanisation of what the clip says, computed by the transliterator
 *    the vocabulary pipeline uses.
 * 20. **The shape of the course.** Every lesson has all six stages, every
 *    lesson id that has ever shipped is still there, every module partitions
 *    the lesson list exactly once, and the activity denominator a card prints
 *    is the one the progress model counts.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');

const { NUMBER_ITEMS, NUMBER_LESSONS, NUMBER_MODULES, numberLessonItems, spokenExample } = await import(
  '../apps/web/src/data/numbers.ts'
);
const { MEANING_PROMPT_KEY, PROMPT_KEY_FOR_TYPE, exerciseCoverage, masteryExercises, practiceExercises } = await import(
  '../apps/web/src/features/numbers/exercises.ts'
);
const {
  applyNumbersEvent,
  blankLessonProgress,
  isComplete,
  lessonActivityProgress,
  lessonStatus,
  repairLessonProgress,
} = await import('../apps/web/src/domain/numbersProgress.ts');

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
 * So the type is data now, and the table is the contract: the page's switch has
 * one branch per row and nothing else may reach a heading. It lives beside the
 * builder as `PROMPT_KEY_FOR_TYPE` and is read here rather than copied — three
 * gates kept a copy of it and one of the three had drifted.
 */
const PROMPT_FOR = PROMPT_KEY_FOR_TYPE;

/*
 * And the table has to be the page's own switch.
 *
 * Reading `PROMPT_KEY_FOR_TYPE` and then checking questions against it is a
 * tautology on its own: change the table and both sides move together. What
 * makes it a contract is that the *page* is compared against it — the switch in
 * `NumberSessionPage` is what a learner actually reads, and the table is what
 * four gates reason about.
 *
 * Parsed rather than imported, because importing a React page into a node
 * script pulls in the whole app. The shape it reads is the shape the switch has
 * had since the type became data: `case '<type>':` followed by
 * `heading = t('numbers:<key>')`. A switch written some other way fails here
 * with "no heading found", which is the right answer — a heading this cannot
 * see is a heading no gate is checking.
 */
const pageSource = readFileSync(join(ROOT, 'apps/web/src/pages/NumberSessionPage.tsx'), 'utf8');
let switchCases = 0;
for (const match of pageSource.matchAll(
  /case '(\w+)':\s*\n(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)\s*\n)*\s*heading = t\(\s*`?'?numbers:([\w.${}?'[\] ]+?)'?`?[,)]/g,
)) {
  const [, type, key] = match;
  switchCases += 1;
  const declared = PROMPT_FOR[type];
  if (!declared) {
    fail(`the page heads "${type}" and PROMPT_KEY_FOR_TYPE does not declare it`);
    continue;
  }
  /*
   * Two types resolve their heading rather than naming it.
   *
   * `sayTheNumber` reads the exercise's own `prompt.key` — three instructions,
   * one per numeral system — and the table's entry is the fallback that key
   * defaults to. `chooseMeaning` reads `MEANING_PROMPT_KEY`, keyed on the
   * answer's domain, because *무슨 뜻일까요?* is the right instruction over a
   * definition and the wrong one over four prices. Both are checked as a
   * *set* below rather than as one string here: what matters is that the page
   * reaches the same table the builder does.
   */
  if (key.includes('MEANING_PROMPT_KEY')) {
    if (!Object.values(MEANING_PROMPT_KEY).includes(declared)) {
      fail(`the page heads "${type}" from MEANING_PROMPT_KEY, which does not contain ${declared}`);
    }
    continue;
  }
  const resolved = key.includes('${') ? PROMPT_FOR.sayTheNumber : key;
  if (resolved !== declared) {
    fail(`the page heads "${type}" with ${resolved} and PROMPT_KEY_FOR_TYPE says ${declared}`);
  }
}
if (switchCases !== Object.keys(PROMPT_FOR).length) {
  fail(
    `the page's switch has ${switchCases} headings and PROMPT_KEY_FOR_TYPE declares ${Object.keys(PROMPT_FOR).length}`,
  );
}

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
  /*
   * Five meaning instructions, not one.
   *
   * *무슨 뜻일까요?* is retired: it was printed over four prices and over four
   * clock times, and it told the learner the question was about definitions in
   * both cases. Each domain names what it is asking for, and Korean is checked
   * literally here for the same reason as the four above — these sentences are
   * the specification of what the question is.
   */
  'prompt.meaning.definition': '이 말은 무엇을 나타낼까요?',
  'prompt.meaning.moneyAmount': '얼마를 뜻할까요?',
  'prompt.meaning.clockTime': '몇 시일까요?',
  'prompt.meaning.month': '몇 월일까요?',
  'prompt.meaning.weekday': '무슨 요일일까요?',
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
  for (const dead of ['prompt.spotMistake', 'prompt.read', 'prompt.listen', 'prompt.chooseMeaning']) {
    if (lookup(bundles[locale], dead) !== undefined) fail(`[${locale}] ${dead} is retired but still present`);
  }
  for (const key of [...Object.values(PROMPT_FOR), ...Object.values(MEANING_PROMPT_KEY)]) {
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
const SAME_MEANING = [
  ['gloss.counterPeople', 'gloss.counterPeoplePlain'],
  /*
   * 첫 번째 and 첫째 are both *the first one*, and the course teaches that they
   * are not used in the same places rather than that they mean different
   * things. Under one instruction they would be two defensible buttons. The
   * fix is `gloss_group` on the items and two answer domains; this is the
   * finding, stated where deleting the fix cannot delete it too.
   */
  ['gloss.ordinal1', 'gloss.ordinalPoint1'],
  ['gloss.ordinal2', 'gloss.ordinalPoint2'],
  ['gloss.ordinal3', 'gloss.ordinalPoint3'],
  ['gloss.ordinal4', 'gloss.ordinalPoint4'],
];

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

  /*
   * The answer may not be the only option of its shape.
   *
   * An option is either a numeral or prose. Where exactly one of a list is of
   * a kind, it is identifiable without being read: *what does 열여섯 mean?* over
   * **16**, *three people*, *five thousand won* and *two o'clock*, and *what
   * does 원 mean?* over *won*, **5,000**, **10,000** and **35,000**. Both were
   * shipping, both are answerable by shape, and `answerability` passed on both
   * because each does have exactly one option that answers it.
   *
   * `readChoose` refuses to build one. This asserts it from outside the
   * builder, over every question of every kind, so a second builder cannot
   * reintroduce the shape.
   */
  if (exercise.question_type !== 'orderTheParts' && exercise.options.length > 2) {
    const numeric = exercise.options.filter((o) => o.value !== undefined).length;
    const odd = numeric === 1 ? 'numeral' : numeric === exercise.options.length - 1 ? 'prose' : null;
    if (odd) {
      const answerIsNumeric = exercise.options[exercise.answer].value !== undefined;
      if ((odd === 'numeral') === answerIsNumeric) {
        fail(`${where}: the answer is the only ${odd} in its option list — it can be picked without reading it`);
      }
    }
  }

  // Distinct options, whatever they are made of. A repeated option is either
  // two right answers or a button that does nothing.
  if (new Set(shown).size !== shown.length) fail(`${where}: repeats an option - ${shown.join(' / ')}`);
  /*
   * And no option is blank.
   *
   * A builder that splits an example on a separator it did not find returns an
   * empty string, and an empty string renders as a button with nothing on it —
   * tappable, gradeable, and impossible to choose on purpose. Every other rule
   * here passes on it: it is distinct, it is in the right domain, and it is not
   * the answer.
   */
  for (const option of exercise.options) {
    const label = option.isKey || option.value !== undefined ? String(option.text) : option.text;
    if (typeof label !== 'string' || label.trim() === '') {
      fail(`${where}: one option is blank - ${shown.map((s) => `"${s}"`).join(' / ')}`);
    }
  }
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
 * A counted quantity is spaced; a date closes.
 *
 * Korean orthography spaces a unit noun from its numeral, and §43's 다만 clause
 * *permits* closing the same noun where the number is an order. A date takes
 * that permission and the course shipped 삼월 일 일, 유월 육 일, 시월 십 일 and
 * 십오 일 - each the 원칙 form, none of them written by anybody. The first reads
 * as two ones, on the screen of the lesson explaining that 일 is both.
 *
 * *Ordinals* do not take it: 번째 is a dependent noun and stays apart — 첫 번째,
 * never 첫번째 — which is §18's business and the reason this section's heading
 * no longer says "an ordinal is closed".
 *
 * Both directions are gated, because fixing one by hand is how a codebase ends
 * up with 한개 as well.
 */
const BANNED_SPACING = ['삼월 일 일', '삼월 이 일', '유월 육 일', '시월 십 일', '십오 일', '이천이십육 년'];
const REQUIRED_SPACING = ['삼월 일일', '유월 육일', '시월 십일'];
const ORDINAL_OPEN = /(일|이|삼|사|오|육|칠|팔|구|십|백|천|만)\s+(일|년)(?![가-힣])/;

/**
 * An example with the wrong half removed.
 *
 * `한 개 (✓) · 한개 (✗)` exists to show a learner the form the course is telling
 * them not to write, and the rules below are about what the course *writes*. A
 * scan that read the whole string would forbid the counter-example, which is
 * the opposite of the rule: 삼월 일 일 marked ✗ is the product saying **not
 * this**, and it is how the closed-date rule is taught at all. `spokenText`
 * makes the same cut for the recording, so no clip ever says the wrong half.
 */
const asWritten = (example) =>
  example.includes('(✗)') ? example.split('·')[0].replace(/\(✓\)/, '').trim() : example;

const koreanStrings = [];
for (const item of NUMBER_ITEMS) {
  koreanStrings.push([`item ${item.id}`, item.korean]);
  if (item.example) koreanStrings.push([`item ${item.id} example`, asWritten(item.example)]);
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
  for (const text of [item.korean, asWritten(item.example ?? '')]) {
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

// --- 11 a learner who cannot hear can finish -----------------------------------
/**
 * The whole course, built without the questions whose only stimulus is a sound.
 *
 * A `listen_choose` prompt carries an audio id and deliberately no text —
 * printing the word would print the answer — and **every one of the nineteen
 * lessons lists that kind**. A mastery check is what completes a lesson, and a
 * mastery check asks every item, so a learner who could not hear had no route
 * through this course at all: not a longer one, none.
 *
 * `settings.sound_free` has existed since §36 and the review scheduler has
 * always honoured it. What is measured here is that honouring it in Numbers
 * leaves a course rather than a remnant: every item still asked, in both
 * phases, in every lesson.
 *
 * Two lessons fall to one question shape when the listening is taken out —
 * minutes and weekdays — and that is reported rather than failed. A shorter
 * lesson a learner can finish beats a richer one they cannot.
 */
let quietRuns = 0;
const quietThin = [];
for (const lesson of NUMBER_LESSONS) {
  const practice = practiceExercises(lesson, 0, { soundFree: true });
  const mastery = masteryExercises(lesson, 0, { soundFree: true });
  quietRuns += 1;
  if (practice.some((e) => e.kind === 'listen_choose') || mastery.some((e) => e.kind === 'listen_choose')) {
    fail(`${lesson.id}: a sound-free run still contains a listening question`);
  }
  for (const id of lesson.item_ids) {
    if (!practice.some((e) => e.item_id === id)) fail(`${lesson.id}: sound-free practice never asks ${id}`);
    if (!mastery.some((e) => e.item_id === id)) fail(`${lesson.id}: sound-free mastery never asks ${id}`);
  }
  if (mastery.length === 0) fail(`${lesson.id}: no sound-free mastery check can be built`);
  const shapes = new Set([...practice, ...mastery].map((e) => e.question_type));
  if (shapes.size < 2) quietThin.push(`${lesson.id} (${[...shapes].join(', ')})`);
}

/**
 * And the second accommodation: the way out of a listening question you meet
 * anyway.
 *
 * The run-level rule above is for a learner the app knows about. This is the
 * **Can't use audio?** under the prompt, which swaps the clip for an equivalent
 * visual question — same item, same options, same answer. What has to hold is
 * that the substitute still has *one* answer, and the two substitutions fail
 * that in different ways if they are chosen carelessly:
 *
 * * a numeral's digits alone do not identify it, because its distractors
 *   include the other system's word for the same value — 하나 offered against
 *   일, and both of those are 1. The instruction has to name the set, which is
 *   why the substitute is `prompt.digitsToKorean.<system>` and not a bare
 *   numeral;
 * * a gloss identifies exactly one option only because `siblingsDistinct` drops
 *   a sibling that names what the answer names. That is a *declaration*
 *   (`gloss_group`), so this recomputes the answer rather than reading it back.
 */
let variants = 0;
const noEscape = new Set();
for (const lesson of NUMBER_LESSONS) {
  for (const attempt of ATTEMPTS) {
    for (const exercise of [...practiceExercises(lesson, attempt), ...masteryExercises(lesson, attempt)]) {
      if (exercise.kind !== 'listen_choose') continue;
      const item = NUMBER_ITEMS.find((i) => i.id === exercise.item_id);
      if (!exercise.soundFree) {
        // Legitimate, and reported rather than failed: 만 원 and 만 are both
        // 10,000 in the same set and 만 원 has no gloss, so nothing on the
        // screen would tell the two apart. A worse question is not the answer.
        noEscape.add(exercise.item_id);
        continue;
      }
      variants += 1;
      const { promptKey, value, glossKey } = exercise.soundFree;
      for (const locale of LOCALES) {
        const text = lookup(bundles[locale], promptKey);
        if (typeof text !== 'string' || text.trim() === '') {
          fail(`[${locale}] ${promptKey} is missing, and a listening question needs it`);
        }
      }
      // Resolved by the id the option was built with. Two items can share a
      // string — 오천 원 is a price and a context phrase, 세 시 삼십 분 is a
      // clock time and a pitfall — so matching on text answers with whichever
      // comes first in the file.
      const sourceOf = (option) => (option.itemId ? itemById.get(option.itemId) : undefined);
      const answer = exercise.options[exercise.answer];
      if (value !== undefined) {
        if (value !== item.value) fail(`${lesson.id}: ${item.id}'s visual prompt shows ${value}, not ${item.value}`);
        if (promptKey !== `prompt.digitsToKorean.${item.system}`) {
          fail(`${lesson.id}: ${item.id}'s visual prompt does not name the set, so its twin in the other system is also an answer`);
        }
        const fits = exercise.options.filter((option) => {
          const source = sourceOf(option);
          return source && source.value === value && source.system === item.system;
        });
        if (fits.length !== 1 || fits[0] !== answer) {
          fail(`${lesson.id}: ${fits.length} of ${item.id}'s options are ${value} in the ${item.system} set`);
        }
      } else if (glossKey !== undefined) {
        if (glossKey !== item.gloss) fail(`${lesson.id}: ${item.id}'s visual prompt shows another item's gloss`);
        const fits = exercise.options.filter((option) => sourceOf(option)?.gloss === glossKey);
        if (fits.length !== 1 || fits[0] !== answer) {
          fail(`${lesson.id}: ${fits.length} of ${item.id}'s options gloss as ${glossKey}`);
        }
      } else {
        fail(`${lesson.id}: ${item.id}'s visual prompt shows nothing`);
      }
    }
  }
}

// --- 12 nothing is tested before it is taught ----------------------------------
/**
 * A question is *about* one item, and that item is the lesson's own.
 *
 * The distractors are a separate question, and the answer to it is not "only
 * things already taught". `system_swap` — 하나 offered against 일 — is the
 * central misconception of the whole course and it necessarily reaches into the
 * set the learner has not met yet; that is what makes it the distractor. What
 * may not happen is a *stray*: an option lifted from a later lesson with no
 * declared reason for being there, which a learner cannot eliminate and the
 * feedback cannot explain.
 */
const firstLesson = new Map();
NUMBER_LESSONS.forEach((lesson, index) => {
  for (const id of lesson.item_ids) if (!firstLesson.has(id)) firstLesson.set(id, index);
});
const itemByKorean = new Map();
const itemByGloss = new Map();
for (const item of NUMBER_ITEMS) {
  if (!itemByKorean.has(item.korean)) itemByKorean.set(item.korean, item);
  if (item.gloss && !itemByGloss.has(item.gloss)) itemByGloss.set(item.gloss, item);
}
let forwardDistractors = 0;

// --- 13/14 one sitting, and the clip says the answer ---------------------------
NUMBER_LESSONS.forEach((lesson, index) => {
  for (const attempt of ATTEMPTS) {
    for (const [phase, run] of [
      ['practice', practiceExercises(lesson, attempt)],
      ['mastery', masteryExercises(lesson, attempt)],
    ]) {
      const asked = new Set();
      for (const exercise of run) {
        // 12 — the subject of the question
        const owner = firstLesson.get(exercise.item_id);
        if (owner === undefined) fail(`${lesson.id}: asks about ${exercise.item_id}, which no lesson teaches`);
        else if (owner > index) {
          fail(`${lesson.id}: asks about ${exercise.item_id}, first taught in ${NUMBER_LESSONS[owner].id}`);
        }
        exercise.options.forEach((option, at) => {
          if (at === exercise.answer) return;
          const source = option.isKey
            ? itemByGloss.get(option.text)
            : option.value !== undefined
              ? null
              : itemByKorean.get(option.text);
          if (!source) return;
          const from = firstLesson.get(source.id);
          if (from === undefined || from <= index) return;
          forwardDistractors += 1;
          if (!option.misconception) {
            fail(
              `${lesson.id}: "${option.text}" is a distractor from ${NUMBER_LESSONS[from].id} with no misconception behind it`,
            );
          }
        });

        // 13 — the same question twice in one sitting
        const fingerprint = `${exercise.question_type}|${exercise.item_id}|${JSON.stringify(exercise.prompt)}`;
        if (asked.has(fingerprint)) {
          fail(`${lesson.id} attempt ${attempt} ${phase}: ${exercise.item_id} is asked as ${exercise.question_type} twice`);
        }
        asked.add(fingerprint);

        // 14 — the clip says the answer
        if (exercise.question_type === 'listenAndChoose') {
          const said = clipText.get(exercise.prompt.audio);
          const wanted = exercise.options[exercise.answer]?.text;
          if (said !== wanted) {
            fail(`${lesson.id}: a listening question plays "${said}" and accepts "${wanted}"`);
          }
        }
      }
    }
  }
});

// --- 15 nothing is written that nothing can show -------------------------------
/**
 * Two shapes of dead copy, both of which had shipped.
 *
 * `rationale.adjacent` was in all thirty-two bundles and unreachable:
 * `MISCONCEPTION_FEEDBACK.adjacent` is `null` on purpose — *정답은 오* is
 * already on the screen — so no code path could ever ask for it.
 *
 * `example_gloss` is drawn by `ItemCard` inside `{item.example && …}`, so on an
 * item with no example it cannot be drawn. Seven keys were in that state,
 * including one — *2시 15분* — that repeated the gloss printed above it.
 */
for (const item of NUMBER_ITEMS) {
  if (item.example_gloss && !item.example) {
    fail(`${item.id} has an example_gloss and no example, so nothing can draw it`);
  }
}

// --- 15b the header may not hold the answer -------------------------------------
/**
 * A lesson whose title is one of its own answers.
 *
 * `얼마예요?` is the money lesson's title in Korean and 얼마예요? is one of its
 * items; the item's Korean gloss is *가격을 묻는 말*, a description, so the two
 * never coincide. In **thirty-one other languages** the gloss was a translation
 * of the phrase — *How much is it?*, *¿Cuánto cuesta?*, *いくらですか？* — and
 * the lesson title was the same sentence, in the header, directly above a
 * *what does this mean?* question whose correct option was that sentence.
 *
 * Three lessons were in that state (money, hours, age) and a fourth was one
 * question away (weekdays). No gate could see it: `answerability` proves one
 * option answers the question and says nothing about what else is on the
 * screen, and `hints:qa` reads hints. This one reads the **header** against the
 * **option list**, in every language, which is the comparison the defect lives
 * in and the reason a Korean-only reading missed it four passes running.
 *
 * Compared after normalising case and trimming punctuation, because *How much
 * is it?* and *How much is it* are the same leak.
 */
const bare = (text) =>
  String(text)
    .toLocaleLowerCase()
    .replace(/[.,·—?!¿¡'‘’"“”()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

let headerChecks = 0;
for (const lesson of NUMBER_LESSONS) {
  const module = NUMBER_MODULES.find((m) => m.id === lesson.module);
  for (const locale of LOCALES) {
    const header = [
      lookup(bundles[locale], lesson.title),
      module ? lookup(bundles[locale], module.title) : undefined,
    ]
      .filter(Boolean)
      .map(bare);
    if (!header.length) continue;
    for (const id of lesson.item_ids) {
      const item = NUMBER_ITEMS.find((i) => i.id === id);
      if (!item?.gloss) continue;
      const gloss = lookup(bundles[locale], item.gloss);
      if (typeof gloss !== 'string') continue;
      headerChecks += 1;
      if (header.includes(bare(gloss))) {
        fail(
          `[${locale}] ${lesson.id}: the header says "${gloss}", which is the answer to a meaning question about ${item.korean}`,
        );
      }
    }
  }
}
notes.push(`${headerChecks} lesson header / answer pairs compared across ${LOCALES.length} languages`);

// --- 16 Korean picks its particles ---------------------------------------------
/**
 * 은(는) is the register of an interface that could not decide.
 *
 * `i18n/josa.ts` exists so a Korean string does not have to: it writes
 * `{{word, eunneun}}` and gets 마디는 and 사람은, each spelled the way a person
 * would. A bundle that writes the pair out longhand has opted out of that, and
 * `prompt.orderParts` — *순서대로 눌러서 {{value}}을(를) 만들어 보세요* — was
 * the one place in the product still doing it.
 */
const PARTICLE_PAIR = /(은\(는\)|는\(은\)|이\(가\)|가\(이\)|을\(를\)|를\(을\)|과\(와\)|와\(과\)|으로\(로\)|로\(으로\))/;
for (const locale of LOCALES) {
  for (const [key, value] of flatten(bundles[locale])) {
    const hit = String(value).match(PARTICLE_PAIR);
    if (hit) fail(`[${locale}] ${key} writes the particle pair "${hit[1]}" out longhand`);
  }
}

// --- 17 completion is evidence --------------------------------------------------
/**
 * The state machine, walked over the sequences that decide a lesson.
 *
 * `numbersProgress.test.ts` owns the unit-level proof. What is here is the
 * handful of transitions a *content* change can break from a distance — a
 * lesson that grew an explanation step, an item added to `item_ids` — and the
 * one the first build got wrong: reaching the last screen completed the lesson
 * whatever the answers were.
 */
const NOW = new Date('2026-09-04T00:00:00Z');
for (const lesson of NUMBER_LESSONS) {
  const blank = blankLessonProgress(lesson.id, NOW);
  if (isComplete(blank, lesson)) fail(`${lesson.id}: an untouched record is complete`);
  if (lessonStatus(blank, lesson, { reviewDue: false }) !== 'available') {
    fail(`${lesson.id}: an untouched record is not "available"`);
  }

  // A completion nobody earned is taken back off the record on the way in.
  const forged = repairLessonProgress(
    { ...blank, completed_at: NOW.toISOString() },
    lesson,
    NOW,
  );
  if (forged === null || forged.completed_at !== null) {
    fail(`${lesson.id}: a completed_at with no evidence behind it survives repair`);
  }

  // Everything read, everything practised, and mastery answered entirely wrong.
  let record = blank;
  for (const step of lesson.explanation) {
    record = applyNumbersEvent(record, lesson, { type: 'explanation_viewed', step: step.text }, NOW);
    // Idempotent: reading a step twice is one step read.
    record = applyNumbersEvent(record, lesson, { type: 'explanation_viewed', step: step.text }, NOW);
  }
  if (record.explanation_steps_viewed.length !== lesson.explanation.length) {
    fail(`${lesson.id}: reading a step twice counted twice`);
  }
  for (const id of lesson.item_ids) {
    record = applyNumbersEvent(record, lesson, { type: 'example_viewed', item_id: id }, NOW);
  }
  record = applyNumbersEvent(record, lesson, { type: 'practice_completed' }, NOW);
  for (const id of lesson.item_ids) {
    record = applyNumbersEvent(
      record,
      lesson,
      { type: 'exercise_attempted', exercise_id: `x:${id}`, item_id: id, correct: false, phase: 'mastery' },
      NOW,
    );
  }
  record = applyNumbersEvent(
    record,
    lesson,
    { type: 'mastery_completed', correct: 0, total: lesson.item_ids.length },
    NOW,
  );
  if (isComplete(record, lesson)) fail(`${lesson.id}: reaching the end with every answer wrong completes it`);
  if (lessonStatus(record, lesson, { reviewDue: false }) !== 'in_progress') {
    fail(`${lesson.id}: a lesson worked through and failed is not "in progress"`);
  }

  // A review does not complete a lesson that was not complete.
  const reviewed = applyNumbersEvent(
    record,
    lesson,
    { type: 'review_completed', item_id: lesson.item_ids[0], correct: true },
    NOW,
  );
  if (isComplete(reviewed, lesson)) fail(`${lesson.id}: a review completed an unfinished lesson`);

  // Now earn it.
  for (const id of lesson.item_ids) {
    record = applyNumbersEvent(
      record,
      lesson,
      { type: 'exercise_attempted', exercise_id: `y:${id}`, item_id: id, correct: true, phase: 'mastery' },
      NOW,
    );
  }
  record = applyNumbersEvent(
    record,
    lesson,
    { type: 'mastery_completed', correct: lesson.item_ids.length, total: lesson.item_ids.length },
    NOW,
  );
  if (!isComplete(record, lesson)) fail(`${lesson.id}: a lesson fully earned is not complete`);
  const stamped = record.completed_at;
  // A later worse attempt cannot take it away.
  const after = applyNumbersEvent(
    record,
    lesson,
    { type: 'mastery_completed', correct: 0, total: lesson.item_ids.length },
    NOW,
  );
  if (after.completed_at !== stamped) fail(`${lesson.id}: a later failed check moved completed_at`);
  if (lessonStatus(after, lesson, { reviewDue: true }) !== 'review_due') {
    fail(`${lesson.id}: a completed lesson that is due does not say so`);
  }
}

// --- 18 ordinals ---------------------------------------------------------------
/**
 * The five ways a learner writes a Korean ordinal wrongly, and the one place
 * each of them is allowed to appear.
 *
 * ## What is wrong with them
 *
 * 번째 is a counting word and takes the native *ordinal* forms — 첫, 두, 세,
 * 네. 한 번째 reaches for the counting form that is right in front of 개 and
 * 명; 일 번째 and 이 번째 reach for the Sino-Korean set, which never stands
 * there. 첫번째 has lost the space 한글 맞춤법 §43 requires between a numeral
 * and its unit noun, and 첫 째 has gained one that the suffix 째 does not take.
 * All five are things a beginner writes in their first week and none is Korean.
 *
 * ## Why this is not a substring ban
 *
 * The course *teaches* four of them, on purpose: `첫 번째 (✓) · 한 번째 (✗)` is
 * how a learner is shown the mistake, and `lesson.ordinals.step2` says in
 * thirty-two languages that 한 번째 and 일 번째 do not exist. A gate that
 * forbade the string would forbid the teaching, which is the failure mode the
 * date-spacing rule already had to solve once (§9, `asWritten`).
 *
 * So a hit is *licensed* or it is a finding, and a licence is structural
 * wherever it can be:
 *
 * * the ✗ half of an item's own contrast example, and the caption under it
 *   (`example_gloss`), which is generated from that half;
 * * the answer of a `findIncorrectExpression` question, which is the option the
 *   learner is asked to identify as wrong, and any option carrying a declared
 *   `misconception` — a distractor exists to be wrong;
 * * one declared key per bundle, `lesson.ordinals.step2`, and only when the
 *   correct counterpart is written in the same sentence. A counter-example with
 *   nothing to compare it against is not a lesson.
 *
 * Everything else — an item's Korean, the ✓ half of an example, a gloss, a
 * clip in the manifest, the accepted answer of any other question type — is the
 * course saying *this is Korean*, and there it is a failure.
 */
const BAD_ORDINALS = {
  '한 번째': '첫 번째',
  '일 번째': '첫 번째',
  '이 번째': '두 번째',
  '삼 번째': '세 번째',
  '사 번째': '네 번째',
  '하나 번째': '첫 번째',
  '둘 번째': '두 번째',
  '셋 번째': '세 번째',
  '넷 번째': '네 번째',
  '첫번째': '첫 번째',
  '두번째': '두 번째',
  '세번째': '세 번째',
  '네번째': '네 번째',
  '첫 째': '첫째',
  '둘 째': '둘째',
  '셋 째': '셋째',
};
/*
 * Anchored on the left so a longer legitimate ordinal cannot trip it: 스물한
 * 번째 is Korean and contains none of these as a *word*, but a bare `includes`
 * would find 한 번째 inside it.
 */
const badOrdinalsIn = (text) =>
  Object.keys(BAD_ORDINALS).filter((form) =>
    new RegExp(`(^|[^가-힣])${form}`, 'u').test(String(text)),
  );

/** The one key per bundle that is allowed to name a wrong form, and teach it. */
const ORDINAL_COUNTEREXAMPLE_KEYS = new Set(['lesson.ordinals.step2']);

/** The ✗ halves the curriculum itself declares, and the captions written from them. */
const declaredWrongOrdinals = new Set();
const ordinalCaptionKeys = new Map();
for (const item of NUMBER_ITEMS) {
  if (!item.example) continue;
  const bad = item.example.split('·')[1]?.replace(/\(✗\)/, '').trim();
  if (!bad || !(bad in BAD_ORDINALS)) continue;
  declaredWrongOrdinals.add(bad);
  if (item.example_gloss) ordinalCaptionKeys.set(item.example_gloss, bad);
}

// The course must still teach the forms that *are* Korean, or the rule above is
// satisfied by a lesson that says nothing.
for (const form of ['첫 번째', '두 번째', '세 번째', '네 번째', '첫째', '둘째', '셋째']) {
  if (!NUMBER_ITEMS.some((i) => i.korean === form)) fail(`no item teaches "${form}"`);
  if (!manifest.entries.some((e) => e.text === form)) fail(`no clip says "${form}"`);
}

// Items, and the halves of their examples the course writes rather than warns
// against.
for (const item of NUMBER_ITEMS) {
  for (const [what, text] of [
    ['korean', item.korean],
    ['example', asWritten(item.example ?? '')],
    ['romanization', item.romanization],
  ]) {
    for (const form of badOrdinalsIn(text)) {
      fail(`${item.id} writes "${form}" as its ${what}, and "${form}" is not Korean`);
    }
  }
  /*
   * A ✗ half has to be one of the forms this gate knows, or it is a wrong form
   * nothing is checking. Only ordinal items are asked: the other contrast pairs
   * are about spacing and months and have their own sections.
   */
  if (item.example?.includes('(✗)') && /번째|째/.test(item.korean)) {
    const bad = item.example.split('·')[1]?.replace(/\(✗\)/, '').trim();
    if (!(bad in BAD_ORDINALS)) fail(`${item.id} marks "${bad}" wrong, and this gate cannot say why it is`);
    else if (BAD_ORDINALS[bad] !== item.korean) {
      fail(`${item.id} shows "${bad}" against ${item.korean}, but "${bad}" is the wrong form of ${BAD_ORDINALS[bad]}`);
    }
  }
}

// The recordings. Nothing the app can play may say one of these.
for (const entry of manifest.entries) {
  for (const form of badOrdinalsIn(entry.text)) {
    fail(`clip ${entry.id} says "${entry.text}", which contains the non-Korean "${form}"`);
  }
}

// Every question the engine builds: an accepted answer is the course saying
// this is Korean, unless the question is the one that asks for the mistake.
for (const exercise of everyExercise) {
  const answer = exercise.options[exercise.answer];
  if (!answer || answer.isKey || answer.value !== undefined) continue;
  const forms = badOrdinalsIn(answer.text);
  if (!forms.length) continue;
  if (exercise.question_type === 'findIncorrectExpression') continue;
  fail(`${exercise.question_type} - ${exercise.item_id}: accepts "${answer.text}" as correct Korean`);
}
for (const exercise of everyExercise) {
  exercise.options.forEach((option, at) => {
    if (option.isKey || option.value !== undefined) return;
    const forms = badOrdinalsIn(option.text);
    if (!forms.length) return;
    // A wrong form on a button is a distractor, and a distractor says why it is
    // there. The one exception is `findIncorrectExpression`, where the wrong
    // form is the answer and §8 has already required exactly one of them.
    if (at === exercise.answer && exercise.question_type === 'findIncorrectExpression') return;
    if (!option.misconception) {
      fail(
        `${exercise.question_type} - ${exercise.item_id}: offers "${option.text}" with no misconception ` +
          'saying why a learner would write it',
      );
    }
  });
}

// The bundles, in all thirty-two languages.
let ordinalCounterexamples = 0;
for (const locale of LOCALES) {
  for (const [key, value] of flatten(bundles[locale])) {
    const forms = badOrdinalsIn(value);
    if (!forms.length) continue;
    if (ordinalCaptionKeys.has(key)) {
      // A caption under a contrast card. It may name the form its own card
      // marks wrong, and it has to show the right one beside it.
      const declared = ordinalCaptionKeys.get(key);
      for (const form of forms) {
        if (form !== declared) fail(`[${locale}] ${key} names "${form}", which is not the form its card marks wrong`);
      }
      if (!String(value).includes(BAD_ORDINALS[declared])) {
        fail(`[${locale}] ${key} writes "${declared}" without "${BAD_ORDINALS[declared]}" beside it`);
      }
      ordinalCounterexamples += 1;
      continue;
    }
    if (ORDINAL_COUNTEREXAMPLE_KEYS.has(key)) {
      for (const form of forms) {
        if (!String(value).includes(BAD_ORDINALS[form])) {
          fail(`[${locale}] ${key} says "${form}" is wrong without writing "${BAD_ORDINALS[form]}" beside it`);
        }
      }
      ordinalCounterexamples += 1;
      continue;
    }
    fail(`[${locale}] ${key} writes "${forms.join('", "')}" as if it were Korean: "${String(value).slice(0, 60)}"`);
  }
}

// --- 19 romanisation is the reading ---------------------------------------------
/**
 * The Revised Romanisation of what the clip says, not of what is written.
 *
 * 십육 is spelled *sibyuk* letter for letter and said *simnyuk*, and the second
 * is what a learner sounding it out needs — so where an item declares a
 * `reading`, the romanisation is of the reading. Nothing was checking it: the
 * romanisation gate that exists reads the vocabulary corpus and has never
 * looked at this course, so 112 hand-typed transliterations were unverified.
 *
 * Computed by `scripts/content/hangul.py`, which is the transliterator the
 * vocabulary pipeline and the dictionary already use. A second implementation
 * in JavaScript would be a second thing to keep right; the cost of the cross-
 * language call is one process for the whole course.
 *
 * Compared on letters only. `공일공` is written *gong-il-gong* with hyphens
 * because it is three digits read one at a time, and `몇 살이에요?` keeps its
 * question mark in the Korean and not in the transliteration; neither is a
 * disagreement about the sound.
 */
const romanised = JSON.parse(
  execFileSync(
    'python3',
    ['-c', [
      'import sys, json',
      'sys.path.insert(0, "scripts/content")',
      'from hangul import romanize',
      'print(json.dumps([romanize(w) for w in json.load(sys.stdin)]))',
    ].join('\n')],
    {
      cwd: ROOT,
      encoding: 'utf8',
      input: JSON.stringify(NUMBER_ITEMS.map((i) => i.reading ?? i.korean)),
    },
  ),
);
const letters = (text) => String(text).toLowerCase().replace(/[^a-z]/g, '');
let romanisations = 0;
NUMBER_ITEMS.forEach((item, index) => {
  romanisations += 1;
  if (letters(romanised[index]) !== letters(item.romanization)) {
    fail(
      `${item.id}: romanisation "${item.romanization}" is not the Revised Romanisation of ` +
        `"${item.reading ?? item.korean}", which is "${romanised[index]}"`,
    );
  }
});

// --- 20 the shape of the course -------------------------------------------------
/**
 * Every lesson has all six stages a learner walks through.
 *
 * `phase` names them — objective, explanation, examples, practice, mastery,
 * summary — and four of the six are data rather than screens: a lesson with no
 * objective key, no explanation steps, no item with an example, or a mastery
 * check shorter than its item list is a lesson one of those screens has nothing
 * to draw. The old §1 checked the first two and counted items; this states the
 * whole walk, because a stage that is missing is not a rendering bug, it is a
 * lesson a learner cannot finish.
 */
for (const lesson of NUMBER_LESSONS) {
  const items = numberLessonItems(lesson);
  if (typeof lookup(en, lesson.objective) !== 'string') fail(`${lesson.id}: no objective`);
  if (typeof lookup(en, lesson.title) !== 'string') fail(`${lesson.id}: no title`);
  for (const step of lesson.explanation) {
    if (typeof lookup(en, step.text) !== 'string') fail(`${lesson.id}: explanation step ${step.text} has no text`);
    for (const id of step.show ?? []) {
      if (!itemById.has(id)) fail(`${lesson.id}: step ${step.text} draws ${id}, which is not an item`);
    }
  }
  /*
   * The examples stage draws an `ItemCard` per item, so what it needs is items
   * rather than examples — a numeral is its own example and the ten-numeral
   * lessons carry none. What it may not have is an item the card cannot
   * describe: no value to print and no gloss to print either.
   */
  for (const item of items) {
    if (item.value === null && !item.gloss) fail(`${lesson.id}: ${item.id} has nothing for its card to say`);
  }
  /*
   * `mastery_count` is a floor rather than a cap — `masteryExercises` takes one
   * question per item first and only then fills up to it — so the number to
   * check is what the builder actually returns.
   */
  const built = masteryExercises(lesson, 0);
  if (built.length < Math.max(lesson.mastery_count, items.length)) {
    fail(`${lesson.id}: a mastery check of ${built.length} question(s) for ${items.length} item(s)`);
  }
  if (practiceExercises(lesson, 0).length === 0) fail(`${lesson.id}: no guided practice can be built`);
}

/**
 * Lesson ids are the key progress is stored under, so a rename is a wipe.
 *
 * `lesson:<id>` is the row in the `numbers` store and `repairLessonProgress`
 * drops a row whose lesson no longer exists — correctly, and silently. Renaming
 * `num-lesson-forms` would therefore delete the evidence of everybody who had
 * finished it, and nothing else in this file would have anything to say. The
 * list is written down so that adding a lesson is a line in a diff and losing
 * one is a failure.
 */
const SHIPPED_LESSON_IDS = [
  'num-lesson-sino-basics', 'num-lesson-native-basics', 'num-lesson-zero', 'num-lesson-choosing',
  'num-lesson-sino-build', 'num-lesson-native-build', 'num-lesson-forms',
  'num-lesson-counters', 'num-lesson-counters-everyday', 'num-lesson-age', 'num-lesson-ordinals',
  'num-lesson-hours', 'num-lesson-minutes', 'num-lesson-dates', 'num-lesson-weekdays',
  'num-lesson-money', 'num-lesson-digits', 'num-lesson-large',
  'num-lesson-pitfalls', 'num-lesson-mixed',
];
const liveLessons = new Set(NUMBER_LESSONS.map((l) => l.id));
for (const id of SHIPPED_LESSON_IDS) {
  if (!liveLessons.has(id)) fail(`${id} has shipped and is gone — every learner's progress on it is dropped on read`);
}
for (const id of liveLessons) {
  if (!SHIPPED_LESSON_IDS.includes(id)) fail(`${id} is a lesson this gate has never been told about`);
}

/**
 * The totals a learner reads, against the ones the model counts.
 *
 * Three denominators are printed — the course header's *of N lessons*, a
 * module's *of N lessons*, and a card's *of N activities* — and each is
 * computed somewhere else. What has to hold is that the modules partition the
 * lesson list exactly once (a lesson in two modules is counted twice in the
 * header and once in each module) and that the activity total is the one
 * `lessonActivityProgress` derives.
 */
const seenInModule = new Map();
for (const module of NUMBER_MODULES) {
  for (const id of module.lesson_ids) {
    if (!liveLessons.has(id)) fail(`${module.id} lists ${id}, which is not a lesson`);
    if (seenInModule.has(id)) fail(`${id} is in both ${seenInModule.get(id)} and ${module.id}`);
    seenInModule.set(id, module.id);
  }
}
for (const lesson of NUMBER_LESSONS) {
  if (!seenInModule.has(lesson.id)) fail(`${lesson.id} is in no module, so no module counts it`);
  const activities = lessonActivityProgress(undefined, lesson);
  const expected = lesson.explanation.length + lesson.item_ids.length + 2;
  if (activities.total !== expected) {
    fail(`${lesson.id}: the card says ${activities.total} activities and the lesson has ${expected}`);
  }
  if (activities.done !== 0) fail(`${lesson.id}: a learner with no record is ${activities.done} activities in`);
  const earned = lessonActivityProgress(undefined, lesson);
  if (earned.done > earned.total) fail(`${lesson.id}: more activities done than there are`);
}
const moduleLessons = NUMBER_MODULES.reduce((n, m) => n + m.lesson_ids.length, 0);
if (moduleLessons !== NUMBER_LESSONS.length) {
  fail(`the modules hold ${moduleLessons} lessons and the course has ${NUMBER_LESSONS.length}`);
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
console.log(`  sound-free            ${quietRuns} lesson(s) complete without a heard-only question`);
console.log(`  audio escapes         ${variants} listening question(s) answerable without the clip`);
console.log(`  forward distractors   ${forwardDistractors}, every one a declared misconception`);
console.log(`  romanisations         ${romanisations} checked against the shared transliterator`);
console.log(`  ordinal forms         ${Object.keys(BAD_ORDINALS).length} rejected as Korean, ${ordinalCounterexamples} licensed counter-examples`);
console.log(`  lesson ids            ${SHIPPED_LESSON_IDS.length} shipped, all present`);
if (noEscape.size) {
  notes.push(
    `no visual substitute for the listening question about ${[...noEscape].join(', ')} — ` +
      'nothing on the screen tells its options apart without the clip',
  );
}
if (quietThin.length) {
  notes.push(
    `sound-free, ${quietThin.length} lesson(s) fall to one question shape: ${quietThin.join('; ')}`,
  );
}
if (notes.length) {
  console.log('\n  notes:');
  for (const n of notes) console.log(`    ${n}`);
}
if (problems.length) {
  console.log('\n  problems:');
  for (const p of problems) console.log(`    ✗ ${p}`);
}
if (CHECK && problems.length) process.exit(1);
