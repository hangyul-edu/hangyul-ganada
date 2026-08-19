/**
 * Translation resources, discovered from the filesystem.
 *
 * Adding a language means dropping `src/locales/<bcp47>/<namespace>.json` into
 * place. Nothing here, and nothing in any component, enumerates the languages —
 * that is the whole point: a new locale must never require a code change.
 *
 * Bundles are loaded eagerly. The whole set is a few tens of kilobytes of JSON
 * that gzips to almost nothing, and the alternative — a network round trip
 * between the learner choosing a language and the interface changing — is a
 * visible flash of the previous language on every switch.
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
  'errors',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE: Namespace = 'common';

type Bundle = Record<string, unknown>;

const modules = import.meta.glob<Bundle>('../locales/*/*.json', {
  eager: true,
  import: 'default',
});

function buildResources(): Record<string, Partial<Record<Namespace, Bundle>>> {
  const out: Record<string, Partial<Record<Namespace, Bundle>>> = {};
  for (const [path, bundle] of Object.entries(modules)) {
    const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const [, locale, namespace] = match as unknown as [string, string, Namespace];
    if (!NAMESPACES.includes(namespace)) {
      throw new Error(
        `${path} declares unknown namespace "${namespace}" — add it to NAMESPACES or rename the file`,
      );
    }
    (out[locale] ??= {})[namespace] = bundle;
  }
  return out;
}

export const RESOURCES = buildResources();

/**
 * Locales that actually ship a translation, newest addition included, sorted so
 * the list is stable between builds.
 *
 * This is *translation coverage*. `describeLocale()` in `locales.ts` will
 * happily describe a language that is not in here; that is
 * *internationalization support*. Keeping the two apart is what lets us claim
 * the architecture handles any language without also claiming we have
 * translated into it.
 */
export const AVAILABLE_LOCALES: readonly string[] = Object.keys(RESOURCES).sort();
