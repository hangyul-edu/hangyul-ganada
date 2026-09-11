/**
 * The shared fixtures, run through the TypeScript evaluator.
 *
 * `fixtures/negative.json` holds strings the policy must refuse — one or more
 * for every prohibited category, in every shape the brief names (lemma,
 * conjugated, particle-attached, spaced, punctuated, zero-width, misspelled,
 * romanised, translated, masked, and unsafe only in a choice, hint or
 * transcript). `fixtures/positive.json` holds the false positives a substring
 * filter would produce. The Python port runs the same two files
 * (`scripts/content/child_safety.py --self-test`), which is what keeps the two
 * evaluators one policy.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { evaluateSurface, verdictOf, type Role } from './index';

interface Case {
  id: string;
  text: string;
  lang: string;
  role: Role;
  headword?: string;
  random?: boolean;
  expect: 'ok' | 'review' | 'blocked';
  category?: string;
}

const here = join(fileURLToPathSafe(import.meta.url), '..', '..', 'fixtures');
function fileURLToPathSafe(url: string): string {
  return decodeURIComponent(new URL(url).pathname);
}
const negative = JSON.parse(readFileSync(join(here, 'negative.json'), 'utf8')).cases as Case[];
const positive = JSON.parse(readFileSync(join(here, 'positive.json'), 'utf8')).cases as Case[];

function run(c: Case) {
  const facts = { headword: c.headword, random: c.random };
  const findings = evaluateSurface({ text: c.text, lang: c.lang, role: c.role }, facts);
  return { verdict: verdictOf(findings, facts), findings };
}

describe('negative fixtures — every prohibited category, every evasion', () => {
  for (const c of negative) {
    it(`${c.id}: ${c.text} → ${c.expect}`, () => {
      const { verdict, findings } = run(c);
      expect(verdict, JSON.stringify(findings)).toBe(c.expect);
      if (c.category && c.expect !== 'ok') {
        expect(findings.map((f) => f.category), JSON.stringify(findings)).toContain(c.category);
      }
    });
  }
  it('covers all seven prohibited categories plus mortality', () => {
    const categories = new Set(negative.map((c) => c.category).filter(Boolean));
    for (const cat of ['sexual', 'political', 'profanity', 'drugs', 'gambling', 'violence', 'self_harm', 'mortality']) {
      expect([...categories]).toContain(cat);
    }
  });
});

describe('positive fixtures — safe words and contexts are not overblocked', () => {
  for (const c of positive) {
    it(`${c.id}: ${c.text} → ok`, () => {
      const { verdict, findings } = run(c);
      expect(verdict, JSON.stringify(findings)).toBe('ok');
    });
  }
});
