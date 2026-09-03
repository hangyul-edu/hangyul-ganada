import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '../../i18n/LocaleProvider';
import { LearnerProvider } from '../../store/LearnerProvider';
import { SessionCompleteModal } from './SessionCompleteModal';

/**
 * What a result screen is allowed to say.
 *
 * ## The reported defect
 *
 * The Review dialog, after reviewing exactly one item:
 *
 * ```
 * 복습 끝
 * 1개 연습 · 1개는 바로 떠올랐어요 · 1개는 곧 다시 나와요
 * ```
 *
 * Three counts for one card. It reads as three items; its second and third
 * clauses contradict each other for anybody who does not know the scheduler is
 * describing the same card twice; and none of the three tells the learner
 * anything they can act on. Words had the same shape with a different content —
 * *10 words learned* over a badge already reading 10/10 — and Letters named the
 * lesson whose title was on the header behind the dialog.
 *
 * ## What is asserted
 *
 * The shape, not the sentence: a title, one honest count, one action, and
 * nothing else unless a caller has a second thing to say. A subtitle is still
 * possible — the prop is optional, not removed — and the test that it renders
 * when given is what keeps this a rule about *filler* rather than a ban.
 */

function show(props: Partial<Parameters<typeof SessionCompleteModal>[0]> = {}) {
  return render(
    <LearnerProvider>
      <LocaleProvider>
        <SessionCompleteModal
          open
          onClose={() => {}}
          onContinue={() => {}}
          title="Review done"
          passed={1}
          total={1}
          {...props}
        />
      </LocaleProvider>
    </LearnerProvider>,
  );
}

describe('the completion dialog', () => {
  it('says what finished, how much of it, and offers one way on', async () => {
    show();
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Review done')).toBeInTheDocument();
    expect(within(dialog).getByText('1/1')).toBeInTheDocument();
    /*
     * One *action*, plus the dismissal every dialog carries. The X is how a
     * learner leaves without deciding anything; the rule is about the row of
     * choices at the bottom, which used to be one button and must stay one.
     */
    const actions = within(dialog)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-label') !== 'Close');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toHaveTextContent('OK');
  });

  it('draws no subtitle when the caller has nothing to add', async () => {
    show();
    const dialog = await screen.findByRole('dialog');

    /*
     * The check is structural rather than a search for the old sentence: any
     * filler put back here would pass a test that only looked for the words
     * *came straight back to you*.
     */
    expect(dialog.getAttribute('aria-describedby')).toBeNull();
    expect(dialog.querySelectorAll('p')).toHaveLength(0);
  });

  it('still draws one when there is something the title and the count do not say', async () => {
    show({ detail: 'Your streak reached 7 days.' });
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Your streak reached 7 days.')).toBeInTheDocument();
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('reports the count it was given, not a rounded or flattering one', async () => {
    // A learner who got three of ten right sees three of ten.
    show({ passed: 3, total: 10 });
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('3/10')).toBeInTheDocument();
  });
});
