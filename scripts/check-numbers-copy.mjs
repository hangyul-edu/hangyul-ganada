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
 * ## The rule changed, and the reason is worth writing down
 *
 * The first version of this gate banned the linguistic names outright — 한자어
 * 수, 고유어 수, 체계 — and made the course call the two sets by their own first
 * three words instead: 일, 이, 삼 and 하나, 둘, 셋.
 *
 * That fixed the register and created a different problem, which a screenshot
 * caught: *이 숫자를 일, 이, 삼으로 말해 보세요* over a numeral, *0을 읽고,
 * 어디에 어떤 말을 쓰는지도 익혀요* as a module goal, *이 방식*, *이런 말*,
 * *어디에 어떤 말*. A set with no name has to be pointed at every time it comes
 * up, and pointing at it is what produced a course full of demonstratives. A
 * learner cannot ask a question about a thing that has no name, and cannot tell
 * two of them apart when both are called *이 숫자*.
 *
 * So the sets have names again, and this gate enforces the opposite rule:
 *
 * ```
 * The two sets are named 한자어식 and 고유어식 — in Korean, and by each
 * language's own equivalent elsewhere. A learner-facing string may not
 * point at one of them with a demonstrative instead.
 * ```
 *
 * Two things did not change, because neither was ever about the names.
 *
 * **No origin.** Where a set *came from* is not the answer to any question a
 * beginner has at the moment they meet 일, 이, 삼 — which is *when do I say
 * this one?* — and it is the one kind of claim in this course that is contested
 * outside it. A practical numbers lesson is not the place to take a position.
 *
 * **No apparatus.** *두 체계*, *두 벌*, *two sets of numbers* frame the thing as
 * a grammatical system a learner has to hold before being told anything usable.
 * A name is not an apparatus: *한자어식으로 읽으면 무엇일까요?* names what is
 * being asked and asks it in the same sentence.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCALES = join(here, '..', 'apps/web/src/locales');
const CHECK = process.argv.includes('--check');

/**
 * What a learner-facing string may not do.
 *
 * Three groups, and each one is a defect somebody photographed.
 *
 * **Demonstratives standing in for a name.** *이 숫자*, *이 방식*, *이런 말*.
 * Every one of these was in the shipping copy and every one of them was there
 * because the set it pointed at had been left nameless. Checked in Korean only:
 * *this number* is an ordinary English sentence in places where Korean's *이
 * 숫자* is not, and a pattern that fires on both would be the gate that cries
 * wolf.
 *
 * **The apparatus.** 체계, 두 벌, two sets — the framing the first rewrite
 * removed and this one does not bring back.
 *
 * **The origin.** Where either set came from, in any language.
 */
const BANNED = {
  '*': [
    '체계',
    '단위 명사',
    '두 가지 영',
    '열 너머',
    '두 벌',
    '두 가지 숫자',
    '두 가지 방법',
    '어느 체계',
    '만 단위',
    'two sets',
    'Two sets',
    'two ways',
    'number family',
    'number system',
    'Number system',
    '중국에서',
    '중국어에서',
    'from Chinese',
    'from China',
    'Chinese origin',
  ],
  ko: [
    '이 숫자를',
    '이 방식',
    '이런 말',
    '어디에 어떤 말',
    '숫자를 한국어로 말하기',
    '그 숫자를',
    '저 숫자',
  ],
};

/**
 * The two names, per language, and the strings that have to carry one.
 *
 * A course that names its two sets and then asks *what did you hear?* over a
 * numeral has not lost anything — that question is about a sound. What it may
 * not do is ask a learner to *produce* one of the two without saying which, and
 * the three `digitsToKorean` prompts are exactly that question. They are the
 * ones checked, plus the four strings whose whole job is to label a set.
 */
const NAMES = {
  ar: ['الصينية الكورية', 'الكورية الأصلية'],
  bn: ['চীনা-কোরীয়', 'কোরীয়'],
  cs: ['inokorejsk', 'korejsk'],
  de: ['inokoreanisch', 'koreanisch'],
  el: ['ινοκορεατικ', 'κορεατικ'],
  en: ['Sino-Korean', 'native Korean'],
  es: ['sino-corean', 'corean'],
  fil: ['Sino-Koreano', 'Koreano'],
  fr: ['sino-coréen', 'coréen'],
  hi: ['चीनी-कोरियाई', 'कोरियाई'],
  hu: ['ino-koreai', 'koreai'],
  id: ['Sino-Korea', 'Korea'],
  it: ['ino-corean', 'corean'],
  ja: ['漢字語', '固有語'],
  kk: ['ино-корей', 'корей'],
  ko: ['한자어식', '고유어식'],
  ky: ['ино-корей', 'корей'],
  mn: ['ино-солонгос', 'солонгос'],
  nl: ['ino-Koreaans', 'Koreaans'],
  pl: ['inokoreańsk', 'koreańsk'],
  'pt-BR': ['ino-corean', 'corean'],
  ro: ['ino-coree', 'coree'],
  ru: ['ино-корейск', 'корейск'],
  sv: ['inokoreansk', 'koreansk'],
  ta: ['சீன-கொரிய', 'கொரிய'],
  te: ['చైనా-కొరియ', 'కొరియ'],
  th: ['จีน-เกาหลี', 'เกาหลี'],
  tr: ['ino-Korece', 'Korece'],
  uk: ['ино-корейськ', 'корейськ'],
  uz: ['ino-koreys', 'koreys'],
  vi: ['Hán-Hàn', 'Hàn'],
  'zh-CN': ['汉字词', '固有词'],
};

/**
 * Sentences this course used to ship, and may not ship again.
 *
 * Every one of them is a specific line somebody read on a screen and reported.
 * They are checked against the **whole** bundle rather than the learner-facing
 * subset, because a retired sentence that survives under a key nothing draws is
 * the state the `rationale.*` block was in for four passes before anyone
 * noticed it was being rendered.
 *
 * Korean and English only, and deliberately: these are the two the reports
 * quote, a translated descendant of one of them is a different sentence, and a
 * list of thirty-two guesses at what that sentence was is a list nobody can
 * check. The structural half of the rule — no `rationale` block in any
 * language — is what covers the other thirty.
 */
const RETIRED = [
  '필요한 곳에는 설명이 따라와요',
  'an explanation follows where it helps',
  '마무리 확인 통과하기',
  '마무리 확인 통과 —',
  '아직 끝나지 않았어요',
  '이 숫자를 일, 이, 삼으로',
  '0을 읽고, 어디에 어떤 말을 쓰는지도',
  '1, 2, 3을 한국어로 말해요',
  'Pass the mastery check',
  'Mastery check passed —',
];

/**
 * Key prefixes the course no longer has.
 *
 * `rationale` is the sentence that used to sit under a right or wrong answer.
 * There is none now — the result state is the verdict and the two marked
 * options — and the keys are gone from all thirty-two bundles. A bundle that
 * grows one back has a body nothing on the screen was asked for.
 */
const RETIRED_KEYS = ['rationale'];

/** The strings that must name the set they are about. */
const MUST_NAME = [
  'systemSino',
  'systemNative',
  'system.sino',
  'system.native',
  'prompt.digitsToKorean.sino',
  'prompt.digitsToKorean.native',
];

/** No string is exempt. The header says why the one exemption was withdrawn. */
const REFERENCE = new Set();

/**
 * The copy a learner must understand in order to get through a lesson.
 *
 * Titles and goals, because they are the whole of what the course list shows.
 * Objectives, because they are the first screen of a lesson. Prompts, because
 * they *are* the question. Glosses, because they are the answer.
 *
 * `rationale.*` used to be on this list. There are no rationale strings any
 * more: an answer result draws the verdict and the two marked options and no
 * prose at all, and the keys were removed from all thirty-two bundles. See
 * `copy:generated`, which fails if one comes back.
 */
const READS = [
  /^module\.[^.]+\.(title|goal)$/,
  /^lesson\.[^.]+\.(title|objective|step\d+)$/,
  /^prompt\./,
  /^gloss\./,
  /^example\./,
  /^summaryMissing\./,
  /^mastery(Intro|Passed|Failed|Perfect)$/,
  /^practiceIntro$/,
  /^system(Sino|Native|Both)$/,
  /^system\./,
];

const findings = [];
const locales = readdirSync(LOCALES).filter((locale) =>
  readdirSync(join(LOCALES, locale)).includes('numbers.json'),
);

/** `a.b.c` out of a nested bundle, or undefined. */
const lookup = (bundle, path) =>
  path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), bundle);

let strings = 0;
let named = 0;
for (const locale of locales) {
  const pack = JSON.parse(readFileSync(join(LOCALES, locale, 'numbers.json'), 'utf8'));
  const banned = [...BANNED['*'], ...(BANNED[locale] ?? [])];

  /*
   * The set has a name, and the strings whose job is to say which set have to
   * use it. Written per language rather than as one word, because *한자어식*
   * is the Korean label and a Tamil learner needs the Tamil one; the entries
   * in `NAMES` are stems, so a declined or suffixed form still matches.
   */
  for (const key of RETIRED_KEYS) {
    if (key in pack) findings.push(`${locale}: the retired "${key}" block is back in the bundle`);
  }
  const flat = JSON.stringify(pack);
  for (const sentence of RETIRED) {
    if (flat.includes(sentence)) {
      findings.push(`${locale}: ships the retired sentence "${sentence}"`);
    }
  }

  const names = NAMES[locale];
  if (!names) {
    findings.push(`${locale}: has no name for either set in NAMES — add one before shipping the pack`);
  } else {
    for (const key of MUST_NAME) {
      const value = lookup(pack, key);
      if (typeof value !== 'string') {
        findings.push(`${locale} ${key}: missing`);
        continue;
      }
      named += 1;
      const which = key.includes('Native') || key.endsWith('.native') ? 1 : 0;
      // Case-folded: a label at the start of a line is capitalised in most of
      // these languages and lower-case inside a sentence, and both are the name.
      if (!value.toLowerCase().includes(names[which].toLowerCase())) {
        findings.push(
          `${locale} ${key}: does not say which set it is about — expected "${names[which]}" in "${value.slice(0, 60)}…"`,
        );
      }
    }
  }

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
            findings.push(`${locale} ${at}: "${term}" — ${value.slice(0, 70)}…`);
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
console.log(`  ${named} set labels checked against the name that language uses for it`);
console.log(`  ${RETIRED.length} retired sentences and ${RETIRED_KEYS.length} retired key block checked in every bundle`);
if (findings.length === 0) {
  console.log('  every string that is about one of the two sets says which; none points at it');
  console.log('  with a demonstrative, frames it as an apparatus, or explains where it came from.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings) console.log(`    ${finding}`);
}
if (CHECK && findings.length > 0) process.exit(1);
