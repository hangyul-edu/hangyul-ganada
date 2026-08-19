/**
 * Arriving at a question you can hear.
 *
 * The defect this suite exists for was invisible to every check the repository
 * had: the listening exercise rendered perfectly, every clip it needed was on
 * disk and passed asset QA, and the screen was silent until the learner
 * happened to press a speaker icon they had no reason to think was the
 * question. So these tests assert on *which utterance was requested and how
 * many times*, not on whether some audio API was touched.
 *
 * The second half is the mirror image: everything that must **not** make the
 * app speak. Re-rendering, answering, opening a sheet, changing the theme,
 * changing the language, coming back from the background. Each of those was a
 * plausible way to implement autoplay badly, and each would be heard by the
 * learner as the app talking over itself.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { PronunciationContext, type PronunciationContextValue } from './PronunciationContext';
import type { PronunciationPlayer } from './PronunciationPlayer';
import { useEntryAudio } from './useEntryAudio';

/** Records what was asked for, in order. */
function harness() {
  const played: string[] = [];
  const stops: number[] = [];
  const player = {
    stop: () => stops.push(played.length),
  } as unknown as PronunciationPlayer;
  const value: PronunciationContextValue = {
    ready: true,
    available: true,
    voice: 'female',
    playing: null,
    play: vi.fn(async (id?: string) => {
      played.push(id ?? '(none)');
      return { status: 'played', voice: 'female', substituted: false } as const;
    }),
    preload: vi.fn(),
    has: () => true,
    player,
  };
  const wrap = (ui: React.ReactNode) => (
    <PronunciationContext.Provider value={value}>{ui}</PronunciationContext.Provider>
  );
  return { played, stops, value, wrap };
}

function Question({
  itemKey,
  audioId,
  enabled = true,
}: {
  itemKey: string;
  audioId: string;
  enabled?: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEntryAudio(itemKey, audioId, { enabled });
  return (
    <div>
      <p data-testid="item">{itemKey}</p>
      <p data-testid="picked">{picked ?? '—'}</p>
      <button type="button" onClick={() => setPicked('wrong')}>
        answer wrong
      </button>
      <button type="button" onClick={() => setPicked('right')}>
        answer right
      </button>
      <button type="button" onClick={() => setSheetOpen((open) => !open)}>
        toggle sheet
      </button>
      {sheetOpen && <p data-testid="sheet">sheet</p>}
    </div>
  );
}

describe('entry audio', () => {
  let kit: ReturnType<typeof harness>;
  beforeEach(() => {
    kit = harness();
  });

  it('A. plays the item’s clip once when the exercise opens', () => {
    render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    expect(kit.played).toEqual(['letter_sound_a']);
  });

  it('B. replays on demand, and the replay is the same utterance', async () => {
    const user = userEvent.setup();
    function WithReplay() {
      useEntryAudio('ㅏ', 'letter_sound_a');
      return (
        <button type="button" onClick={() => void kit.value.play('letter_sound_a')}>
          replay
        </button>
      );
    }
    render(kit.wrap(<WithReplay />));
    await user.click(screen.getByRole('button', { name: 'replay' }));
    expect(kit.played).toEqual(['letter_sound_a', 'letter_sound_a']);
  });

  it('C. plays the new clip exactly once when the learner moves on', () => {
    const view = render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    view.rerender(kit.wrap(<Question itemKey="ㅑ" audioId="letter_sound_ya" />));
    expect(kit.played).toEqual(['letter_sound_a', 'letter_sound_ya']);
  });

  it('D. does not speak again on a re-render of the same question', () => {
    const view = render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    view.rerender(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    view.rerender(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    expect(kit.played).toEqual(['letter_sound_a']);
  });

  it('E. does not replay when the answer is wrong', async () => {
    const user = userEvent.setup();
    render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    await user.click(screen.getByRole('button', { name: 'answer wrong' }));
    expect(screen.getByTestId('picked')).toHaveTextContent('wrong');
    expect(kit.played).toEqual(['letter_sound_a']);
  });

  it('F. does not replay when the answer is right', async () => {
    const user = userEvent.setup();
    render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    await user.click(screen.getByRole('button', { name: 'answer right' }));
    expect(kit.played).toEqual(['letter_sound_a']);
  });

  it('G. stops the previous clip when the learner leaves', () => {
    const view = render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    view.unmount();
    expect(kit.stops).toEqual([1]);
  });

  it('H. going back and forward plays the clip that is on screen, and no other', () => {
    const view = render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    view.rerender(kit.wrap(<Question itemKey="ㅑ" audioId="letter_sound_ya" />));
    view.rerender(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    expect(kit.played).toEqual(['letter_sound_a', 'letter_sound_ya', 'letter_sound_a']);
    // Each move stopped what was sounding before starting the next one.
    expect(kit.stops.length).toBe(2);
  });

  it('I. changing the theme does not make the app speak', () => {
    render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    act(() => {
      document.documentElement.dataset.appearance = 'dark';
    });
    expect(kit.played).toEqual(['letter_sound_a']);
  });

  it('J. coming back from the background does not replay the question', () => {
    render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(kit.played).toEqual(['letter_sound_a']);
  });

  it('opening and closing a sheet leaves the question alone', async () => {
    const user = userEvent.setup();
    render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    await user.click(screen.getByRole('button', { name: 'toggle sheet' }));
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'toggle sheet' }));
    expect(kit.played).toEqual(['letter_sound_a']);
  });

  it('stays silent where hearing the answer would be the answer', () => {
    render(kit.wrap(<Question itemKey="word_sagwa" audioId="word_sagwa" enabled={false} />));
    expect(kit.played).toEqual([]);
  });

  it('says nothing at all when the item has no recording', () => {
    function NoClip() {
      useEntryAudio('ㅏ', undefined);
      return <p>no clip</p>;
    }
    render(kit.wrap(<NoClip />));
    expect(kit.played).toEqual([]);
  });

  it('a stored autoplay=false cannot silence a listening question', () => {
    // The preference is gone from the interface and unread by the player; the
    // only thing that can suppress this clip is `enabled`, which is a property
    // of the *exercise* rather than of the profile. This is the regression
    // test for the setting that used to be able to break a screen.
    const settings = { autoplay_audio: false };
    expect(settings.autoplay_audio).toBe(false);
    render(kit.wrap(<Question itemKey="ㅏ" audioId="letter_sound_a" />));
    expect(kit.played).toEqual(['letter_sound_a']);
  });
});
