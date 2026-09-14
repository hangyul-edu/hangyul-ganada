/**
 * The evaluator the app ships.
 *
 * Built from `policy/runtime-policy.json` — the full policy minus the
 * thirty-one other languages and the English gloss indicators. Everything
 * Korean and romanised is here in full, with the same context rules and allow
 * lists, so a legacy sitting, a cached day, a fetched bank or a distractor
 * chosen in the browser is judged by the same rules the release scanner
 * applied — see `docs/CHILD_SAFE_CONTENT_POLICY.md`.
 *
 * ## The learner's own language, on demand
 *
 * The base policy is what fits in the chunk the Level Test fetches with its
 * bank. It is not the whole policy, and until v1.0.5 the difference was a
 * documented gap: a Latin term inside a Korean field is refused by the
 * release scanner through the *English* lists, which the base does not
 * carry, and a meaning shown in the learner's language was not re-read on
 * the device at all. `runtimeEvaluatorFor(lang)` closes both. It loads two
 * supplements — English, which the Latin-in-Korean rule needs whatever the
 * interface language, and the interface language itself — merges them into
 * the base by concept id, and compiles one evaluator per language, cached.
 * Each supplement is a chunk of its own (`policy/runtime/<lang>.json`), a
 * few kilobytes, fetched once and precached like any other asset; the route
 * budget is measured on every one of them rather than raised.
 *
 * The verdicts are the full policy's for the languages loaded: the
 * `runtime.test.ts` suite runs every fixture in every language through the
 * supplemented evaluator and requires the same answer the full policy gives.
 */
import runtimePolicy from '../policy/runtime-policy.json';
import supplementIndex from '../policy/runtime/index.json';
import { createEvaluator, type Evaluator } from './evaluate';
import type { Policy } from './policy';

type Concept = Policy['concepts'][number];

/** One language's lists, as `build-runtime-policy.mjs` writes them. */
export interface RuntimeSupplement {
  version: string;
  lang: string;
  concepts: Pick<Concept, 'id' | 'surfaces' | 'match' | 'exceptions'>[];
  contextRules: Policy['contextRules'];
  /** English only: the gloss indicators, which classify an English gloss whatever its Korean surface. */
  glossIndicators?: Policy['glossIndicators'];
}

let instance: Evaluator | null = null;

/** The base runtime evaluator — Korean and romanised forms — compiled on first use. */
export function runtimeEvaluator(): Evaluator {
  if (!instance) instance = createEvaluator(runtimePolicy as unknown as Policy);
  return instance;
}

export const RUNTIME_POLICY_VERSION: string = (runtimePolicy as { version: string }).version;

/** The languages a runtime supplement exists for. */
export const RUNTIME_SUPPLEMENT_LANGUAGES: readonly string[] = (
  supplementIndex as { languages: string[] }
).languages;

/**
 * Loads one language's supplement.
 *
 * The template import is what Vite turns into one chunk per file under
 * `policy/runtime/`; the guard above it means an unknown language never
 * builds a path. Injected for tests through `_setSupplementLoader`.
 */
let loadSupplement = async (lang: string): Promise<RuntimeSupplement> => {
  const module = (await import(`../policy/runtime/${lang}.json`)) as { default: RuntimeSupplement };
  return module.default;
};

/** Test seam: replace the loader, and forget every compiled per-language evaluator. */
export function _setSupplementLoader(loader: typeof loadSupplement | null): void {
  loadSupplement = loader ?? defaultLoader;
  perLanguage.clear();
}
const defaultLoader = loadSupplement;

/** The base policy with one or more supplements merged in, by concept id. */
export function mergeSupplements(base: Policy, supplements: RuntimeSupplement[]): Policy {
  const byId = new Map(base.concepts.map((concept) => [concept.id, { ...concept }]));
  const contextRules = [...base.contextRules];
  let glossIndicators = base.glossIndicators;
  for (const supplement of supplements) {
    if (supplement.version !== base.version) {
      throw new Error(
        `runtime supplement ${supplement.lang} is policy ${supplement.version}; the base is ${base.version}`,
      );
    }
    for (const part of supplement.concepts) {
      const target = byId.get(part.id);
      if (!target) continue;
      target.surfaces = { ...(target.surfaces ?? {}), ...(part.surfaces ?? {}) };
      target.match = { ...(target.match ?? {}), ...(part.match ?? {}) };
      target.exceptions = { ...(target.exceptions ?? {}), ...(part.exceptions ?? {}) };
    }
    contextRules.push(...supplement.contextRules);
    if (supplement.glossIndicators) glossIndicators = supplement.glossIndicators;
  }
  return { ...base, concepts: [...byId.values()], contextRules, glossIndicators };
}

const perLanguage = new Map<string, Promise<Evaluator>>();

/**
 * The runtime evaluator for an interface language: the base, plus English,
 * plus that language's own lists. Languages with no supplement of their own
 * (Korean, or a language the policy does not name) get the base plus English.
 */
export function runtimeEvaluatorFor(lang: string): Promise<Evaluator> {
  const key = RUNTIME_SUPPLEMENT_LANGUAGES.includes(lang) ? lang : 'en';
  let pending = perLanguage.get(key);
  if (!pending) {
    pending = (async () => {
      const wanted = key === 'en' ? ['en'] : ['en', key];
      const supplements = await Promise.all(wanted.map((l) => loadSupplement(l)));
      return createEvaluator(mergeSupplements(runtimePolicy as unknown as Policy, supplements));
    })();
    perLanguage.set(key, pending);
    pending.catch(() => perLanguage.delete(key));
  }
  return pending;
}
