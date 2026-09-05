#!/usr/bin/env node
/**
 * Does every Numbers question ask one question, of one kind, with one answer?
 *
 *   node scripts/numbers-domain-qa.mjs           report
 *   node scripts/numbers-domain-qa.mjs --check   exit non-zero on a finding
 *
 * ## Why this exists beside `numbers:qa`
 *
 * `numbers:qa` asks whether a question is *answerable* — one defensible option,
 * a prompt that matches its type, nothing tested before it is taught. Three
 * screenshots of the shipped course passed all of that and were still not
 * questions anyone should be asked:
 *
 * ```
 *   원        무슨 뜻일까요?     한국 돈의 단위 · 5,000원 · 10,000원 · 35,000원
 *   🔊        무엇이라고 들렸나요?  두 시 십오 분 · 분 · 세 시 삼십 분 · 초
 *   오천 원    무슨 뜻일까요?     2시 · 사람 세 명 · 돈 5,000원 · 30분
 * ```
 *
 * Each has exactly one correct option and each is answerable without reading
 * any Korean. The first is a definition among three amounts, so the answer is
 * the odd shape out. The second is two complete times among two bare unit
 * words, so the answer is one of the two long ones. The third is a price among
 * a time, a head-count and a duration, so the answer is the only one about
 * money. What is wrong with all three is *the option set*, and nothing in the
 * old gate had a name for it, because the thing that makes two options
 * comparable had never been written down.
 *
 * It is written down now — `NumberItem.domain`, and `NumbersQuestionSchema` on
 * every built question — and this file is what reads it. It is deliberately not
 * clever: no string heuristics, no similarity thresholds. Every rule below is a
 * comparison of declared fields, so a rule that passes is a rule about the
 * content and not about how the content happened to be spelled.
 *
 * ## What it gates
 *
 * 1.  **One domain per question.** Every option carries the answer's domain.
 * 2.  **One granularity.** A clock time with minutes is only offered against
 *     clock times with minutes. No bare unit word beside a complete value.
 * 3.  **One answer.** No two options normalise to the same string, name the
 *     same thing (`gloss_group`), or fill the same slot (`slot_group`).
 * 4.  **The index survives the shuffle.** `answer` points at the option the
 *     builder made the answer, in the order the learner sees.
 * 5.  **The instruction fits.** Every (promptType, answerDomain) pair is one
 *     the course has an instruction for, and every (promptType, targetType)
 *     pair is one that makes sense.
 * 6.  **The clip is the question.** A question that plays audio plays the clip
 *     of the item it is about, and prints no text that gives it away.
 * 7.  **Nothing untaught.** Every option comes from a lesson at or before this
 *     one, and every prerequisite is a real lesson that precedes it.
 * 8.  **No duplicate questions.** Within one run, no two questions ask the same
 *     thing of the same item with the same options.
 * 9.  **Every string exists, in every language.** Each instruction key and each
 *     option key resolves in all thirty-two bundles, and none of the thirty-one
 *     non-English ones is the English string.
 * 10. **Difficulty is ordered.** A lesson's mastery check is never easier than
 *     its guided practice.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps/web');
const LOCALES = join(WEB, 'src/locales');
const CHECK = process.argv.includes('--check');

/**
 * The course, built through the real generator.
 *
 * Through `tsx` and the app's own modules rather than by re-reading the data,
 * because the defect this gate is for lives in the *generator*: the items were
 * fine and the option sets were not. A checker that rebuilt the option sets
 * itself would be checking its own opinion.
 */
const dump = JSON.parse(
  execFileSync(
    'npx',
    ['tsx', join(ROOT, 'scripts/numbers-dump-questions.mts')],
    { cwd: WEB, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  ),
);

const findings = [];
const fail = (what) => findings.push(what);

const bundles = new Map();
for (const locale of readdirSync(LOCALES)) {
  const path = join(LOCALES, locale, 'numbers.json');
  if (existsSync(path)) bundles.set(locale, JSON.parse(readFileSync(path, 'utf8')));
}
const at = (bundle, key) => key.split('.').reduce((node, part) => (node ?? {})[part], bundle);

/**
 * Two options may not differ by only case or punctuation.
 *
 * Spacing is stripped everywhere *except* in a `writtenForm` question, where the
 * space is the question. 한 개 against 한개 is the whole of what `counter_form`
 * asks, and a normaliser that removed the space reported the right answer and
 * its glued distractor as one option — 18 findings, every one of them a
 * question working exactly as designed.
 */
const answerOptionOf = (q) => q.options[q.answer];

const normalise = (text, domain) =>
  (domain === 'writtenForm' ? text.replace(/[.,·—–-]/g, '') : text.replace(/[\s.,·—–-]/g, ''))
    .toLowerCase();

// --- 1 · 2 · 3 · 4 — the option set ----------------------------------------

const PROMPT_FOR_DOMAIN = {
  chooseMeaning: ['definition', 'moneyAmount', 'clockTime', 'month', 'weekday'],
  chooseCorrectExplanation: ['usageContext'],
  listenAndChoose: ['definition', 'numericValue', 'moneyAmount', 'clockTime', 'month', 'weekday', 'usageContext', 'age', 'duration', 'personCount', 'calendarDate', 'phoneNumber'],
  chooseSystem: ['usageContext'],
  sayTheNumber: ['numericValue', 'moneyAmount', 'clockTime', 'month'],
  /*
   * *Which number is this?* is a fair question about anything that names a
   * quantity, not only about a bare numeral: 세 명 is three, 오천 원 is 5,000,
   * 스무 살 is twenty, 두 시 is two. The options stay inside the answer's own
   * domain either way, so the question is still four counts or four prices —
   * it is the *prompt* that is general here, and it is general because the
   * answer really is a number in every one of these cases.
   */
  writeTheDigits: ['numericValue', 'moneyAmount', 'month', 'clockTime', 'personCount', 'duration', 'age'],
  chooseCounterForm: ['writtenForm'],
  findIncorrectExpression: ['writtenForm'],
  fillTheBlank: ['definition', 'numericValue', 'moneyAmount', 'clockTime', 'month', 'weekday', 'usageContext', 'age', 'duration', 'personCount', 'calendarDate', 'phoneNumber'],
  orderTheParts: ['numericValue'],
};

const TARGET_FOR_PROMPT = {
  chooseMeaning: ['korean'],
  chooseCorrectExplanation: ['korean'],
  listenAndChoose: ['audio'],
  chooseSystem: ['korean'],
  sayTheNumber: ['numeral'],
  writeTheDigits: ['korean'],
  chooseCounterForm: ['numeral'],
  findIncorrectExpression: ['contrast'],
  fillTheBlank: ['sentence'],
  orderTheParts: ['numeral'],
};

let questions = 0;
let optionsChecked = 0;
const seen = new Map();

for (const q of dump.questions) {
  questions += 1;
  const where = `${q.lesson}/${q.itemId}/${q.kind}`;
  const schema = q.schema;

  // 1 — one domain per question.
  for (const option of q.options) {
    optionsChecked += 1;
    if (option.domain !== schema.answerDomain) {
      fail(
        `${where}: an option is ${option.domain} in a ${schema.answerDomain} question — ` +
          `"${option.text}" does not belong in this list`,
      );
    }
  }

  // 2 — one granularity, and no bare unit word beside a complete value.
  if (schema.answerDomain === 'clockTime') {
    const minutes = q.options.map((o) => (o.clock ? o.clock.minute > 0 : null));
    if (new Set(minutes.filter((m) => m !== null)).size > 1) {
      fail(`${where}: a clock time with minutes is offered against an o'clock — ${q.options.map((o) => o.text).join(' · ')}`);
    }
  }
  /*
   * A bare unit word may not stand against a complete expression — when the
   * options are the expressions themselves.
   *
   * This is the second screenshot: a clip of 두 시 십오 분 offered against 분 and
   * 초, where the answer is one of the two options that are more than one word.
   * It is a rule about Korean text, so it is asked only where the options *are*
   * Korean text. Over glosses it means nothing: *people* and *zero, as a
   * quantity* are two definitions, and one of them being a definition of a unit
   * is not a clue to anything.
   */
  /*
   * Asked of a *clip*, and only of a clip.
   *
   * The length of an expression is something a learner hears, so a listening
   * question whose answer is the only long option is answerable without
   * listening. A blank hides its own length and a printed prompt shows the
   * expression itself, so neither leaks anything by being long.
   */
  const koreanOptions = q.options.every((o) => !o.isKey && o.rendered === o.text);
  if (schema.targetType === 'audio' && koreanOptions && q.options.length > 2 && answerOptionOf(q)) {
    /*
     * Word count, except between whole questions.
     *
     * 얼마예요? is one word and 나이가 어떻게 되세요? is three; both are complete
     * utterances with an ending, and a learner hearing one hears the same kind
     * of thing. Counting words there would forbid the four ask-phrases from
     * standing against each other, which is the one comparison that makes any
     * of them worth asking by ear.
     */
    const words = (text) => text.trim().split(/\s+/).length;
    const asks = (text) => text.trim().endsWith('?');
    const answer = answerOptionOf(q);
    const answerWords = words(answer.text) > 1;
    const sameShape = q.options.filter(
      (o) => (asks(o.text) && asks(answer.text)) || (words(o.text) > 1) === answerWords,
    );
    if (sameShape.length === 1) {
      fail(
        `${where}: the answer is the only ${answerWords ? 'multi-word' : 'single-word'} option, ` +
          `so it is findable without listening — ${q.options.map((o) => o.text).join(' · ')}`,
      );
    }
  }

  // 3 — one answer.
  const byText = new Map();
  for (const option of q.options) {
    const key = normalise(option.rendered ?? option.text, schema.answerDomain);
    if (byText.has(key)) fail(`${where}: two options read the same — "${option.rendered ?? option.text}"`);
    byText.set(key, option);
  }
  /*
   * Each of the two groupings makes two options defensible in one place only.
   *
   * `gloss_group` is *these name the same thing*, which is fatal when the
   * options are meanings — 명 glossed 사람 beside 사람 glossed 사람 — and
   * harmless when they are Korean words to be picked out of a recording, where
   * the two are still two different words.
   *
   * `slot_group` is *these fit the same hole*, which is fatal in a
   * fill-the-blank — `____에 만나요.` takes 월요일 and 금요일 and 주말 — and
   * harmless everywhere else, because 월요일 and 주말 do not mean the same
   * thing and are fair distractors for each other in a meaning question.
   *
   * Applying either everywhere is what made this gate's first run report 560
   * findings about the zero lesson, where 영하 and 영 점 share a slot and share
   * nothing else.
   */
  const groupRules = [];
  if (schema.promptType === 'chooseMeaning' || schema.promptType === 'chooseCorrectExplanation') {
    groupRules.push(['glossGroup', 'name the same thing']);
  }
  if (schema.promptType === 'fillTheBlank') {
    groupRules.push(['slotGroup', 'fit the same hole in the sentence']);
  }
  /*
   * Against the answer, not between two distractors.
   *
   * 권 and 장 share a slot with each other and neither shares one with 병, so a
   * question whose answer is 병 has exactly one defensible option however the
   * other two relate. Asking it the other way round reported 60 findings about
   * questions that were fine.
   */
  const answerOption = q.options[q.answer];
  for (const [field, why] of groupRules) {
    if (!answerOption?.[field]) continue;
    const clash = q.options.find((o) => o !== answerOption && o[field] === answerOption[field]);
    if (clash) {
      fail(
        `${where}: "${clash.text}" and the answer ${why} ("${answerOption[field]}"), ` +
          `so both are defensible — ${q.options.map((o) => o.text).join(' · ')}`,
      );
    }
  }

  // 4 — the index survives the shuffle.
  if (q.kind !== 'order_parts') {
    if (q.answer < 0 || q.answer >= q.options.length) {
      fail(`${where}: answer index ${q.answer} is outside 0..${q.options.length - 1}`);
    } else if (q.options[q.answer].text !== schema.correctAnswer) {
      fail(
        `${where}: answer index ${q.answer} points at "${q.options[q.answer].text}" but the ` +
          `question was built with "${schema.correctAnswer}" as its answer`,
      );
    }
  }

  // 5 — the instruction fits the question.
  const allowed = PROMPT_FOR_DOMAIN[schema.promptType];
  if (!allowed) fail(`${where}: no domain list for prompt type ${schema.promptType}`);
  else if (!allowed.includes(schema.answerDomain)) {
    fail(`${where}: ${schema.promptType} cannot ask for a ${schema.answerDomain}`);
  }
  const targets = TARGET_FOR_PROMPT[schema.promptType];
  if (targets && !targets.includes(schema.targetType)) {
    fail(`${where}: ${schema.promptType} shows a ${schema.targetType}, expected ${targets.join(' or ')}`);
  }

  // 6 — the clip is the question, and the question does not print its answer.
  if (schema.targetType === 'audio') {
    if (!schema.audioTarget) fail(`${where}: a listening question with no clip`);
    else if (schema.audioTarget !== q.itemAudio) {
      fail(`${where}: plays ${schema.audioTarget} but is about an item whose clip is ${q.itemAudio}`);
    }
    if (q.promptText) fail(`${where}: a listening question that also prints "${q.promptText}"`);
  } else if (
    schema.audioTarget &&
    q.promptText &&
    !q.promptText.includes(q.itemKorean) &&
    schema.promptType !== 'fillTheBlank'
  ) {
    /*
     * Contains, not equals. The pitfalls lesson prints a contrast pair —
     * `한 개 (✓) · 한개 (✗)` — beside the clip of 한 개, on purpose: over the
     * word alone two of its five rules are true at once and the question has no
     * answer. What must not happen is a clip of one expression printed beside a
     * different one, and that is what this asks.
     */
    fail(`${where}: shows "${q.promptText}", which does not contain the "${q.itemKorean}" it plays`);
  }

  /*
   * 7 — nothing untaught without a reason.
   *
   * Not *nothing from a later lesson*: 하나 offered against 일 reaches into the
   * set the learner has not met, and that reach is the misconception the whole
   * course is built around. `numbers:qa` §12 settles the policy and this is the
   * same one, asked of the schema instead of the strings — a forward option has
   * to carry a declared `misconception`, so a stray lifted from a later lesson
   * with no reason to be there is still a finding.
   */
  for (const option of q.options) {
    if (option.taughtAt !== undefined && option.taughtAt > q.lessonIndex && !option.misconception) {
      fail(
        `${where}: "${option.text}" comes from lesson ${option.taughtAt}, taught after this one, ` +
          'and carries no misconception saying why it is here',
      );
    }
  }
  for (const prerequisite of schema.prerequisites) {
    const index = dump.lessonOrder.indexOf(prerequisite);
    if (index < 0) fail(`${where}: prerequisite "${prerequisite}" is not a lesson`);
    else if (index >= q.lessonIndex) fail(`${where}: prerequisite "${prerequisite}" does not come before it`);
  }

  // 8 — no duplicate questions in one run.
  // One *run* is one lesson, one attempt, one phase: the generator is seeded on
  // the attempt, so the same lesson at attempt 0 and attempt 1 is two sittings
  // and not a repeat.
  const fingerprint = `${q.lesson}|${q.attempt}|${q.run}|${q.itemId}|${schema.promptType}|${[...byText.keys()].sort().join(',')}`;
  if (seen.has(fingerprint)) fail(`${where}: the same question is asked twice in one ${q.run} sitting`);
  seen.set(fingerprint, where);
}

/*
 * 11 — a check that does not believe the declaration.
 *
 * Everything above compares one declared field against another, which catches a
 * question whose options were drawn from the wrong pool and cannot catch a
 * question whose *item* is labelled wrongly. Declare 원 a `moneyAmount` and the
 * money lesson goes back to offering **한국 돈의 단위** against **5,000원**,
 * **10,000원** and **35,000원** — screenshot 1 exactly — with every rule above
 * satisfied, because all four options now agree about being amounts.
 *
 * So this one reads the rendered strings and asks a question no declaration can
 * answer: within one option list, either every option names a quantity or none
 * does. *한국 돈의 단위* has no number in it and the other three are numbers,
 * and that is visible whatever the content claims. Asked per language, because
 * English writes *quarter past two* where Korean writes 2시 15분 — each is
 * internally consistent and the two are not comparable.
 */
const DIGITS = /[0-9\u0660-\u0669\u06F0-\u06F9\u09E6-\u09EF\u0BE6-\u0BEF\u0C66-\u0C6F\u0E50-\u0E59]/;
let shapeChecks = 0;
for (const q of dump.questions) {
  if (q.schema.promptType !== 'chooseMeaning') continue;
  if (!q.options.every((option) => option.isKey)) continue;
  for (const [locale, bundle] of bundles) {
    const rendered = q.options.map((option) => at(bundle, option.text));
    if (rendered.some((value) => typeof value !== 'string')) continue;
    shapeChecks += 1;
    /*
     * And two options that read the same *in this language*.
     *
     * The duplicate check above compares option text, which for a gloss is its
     * key — so `gloss.counterThings` and `gloss.counterAnimals` are two
     * different options however they are translated. Give them the same English
     * sentence and an English learner sees one answer twice and has no way to
     * choose; the keys never collide, and nothing above notices. Resolving per
     * language is the only place this is visible.
     */
    const byRendered = new Map();
    for (const [index, value] of rendered.entries()) {
      const key = normalise(value, q.schema.answerDomain);
      if (byRendered.has(key)) {
        fail(
          `${q.lesson}/${q.itemId}/${q.kind} [${locale}]: two options read the same — ` +
            `"${value}" is both ${q.options[byRendered.get(key)].text} and ${q.options[index].text}`,
        );
      }
      byRendered.set(key, index);
    }
    const numeric = rendered.map((value) => DIGITS.test(value));
    const answerIsNumeric = numeric[q.answer];
    if (numeric.filter((isNumeric) => isNumeric === answerIsNumeric).length === 1) {
      fail(
        `${q.lesson}/${q.itemId}/${q.kind} [${locale}]: the answer is the only option that ` +
          `${answerIsNumeric ? 'names a quantity' : 'does not name a quantity'} — ` +
          rendered.join(' · '),
      );
    }
  }
}

// --- 9 — every string, in every language ------------------------------------

const keysUsed = new Set();
for (const q of dump.questions) {
  if (q.promptKey) keysUsed.add(q.promptKey);
  for (const option of q.options) if (option.isKey) keysUsed.add(option.text);
}
let stringChecks = 0;
for (const [locale, bundle] of bundles) {
  for (const key of keysUsed) {
    stringChecks += 1;
    const value = at(bundle, key);
    if (typeof value !== 'string' || value.trim() === '') {
      fail(`${locale}/numbers.json has no string at ${key}`);
      continue;
    }
    if (locale !== 'en') {
      const english = at(bundles.get('en'), key);
      // A word that is the same in both languages is not a fallback; a whole
      // instruction that is, is.
      if (typeof english === 'string' && value === english && /\s/.test(english) && english.length > 12) {
        fail(`${locale}/numbers.json still holds the English at ${key}: "${english}"`);
      }
    }
  }
}

// --- 10 — a mastery check is never easier than its practice -----------------

const byLesson = new Map();
for (const q of dump.questions) {
  const entry = byLesson.get(q.lesson) ?? { practice: [], mastery: [] };
  if (q.run === 'practice' || q.run === 'mastery') entry[q.run].push(q.schema.difficulty);
  byLesson.set(q.lesson, entry);
}
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
for (const [lesson, { practice, mastery }] of byLesson) {
  if (practice.length && mastery.length && mean(mastery) < mean(practice) - 0.5) {
    fail(
      `${lesson}: the mastery check is easier than the practice ` +
        `(${mean(mastery).toFixed(2)} against ${mean(practice).toFixed(2)})`,
    );
  }
}

// --- report ------------------------------------------------------------------

const domains = new Map();
for (const q of dump.questions) {
  domains.set(q.schema.answerDomain, (domains.get(q.schema.answerDomain) ?? 0) + 1);
}

console.log('Numbers answer domains — every question asks one thing of one kind\n');
console.log(`  questions built        ${questions.toLocaleString()}`);
console.log(`  options checked        ${optionsChecked.toLocaleString()}`);
console.log(`  distinct questions     ${seen.size.toLocaleString()}`);
console.log(`  strings resolved       ${stringChecks.toLocaleString()} across ${bundles.size} languages`);
console.log(`  option lists weighed    ${shapeChecks.toLocaleString()} (a quantity against a definition)`);
console.log('\n  by answer domain');
for (const [domain, count] of [...domains].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${domain.padEnd(16)} ${String(count).padStart(6)}`);
}

if (findings.length === 0) {
  console.log('\nno option stands beside another it cannot be compared with.');
} else {
  const shown = findings.slice(0, 30);
  console.log(`\n${findings.length} finding(s):`);
  for (const finding of shown) console.log(`  - ${finding}`);
  if (findings.length > shown.length) console.log(`  …and ${findings.length - shown.length} more`);
}
if (CHECK && findings.length > 0) process.exit(1);
