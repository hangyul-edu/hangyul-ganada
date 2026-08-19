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

const MODES = [
  'read',
  'produce',
  'listen',
  'listenMeaning',
  'context',
  'distinguish',
  'write',
] as const;

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
        need: 'due',
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
        need: 'due',
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

  it('never generates a handwriting question for a word', () => {
    /*
     * §5 and §35, asserted at the generator.
     *
     * Three things have to hold together for vocabulary handwriting to be gone:
     * the scheduler must not choose it (no `guided_writing` in `WORD_SKILLS`),
     * the daily session must not ask for it, and the generator must refuse it
     * even when handed a candidate that asks. This is the third — the one that
     * closes the "hidden route" §35 warns about, because a route that
     * hand-builds a candidate still cannot get a canvas out of it.
     */
    for (const exercise of EXERCISES) {
      if (exercise.candidate.kind !== 'word') continue;
      expect(exercise.mode, `${exercise.candidate.itemKey} was given a writing question`).not.toBe(
        'write',
      );
      expect(exercise.writeTarget).toBeUndefined();
    }
  });

  it('gives every question something to answer with', () => {
    // A question with two options is a coin toss recorded as knowledge. Either
    // there are enough plausible wrong answers or there is no question.
    for (const exercise of EXERCISES) {
      if (!exercise.options) continue;
      expect(
        exercise.options.length,
        `${exercise.mode} ${exercise.candidate.itemKey} has ${exercise.options.length} options`,
      ).toBeGreaterThanOrEqual(exercise.mode === 'distinguish' ? 2 : 3);
    }
  });

  it('never fills a gap with a word from the same corner of the language', () => {
    /*
     * The `저 ___ 는 의사예요 / 남자 / 여자` defect, as a permanent case.
     *
     * A gap-fill's distractors have to be words the sentence *cannot* take. Two
     * words from the same semantic category are, far too often, both true —
     * that man is a doctor and so is that woman — and the learner is marked
     * wrong for an answer the sentence supports. No hint can repair a question
     * with two right answers, which is why §40 says hints must never be what
     * makes a question solvable.
     */
    for (const exercise of EXERCISES) {
      if (exercise.mode !== 'context') continue;
      const target = getWord(exercise.candidate.itemKey)!;
      const family = new Set([target.category, ...target.category_tags]);
      for (const option of exercise.options ?? []) {
        if (option.id === exercise.answerId) continue;
        const other = getWord(option.id)!;
        expect(
          family.has(other.category),
          `${target.word} was offered against ${other.word}, both in ${other.category}`,
        ).toBe(false);
        for (const tag of other.category_tags) {
          expect(
            family.has(tag),
            `${target.word} was offered against ${other.word}, both tagged ${tag}`,
          ).toBe(false);
        }
      }
    }
  });

  it('does not put a distractor inside the sentence it is a distractor for', () => {
    // A word the sentence already contains elsewhere reads as a second gap.
    for (const exercise of EXERCISES) {
      if (exercise.mode !== 'context' || !exercise.sentence) continue;
      const sentence = `${exercise.sentence.before}${exercise.sentence.after}`;
      for (const option of exercise.options ?? []) {
        if (option.id === exercise.answerId) continue;
        const other = getWord(option.id)!;
        expect(
          sentence.includes(other.word),
          `${other.word} is already in the sentence it is a wrong answer for`,
        ).toBe(false);
      }
    }
  });

  it('asks the meaning question in both directions, and shows the right prompt', () => {
    // `read` shows the Korean and asks what it means; `produce` shows the
    // meaning and asks which word it is. Getting these the wrong way round
    // would hand the learner the answer in the prompt.
    for (const exercise of EXERCISES) {
      if (exercise.candidate.kind !== 'word') continue;
      const word = getWord(exercise.candidate.itemKey)!;
      if (exercise.mode === 'read') {
        expect(exercise.korean).toBe(word.word);
        expect(exercise.options?.every((o) => o.label !== undefined)).toBe(true);
      }
      if (exercise.mode === 'produce') {
        // The Korean must not be shown: it is what is being chosen.
        expect(exercise.korean).toBeUndefined();
        expect(exercise.meaning).toBeTruthy();
        expect(exercise.options?.every((o) => o.korean !== undefined)).toBe(true);
      }
    }
  });

  it('does not depend on the interface language to be answerable', () => {
    /*
     * Answerability is structural, and this is what lets `domain/plan.ts` use
     * `canAsk` — a locale-free predicate — to resolve a plan that a session
     * will render in whatever language the learner has chosen. If it were not
     * true, changing language mid-session could empty a plan already promised.
     */
    const inKorean = (word: Parameters<typeof readingOptions>[0]) => ({
      value: word.word,
      locale: 'ko',
    });
    for (const candidate of candidates()) {
      expect(
        buildExercise(candidate, meaningOf, 1) === null,
        `${candidate.kind} ${candidate.itemKey} ${candidate.mode}`,
      ).toBe(buildExercise(candidate, inKorean, 1) === null);
    }
  });

  it('never shows the Korean on a question whose prompt is the sound', () => {
    // §6 and the reason `listenMeaning` exists: if the word is on screen, the
    // learner is matching a shape and the clip is decoration.
    for (const exercise of EXERCISES) {
      if (exercise.mode !== 'listen' && exercise.mode !== 'listenMeaning') continue;
      expect(exercise.korean, `${exercise.candidate.itemKey}`).toBeUndefined();
      expect(exercise.audioId).toBeTruthy();
    }
  });

  it('offers no usage question at all', () => {
    /*
     * A `usage` mode was built and removed — see the note in `domain/review.ts`.
     * Generated distractors came out either accidentally correct ("차 이야기를
     * 들었어요", ordinary Korean offered as a wrong answer) or trivially wrong
     * in the particle, which turns a usage question into a spot-the-이/가 one.
     *
     * The test stays as the record of that, so a future attempt has to answer
     * for it rather than rediscover it.
     */
    for (const exercise of EXERCISES) {
      expect(exercise.mode).not.toBe('usage');
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
