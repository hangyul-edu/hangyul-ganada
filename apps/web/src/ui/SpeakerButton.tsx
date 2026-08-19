import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePronunciation } from '../audio/PronunciationContext';
import { SpeakerIcon, SpeakerOffIcon, SpeakerPlayingIcon } from './icons';
import styles from './SpeakerButton.module.css';

export type SpeakerSize = 'sm' | 'md' | 'lg';

/**
 * The only pronunciation control in the app.
 *
 * One component so that a speaker beside a letter, a word and an example
 * sentence behave identically — same hit target, same playing state, same
 * behaviour when the clip is missing. Three separate implementations is how an
 * app ends up with a button that looks tappable in one place and is not in
 * another.
 *
 * ### Missing audio
 *
 * Rendered disabled with a struck-through speaker and a tooltip, rather than
 * hidden. A control that vanishes for some words makes the layout jump and
 * leaves the learner wondering whether they missed something; a visibly
 * unavailable one is honest and stays put.
 */
export function SpeakerButton({
  audioId,
  label,
  size = 'md',
  tone = 'default',
  onPlayed,
}: {
  /** Manifest id of the clip. Undefined renders the unavailable state. */
  audioId: string | undefined;
  /** What is being pronounced, for the accessible name — e.g. "사과". */
  label: string;
  size?: SpeakerSize;
  tone?: 'default' | 'plain';
  /** Called after a successful playback. Used to record that the item was heard. */
  onPlayed?: () => void;
}) {
  const { t } = useTranslation('common');
  const { play, playing, has, ready } = usePronunciation();
  const [failed, setFailed] = useState(false);

  const available = has(audioId);
  const isPlaying = playing !== null && playing === audioId;

  const handleClick = useCallback(async () => {
    const outcome = await play(audioId);
    if (outcome.status === 'played') {
      setFailed(false);
      onPlayed?.();
    } else if (outcome.status === 'failed') {
      setFailed(true);
    }
  }, [audioId, play, onPlayed]);

  // Before the manifest resolves, the button is present but inert. It must not
  // shift the layout when audio becomes available a moment later.
  const disabled = !ready || !available;

  const classes = [
    styles.button,
    styles[size],
    tone === 'plain' ? styles.plain : '',
    isPlaying ? styles.playing : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={handleClick}
      disabled={disabled}
      aria-label={
        disabled
          ? t('audio.unavailable', { text: label })
          : failed
            ? t('audio.retry', { text: label })
            : t('audio.play', { text: label })
      }
      title={disabled ? t('audio.unavailable', { text: label }) : undefined}
    >
      {disabled ? (
        <SpeakerOffIcon size={iconSize(size)} />
      ) : isPlaying ? (
        <SpeakerPlayingIcon size={iconSize(size)} />
      ) : (
        <SpeakerIcon size={iconSize(size)} />
      )}
    </button>
  );
}

function iconSize(size: SpeakerSize): number {
  return size === 'lg' ? 26 : size === 'sm' ? 18 : 22;
}
