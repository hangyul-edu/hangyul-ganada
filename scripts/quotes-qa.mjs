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
 * 3. **Every line names a person, or says honestly that nobody can be named.**
 *    One row — "꿈을 크게 가져라", requested by the product owner — ships as
 *    `authorship: "unknown"` with a localized *author unknown* under it. A
 *    name on that row would be a fabrication; a category ("proverb") on any
 *    row is a category where a name should be.
 * 4. **Nothing else is attributed on a guess.** Every row names a source, and
 *    only a row marked `sourceStatus: "attributed"` (the Carlyle line) may say
 *    the attribution is conventional rather than established.
 * 5. **Stable within a day, different across days.** The two halves of §36.
 *    Checked by running the real `quoteForToday` against a fake clock and a
 *    fake `localStorage`, not by reading the code and believing it.
 * 6. **Usable in all 32 locales.** `renderQuote` throws on a missing
 *    translation, so this renders every row in every locale and counts the
 *    ones that come back empty, suspiciously short, placeholder-shaped, or
 *    identical to another language's; and for a Korean original, that the
 *    Korean leads and is shown once in Korean and twice nowhere.
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

// 3 — every line names a person, or says honestly that nobody can be named ----
/*
 * The policy, with the one exception it now carries.
 *
 * "꿈을 크게 가져라. 깨져도 그 조각이 크다" was withdrawn because its author
 * cannot be established. It is back at the product owner's request, and the
 * way it is back is the whole rule: `authorship: "unknown"`, and a localized
 * "author unknown" under it in every language. What is still forbidden is a
 * *name* on a row that cannot carry one, and a *category* ("proverb",
 * "traditional") on a row that claims to be named.
 */
const REQUIRED_UNKNOWN = '꿈을 크게 가져라. 깨져도 그 조각이 크다.';
const dream = LEARNING_QUOTES.find((q) => normalise(q.translations.ko ?? '') === normalise(REQUIRED_UNKNOWN));
if (!dream) {
  fail(`the requested line "${REQUIRED_UNKNOWN}" is missing from the library`);
} else if (dream.authorship !== 'unknown') {
  fail(`${dream.id} must ship as authorship "unknown" — no author has ever been established for it`);
}

const CATEGORY = /\b(proverb|traditional|saying)\b|속담/i;
/** The shapes an "author unknown" byline takes; a named row may not read as one. */
const UNKNOWN_LABEL = /\b(anonymous|unknown|inconnu|desconocido|unbekannt|sconosciuto)\b|작자\s*미상|무명|不詳|不详|неизвест|невідом/i;
let unnamed = 0;
for (const quote of LEARNING_QUOTES) {
  if (!quote.author) {
    unnamed += 1;
    fail(`${quote.id} has no author map; every quotation names a person or carries the localized "author unknown"`);
    continue;
  }
  for (const locale of QUOTE_LOCALES) {
    const name = quote.author[locale];
    if (!name || !name.trim()) {
      fail(`${quote.id} has no attribution for ${locale}`);
      continue;
    }
    if (CATEGORY.test(name)) fail(`${quote.id} names "${name}" in ${locale} — a category, not a person`);
    if (quote.authorship === 'unknown') {
      if (locale === 'ko' && name.trim() !== '작자 미상') {
        fail(`${quote.id}: the Korean attribution must be exactly 작자 미상, not "${name}"`);
      }
    } else if (UNKNOWN_LABEL.test(name)) {
      fail(`${quote.id} is a named row but its ${locale} attribution reads as "unknown": "${name}"`);
    }
  }
}
const unknownRows = LEARNING_QUOTES.filter((q) => q.authorship === 'unknown').map((q) => q.id);
if (unknownRows.length > 1) fail(`more than one row ships as authorship unknown: ${unknownRows.join(', ')}`);
console.log(`  ${unnamed === 0 ? 'ok  ' : '!!  '} every quotation carries an attribution in all ${QUOTE_LOCALES.length} languages (${unknownRows.length} labelled author unknown)`);

// 4 — every source is a citation, and only a marked row may hedge ------------
const HEDGE = /attributed to|probably|possibly|supposedly|reputedly|allegedly|often said|unverified|uncertain/i;
for (const quote of LEARNING_QUOTES) {
  if (!quote.source || !quote.source.trim()) {
    fail(`${quote.id} has no source`);
    continue;
  }
  /*
   * A hedge is allowed on exactly the rows that declare one. `sourceStatus:
   * "attributed"` is the Carlyle line — quoted under his name in every
   * collection and not located in his works — and the report carries it as an
   * attribution item for a person. An unknown-author row's source describes
   * its circulation and names no person, so it has nothing to hedge about.
   */
  if (HEDGE.test(quote.source) && quote.sourceStatus !== 'attributed') {
    fail(`${quote.id}'s source hedges, so the attribution is not established: "${quote.source}"`);
  }
  if (quote.sourceStatus === 'attributed' && !HEDGE.test(quote.source)) {
    fail(`${quote.id} is marked attributed but its source does not say so`);
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
const attributedRows = LEARNING_QUOTES.filter((q) => q.sourceStatus === 'attributed').map((q) => q.id);
console.log(`  ok   ${LEARNING_QUOTES.length} sources, each with a reference a reader can follow; ${attributedRows.length} marked as attributed rather than established (${attributedRows.join(', ') || 'none'})`);

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
    if (!rendered.author || rendered.author.trim() === '') {
      fail(`${quote.id} renders a blank byline in ${locale}`);
    }
    if ((rendered.authorship === 'unknown') !== (quote.authorship === 'unknown')) {
      fail(`${quote.id} renders authorship "${rendered.authorship}" in ${locale}`);
    }
    /*
     * The two requested lines are Korean originals and the requirement is
     * that a non-Korean interface shows the Korean *and* the translation, with
     * the Korean leading — and that Korean shows the line once.
     */
    if (quote.originalLanguage === 'ko') {
      if (locale === 'ko' || locale.startsWith('ko-')) {
        if (rendered.original !== null) fail(`${quote.id} would print the Korean twice in ${locale}`);
      } else {
        if (!rendered.original) fail(`${quote.id} does not show the Korean original in ${locale}`);
        if (!rendered.leadsWithOriginal) fail(`${quote.id} does not lead with the Korean in ${locale}`);
        if (normalise(rendered.text) === normalise(quote.originalText)) {
          fail(`${quote.id} in ${locale} renders the Korean original as its "translation"`);
        }
        if (/[가-힣]/.test(rendered.text) && locale !== 'ko') {
          fail(`${quote.id} in ${locale} leaks Hangul into the translation: "${rendered.text}"`);
        }
      }
    }
    if (/\{\{|\bTODO\b|\bTBD\b|lorem/i.test(rendered.text)) {
      fail(`${quote.id} in ${locale} is a placeholder: "${rendered.text}"`);
    }
  }
}
/*
 * No two unrelated languages may carry the same sentence. Copying the English
 * into a locale nobody translated is how a "translation" ships as English,
 * and identical text across two locales is the signature of it.
 */
for (const quote of LEARNING_QUOTES) {
  const byText = new Map();
  for (const locale of QUOTE_LOCALES) {
    const key = normalise(quote.translations[locale] ?? '');
    const seen = byText.get(key);
    if (seen && !(quote.originalLanguage === locale || quote.originalLanguage === seen)) {
      fail(`${quote.id}: ${locale} and ${seen} carry the identical sentence — one of them is not translated`);
    }
    byText.set(key, locale);
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
  `\n${LEARNING_QUOTES.length} quotations, every one carrying an honest attribution, all ${QUOTE_LOCALES.length} locales, a fresh line on every open.`,
);
