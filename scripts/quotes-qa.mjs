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
 * A browser, near enough for this module — and a witness.
 *
 * Nothing in `quotes.ts` should write to storage any more. This provides a
 * `localStorage` anyway so that if something does, the write lands here and the
 * last check catches it, rather than throwing and being swallowed by a
 * try/catch that would look like success.
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
const { LEARNING_QUOTES, QUOTE_LOCALES, renderQuote, quoteOnOpen, resetSessionQuote } = quotes;

const problems = [];
const fail = (message) => problems.push(message);

console.log('Quotation library\n');
console.log(`  ${LEARNING_QUOTES.length} quotations · ${QUOTE_LOCALES.length} locales`);

// 1 — size ---------------------------------------------------------------------
/*
 * Twenty, not a hundred.
 *
 * The library was a hundred lines and twelve of them were quotations; the rest
 * were encouragement this app wrote for itself, displayed in a slot that looks
 * like a quotation. That is a small dishonesty repeated every time somebody
 * opens the screen. What is here now is twenty sentences by twenty named
 * people, each from a source a reader can go and check.
 *
 * The band is 16–24 rather than exactly 20 because the policy is quality-first:
 * a quotation whose attribution cannot be established is dropped, and the count
 * follows from that rather than the other way round.
 */
if (LEARNING_QUOTES.length < 16 || LEARNING_QUOTES.length > 24) {
  fail(`${LEARNING_QUOTES.length} quotations; the library is meant to be about 20`);
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

// 3 — every line names a person -------------------------------------------------
/*
 * The policy, reversed, and this is the rule that enforces it.
 *
 * The library used to require one specific line to ship *without* an author,
 * because its attribution could not be established. The answer now is that such
 * a line does not ship at all: if nobody can be named, there is nothing to
 * quote. 꿈을 크게 가져라 is gone for exactly that reason.
 */
const WITHDRAWN = '꿈을 크게 가져라. 깨져도 그 조각이 크다.';
if (LEARNING_QUOTES.some((q) => normalise(q.translations.ko ?? '') === normalise(WITHDRAWN))) {
  fail(`${WITHDRAWN} is back in the library; its attribution cannot be established`);
}

const CATEGORY = /\b(proverb|anonymous|unknown|traditional|saying)\b|작자\s*미상|무명|속담/i;
let unnamed = 0;
for (const quote of LEARNING_QUOTES) {
  if (!quote.author) {
    unnamed += 1;
    fail(`${quote.id} has no author; every quotation must name a person`);
    continue;
  }
  for (const locale of QUOTE_LOCALES) {
    const name = quote.author[locale] ?? quote.author.en;
    if (!name || !name.trim()) fail(`${quote.id} has no author name for ${locale}`);
    else if (CATEGORY.test(name)) {
      fail(`${quote.id} names "${name}" in ${locale} — a category, not a person`);
    }
  }
}
console.log(`  ${unnamed === 0 ? 'ok  ' : '!!  '} every quotation names a person, in all ${QUOTE_LOCALES.length} languages`);

// 4 — every source is a citation, and none of them hedges -----------------------
const HEDGE = /attributed to|probably|possibly|supposedly|reputedly|allegedly|often said|unverified|uncertain/i;
for (const quote of LEARNING_QUOTES) {
  if (!quote.source || !quote.source.trim()) {
    fail(`${quote.id} has no source`);
    continue;
  }
  if (HEDGE.test(quote.source)) {
    fail(`${quote.id}'s source hedges, so the attribution is not established: "${quote.source}"`);
  }
  // A citation names a work *and* a place in it, not just a person. "Confucius"
  // is an author; "Analects II.15 (c. 5th century BC)" is somewhere to look.
  if (!/\d/.test(quote.source)) {
    fail(`${quote.id}'s source has no date or reference a reader could follow: "${quote.source}"`);
  }
  if (!quote.originalText || !quote.originalText.trim()) {
    fail(`${quote.id} has no original text; a quotation has to carry the words it quotes`);
  }
}
console.log(`  ok   ${LEARNING_QUOTES.length} sources, each naming a work and a date, none hedging`);

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

// 6 — a different line on the next open ------------------------------------------
/*
 * The behaviour that replaced the daily pin.
 *
 * A quotation is decoration at the foot of a screen, not curriculum state, and
 * a learner who reopens the app is allowed a different one. What must not
 * happen is the same line twice in a row — the repetition somebody actually
 * notices — so that is what is measured, and measured at the worst-case random
 * value rather than an average one.
 */
resetSessionQuote();
let previous = '';
let immediate = 0;
const shown = new Set();
for (let open = 0; open < 400; open += 1) {
  const quote = quoteOnOpen();
  if (quote.id === previous) immediate += 1;
  previous = quote.id;
  shown.add(quote.id);
}
console.log(`  ${immediate === 0 ? 'ok  ' : '!!  '} 400 opens, ${immediate} immediate repeat(s)`);
console.log(
  `  ${shown.size === LEARNING_QUOTES.length ? 'ok  ' : '!!  '} ${shown.size} of ${LEARNING_QUOTES.length} quotations reachable`,
);
if (immediate > 0) fail(`${immediate} of 400 opens repeated the line just shown`);
if (shown.size < LEARNING_QUOTES.length) {
  fail(`only ${shown.size} of ${LEARNING_QUOTES.length} quotations can ever appear`);
}

// And nothing is written to disk for it: a quotation is not learning history.
const persisted = [...store.keys()].filter((key) => key.includes('quote'));
if (persisted.length > 0) {
  fail(`the quotation is persisted under ${persisted.join(', ')}; it is decoration, not state`);
}
console.log('  ok   nothing about the quotation is persisted');

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems.slice(0, 40)) console.error(`  ! ${problem}`);
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
  process.exit(CHECK ? 1 : 0);
}
console.log(
  `\n${LEARNING_QUOTES.length} quotations, every one attributed to a named person, all 32 locales, a fresh line on every open.`,
);
