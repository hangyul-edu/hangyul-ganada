/**
 * The matching grid, as a first-time learner meets it.
 *
 * A grid is the only exercise in the product that asks about several words in
 * one screen, and every counter in the app — the day's goal, the mastery
 * ladder, the activity row, the per-skill memory — is built on the assumption
 * that a question is about one word. So half of what is asserted here is what
 * the session is *told* when the grid is checked. The other half is the
 * interaction a customer could not work out: which column to tap first, what a
 * made pair looks like, how to change one, and when Check becomes available.
 * The likely first-time sequence — tap a meaning first, tap two words, pair,
 * change your mind, pair again — is walked as taps, not asserted from data.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { MatchExercise, type MatchResult } from './MatchExercise';
import type { MatchPair } from './dailyQuestions';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.word
        ? `${key}:${String(values.word)}`
        : values?.n
          ? `${key}:${String(values.n)}`
          : values?.right !== undefined
            ? `${key}:${String(values.right)}/${String(values.total)}`
            : key,
  }),
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

const button = (text: string) => screen.getByRole('button', { name: new RegExp(`^(learning:review\\.matchPairLabel:\\d+ ?)?${text}( |$)`) });
const tap = (text: string) => fireEvent.click(button(text));
const check = () => fireEvent.click(screen.getByTestId('match-check'));

/** Pairs `korean` with `meaning`, in the two taps a learner would use. */
const pair = (korean: string, meaning: string) => {
  tap(korean);
  tap(meaning);
};
const pairAll = () => {
  pair('물', 'water');
  pair('밥', 'rice');
  pair('집', 'house');
  pair('돈', 'money');
};

describe('the matching grid — what a first-time learner sees', () => {
  it('names the two columns and says the first action', () => {
    grid();
    expect(screen.getByText('learning:review.prompt.match')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'learning:review.matchColumnKorean' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'learning:review.matchColumnMeaning' })).toBeInTheDocument();
    expect(screen.getByTestId('match-status')).toHaveTextContent('learning:review.matchPickWord');
  });

  it('only the Korean column is tappable before a word is chosen', () => {
    const { onAnswered } = grid();
    for (const meaning of ['water', 'rice', 'house', 'money']) expect(button(meaning)).toBeDisabled();
    for (const word of ['물', '밥', '집', '돈']) expect(button(word)).not.toBeDisabled();
    // A tap on a meaning first does nothing — the likely first mistake.
    tap('water');
    expect(screen.getByTestId('match-status')).toHaveTextContent('learning:review.matchPickWord');
    expect(onAnswered).not.toHaveBeenCalled();
  });

  it('a chosen word is shown as chosen, the meanings become the target, and the caption names the word', () => {
    grid();
    tap('물');
    expect(button('물')).toHaveAttribute('aria-pressed', 'true');
    expect(button('물')).toHaveAttribute('data-state', 'selected');
    for (const meaning of ['water', 'rice', 'house', 'money']) {
      expect(button(meaning)).not.toBeDisabled();
      expect(button(meaning)).toHaveAttribute('data-state', 'target');
    }
    expect(screen.getByTestId('match-status')).toHaveTextContent('learning:review.matchPickMeaning:물');
  });

  it('two words cannot be a pair: tapping a second word moves the selection', () => {
    grid();
    tap('물');
    tap('밥');
    expect(button('물')).toHaveAttribute('data-state', 'available');
    expect(button('밥')).toHaveAttribute('data-state', 'selected');
    expect(screen.queryByTestId('match-check')).toBeDisabled();
  });

  it('a made pair carries the same badge on both tiles and can be taken apart from either side', () => {
    grid();
    pair('물', 'water');
    expect(button('물')).toHaveAttribute('data-state', 'paired');
    expect(button('water')).toHaveAttribute('data-state', 'paired');
    const badges = screen.getAllByLabelText('learning:review.matchPairLabel:1');
    expect(badges).toHaveLength(2);
    // Change your mind from the meaning side …
    tap('water');
    expect(button('water')).toHaveAttribute('data-state', 'target');
    expect(button('물')).toHaveAttribute('data-state', 'selected');
    tap('rice');
    expect(button('rice')).toHaveAttribute('data-state', 'paired');
    // … and from the word side.
    tap('물');
    expect(button('rice')).toHaveAttribute('data-state', 'target');
    expect(button('물')).toHaveAttribute('data-state', 'selected');
  });

  it('a meaning belongs to one word: re-pairing releases the earlier pair', () => {
    grid();
    pair('물', 'water');
    pair('밥', 'water');
    expect(button('물')).toHaveAttribute('data-state', 'available');
    expect(button('밥')).toHaveAttribute('data-state', 'paired');
  });

  it('Check is disabled until every word is paired, and reports nothing before it is pressed', () => {
    const { onAnswered } = grid();
    expect(screen.getByTestId('match-check')).toBeDisabled();
    pair('물', 'water');
    pair('밥', 'rice');
    pair('집', 'house');
    expect(screen.getByTestId('match-check')).toBeDisabled();
    pair('돈', 'money');
    expect(screen.getByTestId('match-check')).not.toBeDisabled();
    expect(screen.getByTestId('match-status')).toHaveTextContent('learning:review.matchAllPaired');
    expect(onAnswered).not.toHaveBeenCalled();
  });
});

describe('the matching grid — what the session is told', () => {
  it('reports one result per word, once, when checked', () => {
    const { onAnswered } = grid();
    pairAll();
    check();
    expect(onAnswered).toHaveBeenCalledTimes(1);
    const results: MatchResult[] = onAnswered.mock.calls[0]![0];
    expect(results.map((r) => r.wordId).sort()).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(results.every((r) => r.correct)).toBe(true);
    expect(screen.getByTestId('match-next')).toBeInTheDocument();
  });

  it('grades each word by the pair it is in at Check', () => {
    const { onAnswered } = grid();
    pair('물', 'rice');
    pair('밥', 'water');
    pair('집', 'house');
    pair('돈', 'money');
    check();
    const results: MatchResult[] = onAnswered.mock.calls[0]![0];
    const by = Object.fromEntries(results.map((r) => [r.wordId, r.correct]));
    expect(by).toEqual({ w1: false, w2: false, w3: true, w4: true });
    // The verdict is on the tiles: blue for right, red for wrong, and the
    // meaning that was right for a wrong word is outlined.
    expect(button('물')).toHaveAttribute('data-state', 'wrong');
    expect(button('집')).toHaveAttribute('data-state', 'right');
    expect(button('rice')).toHaveAttribute('data-state', 'wrong');
  });

  it('says the verdict in words after Check — every pair right is the shared Correct.', () => {
    grid();
    pairAll();
    check();
    // The live caption is not blank after Check: a screen reader hears the
    // verdict, and a sighted learner reads the same two words every other
    // question uses rather than only a colour and a tick.
    expect(screen.getByTestId('match-status')).toHaveTextContent('common:verdict.correct');
  });

  it('says how many pairs held when some were wrong', () => {
    grid();
    pair('물', 'rice');
    pair('밥', 'water');
    pair('집', 'house');
    pair('돈', 'money');
    check();
    expect(screen.getByTestId('match-status')).toHaveTextContent('learning:review.matchRight:2/4');
  });

  it('a corrected pair counts as known — the grade is the final pairing, not the history', () => {
    const { onAnswered } = grid();
    pair('물', 'rice');
    tap('물'); // take it apart
    tap('water'); // pair it right
    pair('밥', 'rice');
    pair('집', 'house');
    pair('돈', 'money');
    check();
    const results: MatchResult[] = onAnswered.mock.calls[0]![0];
    expect(results.every((r) => r.correct)).toBe(true);
  });

  it('reports once even if Check is pressed twice', () => {
    const { onAnswered } = grid();
    pairAll();
    check();
    fireEvent.click(screen.getByTestId('match-next'));
    expect(screen.queryByTestId('match-check')).toBeNull();
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('nothing is tappable after Check', () => {
    grid();
    pairAll();
    check();
    for (const text of ['물', '밥', '집', '돈', 'water', 'rice', 'house', 'money']) {
      expect(button(text)).toBeDisabled();
    }
  });

  it('does not put a word opposite its own meaning', () => {
    grid();
    const words = screen.getAllByTestId('match-word').map((b) => b.textContent);
    const meanings = screen.getAllByTestId('match-meaning').map((b) => b.textContent);
    words.forEach((text, index) => {
      const expected = PAIRS.find((p) => p.korean === text)!.meaning;
      expect(meanings[index]).not.toBe(expected);
    });
  });
});
