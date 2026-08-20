/**
 * Product identity, in one place so a rename touches exactly this file.
 *
 * Hangyul ganada is the Hangul foundation-learning product in the Hangyul
 * ecosystem: seeing, tracing, writing and recognising Korean letters, then the
 * syllable blocks and first words they build.
 *
 * The brand is **not** translated. `localizedName` carries only the locales
 * that have an officially defined brand representation — today that is Korean
 * and nothing else. Every other locale shows the Latin wordmark, which is the
 * correct behaviour for a brand, not a gap in translation coverage.
 */

/** Locales with an officially defined brand representation. */
type BrandLocale = 'en' | 'ko';

export const PRODUCT = {
  /** Internal repository / project slug. snake_case. */
  slug: 'hangyul_ganada',
  /** npm workspace scope and container/kebab-case identifier. */
  kebabSlug: 'hangyul-ganada',
  /** English product name — also the default wordmark everywhere else. */
  name: 'Hangyul ganada',
  /** Shown in Settings. Matches the root package version. */
  version: '1.0.0',
  localizedName: {
    en: 'Hangyul ganada',
    ko: '한귤 가나다',
  } satisfies Record<BrandLocale, string>,
  /**
   * The family this product belongs to.
   *
   * Kept for the brand lineage — Hangyul ganada looks like a Hangyul product
   * because it is one — and for nothing else. There is no cross-sell in the
   * app: this is a standalone paid application, and a banner advertising a
   * different product's subscription to somebody who has already bought this
   * one is an advert, not a feature.
   */
  family: {
    name: 'Hangyul',
    localizedName: {
      en: 'Hangyul',
      ko: '한귤',
    } satisfies Record<BrandLocale, string>,
  },
} as const;

/**
 * The wordmark for a locale.
 *
 * Falls back to the Latin brand for any locale without an official localized
 * representation — deliberately, so a new UI language never invents a brand
 * name for itself. The base subtag is honoured so `ko-KR` gets 한귤 가나다.
 */
export function productName(locale: string): string {
  const base = locale.split('-')[0]!.toLowerCase();
  return (
    PRODUCT.localizedName[base as BrandLocale] ??
    PRODUCT.localizedName[locale as BrandLocale] ??
    PRODUCT.name
  );
}

export function familyName(locale: string): string {
  const base = locale.split('-')[0]!.toLowerCase();
  return PRODUCT.family.localizedName[base as BrandLocale] ?? PRODUCT.family.name;
}

/** Where the learner lands after onboarding. */
export const HOME_ROUTE = '/';

/**
 * The address a content report is sent to, or null.
 *
 * Read from `VITE_SUPPORT_EMAIL` at build time and **deliberately unset by
 * default**. A support address is not a detail that can be invented: putting
 * `support@` in front of a domain nobody has registered ships a product whose
 * "Report a problem" button opens a draft to an address that bounces, which is
 * worse than not offering it at all.
 *
 * So the feature is configuration-gated. Where the variable is absent — as it
 * is in this repository — every "Report a problem" control is simply not
 * rendered, and the release checklist records the address as something that has
 * to be set before submission rather than something that was guessed at. Both
 * stores require a working support contact, so this is a blocker with a name
 * rather than a bug with a wrong value in it.
 */
export const SUPPORT_EMAIL: string | null =
  (import.meta.env?.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || null;

/** The version a learner would quote in a support message. */
export function appVersion(): string {
  return PRODUCT.version;
}

/**
 * Where a learner goes when this product has finished teaching them.
 *
 * ## Why this is a variable and not a link in a component
 *
 * Hangyul ganada exists to hand a beginner to the main Hangyul product once
 * they can read: it teaches the alphabet, the blocks and a first vocabulary,
 * and speaking and TOPIK live somewhere else. That hand-off is the stated
 * reason for the product to exist and it has never been built — there is no
 * route, no link and no sentence about it anywhere in the app, so a learner who
 * finishes the alphabet finishes the product and stops.
 *
 * The destination is not in this repository and cannot be guessed. Inventing a
 * URL would ship a card that leads nowhere, which is worse than the dead end it
 * was meant to fix, so the whole hand-off renders **only when this is set**:
 *
 *     VITE_HANGYUL_URL=https://…  npm run build
 *
 * Unset — which is the default, and what a checkout does today — every piece of
 * it is absent from the interface rather than present and broken. Setting it is
 * the last thing to do before a release, and `npm run routing:check` reports
 * which way the build went.
 */
export const HANGYUL_URL: string | null =
  (import.meta.env?.VITE_HANGYUL_URL as string | undefined)?.trim() || null;
