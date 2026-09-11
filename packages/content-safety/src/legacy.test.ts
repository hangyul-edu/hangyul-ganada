/**
 * The gate that shipped, reproduced, and shown to pass the defect.
 *
 * Until 11 September 2026 three checks stood between the dictionary and the
 * Level Test. All three are written out below exactly as they were, and each
 * is run against the row that reached a learner — `섹스하다`, glossed "to have
 * sex". The point of keeping them is not nostalgia: a negative test that fails
 * against the old implementation and passes against the new one is the only
 * evidence that the new one is different in the way that matters.
 */
import { describe, expect, it } from 'vitest';

import { evaluateSurface, verdictOf } from './index';

/** `learner-safety.json` → `excluded.sexual`, as committed at 456d4d67. */
const OLD_EXCLUDED_SEXUAL = ['보지', '자지', '좆', '씹', '섹스', '정사', '성교', '자위', '포르노', '야동', '매춘', '창녀', '매춘부', '성기', '음경', '음부', '고환', '불알', '젖꼭지', '유두', '발기', '강간', '성폭행', '성추행', '변태', '음란'];

/** `build_level_test.py` → `_UNSUITABLE`, the sexual rows, as committed at 456d4d67. */
const OLD_UNSUITABLE = ['강간', '성폭', '성추행', '추행', '겁탈', '윤간', '성희롱', '매춘', '매음', '창녀', '포르노', '음란', '외설', '성교', '정사', '자위', '애무', '정액', '음경', '음부', '성기', '항문', '변태', '색정', '호색', '매독', '임질'];

/** `build_level_test.py` → `unsuitable()`, the English gloss terms, as committed at 456d4d67. */
const OLD_GLOSS_TERMS = ['rape', 'sexual', 'genital', 'obscene', 'prostitut', 'porn', 'masturbat', 'slur', 'vulgar', 'profan', 'derogatory', 'offensive', 'swear word', 'excrement', 'faeces', 'feces', 'urine', 'narcotic', 'heroin', 'cocaine', 'execute by', 'behead', 'massacre', 'torture', 'suicide', 'corpse'];

/** The three old checks, verbatim in behaviour. */
function oldGateRefuses(headword: string, gloss: string): boolean {
  if (OLD_EXCLUDED_SEXUAL.includes(headword)) return true; // whole-headword equality
  if (OLD_UNSUITABLE.some((term) => headword.includes(term))) return true; // substring on the headword
  const lowered = gloss.toLowerCase();
  return OLD_GLOSS_TERMS.some((term) => lowered.includes(term)); // substring on the gloss
}

const THE_ROW = { headword: '섹스하다', gloss: 'to have sex' };

describe('the gate that shipped versionCode 23', () => {
  it('let 섹스하다 through all three of its checks', () => {
    expect(oldGateRefuses(THE_ROW.headword, THE_ROW.gloss)).toBe(false);
    // Each check individually, so the report can say which list had which hole.
    expect(OLD_EXCLUDED_SEXUAL.includes('섹스')).toBe(true); // the term was there…
    expect(OLD_EXCLUDED_SEXUAL.includes('섹스하다')).toBe(false); // …and the headword was not it
    expect(OLD_UNSUITABLE.some((t) => '섹스하다'.includes(t))).toBe(false); // 섹스 was never on the substring list
    expect(OLD_GLOSS_TERMS.some((t) => 'to have sex'.includes(t))).toBe(false); // "sexual" is not in "to have sex"
  });

  it('would also have let the particle-attached, conjugated and spaced forms through', () => {
    for (const text of ['섹스를', '섹스했어요', '섹 스', '섹스하는']) {
      expect(OLD_EXCLUDED_SEXUAL.includes(text), text).toBe(false);
    }
  });
});

describe('the policy that replaced it', () => {
  it('refuses the row on the headword alone, on the gloss alone, and on every variant', () => {
    const random = { random: true };
    for (const [text, lang, role] of [
      ['섹스하다', 'ko', 'headword'],
      ['섹스하다', 'ko', 'option'],
      ['to have sex', 'en', 'gloss'],
      ['to have sex', 'en', 'option'],
      ['섹스를', 'ko', 'sentence'],
      ['섹스했어요', 'ko', 'sentence'],
      ['섹 스', 'ko', 'sentence'],
      ['섹스하는', 'ko', 'sentence'],
    ] as const) {
      const findings = evaluateSurface({ text, lang, role }, random);
      expect(verdictOf(findings, random), `${text} (${lang}, ${role})`).toBe('blocked');
      expect(findings.map((f) => f.category)).toContain('sexual');
    }
  });
});
