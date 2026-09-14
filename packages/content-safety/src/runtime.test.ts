/**
 * The runtime evaluator against the Korean and English fixtures.
 *
 * The app carries `runtime-policy.json`, not the full policy, so the Korean
 * fixtures must give the same verdicts through it. A negative fixture in
 * another language is expected to pass through *un*-refused here — that is
 * the documented limit of the runtime gate, and the reason every non-Korean
 * string is validated before it is published.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  evaluateSurface,
  runtimeEvaluator,
  runtimeEvaluatorFor,
  mergeSupplements,
  RUNTIME_POLICY_VERSION,
  RUNTIME_SUPPLEMENT_LANGUAGES,
  POLICY,
  POLICY_VERSION,
  verdictOf,
  type Policy,
  type Role,
} from './index';
import { _setSupplementLoader, type RuntimeSupplement } from './runtime';

interface Case {
  id: string;
  text: string;
  lang: string;
  role: Role;
  headword?: string;
  random?: boolean;
  expect: 'ok' | 'review' | 'blocked';
  /** The language lists the verdict needs beyond the field's own language. */
  lists?: string[];
}
const here = join(decodeURIComponent(new URL(import.meta.url).pathname), '..', '..', 'fixtures');
const negative = JSON.parse(readFileSync(join(here, 'negative.json'), 'utf8')).cases as Case[];
const positive = JSON.parse(readFileSync(join(here, 'positive.json'), 'utf8')).cases as Case[];
// Gloss indicators are not carried: a dictionary or assessment gloss is
// classified when it is built, never on the device. Romanised fixtures are
// English-language rows the base runtime still reads, because a romanisation is
// looked for in any Latin text. A Korean field that hides an English term
// (`lists: ["en"]`) needs the English lists, which the *base* does not carry;
// `runtimeEvaluatorFor` loads them as a supplement, and the second suite below
// holds every fixture in every language to the full policy's verdict through
// it. The first suite is what the base alone promises.
const carried = (c: Case) =>
  (c.lang === 'ko' && !(c.lists ?? []).some((lang) => lang !== 'ko' && lang !== '*')) ||
  (c.lang === 'en' && c.role === 'romanization');

describe('the runtime policy subset', () => {
  it('is the same policy version as the full policy', () => {
    expect(RUNTIME_POLICY_VERSION).toBe(POLICY_VERSION);
  });
  for (const c of negative.filter(carried)) {
    it(`refuses ${c.id}: ${c.text}`, () => {
      const facts = { headword: c.headword, random: c.random };
      const findings = runtimeEvaluator().evaluateSurface({ text: c.text, lang: c.lang, role: c.role }, facts);
      expect(verdictOf(findings, facts), JSON.stringify(findings)).toBe(c.expect);
    });
  }
  for (const c of positive.filter(carried)) {
    it(`allows ${c.id}: ${c.text}`, () => {
      const facts = { headword: c.headword, random: c.random };
      const findings = runtimeEvaluator().evaluateSurface({ text: c.text, lang: c.lang, role: c.role }, facts);
      expect(verdictOf(findings, facts), JSON.stringify(findings)).toBe('ok');
    });
  }
});

/*
 * The supplemented evaluator: every fixture, in every language, gives the
 * verdict the full policy gives. This is the gap the sixteenth and
 * seventeenth editions of the product report documented — English lists
 * absent from the device, meanings in the learner's language never re-read —
 * and it is closed only if this suite holds for every fixture, not the
 * Korean ones.
 */
describe('the runtime evaluator with the language supplements', () => {
  const full = (c: Case) => {
    const facts = { headword: c.headword, random: c.random };
    return verdictOf(evaluateSurface({ text: c.text, lang: c.lang, role: c.role }, facts), facts);
  };
  it('has a supplement for every language the full policy names besides Korean', () => {
    const named = new Set<string>();
    for (const concept of POLICY.concepts) {
      for (const table of [concept.surfaces, concept.match, concept.exceptions]) {
        for (const lang of Object.keys(table ?? {})) if (lang !== 'ko' && lang !== '*') named.add(lang);
      }
    }
    for (const rule of POLICY.contextRules) if (rule.lang !== 'ko' && rule.lang !== '*') named.add(rule.lang);
    expect([...RUNTIME_SUPPLEMENT_LANGUAGES].sort()).toEqual([...named].sort());
  });
  it('refuses a supplement from another policy version', () => {
    const base = runtimePolicyJson();
    const stale: RuntimeSupplement = { version: '0.0.0', lang: 'en', concepts: [], contextRules: [] };
    expect(() => mergeSupplements(base, [stale])).toThrow(/0\.0\.0/);
  });
  for (const c of [...negative, ...positive]) {
    // The languages whose lists this verdict needs: the field's own, plus
    // any the fixture names. Every fixture reaches at most one supplement
    // beyond English, which is what an interface language loads.
    const needed = [...new Set([c.lang, ...(c.lists ?? [])])].filter((l) => l !== 'ko' && l !== '*');
    const lang = needed.find((l) => l !== 'en') ?? needed[0] ?? 'ko';
    it(`${c.id} (${c.lang}, via ${lang}): ${c.text} → ${c.expect}`, async () => {
      const evaluator = await runtimeEvaluatorFor(lang);
      const facts = { headword: c.headword, random: c.random };
      const findings = evaluator.evaluateSurface({ text: c.text, lang: c.lang, role: c.role }, facts);
      const verdict = verdictOf(findings, facts);
      expect(verdict, JSON.stringify(findings)).toBe(c.expect);
      expect(verdict).toBe(full(c));
    });
  }
  it('loads English and the interface language, once each, and caches the evaluator', async () => {
    const loaded: string[] = [];
    _setSupplementLoader(async (lang) => {
      loaded.push(lang);
      return readSupplement(lang);
    });
    try {
      const first = await runtimeEvaluatorFor('de');
      const second = await runtimeEvaluatorFor('de');
      expect(second).toBe(first);
      expect(loaded.sort()).toEqual(['de', 'en']);
      // A language with no supplement of its own gets the base plus English.
      await runtimeEvaluatorFor('xx');
      expect(loaded.sort()).toEqual(['de', 'en', 'en']);
    } finally {
      _setSupplementLoader(null);
    }
  });
});

function runtimePolicyJson(): Policy {
  return JSON.parse(readFileSync(join(here, '..', 'policy', 'runtime-policy.json'), 'utf8')) as Policy;
}
function readSupplement(lang: string): RuntimeSupplement {
  return JSON.parse(readFileSync(join(here, '..', 'policy', 'runtime', `${lang}.json`), 'utf8')) as RuntimeSupplement;
}
