import { useEffect, useRef } from 'react';

import { usePronunciation } from './PronunciationContext';

/**
 * Plays a learning item's audio once, when the learner arrives at it.
 *
 * ## Why this is not optional
 *
 * A question whose prompt is a sound — "which letter makes this sound?" — is
 * not a question until the sound has been heard. Leaving it behind a speaker
 * button makes the first second of the exercise a puzzle about the interface,
 * and a learner who does not realise the button is the prompt sits looking at
 * three letters and no question. So on every screen where hearing the Korean is
 * *how you answer*, the clip plays itself on arrival, and the button becomes
 * what it should always have been: replay.
 *
 * There is no preference for this. There was one — `autoplay_audio` — and it
 * could put a learner in front of a silent listening question, which is a
 * broken screen rather than a quieter one. The stored field survives so that no
 * profile has to be migrated; nothing reads it. See `storage/schema.ts`.
 *
 * ## Once per arrival, not once per render
 *
 * The unit of "arrival" is the `entryKey`: a string that changes when the
 * learner moves to a different item and does not change for anything else. A
 * re-render does not change it. Answering does not change it. Opening a sheet,
 * switching to dark mode, changing the interface language, coming back from the
 * background — none of them change it, and none of them may make the app speak.
 *
 * The guard is a ref rather than the effect's dependency list because an effect
 * can legitimately re-run with identical dependencies — React's strict mode
 * does it deliberately in development — and "have I already spoken for this
 * item" is a fact about the session, not about how often an effect happened to
 * fire.
 *
 * ## Leaving stops the sound
 *
 * The cleanup stops playback, so a clip cannot follow the learner onto the next
 * screen. React runs the old cleanup before the new effect, so the order across
 * a navigation is exactly: stop the old clip, mount the new item, start the new
 * clip. Combined with the player's cancellation token, that also holds when the
 * learner taps Next faster than a clip can start. See `PronunciationPlayer`.
 */
export function useEntryAudio(
  entryKey: string | null | undefined,
  audioId: string | undefined,
  options: {
    /** False for exercises where hearing the answer *is* the answer. */
    enabled?: boolean;
    /** Called when the clip actually played, for progress that counts hearing. */
    onPlayed?: () => void;
  } = {},
): void {
  const { play, player } = usePronunciation();
  const { enabled = true, onPlayed } = options;

  // Read through refs so that changing the voice, the locale or a callback
  // identity cannot be mistaken for arriving at a new item.
  const playRef = useRef(play);
  playRef.current = play;
  const onPlayedRef = useRef(onPlayed);
  onPlayedRef.current = onPlayed;

  const spokenFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !entryKey || !audioId) return;
    if (spokenFor.current === entryKey) return;
    spokenFor.current = entryKey;

    let left = false;
    void playRef.current(audioId).then((outcome) => {
      if (!left && outcome.status === 'played') onPlayedRef.current?.();
    });

    return () => {
      left = true;
      player.stop();
    };
    // `play` is deliberately absent from the dependencies and read through a
    // ref instead: it changes identity with the voice, and a learner switching
    // voice in Settings must not make the lesson behind the sheet speak.
  }, [entryKey, audioId, enabled, player]);
}
