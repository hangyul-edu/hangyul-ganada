import { fallbackChain } from './locales';

/**
 * The language a learner reads *word meanings* in, which is not always the
 * language the interface is in.
 *
 * ## The defect this exists to end
 *
 * A learner set the interface to Tamil and was asked "இந்தச் சொல்லின் பொருள்
 * என்ன?" above four answer choices reading *to be in a place*, *to do*, *to
 * hang*, *to go*. The question was Tamil and the answers were English, and the
 * learner had to read a language they had just told the app they do not use in
 * order to answer it.
 *
 * That was not a bug in one screen. The curriculum ships word meanings in ten
 * languages, the interface ships in thirty-two, and every screen that glossed a
 * word passed the *interface* locale to `wordCopy`, which walked its fallback
 * chain and returned English. Each call was individually correct and the
 * product was incoherent.
 *
 * ## What replaces it
 *
 * One resolved **content locale**, decided once and used by every surface that
 * shows what a Korean word means. Two properties follow from that and neither
 * held before:
 *
 * 1. **A question cannot be half-translated.** Prompt, target meaning and every
 *    distractor come from the same pack, so there is no arrangement of missing
 *    data that produces three Tamil answers and one English one.
 * 2. **The learner is told, and can choose.** Falling back is not the problem —
 *    doing it silently is. Where the interface language has no meanings, the
 *    app says which language the meanings are in and lets the learner pick a
 *    different one from the ten that exist.
 *
 * ## Why this is not solved by translating the corpus
 *
 * It would be, and that is I-19: 2,581 words × 22 languages of meanings,
 * example translations and definitions that a person has to write. Machine
 * output would remove the English from the screen and put an unreviewed
 * sentence in front of a beginner instead, which is worse — a learner cannot
 * tell a wrong gloss from a right one, and this product's whole claim is that
 * they should not have to. Until those languages are authored, an honest,
 * chosen, *consistent* second language is the best thing on offer.
 *
 * @see `data/wordCopy.ts` for the packs, and `LanguagePage` for the choice.
 */

/**
 * The language meanings are shown in, given what the learner reads, what they
 * have chosen, and what the corpus actually has.
 *
 * Pure and total. `available` is the corpus's own list — passed in rather than
 * imported so this can be reasoned about and tested without loading a corpus.
 *
 * Precedence, and each step is a decision somebody made:
 *
 * 1. **The interface language**, when the corpus has it. Nothing to choose.
 * 2. **The learner's explicit choice**, when it is one the corpus has. They
 *    said so; it outranks any guess.
 * 3. **The fallback chain**, so a regional tag finds its parent — `zh-CN` would
 *    read `zh` meanings before English.
 * 4. **The same language in another region.** `fallbackChain` only ever
 *    narrows, so a `pt` reader would drop past `pt-BR` to English: the corpus
 *    has meanings in their language and the chain cannot see them, because
 *    Brazilian Portuguese is not an ancestor of Portuguese. A reader of one
 *    reads the other.
 * 5. **English**, which every corpus has, as the last resort.
 */
export function contentLocale(
  interfaceLocale: string,
  available: readonly string[],
  chosen?: string | null,
): string {
  /*
    A plain boolean, deliberately not a `code is string` type predicate.

    As a predicate it narrowed the *else* branch of `has(interfaceLocale)` to
    `never` — the parameter is already a string, so "not a string" is nothing —
    and every later use of `interfaceLocale` stopped compiling. The nullable
    case is `chosen`, and it is cheaper to check that once than to make the
    whole function reason about a narrowing it does not want.
  */
  const has = (code: string | null | undefined): boolean =>
    !!code && available.includes(code);

  if (has(interfaceLocale)) return interfaceLocale;
  if (chosen && has(chosen)) return chosen;
  /*
   * English is skipped here and returned at the end instead.
   *
   * `fallbackChain` ends every chain with `en`, so taking the chain as written
   * meant English won before the step below ever ran, and a `pt` reader was
   * handed English while Brazilian Portuguese meanings sat in the corpus. That
   * is the same silent drop this module exists to stop, one layer down.
   */
  for (const candidate of fallbackChain(interfaceLocale)) {
    if (candidate !== 'en' && has(candidate)) return candidate;
  }
  // Same language, different region. Deterministic rather than "first match":
  // sorted, so two builds of the same corpus resolve identically.
  const base = interfaceLocale.split('-')[0];
  const sibling = [...available].sort().find((code: string) => code.split('-')[0] === base);
  if (sibling) return sibling;
  return 'en';
}

/**
 * Whether the meanings are in a different language from the interface.
 *
 * What the disclosure is drawn from. It is deliberately a separate question
 * from "which language" — a screen needs to know *that* it is showing a second
 * language before it decides whether to say anything.
 */
export function isBorrowedContent(interfaceLocale: string, resolved: string): boolean {
  return resolved !== interfaceLocale;
}
