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

import { runtimeEvaluator, RUNTIME_POLICY_VERSION, POLICY_VERSION, verdictOf, type Role } from './index';

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
// Gloss indicators are not carried either: a dictionary or assessment gloss is
// classified when it is built, never on the device. Romanised fixtures are
// English-language rows the runtime still reads, because a romanisation is
// looked for in any Latin text. A Korean field that hides an English term
// (`lists: ["en"]`) is refused by the release scanner, which reads the English
// lists for any Latin text — the runtime carries no English lists (they would
// put the chunk past its 24 kB budget), so those cases are the publication
// gate's alone, and every Korean string the app reads has been through it.
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
