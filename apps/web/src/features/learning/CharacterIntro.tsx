import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { HangulCharacter } from '@hangyul-ganada/shared-types';

import { usePronunciation } from '../../audio/PronunciationContext';
import { useEntryAudio } from '../../audio/useEntryAudio';
import { useLocale } from '../../i18n';
import { LocalizedText } from '../../ui/LocalizedText';
import { SpeakerButton } from '../../ui/SpeakerButton';
import { StrokeOrder } from '../../ui/StrokeOrder';
import { letterCopy } from '../../data/letterCopy';
import styles from './CharacterIntro.module.css';

/**
 * Meeting a letter, before writing it.
 *
 * Four things, in the order a beginner needs them:
 *
 * ```
 * 1  how is it written?     the demonstration, playing by itself on arrival
 * 2  what is it called?     Name         기역  🔊
 * 3  what does it sound like?
 *                           Hear ㄱ in    가   🔊
 * 4  …and one line about that sound
 *                           the CTA lives in the session's safe footer
 * ```
 *
 * ## Why the demonstration is the first thing and the only glyph
 *
 * There used to be two ㄱ on this screen: a still one at 148 px in a card at the
 * top, and the animated one at 208 px under two sound rows, a hint and a
 * heading. On a 390 × 844 phone the second began around y = 450, so the single
 * thing a learner opens a letter lesson to find out — *how do I write this* —
 * was the one thing below the fold, behind a **Watch it written** heading and a
 * still picture answering a question the animation answers better.
 *
 * So the still is gone and the demonstration took its place. It is the same
 * geometry either way: `ReferenceGlyph` and `StrokeOrder` are both built from
 * the stroke asset, so nothing about the shape changed by dropping one of them.
 * What changed is that the letter is now *being written* the moment the screen
 * opens.
 *
 * ## Name and sound are different things, and the labels say so
 *
 * ㄱ is *named* 기역 and *sounds like* the g in 가, and a learner who never
 * hears the second one sounds out 가 as "giyeok-a". The two rows have always
 * been here; what was wrong was the label. "Its sound — 가" invites exactly one
 * reading from a complete beginner: that ㄱ *is* 가. So a consonant's row says
 * **Hear ㄱ in**, which is what the syllable is for, and the row is a
 * demonstration rather than a definition.
 *
 * A vowel keeps the plain "Sound", because for a vowel it is the truth: ㅏ is
 * called 아 and says 아, so there is one row and it needs no hedging. Forcing
 * one sentence onto both would make one of them wrong, and it is the harder one
 * that would break.
 *
 * ## The demonstration plays; the sound plays once
 *
 * Both are automatic and both are once. `StrokeOrder` starts on mount and rests
 * on the finished character, with a quiet **Watch again** under it for anyone
 * who wants it a second time. The clip is `audio/useEntryAudio.ts`, which plays
 * once per *arrival at this letter*, so a re-render — a locale change, a
 * screen-reader focus move, coming back from the background — cannot make it
 * speak twice, and leaving stops it rather than letting it follow the learner.
 */
export function CharacterIntro({
  character,
  onHeard,
  onDemoWatched,
}: {
  character: HangulCharacter;
  onHeard: () => void;
  /** The demonstration ran all the way through. */
  onDemoWatched: () => void;
}) {
  const { t } = useTranslation(['learning', 'common']);
  const { locale } = useLocale();
  const { preload, has } = usePronunciation();
  const copy = letterCopy(character, locale);

  const soundId = character.audio.sound;
  const nameId = character.audio.name;
  const isSyllable = character.letter_name === null;
  // A vowel's name *is* its sound — ㅏ is called 아 and says 아 — so showing
  // both rows would be the same word twice under two labels. Consonants are the
  // case that needs both, and they are the case where a learner goes wrong.
  const nameDiffersFromSound = character.letter_name !== character.sound_example;
  const showsName = !isSyllable && nameDiffersFromSound && has(nameId);

  useEffect(() => {
    preload([soundId, nameId]);
  }, [preload, soundId, nameId]);

  /*
   * The letter says itself, once, on arrival.
   *
   * Hearing it is part of meeting it, and a learner who has to find a button to
   * find that out often never does. `useEntryAudio` owns the once-per-arrival
   * rule and the "stop it when they leave" rule; this screen only says which
   * clip and when the arrival is.
   */
  useEntryAudio(character.character, soundId, { onPlayed: onHeard });

  return (
    <div className={styles.intro}>
      {/*
        The letter, being written, and nothing above it.

        This card used to be two: a static glyph at 148 px, and — after the two
        sound rows, the hint and a heading — the demonstration at 208 px. The
        same ㄱ twice, the second one four hundred pixels down a phone screen,
        so the one thing a learner opened the lesson to see was the one thing
        they had to scroll to find. Watching it written answers *what does this
        look like* better than a still of it does, so the still is gone and the
        demonstration moved up into its place.

        It plays by itself, once, on arrival — `StrokeOrder` owns that — and
        settles on the finished character, which is the frame the learner copies
        from. Replaying is a small button under it, not the way in.
      */}
      <div className={styles.demoCard}>
        <StrokeOrder character={character.character} size={200} onWatched={onDemoWatched} />
      </div>

      <div className={styles.sounds}>
        {showsName && (
          <SoundRow
            label={t('learning:intro.letterName')}
            value={character.letter_name!}
            audioId={nameId}
            onPlayed={onHeard}
          />
        )}
        <SoundRow
          label={
            isSyllable
              ? t('learning:intro.reads')
              : showsName
                ? // A consonant. The syllable is an example of the sound, not a
                  // definition of the letter, and the label has to say which.
                  t('learning:intro.soundIn', { character: character.character })
                : t('learning:intro.letterSound')
          }
          value={character.sound_example ?? character.character}
          audioId={soundId}
          onPlayed={onHeard}
          emphasis
        />
      </div>

      {/*
        One line, and it is about the sound.

        Two others used to sit under here: a caption spelling out, in words, the
        stroke movement the animation had just performed, and the mascot's
        mnemonic. Each was defensible on its own, and together they turned
        meeting a letter into a page of reading — for a beginner whose whole
        problem is that Hangul looks like nothing they have seen, and who needs
        to watch it move, hear it, and then write it. What is left is the one
        thing the picture and the sound cannot say: how the letter behaves inside
        a word.
      */}
      <LocalizedText as="p" locale={copy.locale} className={styles.hint}>
        {copy.value.pronunciation_hint}
      </LocalizedText>
    </div>
  );
}

function SoundRow({
  label,
  value,
  audioId,
  onPlayed,
  emphasis = false,
}: {
  label: string;
  value: string;
  audioId: string | undefined;
  onPlayed: () => void;
  emphasis?: boolean;
}) {
  return (
    <div className={`${styles.soundRow} ${emphasis ? styles.soundRowEmphasis : ''}`}>
      <span className={styles.soundLabel}>{label}</span>
      {/* The Korean never mirrors, whatever the interface language does. */}
      <span className={styles.soundValue} lang="ko" dir="ltr">
        {value}
      </span>
      <SpeakerButton audioId={audioId} label={value} size="md" onPlayed={onPlayed} />
    </div>
  );
}
