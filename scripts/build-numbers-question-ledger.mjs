#!/usr/bin/env node
/**
 * Every distinct question the Numbers course can ask, written down and read.
 *
 *   npm run numbers:ledger            record the current bank as reviewed
 *   npm run numbers:ledger:check      fail on any question no reading covers
 *
 * ## Why a ledger and not another rule
 *
 * `answerability` proves that every question has exactly one option that
 * answers it, over 806,252 generated questions. `numbers:qa` proves the prompt
 * matches the question type, that no distractor is a synonym of the answer,
 * that the answer is not given away by position, and that the header does not
 * hold it. Every one of those is a *shape*, and every one of them was green on
 * a question that asked the opposite of what it graded: *어느 쪽이 맞을까요?* —
 * which one is right? — over an option list whose answer is the one that is
 * wrong.
 *
 * What catches that is somebody reading the question. So this file does to the
 * question bank what `copy:ledger` does to the Korean strings: it records each
 * distinct question with a hash of its content — the prompt key, the correct
 * answer and the distractors — and fails when a question has changed since it
 * was last read. The audit becomes a thing with a state rather than an event,
 * and the cost of adding a question includes the cost of reading it.
 *
 * ## What a row means
 *
 * `sound` — read, and the question asks what it grades.
 * `corrected` — read, found wanting, and changed; `why` names the fault.
 * `noted` — read, something is not ideal, and it was left; `why` says what and
 *   why. This is the row that keeps a reading honest: a question with a known
 *   weakness recorded as `sound` is a reading that did not happen.
 *
 * A row's `why` is required on a correction and on a note, and forbidden on a
 * sound reading, for the same reason `copy:ledger` requires it: a reason nobody
 * wrote is a decision nobody made.
 *
 * ## Distinct, not built
 *
 * The engine builds 972 exercises across practice, a retry and mastery, but
 * many are the same question with the options in a different order — the
 * shuffle is seeded on `(lesson, exercise, attempt)`. A row here is one
 * *question*: a lesson, an item, an exercise kind and a question type. 284 of
 * them, which is a bank a person can actually read.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const LEDGER = join(ROOT, 'docs/numbers-question-ledger.json');
const SHEET = join(ROOT, 'docs/numbers-question-ledger.md');

const { NUMBER_LESSONS, getNumberItem } = await import('../apps/web/src/data/numbers.ts');
const { MEANING_PROMPT_KEY, PROMPT_KEY_FOR_TYPE, masteryExercises, practiceExercises } = await import(
  '../apps/web/src/features/numbers/exercises.ts'
);

const en = JSON.parse(readFileSync(join(ROOT, 'apps/web/src/locales/en/numbers.json'), 'utf8'));
const lookup = (path) =>
  path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), en);

/** The heading each question type resolves. Read from the builder, not copied. */
const PROMPT_KEY = PROMPT_KEY_FOR_TYPE;

const optionText = (o) =>
  o.isKey ? (lookup(o.text) ?? o.text) : o.value !== undefined ? String(o.value) : o.text;

const rows = new Map();
for (const lesson of NUMBER_LESSONS) {
  const built = [
    ...practiceExercises(lesson, 0),
    ...practiceExercises(lesson, 1),
    ...masteryExercises(lesson, 0),
  ];
  for (const exercise of built) {
    const item = getNumberItem(exercise.item_id);
    if (!item) continue;
    const id = `${lesson.id}/${exercise.kind}/${exercise.item_id}`;
    if (rows.has(id)) continue;
    const answer = exercise.options[exercise.answer];
    // `prompt.key` only selects a heading on `sayTheNumber`, where it picks the
    // Sino-Korean, native or either-set wording. On `chooseSystem` it carries
    // the item's gloss for the sound-free substitute and is not the heading.
    const promptKey =
      exercise.question_type === 'sayTheNumber'
        ? (exercise.prompt.key ?? PROMPT_KEY.sayTheNumber)
        : exercise.question_type === 'chooseMeaning'
          ? // Five instructions, one per domain a meaning question can ask about.
            (MEANING_PROMPT_KEY[exercise.schema.answerDomain] ?? PROMPT_KEY.chooseMeaning)
          : PROMPT_KEY[exercise.question_type];
    rows.set(id, {
      id,
      lesson: lesson.id,
      module: lesson.module,
      type: exercise.question_type,
      kind: exercise.kind,
      /*
       * The three fields that make a row auditable rather than merely listed.
       *
       * A reader looking at *원 · 무슨 뜻일까요? · 한국 돈의 단위 · 5,000원,
       * 10,000원, 35,000원* has to work out for themselves that three of those
       * are amounts and one is a definition. With the domain written down the
       * mismatch is the row: the answer is a `definition` and the distractors
       * are `moneyAmount`, and no reading is needed to see it.
       */
      target: exercise.schema.targetType,
      domain: exercise.schema.answerDomain,
      strategy: exercise.schema.distractorStrategy.join(', '),
      korean: item.korean,
      prompt: lookup(promptKey) ?? promptKey,
      answer:
        exercise.kind === 'order_parts'
          ? (exercise.parts ?? []).join(' ')
          : optionText(answer ?? {}),
      distractors: exercise.options
        .filter((_, i) => i !== exercise.answer)
        .map((o) => `${optionText(o)}${o.misconception ? ` (${o.misconception})` : ''}`),
    });
  }
}

const ordered = [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
const hashOf = (row) =>
  createHash('sha256')
    .update(JSON.stringify([row.type, row.domain, row.prompt, row.answer, [...row.distractors].sort()]))
    .digest('hex')
    .slice(0, 12);

const existing = (() => {
  try {
    return JSON.parse(readFileSync(LEDGER, 'utf8'));
  } catch {
    return { reviewed: {} };
  }
})();

const findings = [];
const reviewed = {};
let unread = 0;
let corrected = 0;
for (const row of ordered) {
  const hash = hashOf(row);
  const before = existing.reviewed?.[row.id];
  if (!before) {
    unread += 1;
    if (CHECK) findings.push(`${row.id}: never read`);
    reviewed[row.id] = { hash, result: 'sound' };
    continue;
  }
  if (before.hash !== hash) {
    unread += 1;
    if (CHECK) findings.push(`${row.id}: changed since it was read`);
    reviewed[row.id] = { hash, result: before.result, ...(before.why ? { why: before.why } : {}) };
    continue;
  }
  if (before.result !== 'sound' && !before.why) {
    findings.push(`${row.id}: recorded as ${before.result} with no reason`);
  }
  if (!['sound', 'corrected', 'noted'].includes(before.result)) {
    findings.push(`${row.id}: has an unknown result "${before.result}"`);
  }
  if (before.result === 'sound' && before.why) {
    findings.push(`${row.id}: recorded as sound and carries a reason`);
  }
  if (before.result !== 'sound') corrected += 1;
  reviewed[row.id] = before;
}
for (const id of Object.keys(existing.reviewed ?? {})) {
  if (!rows.has(id)) findings.push(`${id}: a reading for a question that no longer exists`);
}

if (!CHECK) {
  writeFileSync(
    LEDGER,
    `${JSON.stringify(
      {
        _comment:
          'Every distinct Numbers question, with a hash of the prompt, the answer and the distractors that were read. A question whose hash no longer matches has changed since its last reading and must be read again. Generated by scripts/build-numbers-question-ledger.mjs; the decisions are written by the person reading.',
        questions: ordered.length,
        reviewed,
      },
      null,
      1,
    )}\n`,
    'utf8',
  );
  const lines = [
    '# Numbers question ledger',
    '',
    'Generated by `npm run numbers:ledger`. One row per distinct question the',
    'course can ask — a lesson, an item, an exercise kind and a question type.',
    'The decisions live in `docs/numbers-question-ledger.json`; this sheet is what',
    'they were read from.',
    '',
    '| Content ID | Module | Lesson | Type | Target | Answer domain | Korean | Prompt | Correct answer | Distractors | Result | Correction |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of ordered) {
    const r = reviewed[row.id];
    lines.push(
      `| \`${row.id}\` | ${row.module.replace('mod-', '')} | ${row.lesson.replace('num-lesson-', '')} | ${row.type} | ${row.target} | ${row.domain} | ${row.korean} | ${row.prompt.replace(/\|/g, '\\|')} | ${String(row.answer).replace(/\|/g, '\\|')} | ${row.distractors.join(' · ').replace(/\|/g, '\\|')} | ${r.result} | ${r.why ?? '—'} |`,
    );
  }
  writeFileSync(SHEET, `${lines.join('\n')}\n`, 'utf8');
}

console.log(`Numbers question ledger — ${ordered.length} distinct questions`);
console.log(`  ${ordered.length - unread} carry a reading at their current wording; ${corrected} were corrected or noted because of one`);
console.log(`  validation: answerability (one valid option), numbers:qa (prompt/type, distractor class,`);
console.log('  answer position, header leak), copy:generated (no composed result body)');
if (findings.length) {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings.slice(0, 30)) console.log(`    ${finding}`);
  if (findings.length > 30) console.log(`    …and ${findings.length - 30} more`);
  if (CHECK) process.exit(1);
} else if (CHECK) {
  console.log('\n  every question in the bank has been read at its current wording.');
}
