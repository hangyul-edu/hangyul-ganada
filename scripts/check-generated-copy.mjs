#!/usr/bin/env node
/**
 * Every sentence the app *composes*, rendered and read — and the proof that an
 * answer result composes none.
 *
 *   npm run copy:generated              render every question and report
 *   npm run copy:generated:check        the same; exit non-zero on a finding
 *
 * ## Why the string ledger was not enough
 *
 * `copy:ledger` reads the Korean strings in the locale bundles. Not one of them
 * said *사는 4예요*. That sentence had no entry anywhere: it was
 * `rationale.value` — `{{subject}} {{value}}예요` — with an item and a particle
 * put into it at runtime, under a question whose whole content was that 사 is
 * 4. A template can be perfectly good and still compose a sentence that says
 * nothing, and a gate that reads templates cannot see it.
 *
 * ## The result body is gone, and this is what says so
 *
 * Four passes were spent making those sentences say something — the generated
 * *사는 4예요*, then *정답은 8*, then the counting-word line under questions
 * about numerals, then `rationale.adjacent` — and each pass removed the worst of
 * them and left the rest. The answer result now shows the verdict and nothing
 * else: the option the learner tapped is marked with a cross, the right one with
 * a tick, and both marks carry their own screen-reader text. The teaching is in
 * the explanation steps, which are read before the exercise.
 *
 * So the first half of this gate is a **structural** claim, checked over every
 * exercise the engine can build in every lesson and every phase:
 *
 * ```
 * No exercise carries a result body, and no bundle carries a key for one.
 * ```
 *
 * That is what stops the block coming back through another component, a review
 * mode or one untended translation — which is exactly how `rationale` survived:
 * `wrong_system_context` was attached to options for four passes with no
 * sentence in any of the thirty-two bundles, and a learner who tapped that
 * option was shown the key.
 *
 * ## The second half: what is still composed
 *
 * Prompts are. `prompt.counterForm` is *{{value}} — {{counter}} 앞에서는 어떻게
 * 말할까요?* and only exists as a sentence once an item and a counting word are
 * in it, and `prompt.orderParts` the same. Those are rendered here for every
 * item, in all thirty-two languages, and read for:
 *
 * - **An empty prompt.** A key that resolves to whitespace.
 * - **A raw key or placeholder residue.** `{{value}}`, `undefined`, `null`, `NaN`.
 * - **English leaking into another language.**
 * - **A category label.** 만 단위 and its kin, which name a concept rather than
 *   something a learner says.
 * - **A claim about learners.** *자주 틀려요*, *most learners confuse*.
 * - **The verdict.** A prompt that pre-empts 맞았어요 / 틀렸어요.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');
const LOCALES = join(root, 'apps/web/src/locales');

const { NUMBER_LESSONS, NUMBER_ITEMS, getNumberItem } = await import('../apps/web/src/data/numbers.ts');
const { PROMPT_KEY_FOR_TYPE, masteryExercises, practiceExercises } = await import('../apps/web/src/features/numbers/exercises.ts');
const { withParticle } = await import('../apps/web/src/i18n/josa.ts');

const findings = [];
const fail = (what) => findings.push(what);

const bundles = new Map();
for (const locale of readdirSync(LOCALES)) {
  const path = join(LOCALES, locale, 'numbers.json');
  bundles.set(locale, JSON.parse(readFileSync(path, 'utf8')));
}

/** `rationale.value` → the string, or undefined. */
function lookup(bundle, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), bundle);
}

/** i18next's interpolation, for the values the page actually passes. */
function render(template, values) {
  return String(template).replace(/\{\{\s*(\w+)[^}]*\}\}/g, (_, name) => String(values[name] ?? `{{${name}}}`));
}

/*
 * The claims a sentence may not make, and the shapes it may not have.
 *
 * `LEARNER_CLAIMS` is the set this repository has no evidence for. It is
 * checked in Korean and in English because those are the two the copy was
 * written in; a translation of one of them is caught by the English-leak rule
 * or by a reader, and that is stated rather than pretended otherwise.
 */
const LEARNER_CLAIMS = [
  '자주 틀려요', '자주 헷갈려요', '가장 많이 틀리는', '학습자들이',
  'most learners', 'people often confuse', 'learners often', 'most beginners',
];
const CATEGORY_LABELS = ['만 단위', '체계', 'number system', 'two sets'];
const RESIDUE = [/\{\{/, /\bundefined\b/, /\bnull\b/, /\bNaN\b/, /^[a-z]+\.[a-z]+/i];

/**
 * Does this sentence say anything the question did not already say?
 *
 * The test is deliberately mechanical: strip everything that is punctuation or
 * a particle, and see whether what is left is a subset of {the prompt word, the
 * answer}. *사는 4예요* reduces to {사, 4} and the question was 사 → 4, so it
 * adds nothing. *10,000원은 만 원이라고 읽어요* reduces to a set containing
 * 원이라고, 읽어요 — words the question never held — so it survives.
 */
function isTautology(body, { korean, answer }) {
  const words = body
    .replace(/[.,·—?!'‘’"“”()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  const known = new Set();
  for (const token of [korean, answer].filter(Boolean)) {
    known.add(String(token));
    for (const pair of ['은/는', '이/가', '을/를', '이에요/예요']) {
      known.add(withParticle(String(token), pair));
    }
  }
  // Every word is either the prompt, the answer, one of them with a particle,
  // or a copula ending glued to one of them.
  return words.every((word) => {
    if (known.has(word)) return true;
    for (const token of known) {
      if (word.startsWith(token) && word.length - token.length <= 4) return true;
    }
    return false;
  });
}

/**
 * Which string heads each question type.
 *
 * Read from the builder rather than copied. This file kept its own copy for one
 * pass and it drifted: it resolved `prompt.key` on every type, and on
 * `chooseSystem` that key is the item's gloss for the sound-free substitute,
 * not the heading — so the gate read a gloss and called it an instruction.
 */
const PROMPT_KEY = PROMPT_KEY_FOR_TYPE;

/**
 * A key on an exercise that would carry a sentence for the answer result.
 *
 * Named rather than inferred, because the point is to fail on the *shape*
 * coming back under any name somebody reaches for next.
 */
const BODY_FIELDS = ['feedback', 'rationale', 'explanation', 'note', 'why'];

/** The prompt keys that are only a sentence once values are put into them. */
const COMPOSED_PROMPTS = new Set(['prompt.counterForm', 'prompt.orderParts']);

let rendered = 0;
let exercises = 0;
let bodies = 0;

for (const lesson of NUMBER_LESSONS) {
  const runs = [
    ['practice', practiceExercises(lesson, 0)],
    ['practice-retry', practiceExercises(lesson, 1)],
    ['mastery', masteryExercises(lesson, 0)],
  ];
  for (const [phase, built] of runs) {
    for (const exercise of built) {
      exercises += 1;
      const item = getNumberItem(exercise.item_id);
      if (!item) { fail(`${lesson.id}: exercise names a missing item ${exercise.item_id}`); continue; }

      // --- the result composes nothing ------------------------------------
      for (const field of BODY_FIELDS) {
        if (field in exercise) {
          bodies += 1;
          fail(`${lesson.id}/${phase} ${exercise.kind} ${item.korean}: carries a result body in "${field}"`);
        }
      }

      // --- the prompts, which are composed --------------------------------
      // `prompt.key` only selects a heading on `sayTheNumber`. On `chooseSystem`
      // it carries the item's gloss for the sound-free substitute.
      const key =
        exercise.question_type === 'sayTheNumber'
          ? (exercise.prompt.key ?? PROMPT_KEY.sayTheNumber)
          : PROMPT_KEY[exercise.question_type];
      if (!key) continue;
      for (const [locale, bundle] of bundles) {
        const template = lookup(bundle, key);
        const where = `${locale} ${lesson.id}/${phase} ${exercise.kind} ${item.korean}`;
        if (template === undefined) { fail(`${where}: ${key} is missing`); continue; }
        const body = render(template, {
          korean: item.korean,
          value: item.value === null ? '' : String(item.value),
          counter: exercise.prompt.text ?? '',
          count: '10',
          total: '10',
          correct: '8',
          pass: '8',
        }).trim();
        rendered += 1;

        if (body === '') { fail(`${where}: ${key} renders empty`); continue; }
        if (COMPOSED_PROMPTS.has(key)) {
          for (const pattern of RESIDUE) {
            if (pattern.test(body)) fail(`${where}: unresolved output — ${body.slice(0, 60)}`);
          }
        }
        for (const claim of LEARNER_CLAIMS) {
          if (body.includes(claim)) fail(`${where}: claims something about learners — ${body.slice(0, 60)}`);
        }
        for (const label of CATEGORY_LABELS) {
          if (body.includes(label)) fail(`${where}: names a category — ${body.slice(0, 60)}`);
        }
        /*
          A composed prompt may not pre-empt the verdict.

          Only the composed ones. `prompt.findIncorrectExpression` is *다음 중
          틀린 표현을 고르세요* — pick the one that is wrong — and in a dozen
          languages the word for *wrong* in that instruction is the same word as
          `feedback.incorrect`. Reading the fixed prompts for it reported 226
          correct questions, which is the shape of gate this project keeps
          having to unpick: a rule that was right about the result body applied
          to a string that is a question.
        */
        if (COMPOSED_PROMPTS.has(key)) {
          const verdicts = [lookup(bundle, 'feedback.correct'), lookup(bundle, 'feedback.incorrect')].filter(Boolean);
          for (const verdict of verdicts) {
            if (body.includes(verdict)) fail(`${where}: the prompt already says "${verdict}"`);
          }
        }
        if (locale !== 'en' && COMPOSED_PROMPTS.has(key)) {
          const english = lookup(bundles.get('en'), key);
          if (english && body === render(english, { korean: item.korean, value: String(item.value ?? ''), counter: exercise.prompt.text ?? '' }).trim()) {
            fail(`${where}: identical to English`);
          }
        }
      }
    }
  }
}

/*
 * The retired block, checked in the bundles as well as on the exercises.
 *
 * An exercise cannot carry a key the builder does not set, so the structural
 * check above is about the code. This one is about the content: a translated
 * pack that still holds the sentences is a pack somebody will wire back up.
 */
const RETIRED_BLOCKS = ['rationale', 'explanation', 'why'];
for (const [locale, bundle] of bundles) {
  /*
    `feedback` stays: it is 맞았어요 / 틀렸어요, the verdict itself, and the
    verdict is the whole of what the result state draws. `note` stays: it is an
    authored line on an item card, read before the exercise. What may not come
    back is the block that held the sentence *under* a verdict.
  */
  for (const field of RETIRED_BLOCKS) {
    if (field in bundle) fail(`${locale}: the retired "${field}" block is back in numbers.json`);
  }
}

console.log(`Generated copy — ${exercises} exercises built, ${rendered} rendered prompts across ${bundles.size} languages`);
console.log(`  ${NUMBER_ITEMS.length} items · ${NUMBER_LESSONS.length} lessons · practice, a retry and mastery`);
console.log(`  ${bodies} of them compose a sentence under the answer result — the number that may ever be printed here is 0`);
if (findings.length === 0) {
  console.log('  no answer result composes an explanation, and no prompt resolves empty,');
  console.log('  leaks English, names a category or claims what this repository cannot support.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings.slice(0, 25)) console.log(`    ${finding}`);
  if (findings.length > 25) console.log(`    …and ${findings.length - 25} more`);
}
if (CHECK && findings.length > 0) process.exit(1);
