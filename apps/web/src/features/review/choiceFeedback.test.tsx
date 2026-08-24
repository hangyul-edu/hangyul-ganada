/**
 * What the feedback card is allowed to say when the options already said it.
 *
 * §20–21, photographed. A reading question offered four meanings, the learner
 * picked the wrong one, and the card underneath read:
 *
 *     틀렸어요
 *     정답은 "어떤 종류의"예요
 *
 * directly beneath a list in which "어떤 종류의" was already marked as the right
 * answer in blue. The same six characters twice, two centimetres apart, the
 * second occurrence presented as an explanation of the first.
 *
 * The rule these hold: **where the choices carry the verdict, the card carries
 * the verdict and nothing else.** Not a softer restatement, not the answer in
 * quotation marks — the learner is looking at it.
 *
 * Held as a render test rather than a snapshot on purpose. A snapshot would
 * pass again the moment somebody updated it, and this is exactly the change
 * somebody would make by updating a snapshot.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { PronunciationProvider } from '../../audio/PronunciationProvider';
import { createI18n } from '../../i18n/config';
import { ChoiceExercise } from './ChoiceExercise';
import type { Exercise } from './exercises';

const i18n = createI18n('ko');

/** A reading question: Korean on the card, four meanings to choose from. */
const reading = {
  candidate: { wordId: 'w1', mode: 'read', due: 0 },
  mode: 'read',
  promptKey: 'review.prompt.read',
  korean: '학교',
  answerId: 'w1',
  options: [
    { id: 'w1', label: '어떤 종류의' },
    { id: 'w2', label: '학교' },
    { id: 'w3', label: '지난주' },
    { id: 'w4', label: '조용히' },
  ],
  hints: [],
} as unknown as Exercise;

function show(exercise: Exercise) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PronunciationProvider voice="female">
        <ChoiceExercise
          exercise={exercise}
          fontFamily="inherit"
          onAnswered={() => {}}
          onContinue={() => {}}
          isLast={false}
        />
      </PronunciationProvider>
    </I18nextProvider>,
  );
}

/** Every occurrence of a string in the rendered text, however it is marked up. */
function occurrences(container: HTMLElement, text: string): number {
  const rendered = (container.textContent ?? '').split(text).length - 1;
  return rendered;
}

describe('the feedback card under a multiple-choice question', () => {
  it('N — does not print the correct answer a second time after a wrong pick', async () => {
    const user = userEvent.setup();
    const { container } = show(reading);

    // The photographed answer is on screen once, as an option.
    expect(occurrences(container, '어떤 종류의')).toBe(1);

    await user.click(screen.getByRole('button', { name: '지난주' }));

    // Verdict shown …
    expect(screen.getByRole('status')).toHaveTextContent('틀렸어요');
    // … and the right answer is still on screen exactly once: as the option.
    expect(occurrences(container, '어떤 종류의')).toBe(1);
  });

  it('O — says nothing but the verdict after a right pick either', async () => {
    const user = userEvent.setup();
    const { container } = show(reading);
    await user.click(screen.getByRole('button', { name: '어떤 종류의' }));

    const card = screen.getByRole('status');
    expect(card).toHaveTextContent('맞았어요');
    expect(occurrences(container, '어떤 종류의')).toBe(1);
    /*
     * The card holds a headline and a Continue button. Nothing else — asserted
     * as the whole string rather than as an absence, because "the answer is not
     * repeated" is a fact about what *is* there, and a `queryBy…().not` passes
     * just as happily when somebody adds a different redundant line.
     */
    expect(card.textContent?.replace(/\s+/g, ' ').trim()).toBe('맞았어요.다음');
  });
});
