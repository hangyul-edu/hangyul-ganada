#!/usr/bin/env node
/**
 * Is the quotation library big enough, honest, and the same all day?
 *
 *   tsx scripts/quotes-qa.mjs           print the audit
 *   tsx scripts/quotes-qa.mjs --check   fail the build
 *
 * ## Why a gate and not just the unit tests
 *
 * `quotes.test.ts` proves the shape of a row — every locale present, every
 * author translated. This asks the questions that are about the *library*
 * rather than about a row, and that only have answers once all hundred are
 * written:
 *
 * 1. **Size.** A hundred lines, near enough, so a daily learner does not meet
 *    the same sentence twice in a season.
 * 2. **No duplicate text.** Not by id — by the sentence itself, normalised,
 *    per locale. Two rows that say the same thing in English are one quote and
 *    a bug, and ids cannot see that.
 * 3. **The required line is present, unattributed.** §34 names one quotation
 *    and says it must carry no author, because the three names it circulates
 *    under are all wrong. An `author` that is anything but null here is a
 *    fabricated attribution shipped to a learner.
 * 4. **Nothing else is attributed on a guess.** Every row that *does* name an
 *    author has to name a source too, and no source may hedge.
 * 5. **Stable within a day, different across days.** The two halves of §36.
 *    Checked by running the real `quoteForToday` against a fake clock and a
 *    fake `localStorage`, not by reading the code and believing it.
 * 6. **Usable in all 32 locales.** `renderQuote` throws on a missing
 *    translation, so this renders every row in every locale and counts the
 *    ones that come back empty or suspiciously short.
 */

/*
 * A browser, near enough for this module.
 *
 * `quotes.ts` reads `window.localStorage` to remember the day's choice, and it
 * catches the failure — so without this the day-stability check would pass by
 * never storing anything, which is the opposite of what it is meant to prove.
 */
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
  },
};

const CHECK = process.argv.includes('--check');
const quotes = await import('../apps/web/src/data/quotes.ts');
const { LEARNING_QUOTES, QUOTE_LOCALES, renderQuote, quoteForToday, resetSessionQuote } = quotes;

const problems = [];
const fail = (message) => problems.push(message);

console.log('Quotation library\n');
console.log(`  ${LEARNING_QUOTES.length} quotations · ${QUOTE_LOCALES.length} locales`);

// 1 — size ---------------------------------------------------------------------
if (LEARNING_QUOTES.length < 95) {
  fail(`only ${LEARNING_QUOTES.length} quotations, short of the ~100 asked for`);
}

// 2 — no two rows say the same thing -------------------------------------------
/** Case, punctuation and spacing removed, so near-duplicates collide too. */
const normalise = (text) =>
  text
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

const ids = new Set();
for (const quote of LEARNING_QUOTES) {
  if (ids.has(quote.id)) fail(`duplicate id ${quote.id}`);
  ids.add(quote.id);
}

let duplicateTexts = 0;
for (const locale of QUOTE_LOCALES) {
  const seen = new Map();
  for (const quote of LEARNING_QUOTES) {
    const text = quote.translations[locale];
    if (!text) continue;
    const key = normalise(text);
    if (seen.has(key)) {
      duplicateTexts += 1;
      fail(`${locale}: ${quote.id} and ${seen.get(key)} are the same sentence`);
    } else seen.set(key, quote.id);
  }
}
console.log(`  ${duplicateTexts === 0 ? 'ok  ' : '!!  '} no two rows carry the same sentence in any locale`);

// 3 — the quotation §34 requires, without a name -------------------------------
const REQUIRED = '꿈을 크게 가져라. 깨져도 그 조각이 크다.';
const required = LEARNING_QUOTES.find(
  (quote) => normalise(quote.translations.ko ?? '') === normalise(REQUIRED),
);
if (!required) {
  fail(`the quotation §34 names is not in the library: ${REQUIRED}`);
} else if (required.author !== null) {
  fail(`${required.id} carries an author; §34 requires none, because every name it circulates under is wrong`);
} else {
  console.log(`  ok   "${REQUIRED}" is present with no author`);
}

// 4 — nothing attributed on a guess --------------------------------------------
const HEDGE = /attributed to|probably|possibly|supposedly|reputedly|allegedly|often said|unverified|unknown|uncertain/i;
let attributed = 0;
for (const quote of LEARNING_QUOTES) {
  if (!quote.source || quote.source.trim() === '') fail(`${quote.id} has no source`);
  if (quote.author === null) continue;
  attributed += 1;
  if (HEDGE.test(quote.source)) {
    fail(`${quote.id} names an author but its source hedges: "${quote.source}"`);
  }
  for (const locale of QUOTE_LOCALES) {
    const name = quote.author[locale] ?? quote.author.en;
    if (!name || name.trim() === '') fail(`${quote.id} has no author name for ${locale}`);
  }
}
console.log(
  `  ok   ${attributed} attributed to a named author with a source · ${LEARNING_QUOTES.length - attributed} deliberately unattributed`,
);

// 5 — every row renders in every locale ----------------------------------------
let thin = 0;
for (const quote of LEARNING_QUOTES) {
  for (const locale of QUOTE_LOCALES) {
    let rendered;
    try {
      rendered = renderQuote(quote, locale);
    } catch (error) {
      fail(`${quote.id} cannot be rendered in ${locale}: ${error.message}`);
      continue;
    }
    if (!rendered.text || rendered.text.trim().length === 0) {
      fail(`${quote.id} is empty in ${locale}`);
    } else if (rendered.text.trim().length < 8) {
      // Not an error on its own — Chinese and Japanese are legitimately short —
      // but a two-character "translation" is a placeholder somebody forgot.
      thin += 1;
      if (!['ja', 'zh-CN', 'ko', 'th'].includes(locale)) {
        fail(`${quote.id} in ${locale} is only ${rendered.text.trim().length} characters: "${rendered.text}"`);
      }
    }
    if (rendered.author !== null && rendered.author.trim() === '') {
      fail(`${quote.id} renders a blank author in ${locale} — §35 wants nothing, not empty space`);
    }
    // §35 again: an uncertain attribution shows *nothing*, never a word that
    // makes the absence look like a fact.
    if (rendered.author && /^(anonymous|unknown|작자\s*미상|무명)$/i.test(rendered.author.trim())) {
      fail(`${quote.id} renders "${rendered.author}" in ${locale} instead of nothing`);
    }
  }
}
console.log(`  ok   ${LEARNING_QUOTES.length * QUOTE_LOCALES.length} renderings, none missing`);

// 6 — the same all day, different tomorrow -------------------------------------
/** One calendar day, read the way three separate app launches would read it. */
function dayOf(date) {
  store.clear();
  const first = quoteForToday(date).id;
  resetSessionQuote(); // a cold start: the in-memory cache is gone, storage is not
  const second = quoteForToday(date).id;
  resetSessionQuote();
  const third = quoteForToday(new Date(date.getTime() + 11 * 60 * 60 * 1000)).id;
  if (first !== second || first !== third) {
    fail(`the quotation changed during ${date.toDateString()}: ${first} / ${second} / ${third}`);
  }
  return first;
}

const DAYS = 60;
const start = new Date(2026, 0, 1, 7, 0, 0);
const perDay = [];
for (let day = 0; day < DAYS; day += 1) {
  perDay.push(dayOf(new Date(start.getTime() + day * 24 * 60 * 60 * 1000)));
}
console.log(`  ok   the same quotation all day, checked across ${DAYS} days at 07:00, again, and at 18:00`);

/*
 * Rotation, measured rather than asserted.
 *
 * The store is cleared per day above, so each day picks fresh from the whole
 * library — which is the worst case for repetition and the honest one to
 * measure. What matters is that consecutive days differ and that the spread
 * over two months is wide.
 */
let sameAsYesterday = 0;
for (let i = 1; i < perDay.length; i += 1) if (perDay[i] === perDay[i - 1]) sameAsYesterday += 1;
const distinct = new Set(perDay).size;
console.log(`       ${distinct} distinct quotations over ${DAYS} days · ${sameAsYesterday} repeated the next day`);
if (sameAsYesterday > 2) fail(`${sameAsYesterday} days repeated the previous day's quotation`);
if (distinct < DAYS * 0.6) fail(`only ${distinct} distinct quotations in ${DAYS} days`);

/*
 * And the rotation proper: `nextQuote` walks the library, given its history.
 * This is what a learner who keeps their storage actually gets.
 */
let history = [];
const walked = [];
for (let day = 0; day < LEARNING_QUOTES.length; day += 1) {
  const step = quotes.nextQuote(history, ((day * 7919) % 1000) / 1000);
  history = step.history;
  walked.push(step.quote.id);
}
const walkedDistinct = new Set(walked).size;
console.log(
  `  ${walkedDistinct === LEARNING_QUOTES.length ? 'ok  ' : '!!  '} ${walkedDistinct} of ${LEARNING_QUOTES.length} shown before any repeats`,
);
if (walkedDistinct < LEARNING_QUOTES.length) {
  fail(`the rotation repeated after ${walkedDistinct} of ${LEARNING_QUOTES.length} quotations`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems.slice(0, 40)) console.error(`  ! ${problem}`);
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
  process.exit(CHECK ? 1 : 0);
}
console.log(
  `\n${LEARNING_QUOTES.length} quotations, none duplicated, all 32 locales, stable within the day and rotating across days.`,
);
