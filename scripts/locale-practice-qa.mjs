#!/usr/bin/env node
/**
 * Does a learner in *this* language get the same kinds of practice?
 *
 *   npm run locale:practice:qa            simulate, and write the audit
 *   npm run locale:practice:qa:check      the same; exit non-zero on a finding
 *
 * ## The defect this exists for
 *
 * Twelve of the thirty-two language packs carried word meanings for the first
 * 600 words of the corpus and nothing past it. `locale:content:qa` reported
 * exactly that — *12 partial at 600 of 3,333* — and every other gate was
 * green, so the number read as a coverage percentage rather than as a
 * description of what those learners were being handed.
 *
 * Driven through the real plan and question builders, it was not a percentage.
 * Fourteen days of Today's Vocabulary for a Turkish learner at Level 21:
 *
 * ```
 *   en  L21   140 intro, 57 meaning, 14 match, 30 build, 11 context
 *   tr  L21   140 intro,  0 meaning,  0 match, 86 build, 11 context
 * ```
 *
 * Not a smaller number of the same product: a *different* product. Meaning
 * recognition — read the Korean, choose what it means — disappears entirely,
 * the matching grid disappears entirely, and nine questions in ten become the
 * one exercise that needs no meaning at all, assembling the word from its own
 * syllables. The teaching card meanwhile shows the English gloss, marked as
 * English, because that is all the pack has.
 *
 * Nothing failed. `synthetic:users:qa` runs personas in these locales and
 * passes, because it asks whether every question that *was* built is in the
 * learner's language — not whether the questions that were not built should
 * have been. `dailyplan:level` declares `locale_askable: true` for every row
 * and defers the question here. This is the gate that reads the shape of the
 * session rather than the coverage of the pack.
 *
 * ## What it asserts
 *
 * For every shipping locale, at seven levels across the scale, fourteen
 * consecutive days of plans built by `buildDailyPlan` and turned into
 * questions by `buildDailyQuestions` — the same functions the session screen
 * calls:
 *
 * 1. **Meaning recognition survives.** A locale must build meaning questions
 *    at every level at which the reference locale (`en`) builds them. This is
 *    the assertion the 600-word band fails.
 * 2. **No single exercise swamps the session.** No one exercise kind may be
 *    more than `MAX_ONE_KIND` of the questions that are not the teaching card,
 *    at any level. A session that is 88% one screen is the finding the
 *    handwriting-free redesign was built to avoid, arriving by a different
 *    route.
 * 3. **The teaching card is in the learner's language.** Every new word
 *    scheduled must have a meaning in the pack, since the intro is what
 *    credits it: a word introduced with an English gloss counts toward the
 *    day's ten without the learner having read anything in their own language.
 *
 * The thresholds are properties of the *reference* locale rather than fixed
 * numbers, so a change to the exercise mix moves both sides together and this
 * gate keeps measuring the same thing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const PUBLIC = join(ROOT, 'apps/web/public');

const LOCAL = /^\/(corpus|level-test|dictionary)\//;
const network = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (!LOCAL.test(url)) return network(input, init);
  try {
    const body = await readFile(join(PUBLIC, url));
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
};

const { loadCorpusCore, loadCorpusRest } = await import('../apps/web/src/data/corpus.ts');
await loadCorpusCore();
await loadCorpusRest();

const { vocabularyByPriority } = await import('../apps/web/src/data/vocabulary.ts');
const { loadWordCopy, strictMeaning } = await import('../apps/web/src/data/wordCopy.ts');
const { buildDailyPlan, scheduleSteps } = await import('../apps/web/src/domain/vocabularyDay.ts');
const { buildDailyQuestions, canPractise } = await import(
  '../apps/web/src/features/vocabulary/dailyQuestions.ts'
);

/** Every locale the product ships, read from the packs rather than listed twice. */
const LOCALES = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/data/generated/vocabulary.json'), 'utf8'),
).locales;

/** The reference every threshold is derived from. */
const REFERENCE = 'en';

/** Levels sampled across the scale. */
const LEVELS = [1, 5, 10, 15, 20, 25, 30];

/** Consecutive days simulated at each level. */
const DAYS = 14;

/** The learner's daily goal. Ten is the default and the commonest. */
const GOAL = 10;

/**
 * The most of one exercise kind a session may be, counted over the questions
 * that are not the teaching card.
 *
 * 0.75 is above every reference figure and below every failing one: `en` peaks
 * at 0.55 and the 600-word band produced 0.88.
 */
const MAX_ONE_KIND = 0.75;

const corpus = vocabularyByPriority();
for (const locale of LOCALES) await loadWordCopy(locale);

/** Fourteen days of one learner, as a tally of what they were asked. */
function simulate(locale, level) {
  const meaningOf = (word) => ({ value: strictMeaning(word, locale) ?? '', locale });
  const met = new Set();
  const kinds = {};
  let introducedWithoutMeaning = 0;
  let introduced = 0;

  for (let day = 0; day < DAYS; day += 1) {
    const plan = buildDailyPlan({
      corpus,
      goal: GOAL,
      dayIndex: day,
      seed: `locale-practice:${locale}`,
      level,
      progress: {},
      memory: {},
      mistakes: {},
      recentlyIntroduced: met,
      canPractise: (wordId) => {
        const word = corpus.find((candidate) => candidate.id === wordId);
        return word ? canPractise(word, meaningOf) : false;
      },
      now: new Date(2026, 6, 1 + day),
    });
    for (const planned of plan.words) met.add(planned.wordId);

    for (const question of buildDailyQuestions(scheduleSteps(plan), meaningOf, (key) => key)) {
      kinds[question.step] = (kinds[question.step] ?? 0) + 1;
      if (question.step !== 'intro') continue;
      introduced += 1;
      if (!strictMeaning(question.word, locale)) introducedWithoutMeaning += 1;
    }
  }

  const asked = Object.entries(kinds)
    .filter(([step]) => step !== 'intro')
    .reduce((sum, [, count]) => sum + count, 0);
  return { kinds, asked, introduced, introducedWithoutMeaning };
}

const reference = new Map();
for (const level of LEVELS) reference.set(level, simulate(REFERENCE, level));

const findings = [];
const rows = [];

for (const locale of LOCALES) {
  for (const level of LEVELS) {
    const result = locale === REFERENCE ? reference.get(level) : simulate(locale, level);
    const ref = reference.get(level);
    const dominant = Object.entries(result.kinds)
      .filter(([step]) => step !== 'intro')
      .sort((a, b) => b[1] - a[1])[0] ?? ['none', 0];
    const share = result.asked > 0 ? dominant[1] / result.asked : 0;

    rows.push({
      locale,
      level,
      asked: result.asked,
      kinds: result.kinds,
      dominant: dominant[0],
      dominantShare: Number(share.toFixed(3)),
      introduced: result.introduced,
      introducedWithoutMeaning: result.introducedWithoutMeaning,
    });

    if ((ref.kinds.meaning ?? 0) > 0 && (result.kinds.meaning ?? 0) === 0) {
      findings.push(
        `${locale} L${level}: no meaning question in ${DAYS} days, where ${REFERENCE} builds ${ref.kinds.meaning}`,
      );
    }
    if ((ref.kinds.match ?? 0) > 0 && (result.kinds.match ?? 0) === 0) {
      findings.push(
        `${locale} L${level}: no matching grid in ${DAYS} days, where ${REFERENCE} builds ${ref.kinds.match}`,
      );
    }
    if (share > MAX_ONE_KIND) {
      findings.push(
        `${locale} L${level}: ${(share * 100).toFixed(0)}% of the session is one exercise (${dominant[0]}), over the ${(MAX_ONE_KIND * 100).toFixed(0)}% ceiling`,
      );
    }
    if (result.introducedWithoutMeaning > 0) {
      findings.push(
        `${locale} L${level}: ${result.introducedWithoutMeaning} of ${result.introduced} words are taught with no ${locale} meaning to read`,
      );
    }
  }
}

console.log(`Locale practice parity — ${LOCALES.length} locales × ${LEVELS.length} levels × ${DAYS} days\n`);
const worst = rows
  .filter((row) => row.locale !== REFERENCE)
  .sort((a, b) => b.introducedWithoutMeaning - a.introducedWithoutMeaning || b.dominantShare - a.dominantShare)
  .slice(0, 12);
console.log('  locale  level  asked  meaning  match  build  context  dominant       taught w/o meaning');
for (const row of worst) {
  console.log(
    `  ${row.locale.padEnd(7)} ${String(row.level).padStart(4)}  ${String(row.asked).padStart(5)}  ${String(row.kinds.meaning ?? 0).padStart(7)}  ${String(row.kinds.match ?? 0).padStart(5)}  ${String(row.kinds.build ?? 0).padStart(5)}  ${String(row.kinds.context ?? 0).padStart(7)}  ${row.dominant.padEnd(9)} ${String((row.dominantShare * 100).toFixed(0)).padStart(3)}%  ${String(row.introducedWithoutMeaning).padStart(6)}`,
  );
}
console.log('');

mkdirSync(join(ROOT, 'docs'), { recursive: true });
writeFileSync(
  join(ROOT, 'docs/locale-practice-audit.json'),
  `${JSON.stringify({ generatedBy: 'scripts/locale-practice-qa.mjs', reference: REFERENCE, days: DAYS, goal: GOAL, levels: LEVELS, maxOneKind: MAX_ONE_KIND, rows }, null, 1)}\n`,
);

if (findings.length > 0) {
  console.log(`  ${findings.length} finding(s):`);
  for (const finding of findings.slice(0, 40)) console.log(`  ✗  ${finding}`);
  if (findings.length > 40) console.log(`  … and ${findings.length - 40} more`);
  console.log('');
}
console.log(`${findings.length} error(s).`);
process.exit(CHECK && findings.length > 0 ? 1 : 0);
