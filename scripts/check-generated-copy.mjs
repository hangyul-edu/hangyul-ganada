#!/usr/bin/env node
/**
 * Every sentence the app *composes*, rendered and read.
 *
 *   npm run copy:generated              render every question and report
 *   npm run copy:generated:check        the same; exit non-zero on a finding
 *
 * ## Why the string ledger was not enough
 *
 * `copy:ledger` reads the 834 Korean strings in the locale bundles. Not one of
 * them said *사는 4예요*. That sentence has no entry anywhere: it is
 * `rationale.value` — `{{subject}} {{value}}예요` — with an item and a particle
 * put into it at runtime, under a question whose whole content was that 사 is
 * 4. A template can be perfectly good and still compose a sentence that says
 * nothing, and a gate that reads templates cannot see it.
 *
 * So this one builds the exercises the engine would build, resolves the same
 * keys the page would resolve, with the same interpolation, and reads the
 * result — for every item, every exercise kind, both outcomes, every distractor
 * path, and all thirty-two languages.
 *
 * ## What it fails on
 *
 * - **A tautology after a correct answer.** The body repeats the prompt and the
 *   answer and adds nothing: *사는 4예요* under *사 → 4*.
 * - **An empty body.** A key that resolves to whitespace, or a wrapper rendered
 *   with nothing in it.
 * - **A raw key or placeholder residue.** `rationale.value`, `{{value}}`,
 *   `undefined`, `null`, `NaN`.
 * - **English leaking into another language.** A body identical to the English
 *   one in a language that is not English.
 * - **A category label.** 만 단위 and its kin, which name a concept rather than
 *   something a learner says.
 * - **A claim about learners.** *자주 틀려요*, *most learners confuse*, and the
 *   rest of the unsupported set.
 * - **The verdict, twice.** A body that repeats 맞았어요 / 틀렸어요.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');
const LOCALES = join(root, 'apps/web/src/locales');

const { NUMBER_LESSONS, NUMBER_ITEMS, getNumberItem } = await import('../apps/web/src/data/numbers.ts');
const { masteryExercises, practiceExercises, MISCONCEPTION_FEEDBACK } = await import('../apps/web/src/features/numbers/exercises.ts');
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

let rendered = 0;
const bodies = new Map();

for (const lesson of NUMBER_LESSONS) {
  const runs = [
    ['practice', practiceExercises(lesson, 0)],
    ['practice-retry', practiceExercises(lesson, 1)],
    ['mastery', masteryExercises(lesson, 0)],
  ];
  for (const [phase, exercises] of runs) {
    for (const exercise of exercises) {
      const item = getNumberItem(exercise.item_id);
      if (!item) { fail(`${lesson.id}: exercise names a missing item ${exercise.item_id}`); continue; }
      const answerOption = exercise.options[exercise.answer];
      const answerText = exercise.kind === 'order_parts'
        ? (exercise.parts ?? []).join(' ')
        : answerOption?.value !== undefined ? String(answerOption.value) : String(answerOption?.text ?? '');

      /*
       * Every path a learner can take out of this question: right, wrong with
       * a misconception the distractor carries, and wrong without one.
       */
      const paths = [{ outcome: 'correct', key: exercise.feedback.correct }];
      paths.push({ outcome: 'incorrect', key: exercise.feedback.incorrect });
      for (const option of exercise.options) {
        if (!option.misconception) continue;
        const key = MISCONCEPTION_FEEDBACK[option.misconception] ?? exercise.feedback.incorrect;
        paths.push({ outcome: `incorrect:${option.misconception}`, key });
      }

      for (const { outcome, key } of paths) {
        if (key === null) continue; // a correct answer with nothing to add
        for (const [locale, bundle] of bundles) {
          const template = lookup(bundle, key);
          const where = `${locale} ${lesson.id}/${phase} ${exercise.kind} ${item.korean} [${outcome}]`;
          if (template === undefined) { fail(`${where}: ${key} is missing`); continue; }
          const body = render(template, {
            korean: item.korean,
            subject: withParticle(item.korean, '은/는'),
            object: withParticle(item.korean, '을/를'),
            value: item.value === null ? '' : String(item.value),
            example: item.example ?? '',
          }).trim();
          rendered += 1;
          bodies.set(`${where}`, body);

          if (body === '') { fail(`${where}: renders empty`); continue; }
          for (const pattern of RESIDUE) {
            if (pattern.test(body)) fail(`${where}: unresolved output — ${body.slice(0, 60)}`);
          }
          for (const claim of LEARNER_CLAIMS) {
            if (body.includes(claim)) fail(`${where}: claims something about learners — ${body.slice(0, 60)}`);
          }
          for (const label of CATEGORY_LABELS) {
            if (body.includes(label)) fail(`${where}: names a category — ${body.slice(0, 60)}`);
          }
          const verdicts = [lookup(bundle, 'feedback.correct'), lookup(bundle, 'feedback.incorrect')].filter(Boolean);
          for (const verdict of verdicts) {
            if (body.includes(verdict)) fail(`${where}: repeats the verdict "${verdict}"`);
          }
          if (locale !== 'en') {
            const english = lookup(bundles.get('en'), key);
            if (english && body === render(english, { korean: item.korean, value: String(item.value ?? ''), example: item.example ?? '', subject: item.korean, object: item.korean }).trim()) {
              fail(`${where}: identical to English`);
            }
          }
          /*
           * The counting-word line, under a question that is not about one.
           *
           * *each counting word has its own things — 명 for people, 마리 for
           * animals* is true, and it was being shown under 사 → 4 because every
           * sibling distractor was labelled `wrong_counter` whatever the item
           * was. Checked by key rather than by prose: the counting-form lesson
           * legitimately ends its line with 두 개, and a rule that read the
           * words rather than the identity failed 434 correct sentences.
           */
          if (key === 'rationale.wrong_counter' && item.role !== 'counter') {
            fail(`${where}: the counting-word line under a question about a ${item.role}`);
          }
          if (outcome === 'correct' && isTautology(body, { korean: item.korean, answer: answerText })) {
            fail(`${where}: says only what the question said — "${body}"`);
          }
        }
      }
    }
  }
}

console.log(`Generated copy — ${rendered} rendered feedback strings across ${bundles.size} languages`);
console.log(`  ${NUMBER_ITEMS.length} items · ${NUMBER_LESSONS.length} lessons · practice, a retry and mastery · every outcome and misconception path`);
const withBody = [...bodies.values()].filter(Boolean).length;
console.log(`  ${withBody} of them draw a body; a correct answer with nothing to add draws none`);
if (findings.length === 0) {
  console.log('  nothing composed at runtime repeats the question, resolves empty, or claims what it cannot support.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings.slice(0, 25)) console.log(`    ${finding}`);
  if (findings.length > 25) console.log(`    …and ${findings.length - 25} more`);
}
if (CHECK && findings.length > 0) process.exit(1);
