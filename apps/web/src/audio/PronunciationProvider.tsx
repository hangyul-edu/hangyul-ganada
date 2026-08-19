import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { VoiceGender } from '@hangyul-ganada/shared-types';

import { PronunciationContext, type PronunciationContextValue } from './PronunciationContext';
import { PronunciationPlayer, type PlaybackOutcome } from './PronunciationPlayer';

/**
 * Makes one player available to the whole app, bound to the learner's chosen
 * voice.
 *
 * The voice comes in as a prop rather than being read from the store here, so
 * this layer has no opinion about where preferences live and can be rendered in
 * a test with a stub player.
 */
export function PronunciationProvider({
  children,
  voice,
  player: injected,
}: {
  children: ReactNode;
  voice: VoiceGender;
  player?: PronunciationPlayer;
}) {
  const playerRef = useRef(injected ?? new PronunciationPlayer());
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  // A monotonically increasing token: only the most recent play may clear the
  // playing state, so a fast double-tap does not leave the button stuck.
  const token = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // Captured here rather than read in the cleanup: the ref is stable, but
    // reading `.current` on unmount is the pattern that silently stops the
    // wrong player once this component is ever rendered twice.
    const player = playerRef.current;
    void player.ready().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      player.stop();
    };
  }, []);

  const play = useCallback(
    async (id: string | undefined): Promise<PlaybackOutcome> => {
      const mine = ++token.current;
      setPlaying(id ?? null);
      const outcome = await playerRef.current.play(id, voice);
      if (token.current === mine) setPlaying(null);
      return outcome;
    },
    [voice],
  );

  const preload = useCallback(
    (ids: Array<string | undefined>) => {
      void playerRef.current.preload(ids, voice);
    },
    [voice],
  );

  const has = useCallback((id: string | undefined) => playerRef.current.has(id), []);

  const value = useMemo<PronunciationContextValue>(
    () => ({
      ready,
      available: ready && playerRef.current.size > 0,
      voice,
      playing,
      play,
      preload,
      has,
      player: playerRef.current,
    }),
    [ready, voice, playing, play, preload, has],
  );

  return <PronunciationContext.Provider value={value}>{children}</PronunciationContext.Provider>;
}
