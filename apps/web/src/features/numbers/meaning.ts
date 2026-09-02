import type { NumberItem } from '@hangyul-ganada/shared-types';

/**
 * What a number item means, in the learner's language.
 *
 * ## Why most of this is not translated
 *
 * 십 means ten. Writing "ten" into thirty-two locale bundles produces
 * thirty-two strings that all say the same thing, that all have to be reviewed,
 * and that can each independently fall out of step with the `value` printed
 * beside them — and it produces the *wrong* thing for a locale that does not
 * use Arabic digits, because a hand-written "10" is not what an Arabic or
 * Bengali reader expects to see.
 *
 * `Intl.NumberFormat` already knows. It is correct in every locale the app
 * ships, it uses the reader's own digits where those differ, it groups
 * thousands the way that reader groups them, and it cannot disagree with
 * `value` because it is derived from it.
 *
 * So the rule is: **if `value` says it, Intl renders it; a translation key is
 * only for what Intl cannot say.** What Intl cannot say is what a counter
 * counts — 마리 is "animals" and no amount of number formatting will produce
 * that — and what a lesson is teaching. Those are keys, and a missing one is a
 * failure `i18n:check` reports rather than an English word appearing inside a
 * Thai sentence.
 *
 * ## Why the formatter is cached
 *
 * Constructing an `Intl.NumberFormat` is expensive relative to using one, and a
 * lesson screen renders a list of them. One per locale, kept for as long as the
 * locale is.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string): Intl.NumberFormat {
  const hit = formatters.get(locale);
  if (hit) return hit;
  let made: Intl.NumberFormat;
  try {
    made = new Intl.NumberFormat(locale);
  } catch {
    // An unknown or malformed tag is not a reason to render nothing. The
    // default locale's grouping is still a correct number.
    made = new Intl.NumberFormat();
  }
  formatters.set(locale, made);
  return made;
}

/** The numeral for an item's value, in the reader's own digits. */
export function formatValue(value: number, locale: string): string {
  return formatter(locale).format(value);
}

/**
 * The line shown under the Korean.
 *
 * `translate` is passed in rather than imported so this stays a pure function —
 * it is called from a component that already has `t`, and a module that reaches
 * for the i18n singleton is a module that cannot be tested without booting it.
 */
export function numberMeaning(
  item: NumberItem,
  locale: string,
  translate: (key: string) => string,
): string {
  if (item.gloss) return translate(`numbers:${item.gloss}`);
  if (item.value !== null) return formatValue(item.value, locale);
  // Neither a value nor a gloss should reach here — `numbers:qa` fails the
  // build on it — but rendering the romanization beats rendering nothing.
  return item.romanization;
}

/**
 * The meaning of a worked example, where it has one.
 *
 * Null is the common case and is not a gap: `두 개` sitting under the numeral 2
 * and the gloss "things — the general counter" has already been explained, and
 * a third line saying "two things" is noise. Only the examples that carry
 * something new — a clock time, an irregular month, a wrong form beside a right
 * one — have a key.
 */
export function exampleMeaning(
  item: NumberItem,
  translate: (key: string) => string,
): string | null {
  return item.example_gloss ? translate(`numbers:${item.example_gloss}`) : null;
}
