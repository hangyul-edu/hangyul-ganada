import { createContext, useContext } from 'react';
import type { VoiceGender } from '@hangyul-ganada/shared-types';

import type { PlaybackOutcome, PronunciationPlayer } from './PronunciationPlayer';

export interface PronunciationContextValue {
  /** True once the manifest has been read — successfully or not. */
  ready: boolean;
  /** False when no audio shipped or the manifest failed to load. */
  available: boolean;
  voice: VoiceGender;
  /** The id currently sounding, so a button can show its own playing state. */
  playing: string | null;
  play: (id: string | undefined) => Promise<PlaybackOutcome>;
  preload: (ids: Array<string | undefined>) => void;
  has: (id: string | undefined) => boolean;
  player: PronunciationPlayer;
}

/**
 * Split from the provider component so the module exports one thing each. A
 * file exporting both a component and a hook opts out of React Fast Refresh,
 * and a full reload mid-lesson throws away what the learner had drawn.
 */
export const PronunciationContext = createContext<PronunciationContextValue | null>(null);

export function usePronunciation(): PronunciationContextValue {
  const context = useContext(PronunciationContext);
  if (!context) throw new Error('usePronunciation must be used inside <PronunciationProvider>');
  return context;
}
