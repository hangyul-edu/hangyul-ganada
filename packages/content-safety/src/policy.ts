/**
 * The child-safe content policy, typed.
 *
 * The data lives in `policy/child-safe-content-policy.json` and is the single
 * source every gate reads — import, authoring, generation, publication, the
 * runtime, CI and the packaged-artefact scan. This file only says what the JSON
 * means; `evaluate.ts` says how it is applied. See
 * `docs/CHILD_SAFE_CONTENT_POLICY.md` for the policy in prose.
 */
import policyJson from '../policy/child-safe-content-policy.json';

export type Category =
  | 'sexual'
  | 'political'
  | 'profanity'
  | 'drugs'
  | 'gambling'
  | 'violence'
  | 'self_harm'
  | 'mortality';

export type Severity =
  | 'HARD_BLOCK'
  | 'CONTEXT_BLOCK'
  | 'SAFE_ALLOWLIST'
  | 'INTERNAL_ONLY'
  | 'EXTERNAL_REVIEW';

/**
 * How a surface form is looked for.
 *
 * - `substring`: the compact form of the text (normalised, spaces and
 *   punctuation removed) contains the compact form of the term. Right for
 *   unambiguous multi-syllable Korean lexemes: it is what catches 섹스하다,
 *   섹 스, 섹.스 and 섹스를 from the one entry 섹스.
 * - `token`: the term at a script-run boundary, optionally followed by one
 *   Korean particle. For short terms whose syllables occur inside ordinary
 *   words (총, 놈) and for every space-delimited language.
 * - `phrase`: a token sequence, for multi-word terms.
 * - `headword`: compared against a headword or an answer choice only, never
 *   inside running text — 보지 마세요 is 보다.
 */
export type MatchMode = 'substring' | 'token' | 'phrase' | 'headword';

export interface Concept {
  id: string;
  category: Category;
  severity: Severity;
  /** Surface forms by language; `*` applies to every language. */
  surfaces: Record<string, string[]>;
  /** Romanised Korean forms, matched as Latin tokens in any language. */
  romanized: string[];
  /** Per-language overrides of the match mode for a given surface. */
  match: Record<string, Record<string, MatchMode>>;
  /** Longer strings that contain a surface and are safe; blanked before matching. */
  exceptions: Record<string, string[]>;
  /** Items this concept may never flag. */
  allow: { headwords: string[]; senseIds: string[] };
  guidance: string;
}

export interface ContextRule {
  id: string;
  category: Category;
  severity: Severity;
  lang: string;
  pattern: string;
  why: string;
}

export interface GlossIndicators {
  terms: string[];
  except: string[];
}

export interface Policy {
  version: string;
  severities: Severity[];
  categories: Record<Category, string>;
  languageDefaults: Record<string, MatchMode>;
  koreanParticles: string[];
  leet: Record<string, string>;
  concepts: Concept[];
  contextRules: ContextRule[];
  glossIndicators: Record<string, GlossIndicators> & { _comment?: string };
  allow: { exact: string[]; headwords: string[]; senseIds: string[]; _comment?: string };
}

export const POLICY = policyJson as unknown as Policy;
export const POLICY_VERSION: string = POLICY.version;
export const CATEGORIES = Object.keys(POLICY.categories).filter(
  (key) => key !== '_comment',
) as Category[];
