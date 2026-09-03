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
 * ## The one exception was removed
 *
 * `lesson.choosing.step3` used to be allowed to name the two sets — in brackets,
 * with a note that today was not the day to memorise them — on the argument
 * that a learner who has just seen both in one clock time is at the moment the
 * names are useful rather than intimidating. The argument was wrong twice over.
 * A beginner who has just been shown *세 시 삼십 분* does not need to know that
 * a grammar book calls the halves 고유어 수 and 한자어 수; and a line that ends
 * *worth knowing, not worth memorising today* is a line that admits it did not
 * need to be there.
 *
 * There is now no exception. No learner-facing string in this course names a
 * set by a linguistic category, and none explains where either set came from —
 * see the origin list below, which is the other half of the same rule.
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
    /*
     * The metaphors that replaced the technical names, and were no better.
     *
     * *두 벌* — two sets — and *두 가지 숫자* were the second draft's way of
     * saying 체계 without saying it, and a learner who reads *Korean has two
     * sets of numbers* has been handed one more thing to hold before being
     * told anything they can use. *쪽* — this side, that side — was the third,
     * and it is the vague subject the copy rules forbid: a sentence whose
     * subject is *the other side* names nothing.
     *
     * What replaced all of them is not another word for the sets. It is their
     * own first three members, 일, 이, 삼 and 하나, 둘, 셋, which need no
     * introduction because they are what the lesson is teaching anyway.
     */
    '두 벌',
    '두 가지 숫자',
    '두 가지 방법',
    '어느 체계',
    '만 단위',
    'two sets',
    'Two sets',
    'two ways',
    'number family',
    /*
     * And where either set is said to come from.
     *
     * The first lesson opened with *this set came from Chinese*. It is not
     * false, and it is not the answer to any question a beginner has at the
     * moment they meet 일, 이, 삼 — which is *when do I say this one?* Origin
     * is also the one kind of claim in this course that is contested outside
     * it, and a practical numbers lesson is not the place to take a position.
     */
    '중국에서',
    '중국어에서',
    'from Chinese',
    'from China',
    'Chinese origin',
    'native Korean numbers',
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

/** No string is exempt. The header says why the one exemption was withdrawn. */
const REFERENCE = new Set();

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


console.log(`Numbers copy — ${strings} learner-facing strings across ${locales.length} languages`);
if (findings.length === 0) {
  console.log('  no lesson names the two number sets by a linguistic label a beginner has not met.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings) console.log(`    ${finding}`);
}
if (CHECK && findings.length > 0) process.exit(1);
