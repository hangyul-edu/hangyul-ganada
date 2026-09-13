/**
 * The policy evaluator.
 *
 * One function, `evaluateSurface`, reads one string in one language in one
 * role and returns the policy findings for it; `evaluateItem` runs it over
 * every field of a content item and turns the findings into a verdict. Every
 * gate in the repository — the Python builders through their port, the bank
 * builder, the runtime delivery gate, the release scanner and the artefact scan
 * — calls one of those two and nothing else, which is what makes the policy a
 * policy rather than a set of lists that drift apart.
 *
 * ## The order of evaluation
 *
 * 1. normalise (see `normalize.ts`);
 * 2. the global allow list: a field that *is* an allowlisted string, or a
 *    headword/option that is an allowlisted headword, is never flagged;
 * 3. per concept: skip when the item's headword or sense is allowlisted for
 *    that concept; blank the concept's exceptions out of the text; then match
 *    each surface in the mode the policy gives it;
 * 4. the context rules — regular expressions over the normalised text for the
 *    cases a term list cannot express (총을 쏘다 against 총 세 개);
 * 5. for an English gloss, the gloss indicators, which classify an entry by
 *    what it *means* rather than how it is spelled (보지 glossed
 *    "preservation" is caught by the word list; 매음 glossed "prostitution"
 *    is caught here).
 *
 * ## What a verdict means
 *
 * `blocked` — at least one HARD_BLOCK finding, or a CONTEXT_BLOCK finding on
 * a random or generated surface. `review` — a CONTEXT_BLOCK finding on a
 * curated surface that nobody has allowlisted: the gate fails so a person
 * decides, and the decision is recorded in the policy's allow lists. `ok` —
 * nothing.
 */
import { compactTerm, configureLeet, escapeRegExp, isHangulTerm, normalize } from './normalize';
import { POLICY, type Category, type Concept, type MatchMode, type Policy, type Severity } from './policy';

export type Role =
  | 'headword'
  | 'option'
  | 'sentence'
  | 'gloss'
  | 'note'
  | 'ui'
  | 'romanization'
  | 'transcript';

export interface Surface {
  text: string;
  /** BCP-47-ish locale as the repository spells it: `ko`, `en`, `pt-BR`, `zh-CN`. */
  lang: string;
  role: Role;
  /** Where the string came from, for the report. */
  field?: string;
}

export interface ItemFacts {
  headword?: string;
  senseId?: string;
  /**
   * A surface a learner meets without asking for it — an assessment option, a
   * distractor, a gap-fill, a recommendation. CONTEXT_BLOCK findings block
   * here and only here.
   */
  random?: boolean;
}

export interface Finding {
  conceptId: string;
  category: Category;
  severity: Severity;
  lang: string;
  /** The policy term or rule that matched. */
  term: string;
  mode: MatchMode | 'pattern' | 'gloss' | 'romanized';
  field?: string;
  /** The text the finding was made on, trimmed for the report. */
  excerpt: string;
}

export type Verdict = 'ok' | 'review' | 'blocked';

export interface ItemResult {
  verdict: Verdict;
  findings: Finding[];
}

interface Compiled {
  concept: Concept;
  allowHeadwords: Set<string>;
  allowSenseIds: Set<string>;
  /** lang → alternation of exception strings (normalised), to blank. */
  exceptions: Map<string, { norm: RegExp; compact: RegExp; flat: RegExp }>;
  /** lang → mode → regex. Substring regexes run on the compact form (and `flat` on the flat form). */
  matchers: Map<string, Map<MatchMode, RegExp[]>>;
  /** lang → substring terms of three or more characters, matched on the flat form too. */
  flatMatchers: Map<string, RegExp>;
  romanized: RegExp | null;
}

/** Endings a romaniser attaches to a Korean stem. */
const ROMANIZED_ENDINGS = 'hada|haeyo|haesseoyo|hae|han|hal|hamnida|reul|eul|eun|neun|do|ro|euro|eseo|ege|hante|deul|ga';
const HANGUL = '가-힣ㄱ-ㅎㅏ-ㅣ\u1100-\u11ff\u3130-\u318f';

/** A policy, compiled once into the regular expressions the evaluator runs. */
interface CompiledPolicy {
  policy: Policy;
  concepts: Compiled[];
  contextRules: { rule: Policy['contextRules'][number]; re: RegExp }[];
  glossTerms: Map<string, { terms: { term: string; re: RegExp }[]; except: RegExp | null }>;
  globalAllowExact: Set<string>;
  globalAllowHeadwords: Set<string>;
  particleAlternation: string;
  /** The languages written in the Latin alphabet — a Latin word is not foreign there. */
  latinScript: Set<string>;
}

/**
 * A gloss indicator is a whole word (`gun` is not `begun`, `meth` is not
 * `something`); a trailing `*` makes it a stem (`prostitut*` covers
 * prostitute and prostitution).
 */
function glossRegex(term: string): { term: string; re: RegExp } {
  const stem = term.endsWith('*');
  const body = escapeRegExp(stem ? term.slice(0, -1) : term).replace(/\s+/g, '\\s+');
  return {
    term,
    re: new RegExp(`(?<![\\p{L}\\p{N}])${body}${stem ? '' : '(?![\\p{L}\\p{N}])'}`, 'u'),
  };
}
function defaultMode(policy: Policy, lang: string, term: string): MatchMode {
  const base = policy.languageDefaults[lang] ?? policy.languageDefaults['*'] ?? 'token';
  if (base === 'token' && /\s/.test(term)) return 'phrase';
  return base;
}

/** A token or phrase regex: the term at a script-run boundary, optionally followed by a Korean particle. */
function tokenRegex(terms: string[], hangul: boolean, particleAlternation: string): RegExp {
  const body = terms.map((t) => escapeRegExp(t).replace(/\s+/g, '\\s+')).join('|');
  if (hangul) {
    return new RegExp(`(?<![${HANGUL}])(?:${body})(?:${particleAlternation})?(?![${HANGUL}])`, 'u');
  }
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])(?:${body})(?![\\p{L}\\p{N}\\p{M}])`, 'u');
}

function compile(policy: Policy): CompiledPolicy {
  configureLeet(policy.leet);
  const particleAlternation = policy.koreanParticles.map(escapeRegExp).join('|');
  const globalAllowExact = new Set(policy.allow.exact.map((s) => normalize(s).norm));
  const globalAllowHeadwords = new Set(policy.allow.headwords.map((s) => normalize(s).norm));

  const out: Compiled[] = [];
  for (const concept of policy.concepts) {
    const exceptions = new Map<string, { norm: RegExp; compact: RegExp; flat: RegExp }>();
    for (const [lang, list] of Object.entries(concept.exceptions ?? {})) {
      const norms = list.map((s) => normalize(s).norm).filter(Boolean);
      const compacts = list.map((s) => compactTerm(s).compact).filter(Boolean);
      const flats = list.map((s) => compactTerm(s).flat).filter(Boolean);
      if (norms.length === 0) continue;
      exceptions.set(lang, {
        norm: new RegExp(norms.map(escapeRegExp).join('|'), 'gu'),
        compact: new RegExp(compacts.map(escapeRegExp).join('|'), 'gu'),
        flat: new RegExp(flats.map(escapeRegExp).join('|'), 'gu'),
      });
    }
    const matchers = new Map<string, Map<MatchMode, RegExp[]>>();
    const flatMatchers = new Map<string, RegExp>();
    for (const [lang, list] of Object.entries(concept.surfaces ?? {})) {
      const byMode = new Map<MatchMode, string[]>();
      const flats: string[] = [];
      for (const raw of list) {
        const mode = concept.match?.[lang]?.[raw] ?? defaultMode(policy, lang, raw);
        const term = mode === 'substring' ? compactTerm(raw).compact : normalize(raw).norm;
        if (!term) continue;
        const bucket = byMode.get(mode) ?? [];
        bucket.push(term);
        byMode.set(mode, bucket);
        // A term of three or more characters is also looked for with every
        // space removed (죽고싶어요 for 죽고 싶); a two-character term is not,
        // because 복도 박물관 would then contain 도박.
        if (mode === 'substring') {
          const flat = compactTerm(raw).flat;
          if (flat.length >= 3 && flat !== term) flats.push(flat);
        }
      }
      if (flats.length) flatMatchers.set(lang, new RegExp(flats.map(escapeRegExp).join('|'), 'u'));
      const regexes = new Map<MatchMode, RegExp[]>();
      for (const [mode, terms] of byMode) {
        if (mode === 'substring') {
          regexes.set(mode, [new RegExp(terms.map(escapeRegExp).join('|'), 'u')]);
        } else if (mode === 'headword') {
          regexes.set(mode, [new RegExp(`^(?:${terms.map(escapeRegExp).join('|')})$`, 'u')]);
        } else {
          const hangul = terms.filter(isHangulTerm);
          const other = terms.filter((t) => !isHangulTerm(t));
          const list: RegExp[] = [];
          if (hangul.length) list.push(tokenRegex(hangul, true, particleAlternation));
          if (other.length) list.push(tokenRegex(other, false, particleAlternation));
          regexes.set(mode, list);
        }
      }
      matchers.set(lang, regexes);
    }
    // Romanised Korean is matched as a whole word that may carry one of the
    // endings a romaniser attaches (sekseuhada, sekseureul); anything else
    // after it is a different word — sicheong is not siche.
    const romanized = concept.romanized?.length
      ? new RegExp(
          `(?<![\\p{L}\\p{N}])(?:${concept.romanized
            .map((r) => escapeRegExp(normalize(r).norm))
            .join('|')})(?:${ROMANIZED_ENDINGS})?(?![\\p{L}\\p{N}])`,
          'u',
        )
      : null;
    out.push({
      concept,
      allowHeadwords: new Set((concept.allow?.headwords ?? []).map((s) => normalize(s).norm)),
      allowSenseIds: new Set(concept.allow?.senseIds ?? []),
      exceptions,
      matchers,
      flatMatchers,
      romanized,
    });
  }
  const contextRules = (policy.contextRules ?? []).map((rule) => ({ rule, re: new RegExp(rule.pattern, 'u') }));
  const glossTerms = new Map<string, { terms: { term: string; re: RegExp }[]; except: RegExp | null }>();
  for (const [category, spec] of Object.entries(policy.glossIndicators ?? {})) {
    if (category === '_comment' || typeof spec === 'string') continue;
    const except = spec.except.map((s) => s.toLowerCase()).filter(Boolean);
    glossTerms.set(category, {
      terms: spec.terms.map((s) => s.toLowerCase()).filter(Boolean).map(glossRegex),
      except: except.length ? new RegExp(except.map(escapeRegExp).join('|'), 'g') : null,
    });
  }
  return {
    policy,
    concepts: out,
    contextRules,
    glossTerms,
    globalAllowExact,
    globalAllowHeadwords,
    particleAlternation,
    latinScript: new Set(policy.latinScript ?? []),
  };
}

function excerptOf(text: string): string {
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function stripOneParticle(norm: string, particleAlternation: string): string {
  if (!isHangulTerm(norm)) return norm;
  const re = new RegExp(`(${particleAlternation})$`, 'u');
  return norm.replace(re, '');
}

/** The functions an evaluator exposes; one per policy. */
export interface Evaluator {
  evaluateSurface(surface: Surface, facts?: ItemFacts): Finding[];
  classifyGloss(gloss: string, facts?: ItemFacts, field?: string): Finding[];
  evaluateItem(surfaces: Surface[], facts?: ItemFacts): ItemResult;
  isBlocked(text: string, lang?: string, role?: Role, facts?: ItemFacts): boolean;
  version: string;
}

/**
 * An evaluator for one policy.
 *
 * The release scanner and the builders use the full policy; the runtime
 * bundles the slimmer `runtime-policy.json` (Korean, English and romanised
 * forms — every other language was validated at publication) and evaluates
 * legacy, cached and generated content against it before serving.
 */
export function createEvaluator(policy: Policy): Evaluator {
  const compiledPolicy = compile(policy);
  return {
    version: policy.version,
    evaluateSurface: (surface, facts = {}) => evaluateWith(compiledPolicy, surface, facts),
    classifyGloss: (gloss, facts = {}, field) => classifyGlossWith(compiledPolicy, gloss, facts, field),
    evaluateItem: (surfaces, facts = {}) => {
      const findings: Finding[] = [];
      for (const surface of surfaces) findings.push(...evaluateWith(compiledPolicy, surface, facts));
      return { verdict: verdictOf(findings, facts), findings };
    },
    isBlocked: (text, lang = 'ko', role = 'sentence', facts = {}) =>
      verdictOf(evaluateWith(compiledPolicy, { text, lang, role }, facts), facts) === 'blocked',
  };
}

let defaultEvaluator: Evaluator | null = null;
function defaults(): Evaluator {
  if (!defaultEvaluator) defaultEvaluator = createEvaluator(POLICY);
  return defaultEvaluator;
}

/** Test seam: forget the compiled policy so a test can swap the JSON. */
export function resetCompiled(): void {
  defaultEvaluator = null;
}

/**
 * Every finding for one string, under the full policy.
 *
 * `facts.headword` and `facts.senseId` let the concept-level allow lists work;
 * the global allow list needs nothing but the text.
 */
export function evaluateSurface(surface: Surface, facts: ItemFacts = {}): Finding[] {
  return defaults().evaluateSurface(surface, facts);
}

function evaluateWith(compiledPolicy: CompiledPolicy, surface: Surface, facts: ItemFacts): Finding[] {
  const { globalAllowExact, globalAllowHeadwords, particleAlternation, contextRules, latinScript } = compiledPolicy;
  const { norm, compact, flat } = normalize(surface.text);
  if (!norm) return [];
  const findings: Finding[] = [];
  const isHead = surface.role === 'headword' || surface.role === 'option';

  if (globalAllowExact.has(norm)) return [];
  // A taught headword on the allow list is never flagged as a headword. An
  // *option* is not a headword: 년 is taught as the counter for years and is
  // still refused as a bare answer choice, which is the whole point of the
  // distinction.
  if (surface.role === 'headword' && globalAllowHeadwords.has(norm)) return [];
  const headwordNorm = facts.headword ? normalize(facts.headword).norm : null;

  // Latin letters in a field whose language is not written in the Latin
  // alphabet are read against the English lists as well: a Korean sentence
  // that contains "sex" is not caught by the Korean list, and the product's
  // fallback language is the one a stray Latin word is most likely to be in.
  // A German or Spanish field is all Latin letters and reads only its own
  // lists ("die" is an article there). `child_safety.py` does the same.
  const foreignLatin = !latinScript.has(surface.lang) && /[a-z]/.test(norm);
  const langs = foreignLatin ? [surface.lang, '*', 'en'] : [surface.lang, '*'];
  // A romanisation is Latin letters standing for Korean, not English: 군 is
  // romanised `gun` and is not a firearm. Only the romanised forms apply.
  const romanizationOnly = surface.role === 'romanization';
  /** The text with a category's exceptions blanked, for the context rules. */
  const blankedByCategory = new Map<string, string>();
  for (const entry of compiledPolicy.concepts) {
    const { concept } = entry;
    if (headwordNorm && entry.allowHeadwords.has(headwordNorm)) continue;
    if (facts.senseId && entry.allowSenseIds.has(facts.senseId)) continue;
    if (surface.role === 'headword' && entry.allowHeadwords.has(norm)) continue;

    // Blank the exceptions for this language and for every language.
    let text = norm;
    let compactText = compact;
    let flatText = flat;
    for (const lang of langs) {
      const ex = entry.exceptions.get(lang);
      if (!ex) continue;
      text = text.replace(ex.norm, (m) => ' '.repeat(m.length));
      compactText = compactText.replace(ex.compact, ' ');
      flatText = flatText.replace(ex.flat, '');
    }
    blankedByCategory.set(concept.category, text);

    for (const lang of romanizationOnly ? [] : langs) {
      const regexes = entry.matchers.get(lang);
      if (!regexes) continue;
      for (const [mode, list] of regexes) {
        if (mode === 'headword' && !isHead) continue;
        const subjects =
          mode === 'substring'
            ? [compactText]
            : mode === 'headword'
              ? [text, stripOneParticle(text, particleAlternation)]
              : [text];
        for (const re of list) {
          let m = subjects.map((subject) => re.exec(subject)).find(Boolean);
          if (!m && mode === 'substring') m = entry.flatMatchers.get(lang)?.exec(flatText) ?? undefined;
          if (m) {
            findings.push({
              conceptId: concept.id,
              category: concept.category,
              severity: concept.severity,
              lang: surface.lang,
              term: m[0],
              mode,
              field: surface.field,
              excerpt: excerptOf(surface.text),
            });
            break;
          }
        }
      }
    }

    // Romanised Korean is Latin letters; it is looked for in English text and
    // in romanisation fields, not in German, where `sache` is a thing.
    if (entry.romanized && (surface.lang === 'en' || romanizationOnly)) {
      const m = entry.romanized.exec(text);
      if (m) {
        findings.push({
          conceptId: concept.id,
          category: concept.category,
          severity: concept.severity,
          lang: surface.lang,
          term: m[0],
          mode: 'romanized',
          field: surface.field,
          excerpt: excerptOf(surface.text),
        });
      }
    }
  }

  for (const { rule, re } of romanizationOnly ? [] : contextRules) {
    if (rule.lang !== surface.lang && rule.lang !== '*') continue;
    if (headwordNorm) {
      const owner = compiledPolicy.concepts.find((c) => c.concept.category === rule.category);
      if (owner?.allowHeadwords.has(headwordNorm)) continue;
    }
    const m = re.exec(blankedByCategory.get(rule.category) ?? norm);
    if (m) {
      findings.push({
        conceptId: rule.id,
        category: rule.category,
        severity: rule.severity,
        lang: surface.lang,
        term: m[0],
        mode: 'pattern',
        field: surface.field,
        excerpt: excerptOf(surface.text),
      });
    }
  }

  if (surface.role === 'gloss' && surface.lang === 'en') {
    findings.push(...classifyGlossWith(compiledPolicy, surface.text, facts, surface.field));
  }
  return dedupe(findings);
}

/**
 * What an English gloss says an entry means.
 *
 * Used on dictionary rows and assessment anchors, where the Korean surface is
 * an arbitrary headword and the only thing that says what it is, is the
 * gloss. Mortality is CONTEXT_BLOCK; every other category is HARD_BLOCK.
 */
export function classifyGloss(gloss: string, facts: ItemFacts = {}, field?: string): Finding[] {
  return defaults().classifyGloss(gloss, facts, field);
}

function classifyGlossWith(compiledPolicy: CompiledPolicy, gloss: string, facts: ItemFacts, field?: string): Finding[] {
  const headwordNorm = facts.headword ? normalize(facts.headword).norm : null;
  const lower = gloss.toLowerCase();
  const out: Finding[] = [];
  for (const [category, spec] of compiledPolicy.glossTerms) {
    if (headwordNorm) {
      const allowed = compiledPolicy.concepts.some(
        (c) => c.concept.category === category && c.allowHeadwords.has(headwordNorm),
      );
      if (allowed) continue;
    }
    const text = spec.except ? lower.replace(spec.except, (m) => ' '.repeat(m.length)) : lower;
    const hit = spec.terms.find(({ re }) => re.test(text))?.term;
    if (hit) {
      out.push({
        conceptId: `gloss.${category}`,
        category: category as Category,
        severity: category === 'mortality' ? 'CONTEXT_BLOCK' : 'HARD_BLOCK',
        lang: 'en',
        term: hit,
        mode: 'gloss',
        field,
        excerpt: excerptOf(gloss),
      });
    }
  }
  return out;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.conceptId}\u0000${f.term}\u0000${f.field ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The verdict a list of findings adds up to. */
export function verdictOf(findings: Finding[], facts: ItemFacts = {}): Verdict {
  let verdict: Verdict = 'ok';
  for (const f of findings) {
    if (f.severity === 'HARD_BLOCK') return 'blocked';
    if (f.severity === 'CONTEXT_BLOCK') verdict = facts.random ? 'blocked' : 'review';
  }
  return verdict;
}

/** Every field of an item, one verdict, under the full policy. */
export function evaluateItem(surfaces: Surface[], facts: ItemFacts = {}): ItemResult {
  return defaults().evaluateItem(surfaces, facts);
}

/** Convenience for callers that only have a Korean string and want yes/no. */
export function isBlocked(text: string, lang = 'ko', role: Role = 'sentence', facts: ItemFacts = {}): boolean {
  return defaults().isBlocked(text, lang, role, facts);
}
