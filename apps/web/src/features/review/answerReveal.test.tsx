/**
 * The answer-reveal state machine, as a learner meets it.
 *
 *     UNANSWERED → HINT_VIEWED → ANSWER_REVEALED → (next; owed again later)
 *
 * ## The defect
 *
 * Today's Words, a question, *Show hint*, then *Show answer*: the screen
 * printed 정답은 어떤 일이나 행동을 이루다예요 under four still-live options,
 * the learner tapped the option they had just been told, and the tap was
 * written down as a pass at hint level 3 — a completion, a mastery step, a
 * point on the day's counter. The sentence restated an option that was about
 * to be highlighted anyway, and "tapped what I was told" became "recalled".
 *
 * ## What is held here
 *
 * On the reveal: no 정답은 sentence; the correct option takes the same blue
 * box a right choice takes and is marked; every option is disabled; exactly
 * one outcome is reported, `correct: false, revealed: true`; a Next button is
 * offered; and nothing a learner can do afterwards — tap again, tap an
 * option, tap Show answer twice — reports a second outcome. The ordinary
 * paths (hint then right, wrong pick) are unchanged, and the build screen
 * reveals the same way.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { PronunciationProvider } from '../../audio/PronunciationProvider';
import { createI18n } from '../../i18n/config';
import { BuildExercise } from './BuildExercise';
import { ChoiceExercise } from './ChoiceExercise';
import type { Exercise } from './exercises';

const i18n = createI18n('ko');

/** A reading question with a two-rung ladder: one hint, then the answer. */
const reading = {
  candidate: { kind: 'word', itemKey: 'w1', mode: 'read', skill: 'meaning_recognition', due: 0 },
  mode: 'read',
  promptKey: 'review.prompt.read',
  korean: '하다',
  answerId: 'w1',
  options: [
    { id: 'w1', label: '어떤 일이나 행동을 이루다' },
    { id: 'w2', label: '학교' },
    { id: 'w3', label: '지난주' },
    { id: 'w4', label: '조용히' },
  ],
  hints: [
    { strength: 'light', key: 'review.hint.inSentence', values: { sentence: '숙제를 ____.' } },
    { strength: 'answer', key: 'review.hint.reveal' },
  ],
} as unknown as Exercise;

/** The same question with only the answer rung — reveal without a hint. */
const answerOnly = { ...reading, hints: [reading.hints![1]] } as unknown as Exercise;

/** A build question: the meaning, and the syllables of 학교 plus a distractor. */
const build = {
  candidate: { kind: 'word', itemKey: 'w2', mode: 'build', skill: 'meaning_recognition', due: 0 },
  mode: 'build',
  promptKey: 'review.prompt.build',
  korean: '학교',
  meaning: '학생이 공부하는 곳',
  meaningLocale: 'ko',
  answerId: 'w2',
  tiles: [
    { id: 't1', syllable: '교' },
    { id: 't2', syllable: '학' },
    { id: 't3', syllable: '사' },
  ],
  hints: [{ strength: 'answer', key: 'review.hint.revealWord' }],
} as unknown as Exercise;

function showChoice(exercise: Exercise) {
  const onAnswered = vi.fn();
  const onContinue = vi.fn();
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <PronunciationProvider voice="female">
        <ChoiceExercise
          exercise={exercise}
          fontFamily="inherit"
          onAnswered={onAnswered}
          onContinue={onContinue}
          isLast={false}
        />
      </PronunciationProvider>
    </I18nextProvider>,
  );
  return { ...utils, onAnswered, onContinue };
}

const answerButton = () => screen.getByRole('button', { name: /어떤 일이나 행동을 이루다/ });

describe('Today’s Words — the answer-reveal path', () => {
  it('hint, then a correct answer: an ordinary pass at hint level 1', async () => {
    const user = userEvent.setup();
    const { onAnswered } = showChoice(reading);
    await user.click(screen.getByTestId('show-hint'));
    expect(screen.getByText(/숙제를/)).toBeInTheDocument();
    await user.click(answerButton());
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(onAnswered).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true, chosen: 'w1', hintLevel: 1 }),
    );
    expect(onAnswered.mock.calls[0]![0].revealed).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent('맞았어요');
  });

  it('hint, then Show answer: the answer is highlighted in the blue box, no 정답은 sentence, nothing counted', async () => {
    const user = userEvent.setup();
    const { container, onAnswered } = showChoice(reading);
    await user.click(screen.getByTestId('show-hint'));
    await user.click(screen.getByTestId('show-answer'));

    // No written restatement of the answer anywhere on the screen.
    expect(container.textContent).not.toMatch(/정답은/);
    // The answer appears exactly once — as the option — and it is marked.
    expect((container.textContent ?? '').split('어떤 일이나 행동을 이루다').length - 1).toBe(1);
    const answer = answerButton();
    expect(answer).toHaveAttribute('data-answer', 'true');
    expect(answer.className).toMatch(/right/);
    expect(answer).toHaveTextContent('정답');
    // Every option is finished with.
    for (const button of screen.getAllByRole('button', { name: /어떤|학교|지난주|조용히/ })) {
      expect(button).toBeDisabled();
    }
    // Reported once, as a reveal and not as an answer of either kind.
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(onAnswered).toHaveBeenCalledWith(
      expect.objectContaining({ correct: false, chosen: '', hintLevel: 2, revealed: true }),
    );
    // A clear way forward, and the card says what happened.
    expect(screen.getByTestId('revealed-next')).toHaveTextContent('다음');
    expect(screen.getByRole('status')).toHaveTextContent('정답을 확인했어요');
    expect(screen.getByRole('status')).toHaveAttribute('data-feedback', 'revealed');
  });

  it('Show answer without a hint first, where the ladder allows it', async () => {
    const user = userEvent.setup();
    const { onAnswered } = showChoice(answerOnly);
    await user.click(screen.getByTestId('show-answer'));
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(onAnswered).toHaveBeenCalledWith(
      expect.objectContaining({ correct: false, revealed: true, hintLevel: 1 }),
    );
    expect(answerButton()).toHaveAttribute('data-answer', 'true');
  });

  it('cannot report twice: a double tap, a tap on an option, Next twice', async () => {
    const user = userEvent.setup();
    const { onAnswered, onContinue } = showChoice(reading);
    await user.click(screen.getByTestId('show-hint'));
    const show = screen.getByTestId('show-answer');
    await user.dblClick(show);
    // The button is gone once the question is settled; a second tap has nothing to land on.
    expect(screen.queryByTestId('show-answer')).toBeNull();
    await user.click(answerButton());
    await user.click(screen.getByRole('button', { name: '학교' }));
    expect(onAnswered).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('revealed-next'));
    await user.click(screen.getByTestId('revealed-next'));
    // Continue is the page's to debounce (see `advancedFrom` in WordSessionPage);
    // what this component guarantees is that no second *outcome* was reported.
    expect(onContinue).toHaveBeenCalled();
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('a wrong pick is still a wrong pick, with the answer shown and nothing revealed', async () => {
    const user = userEvent.setup();
    const { onAnswered } = showChoice(reading);
    await user.click(screen.getByRole('button', { name: '지난주' }));
    expect(onAnswered).toHaveBeenCalledWith(
      expect.objectContaining({ correct: false, chosen: 'w3', hintLevel: 0 }),
    );
    expect(onAnswered.mock.calls[0]![0].revealed).toBeUndefined();
    expect(answerButton().className).toMatch(/right/);
    expect(screen.getByRole('status')).toHaveTextContent('틀렸어요');
    expect(screen.queryByTestId('revealed-next')).toBeNull();
  });

  it('the build screen reveals the same way: the word in the slots, the tray locked, one outcome', async () => {
    const user = userEvent.setup();
    const onAnswered = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <PronunciationProvider voice="female">
          <BuildExercise
            exercise={build}
            fontFamily="inherit"
            onAnswered={onAnswered}
            onContinue={() => {}}
            isLast={false}
          />
        </PronunciationProvider>
      </I18nextProvider>,
    );
    await user.click(screen.getByTestId('show-answer'));
    const slots = screen.getByTestId('build-slots');
    expect(slots).toHaveAttribute('data-revealed', 'true');
    expect(slots.className).toMatch(/right/);
    expect(slots.textContent).toBe('학교');
    for (const tile of screen.getAllByRole('button', { name: /^[학교사]$/ })) expect(tile).toBeDisabled();
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(onAnswered).toHaveBeenCalledWith(
      expect.objectContaining({ correct: false, revealed: true, hintLevel: 1 }),
    );
    // A tile tap after the reveal changes nothing.
    await user.click(screen.getByRole('button', { name: '사' }));
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('revealed-next')).toBeInTheDocument();
  });
});
