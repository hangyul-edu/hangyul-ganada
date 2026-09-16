import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { conjugate, classify, displayConjugations, type Form } from '@hangyul-ganada/korean-morphology';
import { isBlocked } from '@hangyul-ganada/content-safety';

import { ALL_LETTERS, getCharacterByGlyph } from './characters';
import { toJamo } from './jamo';
import { withParticle } from '../i18n/josa';
import { sameMeaning } from '../features/learning/wordOptions';
// @ts-expect-error — a plain-JS module shared with the content builders; no declaration file.
import * as frameRules from '../../../../scripts/lib/level-test-rules.mjs';

const {
  isAgentSubjectFrame,
  isConsumptionObjectFrame,
  isHadaFrame,
  isOpenEvaluativeFrame,
  isUnconstrainedPredicateFrame,
} = frameRules as unknown as Record<'isAgentSubjectFrame' | 'isConsumptionObjectFrame' | 'isHadaFrame' | 'isOpenEvaluativeFrame' | 'isUnconstrainedPredicateFrame', (sentence: string) => boolean>;

/**
 * The expert gold set, run against the code.
 *
 * `content/korean-gold-set.json` was written from the standard references it
 * names, not from these functions, so a row that fails here is a disagreement
 * between the code and the standard — which is the only kind of failure worth
 * having. The `must_not` rows are the other half: a validator that accepts
 * 걷어요 or 다묘 passes nothing.
 */
const gold = JSON.parse(readFileSync(join(__dirname, '../../../../content/korean-gold-set.json'), 'utf8'));

describe('letters — names, romanisation, stroke counts', () => {
  it('every one of the 40 letters is in the gold set and agrees with it', () => {
    expect(gold.letters).toHaveLength(ALL_LETTERS.length);
    for (const row of gold.letters) {
      const letter = getCharacterByGlyph(row.character);
      expect(letter, row.character).toBeDefined();
      expect(letter!.letter_name).toBe(row.name);
      expect(letter!.romanization).toBe(row.romanization);
      expect(letter!.stroke_count).toBe(row.strokes);
    }
  });
  it('refuses the wrong names and counts', () => {
    for (const row of gold.letters_must_not) {
      const letter = getCharacterByGlyph(row.character)!;
      if (row.name) expect(letter.letter_name).not.toBe(row.name);
      if (row.strokes) expect(letter.stroke_count).not.toBe(row.strokes);
    }
  });
  it('decomposes blocks into the right jamo', () => {
    for (const row of gold.syllables) {
      const parts = toJamo(row.block);
      expect(parts[0]).toBe(row.initial);
      expect(parts[1]).toBe(row.medial);
      if (row.final) expect(parts[2]).toBe(row.final);
      else expect(parts.length).toBe(2);
    }
  });
});

describe('particles', () => {
  it('chooses the form the standard chooses, including 로 after ㄹ', () => {
    for (const row of gold.particles) expect(withParticle(row.stem, row.pair), row.stem).toBe(row.expect);
  });
  it('never produces the forbidden forms', () => {
    for (const row of gold.particles_must_not) expect(withParticle(row.stem, row.pair)).not.toBe(row.not);
  });
});

describe('conjugation', () => {
  it('produces every form the gold set lists', () => {
    for (const row of gold.conjugation) {
      if (!row.forms) continue;
      const shape = { partOfSpeech: row.pos };
      if (row.class) expect(classify(row.lemma, shape), row.lemma).toBe(row.class);
      for (const [form, value] of Object.entries(row.forms)) {
        expect(conjugate(row.lemma, form as Form, shape), `${row.lemma} ${form}`).toBe(value);
      }
    }
  });
  it('refuses the forms a learner must not be taught', () => {
    for (const row of gold.conjugation_must_not) {
      expect(conjugate(row.lemma, row.form as Form, { partOfSpeech: row.pos }), `${row.lemma} ${row.form}`).not.toBe(row.not);
    }
  });
  it('shows the honorific verb on the card where Korean has one', () => {
    for (const row of gold.honorific_display) {
      const rows = displayConjugations(row.lemma, { partOfSpeech: row.pos });
      const command = rows.find((r) => r.form === 'honorific');
      expect(command?.value, row.lemma).toBe(row.command);
      if (row.not) expect(rows.map((r) => r.value)).not.toContain(row.not);
    }
  });
});

describe('sentence frames', () => {
  const weak = (frame: string, kind: string) =>
    kind === 'predicate'
      ? isUnconstrainedPredicateFrame(frame)
      : isAgentSubjectFrame(frame) || isOpenEvaluativeFrame(frame) || isHadaFrame(frame) || isConsumptionObjectFrame(frame);
  it('flags the frames that admit any answer, and only those', () => {
    for (const row of gold.weak_frames) expect(weak(row.frame, row.kind), row.frame).toBe(row.weak);
  });
});

describe('gloss collisions', () => {
  it('treats the pairs a reader would take as one answer as one answer', () => {
    for (const row of gold.gloss_collisions) expect(sameMeaning(row.a, row.b), `${row.a} / ${row.b}`).toBe(row.collide);
  });
});

describe('the child-safe policy against evasions', () => {
  it('blocks the evasions and leaves ordinary words alone', () => {
    for (const row of gold.unsafe_evasions) {
      expect(isBlocked(row.text, row.lang, 'option', { random: true }), row.text).toBe(row.blocked);
    }
  });
});
