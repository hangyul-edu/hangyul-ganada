import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { PronunciationProvider } from '../../audio/PronunciationProvider';
import { VOCABULARY } from '../../data/vocabulary';
import { toSyllables } from '../../data/jamo';
import { buildExercise } from './exercises';
import { BuildExercise } from './BuildExercise';
import type { ReviewCandidate } from '../../domain/review';

/**
 * Assembling a word from its own syllables.
 *
 * The interesting properties are not "it renders". They are the three that
 * decide whether it is a *question*: the tray must not spell the answer for the
 * learner, the answer must be gradeable in the right order, and a wrong answer
 * must be reported as wrong rather than quietly retried.
 */

const meaningOf = (word: { id: string }) => ({
  value: `meaning of ${word.id}`,
  locale: 'en',
});

/**
 * The exercise inside the one context it needs.
 *
 * `SpeakerButton` reads the pronunciation context, and the answered state
 * renders one. Wrapping rather than stubbing, so the test exercises the same
 * tree the session does.
 */
function show(node: ReactElement) {
  return render(<PronunciationProvider voice="female">{node}</PronunciationProvider>);
}

/** A candidate for the first corpus word with two or three syllables. */
function twoSyllableCandidate(): { candidate: ReviewCandidate; word: (typeof VOCABULARY)[number] } {
  const word = VOCABULARY.find((entry) => {
    const count = toSyllables(entry.word).length;
    return count >= 2 && count <= 3;
  })!;
  return {
    word,
    candidate: {
      kind: 'word',
      itemKey: word.id,
      skill: 'meaning_recognition',
      mode: 'build',
      priority: 0,
      recall: 0,
      partner: null,
      intervene: false,
      need: 'due',
    },
  };
}

describe('building a word from syllables', () => {
  it('offers the word’s own syllables and some that are not', () => {
    const { candidate, word } = twoSyllableCandidate();
    const exercise = buildExercise(candidate, meaningOf, 3)!;
    expect(exercise).toBeTruthy();

    const own = toSyllables(word.word);
    const offered = exercise.tiles!.map((tile) => tile.syllable);

    for (const syllable of own) expect(offered).toContain(syllable);
    /*
     * The decoys are the question. A tray holding exactly the answer's
     * syllables is a question about ordering two tiles, which a learner can
     * finish without knowing the word — and with two syllables they would get
     * it right half the time by guessing.
     */
    expect(offered.length).toBeGreaterThan(own.length);
  });

  it('never offers a decoy that is already in the answer', () => {
    /*
     * A duplicated syllable makes the tray unreadable: the learner taps one 사,
     * the other stays lit, and the question becomes about counting rather than
     * spelling.
     */
    for (const word of VOCABULARY.slice(0, 200)) {
      const own = toSyllables(word.word);
      if (own.length < 2 || own.length > 4) continue;
      const exercise = buildExercise(
        { ...twoSyllableCandidate().candidate, itemKey: word.id },
        meaningOf,
        7,
      );
      if (!exercise?.tiles) continue;
      const offered = exercise.tiles.map((tile) => tile.syllable);
      const extras = [...offered];
      for (const syllable of own) extras.splice(extras.indexOf(syllable), 1);
      for (const decoy of extras) expect(own, `${word.word} decoy ${decoy}`).not.toContain(decoy);
    }
  });

  it('refuses a word too short or too long to assemble', () => {
    const oneSyllable = VOCABULARY.find((word) => toSyllables(word.word).length === 1);
    if (oneSyllable) {
      const exercise = buildExercise(
        { ...twoSyllableCandidate().candidate, itemKey: oneSyllable.id },
        meaningOf,
        1,
      );
      // One tile beside three decoys is `produce` with a worse interface.
      expect(exercise).toBeNull();
    }
  });

  it('grades the order, not just the letters', () => {
    const { candidate, word } = twoSyllableCandidate();
    const exercise = buildExercise(candidate, meaningOf, 3)!;
    const own = toSyllables(word.word);
    const onAnswered = vi.fn();

    show(
      <BuildExercise
        exercise={exercise}
        fontFamily="sans-serif"
        onAnswered={onAnswered}
        onContinue={() => {}}
        isLast={false}
      />,
    );

    // Tap the word's syllables in the *wrong* order.
    const reversed = [...own].reverse();
    for (const syllable of reversed) {
      fireEvent.click(screen.getAllByRole('button', { name: syllable })[0]!);
    }

    expect(onAnswered).toHaveBeenCalledTimes(1);
    const result = onAnswered.mock.calls[0]![0];
    // Only meaningful when the word is not a palindrome of syllables.
    if (reversed.join('') !== word.word) {
      expect(result.correct).toBe(false);
      expect(result.chosen).toBe(reversed.join(''));
    }
  });

  it('accepts the right order and reports it once', () => {
    const { candidate, word } = twoSyllableCandidate();
    const exercise = buildExercise(candidate, meaningOf, 3)!;
    const onAnswered = vi.fn();

    show(
      <BuildExercise
        exercise={exercise}
        fontFamily="sans-serif"
        onAnswered={onAnswered}
        onContinue={() => {}}
        isLast={false}
      />,
    );

    for (const syllable of toSyllables(word.word)) {
      fireEvent.click(screen.getAllByRole('button', { name: syllable })[0]!);
    }

    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(onAnswered.mock.calls[0]![0]).toMatchObject({ correct: true, chosen: word.word });
  });

  it('is not a canvas', () => {
    /*
     * §63: vocabulary is never handwritten. Tapping tiles is not writing, and
     * this asserts the distinction rather than trusting it — the failure mode
     * is a future refactor reaching for the practice canvas because "the
     * learner is producing the word here too".
     */
    const { candidate } = twoSyllableCandidate();
    const exercise = buildExercise(candidate, meaningOf, 3)!;
    const { container } = show(
      <BuildExercise
        exercise={exercise}
        fontFamily="sans-serif"
        onAnswered={() => {}}
        onContinue={() => {}}
        isLast={false}
      />,
    );
    expect(container.querySelector('canvas')).toBeNull();
    expect(exercise.writeTarget).toBeUndefined();
  });
});
