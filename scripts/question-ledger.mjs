#!/usr/bin/env node
/**
 * Every objective question the product can ask, written down in one place.
 *
 *   npx tsx scripts/question-ledger.mjs           write the ledger and summarise
 *   npx tsx scripts/question-ledger.mjs --check   fail on any invariant breach
 *
 * ## Why a ledger rather than another gate
 *
 * The gates that already exist each read one source and each answer one
 * question — `leveltest:ambiguity` reads the bank, `numbers:qa` builds the
 * Numbers exercises, `dailyvocab:qa` reads the day's queue. None of them can
 * answer "how many questions are there, and has every one of them been looked
 * at", which is the question a release has to answer, and none of them sees
 * that the Level Test and Today's Vocabulary now ask *the same* gap-fills from
 * `cloze.json` and so share a defect when one appears.
 *
 * So this enumerates the three data sources every objective question is
 * ultimately built from, records each question with what a reader needs to
 * judge it, and re-applies the invariants that hold across all of them. The
 * ledger it writes is the artefact a human review works from — the rules below
 * are proxies, and reading Korean is not something any of them do.
 *
 * ## The invariants, and why each one exists
 *
 * | | |
 * | --- | --- |
 * | options unique after normalisation | 三 and ３ and 3 are one option wearing three labels |
 * | the answer is among the options exactly once | otherwise the item is unanswerable or self-answering |
 * | at least two options | a question with one button is a statement |
 * | one consumable in a consumption frame | 밥을 먹고 ____을 드세요 took 물 and 약 |
 * | one activity noun in a 하다 frame | 친구와 ____를 해요 took 축구 and 낚시 |
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  consumableWords,
  isActivityNoun,
  isConsumptionObjectFrame,
  isHadaFrame,
} from './lib/level-test-rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');
const read = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));

const manifest = read('apps', 'web', 'public', 'level-test', 'manifest.json');
const bank = read('apps', 'web', 'public', 'level-test', manifest.bank);
const cloze = read('apps', 'web', 'src', 'data', 'generated', 'cloze.json');
const anchorList = read('content-cache', 'level-test-anchors.json').anchors;
const nounClasses = read('content', 'vocabulary', 'noun-classes.json').classes;
const CONSUMABLES = consumableWords(anchorList, nounClasses);
const LEMMAS = new Set(anchorList.map((a) => a.word));

const { NUMBER_LESSONS } = await import(
  new URL('../apps/web/src/data/numbers.ts', import.meta.url).href
);
const { masteryExercises, practiceExercises } = await import(
  new URL('../apps/web/src/features/numbers/exercises.ts', import.meta.url).href
);

/**
 * Width and encoding folded away — and **spacing deliberately kept**.
 *
 * Two options that differ only in a full-width digit are one option as far as a
 * learner tapping a button is concerned, so NFKC has to run. Removing spaces as
 * well looks like the same idea and is the opposite of it: Korean spacing is
 * meaningful, and the Numbers course teaches it with minimal pairs — 두 개
 * against 두개, 세 번째 against 세번째, 스무 살 against 스무살. The first draft
 * of this file stripped spaces and reported eighteen of the course's own
 * spacing questions as having a duplicate option, which is a check destroying
 * the distinction the question exists to test.
 *
 * Runs of whitespace collapse to one and the ends are trimmed, because that
 * difference is invisible on screen and is a real duplicate.
 */
function normalise(text) {
  return String(text)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const questions = [];
const problems = [];
const note = (question, rule, detail) => problems.push({ id: question.id, rule, detail });

function record(question) {
  questions.push(question);
  const { options, answer } = question;
  if (options.length < 2) {
    note(question, 'single-option', `only ${options.length} option(s)`);
  }
  const seen = new Map();
  for (const option of options) {
    const key = normalise(option);
    if (seen.has(key)) {
      note(question, 'duplicate-option', `"${seen.get(key)}" and "${option}" normalise alike`);
    }
    seen.set(key, option);
  }
  if (answer !== null && answer !== undefined) {
    const hits = options.filter((o) => normalise(o) === normalise(answer));
    if (hits.length === 0) note(question, 'answer-absent', `${answer} is not among the options`);
    if (hits.length > 1) note(question, 'answer-twice', `${answer} appears ${hits.length} times`);
  }
  if (question.frame) {
    const others = options.filter((o) => normalise(o) !== normalise(answer));
    if (isConsumptionObjectFrame(question.frame)) {
      for (const other of others) {
        if (CONSUMABLES.has(other)) {
          note(question, 'consumable-collision', `${other} can be swallowed, and the verb is 드시다`);
        }
      }
    }
    if (isHadaFrame(question.frame)) {
      for (const other of others) {
        if (isActivityNoun(other, LEMMAS)) {
          note(question, 'activity-collision', `${other}하다 is a thing you can do, and the verb is 하다`);
        }
      }
    }
  }
}

for (const item of bank.items) {
  record({
    id: item.id,
    source: `apps/web/public/level-test/${manifest.bank}`,
    surface: 'Vocabulary Level Test',
    type: item.kind,
    level: item.level ?? null,
    prompt: item.prompt ?? item.promptId ?? '',
    options: item.options ?? item.optionIds ?? [],
    answer: item.answer ?? null,
    frame: item.kind === 'context' && item.form === 'noun' ? item.prompt : null,
    rationale:
      item.kind === 'context'
        ? 'distractors are filtered by category, noun class, particle agreement, frame safety and the frame rules in scripts/lib/level-test-rules.mjs'
        : 'one gloss per sense; a distractor sharing the answer’s meaning in any locale is rejected by collideInAnyLocale',
  });
}

for (const [id, entry] of Object.entries(cloze.words ?? {})) {
  const sentence = `${entry.before}____${entry.after}`;
  record({
    id: `cloze:${id}`,
    source: 'apps/web/src/data/generated/cloze.json',
    surface: 'Today’s Vocabulary and Review',
    type: 'cloze',
    level: null,
    prompt: sentence,
    options: (entry.options ?? []).map((o) => o.surface),
    answer: entry.target,
    frame: entry.form === 'noun' ? sentence : null,
    rationale: 'built by the same builder as the Level Test bank, so one set of rules decides both',
  });
}

for (const lesson of NUMBER_LESSONS) {
  for (const [kind, built] of [
    ['practice', practiceExercises(lesson, 0)],
    ['mastery', masteryExercises(lesson, 0)],
  ]) {
    for (const exercise of built) {
      const options = (exercise.options ?? []).map((o) => String(o.text ?? o.value ?? ''));
      const answerOption = (exercise.options ?? []).find((o) => o.isKey);
      record({
        id: `numbers:${lesson.id}:${kind}:${exercise.item_id}:${exercise.kind}`,
        source: 'apps/web/src/data/numbers.ts',
        surface: 'Numbers course',
        type: `numbers-${exercise.question_type ?? exercise.kind}`,
        level: null,
        prompt: exercise.prompt_key ?? exercise.type,
        options,
        answer: answerOption ? String(answerOption.text ?? answerOption.value ?? '') : null,
        frame: null,
        rationale: 'options come from the lesson’s own siblings, excluding any that fills the same slot (slot_group)',
      });
    }
  }
}

const bySurface = new Map();
for (const question of questions) {
  bySurface.set(question.surface, (bySurface.get(question.surface) ?? 0) + 1);
}

writeFileSync(
  join(ROOT, 'content-cache', 'question-ledger.json'),
  `${JSON.stringify({ generated: questions.length, questions }, null, 2)}\n`,
);

console.log('\nObjective question ledger\n');
for (const [surface, count] of [...bySurface].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(6)}  ${surface}`);
}
console.log(`  ${String(questions.length).padStart(6)}  total, written to content-cache/question-ledger.json`);

if (problems.length === 0) {
  console.log('\n  every question has one answer, distinct options, and no frame collision.\n');
} else {
  console.log(`\n${problems.length} problem(s):\n`);
  for (const p of problems.slice(0, 40)) console.log(`  ${p.rule.padEnd(22)} ${p.id} — ${p.detail}`);
  if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`);
  console.log();
}
if (CHECK && problems.length > 0) process.exit(1);
