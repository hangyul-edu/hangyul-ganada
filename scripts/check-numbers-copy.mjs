#!/usr/bin/env node
/**
 * The Numbers course reads like a course for beginners, in all 32 languages.
 *
 *   npm run numbers:copy            report
 *   npm run numbers:copy -- --check the same; exit non-zero on a finding
 *
 * ## What went wrong, and why a gate rather than a rewrite
 *
 * The course was written by somebody who knows Korean grammar, for somebody who
 * does not. Its module titles were *두 체계* and *열 너머*; a lesson called
 * itself *일 이 삼 — 한자어 수 일에서 십까지*; a goal read *상황에 맞는 체계를
 * 골라요*. Every one of those is accurate. Not one of them is a sentence a
 * person who has just downloaded a Korean app can act on, and the first screen
 * of a numbers course is where an absolute beginner is most likely to close it.
 *
 * The copy has been rewritten — 1,856 strings across 32 languages — and a
 * rewrite is a state, not a property. What keeps it rewritten is this: the
 * linguistic labels may not come back into the copy a learner has to
 * understand in order to answer.
 *
 * ## The rule
 *
 * ```
 * A module title, a module goal, a lesson title, a lesson objective,
 * a question prompt, an answer gloss or a feedback line
 * may not name the two number sets by their linguistic labels.
 * ```
 *
 * The two sets are called by their own first three words — 일, 이, 삼 and
 * 하나, 둘, 셋 — which is what they are, is concrete, and needs no prior
 * teaching. A counter is a *counting word*.
 *
 * ## Where the technical terms are still allowed, and why the exception is one line
 *
 * `lesson.choosing.step3`, and nowhere else. That lesson is where a learner has
 * just seen both sets in one clock time, which is the moment the names are
 * useful rather than intimidating, and they are given there in brackets with an
 * explicit note that today is not the day to memorise them. §4 of the brief
 * allows exactly this: technical labels introduced later as optional reference,
 * never required to understand a beginner lesson.
 *
 * Naming the exception as a path rather than allowing a count of them is
 * deliberate. A budget would let the terms creep back one string at a time.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCALES = join(here, '..', 'apps/web/src/locales');
const CHECK = process.argv.includes('--check');

/**
 * The labels, per language, that name a set by its linguistic category.
 *
 * Korean and English are checked by their own words; every other language is
 * checked for the two Korean terms and for the English ones, which is what an
 * untranslated or copy-pasted string would leave behind. A language that
 * invents its own linguistic label for these sets is not caught here — that is
 * what reading them is for, and what §11's native review is for.
 */
const BANNED = {
  '*': [
    '한자어 수',
    '고유어 수',
    // The bare word, not only 두 체계: "체계 선택", "같은 체계" and "어떤 체계"
    // were all in the copy and all say the same unhelpful thing.
    '체계',
    '단위 명사',
    '두 가지 영',
    '열 너머',
    'Sino-Korean',
    'sino-korean',
    'Sino number',
    'sino number',
  ],
  en: [
    'native Korean',
    'Native Korean',
    // "Two number systems" as a module title is exactly the register this
    // rewrite removed, and the first draft of this gate let it through
    // because it only looked for the *names* of the sets and not for the
    // word that frames them as a grammatical apparatus.
    'number system',
    'counter',
  ],
};

/** The one place the labels are allowed, and the reason is in the file header. */
const REFERENCE = new Set(['lesson.choosing.step3']);

/**
 * The copy a learner must understand in order to get through a lesson.
 *
 * Titles and goals, because they are the whole of what the course list shows.
 * Objectives, because they are the first screen of a lesson. Prompts, because
 * they *are* the question. Glosses, because they are the answer. Rationale,
 * because it is the explanation of why an answer was right, and an explanation
 * a learner cannot read is not one.
 */
const READS = [
  /^module\.[^.]+\.(title|goal)$/,
  /^lesson\.[^.]+\.(title|objective|step\d+)$/,
  /^prompt\./,
  /^gloss\./,
  /^rationale\./,
  /^example\./,
  /^system(Sino|Native|Both)$/,
  /^system\./,
];

const findings = [];
const locales = readdirSync(LOCALES).filter((locale) =>
  readdirSync(join(LOCALES, locale)).includes('numbers.json'),
);

let strings = 0;
for (const locale of locales) {
  const pack = JSON.parse(readFileSync(join(LOCALES, locale, 'numbers.json'), 'utf8'));
  const banned = [...BANNED['*'], ...(BANNED[locale] ?? [])];

  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key;
      if (typeof value === 'string') {
        if (!READS.some((shape) => shape.test(at))) continue;
        strings += 1;
        if (REFERENCE.has(at)) continue;
        /*
         * What a learner reads, not what the file contains.
         *
         * `prompt.counterForm` is "How do you say {{value}} with {{counter}}?"
         * and renders as "How do you say 3 with 개?" — the word *counter* is
         * the name of a slot, and the thing that lands in it is a Korean
         * counting word. A gate that reads the template rather than the
         * sentence reports the developer's vocabulary as the learner's.
         */
        const read = value.replace(/\{\{[^}]*\}\}/g, '');
        for (const term of banned) {
          if (read.includes(term)) {
            findings.push(`${locale} ${at}: names the set "${term}" — ${value.slice(0, 70)}…`);
          }
        }
      } else if (value && typeof value === 'object') {
        walk(value, at);
      }
    }
  };
  walk(pack, '');
}

/*
 * And that the exception is actually taken.
 *
 * A learner should meet the technical names once, in the lesson where they
 * finally mean something. If that line ever loses them, the course has gone
 * from too technical to silent about a thing every textbook says, and the fix
 * is a sentence rather than a rule.
 */
const korean = JSON.parse(readFileSync(join(LOCALES, 'ko', 'numbers.json'), 'utf8'));
if (!korean.lesson.choosing.step3.includes('한자어 수')) {
  findings.push('ko lesson.choosing.step3 no longer introduces the technical names at all');
}

console.log(`Numbers copy — ${strings} learner-facing strings across ${locales.length} languages`);
if (findings.length === 0) {
  console.log('  no lesson names the two number sets by a linguistic label a beginner has not met.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings) console.log(`    ${finding}`);
}
if (CHECK && findings.length > 0) process.exit(1);
