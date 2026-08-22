/**
 * Translation resources, discovered from the filesystem.
 *
 * Adding a language means dropping `src/locales/<bcp47>/<namespace>.json` into
 * place. Nothing here, and nothing in any component, enumerates the languages —
 * that is the whole point: a new locale must never require a code change.
 *
 * The source locale is bundled; every other one is fetched.
 *
 * That split is new, and it is the difference between a first load of 460 kB
 * and one of 651 kB. Every bundle used to be `eager: true`, on the argument
 * that the whole set was a few tens of kilobytes and that fetching one would
 * put a flash of the previous language between the tap and the interface. Both
 * halves were true at ten languages. At thirty-two they are not: the set is
 * about 300 kB gzipped, a learner reads exactly one of them, and the other
 * thirty-one were arriving *before the first paint* on the phone of somebody
 * who will never see them.
 *
 * So English stays in the bundle — it is the end of every fallback chain and
 * the value of `humanizeKey` never being reached — and each other language is
 * a chunk of its own, fetched by `loadLocaleResources` before the interface
 * changes to it. The flash the old comment worried about does not happen,
 * because `LocaleProvider` awaits the fetch and *then* switches; what a learner
 * sees on a slow connection is the old language for a moment longer, which is
 * the correct thing to show them.
 */

/** Namespaces, in the order a missing key is searched. */
export const NAMESPACES = [
  'common',
  'navigation',
  'home',
  'learning',
  'handwriting',
  'vocabulary',
  'activity',
  'settings',
  'levelTest',
  'errors',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE: Namespace = 'common';

type Bundle = Record<string, unknown>;
export type LocaleResources = Partial<Record<Namespace, Bundle>>;

/**
 * Every locale directory, as a lazy import per file.
 *
 * The glob is not eager, so this is a map of paths to loaders and none of the
 * JSON is in the graph until one is called. The *keys* are still available
 * synchronously, which is what `AVAILABLE_LOCALES` needs — a language has to
 * appear in the picker before anybody has fetched it.
 */
const modules = import.meta.glob<Bundle>('../locales/*/*.json', { import: 'default' });

/** The English bundles, imported by name so the bundler keeps them inline. */
import commonEn from '../locales/en/common.json';
import navigationEn from '../locales/en/navigation.json';
import homeEn from '../locales/en/home.json';
import learningEn from '../locales/en/learning.json';
import handwritingEn from '../locales/en/handwriting.json';
import vocabularyEn from '../locales/en/vocabulary.json';
import activityEn from '../locales/en/activity.json';
import settingsEn from '../locales/en/settings.json';
import levelTestEn from '../locales/en/levelTest.json';
import errorsEn from '../locales/en/errors.json';

/*
 * Typed as complete rather than partial, so this cannot fall behind
 * `NAMESPACES` again.
 *
 * It did once: `levelTest` was added to the list and not to this object, and
 * because English is the end of every fallback chain the result was not a
 * missing-translation warning — it was `humanizeKey` rendering the *key*.
 * "Vocabulary Level" became "Title", in every language, and nothing failed:
 * `i18n:check` compares locale directories against each other and all 32 of
 * them had the file. `Record` rather than `Partial<Record>` turns the next one
 * into a compile error.
 */
const ENGLISH: Record<Namespace, Bundle> = {
  common: commonEn,
  navigation: navigationEn,
  home: homeEn,
  learning: learningEn,
  handwriting: handwritingEn,
  vocabulary: vocabularyEn,
  activity: activityEn,
  settings: settingsEn,
  levelTest: levelTestEn,
  errors: errorsEn,
};

function parsePath(path: string): [string, Namespace] | null {
  const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) return null;
  const [, locale, namespace] = match as unknown as [string, string, Namespace];
  if (!NAMESPACES.includes(namespace)) {
    throw new Error(
      `${path} declares unknown namespace "${namespace}" — add it to NAMESPACES or rename the file`,
    );
  }
  return [locale, namespace];
}

/**
 * What i18next is initialised with: English, and nothing else.
 *
 * Everything else is added at runtime by `loadLocaleResources`. Reading this
 * object to ask "do we have Thai" gives the wrong answer on purpose — ask
 * `AVAILABLE_LOCALES`, which is about what *ships*, not about what is loaded.
 */
export const RESOURCES: Record<string, LocaleResources> = { en: ENGLISH };

/**
 * Locales that actually ship a translation, sorted so the list is stable
 * between builds.
 *
 * This is *translation coverage*. `describeLocale()` in `locales.ts` will
 * happily describe a language that is not in here; that is
 * *internationalization support*. Keeping the two apart is what lets us claim
 * the architecture handles any language without also claiming we have
 * translated into it.
 */
export const AVAILABLE_LOCALES: readonly string[] = [
  ...new Set(
    Object.keys(modules)
      .map((path) => parsePath(path)?.[0])
      .filter((code): code is string => Boolean(code)),
  ),
].sort();

const loaded = new Map<string, Promise<LocaleResources>>([['en', Promise.resolve(ENGLISH)]]);

/**
 * Fetches one locale's bundles, once.
 *
 * Concurrent calls for the same language share a promise, so tapping a row
 * twice does not fetch twice, and a language already in the cache resolves in
 * the same tick — which is what keeps a second visit to a language instant.
 *
 * A locale with no directory resolves to `{}` rather than throwing: the picker
 * only offers what `AVAILABLE_LOCALES` lists, but a stored preference can name
 * anything, and the right answer for an unknown tag is English through the
 * fallback chain, not a crash on launch.
 */
export function loadLocaleResources(code: string): Promise<LocaleResources> {
  const cached = loaded.get(code);
  if (cached) return cached;

  const wanted = Object.entries(modules).filter(([path]) => parsePath(path)?.[0] === code);
  const pending = Promise.all(
    wanted.map(async ([path, load]) => [parsePath(path)![1], await load()] as const),
  ).then((entries) => Object.fromEntries(entries) as LocaleResources);

  loaded.set(code, pending);
  return pending;
}

/** True when a locale's bundles are already in memory. */
export function hasLocaleResources(code: string): boolean {
  return loaded.has(code);
}

/**
 * Loads every locale, for the suites that assert across all of them.
 *
 * **Test and QA only.** No screen may call this: the reason the bundles are
 * split is that a learner reads one language, and a helper that pulls all
 * thirty-two would put the 300 kB straight back. It exists because the checks
 * that matter most about translations — no hint reveals its answer, in any
 * language; every plural category is filled, in any language — are statements
 * about the whole set, and a check that can only see English is the check that
 * let six locales ship with English lesson titles for two cycles.
 *
 * `src/test/setup.ts` awaits it once per suite, so the tests read `RESOURCES`
 * the way they always did.
 */
export async function preloadAllLocaleResources(): Promise<void> {
  await Promise.all(
    AVAILABLE_LOCALES.map(async (code) => {
      RESOURCES[code] = await loadLocaleResources(code);
    }),
  );
}
