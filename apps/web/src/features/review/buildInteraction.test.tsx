/**
 * The word-ordering screen, as a first-time learner meets it.
 *
 * A customer saw a definition, three dashed boxes and five tiles and did not
 * know what to do. This walks the interaction in taps and keystrokes: the
 * instruction says the action; the next slot is marked before the first tap;
 * a tapped tile visibly moves into that slot and leaves the tray; a placed
 * tile can be taken back from the slot or with Undo — including the last one,
 * which the old auto-grading made irreversible; Check is disabled until every
 * slot is filled; a repeated syllable and a distractor both behave; and a
 * screen reader hears the instruction, each slot, each tile and the count.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { PronunciationProvider } from '../../audio/PronunciationProvider';
import { createI18n } from '../../i18n/config';
import { BuildExercise } from './BuildExercise';
import type { Exercise } from './exercises';

const i18n = createI18n('ko');

function exercise(korean: string, tiles: string[]): Exercise {
  return {
    candidate: { kind: 'word', itemKey: `w-${korean}`, mode: 'build', skill: 'meaning_recognition', due: 0 },
    mode: 'build',
    promptKey: 'review.prompt.build',
    korean,
    meaning: '여성인 사람',
    meaningLocale: 'ko',
    answerId: `w-${korean}`,
    tiles: tiles.map((syllable, index) => ({ id: `${index}:${syllable}`, syllable })),
    hints: [],
  } as unknown as Exercise;
}

function show(ex: Exercise) {
  const onAnswered = vi.fn();
  const onContinue = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <PronunciationProvider voice="female">
        <BuildExercise exercise={ex} fontFamily="inherit" onAnswered={onAnswered} onContinue={onContinue} isLast={false} />
      </PronunciationProvider>
    </I18nextProvider>,
  );
  return { onAnswered, onContinue };
}

const tiles = () => screen.getAllByTestId('build-tile');
const tile = (syllable: string) => tiles().find((b) => b.textContent === syllable && b.getAttribute('data-state') === 'available')!;
const slots = () => screen.getAllByTestId('build-slot');
const check = () => screen.getByTestId('build-check');
const undo = () => screen.getByTestId('build-undo');

describe('the word-ordering screen', () => {
  it('says the action, marks the first slot, and disables Check', () => {
    show(exercise('여자', ['자', '여', '사']));
    expect(screen.getByText('아래 음절을 순서대로 눌러 단어를 완성하세요.')).toBeInTheDocument();
    expect(slots()).toHaveLength(2);
    expect(slots()[0]).toHaveAttribute('data-state', 'next');
    expect(slots()[1]).toHaveAttribute('data-state', 'empty');
    expect(check()).toBeDisabled();
    expect(undo()).toBeDisabled();
    // Screen reader: the tray is named, each slot is named with its number.
    expect(screen.getByRole('group', { name: '빈칸 2개' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1번째 칸, 비어 있음' })).toBeInTheDocument();
    expect(screen.getByTestId('build-live')).toHaveTextContent('2칸 중 0칸을 채웠어요.');
  });

  it('a tapped tile moves into the next slot and leaves the tray; the next slot advances', async () => {
    const user = userEvent.setup();
    show(exercise('여자', ['자', '여', '사']));
    await user.click(tile('여'));
    expect(slots()[0]).toHaveAttribute('data-state', 'filled');
    expect(slots()[0]).toHaveTextContent('여');
    expect(slots()[1]).toHaveAttribute('data-state', 'next');
    const placed = tiles().find((b) => b.textContent === '여')!;
    expect(placed).toHaveAttribute('data-state', 'placed');
    expect(placed).toBeDisabled();
    expect(placed).toHaveAccessibleName('여, 칸에 넣었어요');
    expect(screen.getByTestId('build-live')).toHaveTextContent('2칸 중 1칸을 채웠어요.');
    expect(check()).toBeDisabled();
    expect(undo()).not.toBeDisabled();
  });

  it('the right order, checked: one correct outcome', async () => {
    const user = userEvent.setup();
    const { onAnswered } = show(exercise('여자', ['자', '여', '사']));
    await user.click(tile('여'));
    await user.click(tile('자'));
    expect(screen.getByTestId('build-live')).toHaveTextContent('모두 채웠어요. 확인을 누르세요.');
    expect(check()).not.toBeDisabled();
    expect(onAnswered).not.toHaveBeenCalled();
    await user.click(check());
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(onAnswered.mock.calls[0]![0]).toMatchObject({ correct: true, chosen: '여자' });
    expect(screen.getByRole('status')).toHaveTextContent('맞았어요');
  });

  it('the wrong order, checked: one wrong outcome and the answer shown', async () => {
    const user = userEvent.setup();
    const { onAnswered } = show(exercise('여자', ['자', '여', '사']));
    await user.click(tile('자'));
    await user.click(tile('여'));
    await user.click(check());
    expect(onAnswered.mock.calls[0]![0]).toMatchObject({ correct: false, chosen: '자여' });
    expect(screen.getByRole('status')).toHaveTextContent('틀렸어요');
    expect(screen.getByRole('status')).toHaveTextContent('여자');
  });

  it('undo takes the last tile back — including the last one, before Check', async () => {
    const user = userEvent.setup();
    const { onAnswered } = show(exercise('여자', ['자', '여', '사']));
    await user.click(tile('자'));
    await user.click(tile('여'));
    expect(check()).not.toBeDisabled();
    await user.click(undo());
    expect(slots()[1]).toHaveAttribute('data-state', 'next');
    expect(check()).toBeDisabled();
    expect(tiles().find((b) => b.textContent === '여')).toHaveAttribute('data-state', 'available');
    // Tapping a filled slot takes that tile back too.
    await user.click(screen.getByRole('button', { name: '1번째 칸: 자. 빼려면 누르세요.' }));
    expect(slots()[0]).toHaveAttribute('data-state', 'next');
    expect(undo()).toBeDisabled();
    // Now the right way round.
    await user.click(tile('여'));
    await user.click(tile('자'));
    await user.click(check());
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(onAnswered.mock.calls[0]![0]).toMatchObject({ correct: true });
  });

  it('a repeated syllable works: each tile is its own, and either fills a slot', async () => {
    const user = userEvent.setup();
    const { onAnswered } = show(exercise('생생하다', ['하', '생', '다', '생', '기']));
    await user.click(tile('생'));
    await user.click(tile('생'));
    await user.click(tile('하'));
    await user.click(tile('다'));
    await user.click(check());
    expect(onAnswered.mock.calls[0]![0]).toMatchObject({ correct: true, chosen: '생생하다' });
  });

  it('a distractor tile can be placed, taken back, and never blocks the word', async () => {
    const user = userEvent.setup();
    const { onAnswered } = show(exercise('여자', ['자', '여', '사', '람', '구']));
    await user.click(tile('사'));
    await user.click(tile('람'));
    expect(check()).not.toBeDisabled();
    // Two distractors fill the word's length; Check is honest about it.
    await user.click(undo());
    await user.click(undo());
    await user.click(tile('여'));
    await user.click(tile('자'));
    await user.click(check());
    expect(onAnswered.mock.calls[0]![0]).toMatchObject({ correct: true });
  });

  it('works from the keyboard: Tab to a tile, Enter to place it, Enter on Check', async () => {
    const user = userEvent.setup();
    const { onAnswered } = show(exercise('여자', ['여', '자']));
    // Slots are not focusable while empty; the first focusable control is the first tile.
    await user.tab();
    expect(document.activeElement).toBe(tiles()[0]);
    await user.keyboard('{Enter}');
    expect(slots()[0]).toHaveTextContent('여');
    // The placed tile is disabled, so focus fell back to the document; the
    // first Tab lands on the filled slot (take-back), the second on the next tile.
    await user.tab();
    expect(document.activeElement).toBe(slots()[0]);
    await user.tab();
    expect(document.activeElement).toBe(tiles()[1]);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('build-live')).toHaveTextContent('모두 채웠어요');
    check().focus();
    await user.keyboard('{Enter}');
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('does not reveal the answer through the layout: tiles keep their given order', () => {
    show(exercise('여자', ['자', '여', '사']));
    expect(tiles().map((b) => b.textContent)).toEqual(['자', '여', '사']);
  });
});
