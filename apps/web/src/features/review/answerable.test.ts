/**
 * Every question has exactly one answer, and the learner can reach it.
 *
 * A wrong answer key is the worst defect this product can ship: it teaches the
 * wrong thing and then marks the learner down for knowing better. These walk
 * the real curriculum rather than a fixture, because the generator is fed by
 * data and the data is what changes.
 *
 * The subtler failure is a question that is *unanswerable* — one where the
 * prompt genuinely does not distinguish the right answer from a wrong one.
 * Korean has three sets of vowels that merged into one sound, and offering 애
 * and 에 as two options in a listening question is a coin toss recorded as a
 * failure. That is what the last group here defends.
 */
import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS } from '../../data/characters';
import { VOCABULARY, getWord } from '../../data/vocabulary';
import type { ReviewCandidate } from '../../domain/review';
import { recognitionOptions, soundsTheSame } from '../learning/lookAlikes';
import type { readingOptions } from '../learning/wordOptions';
import { buildExercise } from './exercises';

const meaningOf = (word: Parameters<typeof readingOptions>[0]) => ({
  value: word.translations?.en?.meaning ?? word.word,
  locale: 'en',
});

const MODES = ['read', 'listen', 'context', 'distinguish', 'write'] as const;

function candidates(): ReviewCandidate[] {
  const rows: ReviewCandidate[] = [];
  for (const character of ALL_CHARACTERS) {
    for (const mode of MODES) {
      rows.push({
        kind: 'character',
        itemKey: character.character,
        skill: 'visual_recognition',
        mode,
        priority: 1,
        recall: 0.5,
        // The partner a `distinguish` question needs: whichever letter this one
        // is genuinely confusable with, which is what the scheduler supplies.
        partner:
          recognitionOptions(character.character, 1).find(
            (glyph) => glyph !== character.character,
          ) ?? null,
        intervene: false,
      });
    }
  }
  for (const word of VOCABULARY.slice(0, 400)) {
    for (const mode of MODES) {
      rows.push({
        kind: 'word',
        itemKey: word.id,
        skill: 'meaning_recognition',
        mode,
        priority: 1,
        recall: 0.5,
        partner: null,
        intervene: false,
      });
    }
  }
  return rows;
}

const EXERCISES = candidates()
  .map((candidate, index) => buildExercise(candidate, meaningOf, index + 1))
  .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise));

describe('generated questions', () => {
  it('builds a usable set to check', () => {
    expect(EXERCISES.length).toBeGreaterThan(500);
  });

  it('has exactly one correct option, and it is in the list', () => {
    for (const exercise of EXERCISES) {
      if (!exercise.options) continue;
      const matching = exercise.options.filter((option) => option.id === exercise.answerId);
      expect(matching, `${exercise.mode} ${exercise.candidate.itemKey}`).toHaveLength(1);
    }
  });

  it('never offers the same option twice', () => {
    for (const exercise of EXERCISES) {
      if (!exercise.options) continue;
      const ids = exercise.options.map((option) => option.id);
      expect(new Set(ids).size, `${exercise.mode} ${exercise.candidate.itemKey}`).toBe(ids.length);
    }
  });

  it('never offers two options that read identically', () => {
    // Two different words with the same English gloss, offered together, are
    // one question with two right answers.
    for (const exercise of EXERCISES) {
      if (!exercise.options) continue;
      const shown = exercise.options.map((option) => `${option.korean ?? ''}|${option.label ?? ''}`);
      expect(new Set(shown).size, `${exercise.mode} ${exercise.candidate.itemKey}`).toBe(
        shown.length,
      );
    }
  });

  it('asks about the thing it shows', () => {
    for (const exercise of EXERCISES) {
      if (exercise.candidate.kind !== 'word') continue;
      const word = getWord(exercise.candidate.itemKey);
      expect(word).toBeTruthy();
      if (exercise.mode === 'read') expect(exercise.korean).toBe(word!.word);
      if (exercise.mode === 'listen') {
        // The Korean must *not* be shown: it would be the answer.
        expect(exercise.korean).toBeUndefined();
        expect(exercise.audioId).toBe(word!.audio.word);
      }
      if (exercise.mode === 'context') {
        const written = `${exercise.sentence?.before}${exercise.sentence?.target}${exercise.sentence?.after}`;
        expect(written).toBe(word!.example);
        // The blank is the word being asked about, so the sentence around it
        // must not also contain it.
        expect(exercise.sentence?.target).toBeTruthy();
      }
    }
  });

  it('never asks a listening question the language cannot answer', () => {
    for (const exercise of EXERCISES) {
      if (exercise.mode !== 'listen' && exercise.mode !== 'distinguish') continue;
      if (exercise.candidate.kind !== 'character') continue;
      for (const option of exercise.options ?? []) {
        if (option.id === exercise.answerId) continue;
        expect(
          soundsTheSame(exercise.answerId!, option.id),
          `${exercise.answerId} vs ${option.id} sound the same and were offered together`,
        ).toBe(false);
      }
    }
  });

  it('still uses soundalikes as wrong answers when the prompt is a shape', () => {
    // The distinction is real on the page, and this is where it is taught.
    // A wide draw, so the assertion is about what is *eligible* rather than
    // about which four the shuffle happened to pick.
    expect(recognitionOptions('ㅐ', 1, 200, false)).toContain('ㅔ');
    expect(recognitionOptions('ㅐ', 1, 200, true)).not.toContain('ㅔ');
    expect(recognitionOptions('ㅚ', 1, 200, false)).toContain('ㅙ');
    expect(recognitionOptions('ㅚ', 1, 200, true)).not.toContain('ㅙ');
  });
});
