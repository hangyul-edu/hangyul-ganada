/**
 * The matching grid, and the one thing it can get badly wrong.
 *
 * A grid is the only exercise in the product that asks about several words in
 * one screen, and every counter in the app — the day's goal, the mastery
 * ladder, the activity row, the per-skill memory — is built on the assumption
 * that a question is about one word. The interesting assertions here are
 * therefore not about tapping; they are about what the session is *told* when
 * the tapping is done.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { MatchExercise, type MatchResult } from './MatchExercise';
import type { MatchPair } from './dailyQuestions';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../native/haptics', () => ({
  hapticPass: () => {},
  hapticRetry: () => {},
  hapticSelection: () => {},
}));

const PAIRS: MatchPair[] = [
  { wordId: 'w1', korean: '물', meaning: 'water', meaningLocale: 'en' },
  { wordId: 'w2', korean: '밥', meaning: 'rice', meaningLocale: 'en' },
  { wordId: 'w3', korean: '집', meaning: 'house', meaningLocale: 'en' },
  { wordId: 'w4', korean: '돈', meaning: 'money', meaningLocale: 'en' },
];

function grid(onAnswered = vi.fn(), onContinue = vi.fn()) {
  render(
    <MatchExercise
      pairs={PAIRS}
      fontFamily="sans-serif"
      isLast={false}
      onAnswered={onAnswered}
      onContinue={onContinue}
    />,
  );
  return { onAnswered, onContinue };
}

const tap = (text: string) => fireEvent.click(screen.getByRole('button', { name: text }));

/** Pairs `korean` with `meaning`, in the two taps a learner would use. */
const pair = (korean: string, meaning: string) => {
  tap(korean);
  tap(meaning);
};

describe('the matching grid', () => {
  it('reports one result per word, and only when the grid is finished', () => {
    const { onAnswered } = grid();

    pair('물', 'water');
    pair('밥', 'rice');
    pair('집', 'house');
    expect(onAnswered, 'reported before the last pair was made').not.toHaveBeenCalled();

    pair('돈', 'money');
    expect(onAnswered).toHaveBeenCalledTimes(1);

    const results: MatchResult[] = onAnswered.mock.calls[0]![0];
    expect(results.map((r) => r.wordId).sort()).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(results.every((r) => r.correct)).toBe(true);
  });

  it('marks both sides of a wrong attempt, and nothing else', () => {
    const { onAnswered } = grid();

    // 물 offered for "rice": neither of the two is known to be the mistake, so
    // both are marked. 집 and 돈 were not involved and must stay correct.
    pair('물', 'rice');

    pair('물', 'water');
    pair('밥', 'rice');
    pair('집', 'house');
    pair('돈', 'money');

    const results: MatchResult[] = onAnswered.mock.calls[0]![0];
    const by = Object.fromEntries(results.map((r) => [r.wordId, r.correct]));
    expect(by).toEqual({ w1: false, w2: false, w3: true, w4: true });
  });

  it('does not reveal or remove anything on a wrong attempt', () => {
    grid();
    pair('물', 'rice');
    // Every tile is still on screen and still usable — a wrong guess costs the
    // learner nothing but the attempt.
    for (const text of ['물', '밥', '집', '돈', 'water', 'rice', 'house', 'money']) {
      expect(screen.getByRole('button', { name: text })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: '물' })).not.toBeDisabled();
  });

  it('keeps a matched pair on screen, and out of play', () => {
    grid();
    pair('물', 'water');
    expect(screen.getByRole('button', { name: '물' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'water' })).toBeDisabled();
    // Still rendered: a tile that vanishes moves every row below it, and takes
    // away the record of what has already been used.
    expect(screen.getByRole('button', { name: '물' })).toBeTruthy();
  });

  it('lets a learner change their mind before choosing a meaning', () => {
    const { onAnswered } = grid();
    tap('물');
    tap('물'); // deselect
    // With nothing selected the meanings are inert, so this cannot pair.
    tap('water');
    expect(screen.getByRole('button', { name: '물' })).not.toBeDisabled();
    expect(onAnswered).not.toHaveBeenCalled();
  });

  it('reports once even if the last pair is tapped twice', () => {
    const { onAnswered } = grid();
    pair('물', 'water');
    pair('밥', 'rice');
    pair('집', 'house');
    pair('돈', 'money');
    // A double tap on a finished grid must not report a second set of results;
    // the session would credit every word twice.
    tap('돈');
    tap('money');
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('does not put a word opposite its own meaning', () => {
    grid();
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    const korean = buttons.filter((text) => PAIRS.some((p) => p.korean === text));
    const meanings = buttons.filter((text) => PAIRS.some((p) => p.meaning === text));
    // A grid laid out in the same order on both sides is a straight line, not
    // a puzzle.
    korean.forEach((text, index) => {
      const expected = PAIRS.find((p) => p.korean === text)!.meaning;
      expect(meanings[index]).not.toBe(expected);
    });
  });
});
