import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { HangulCharacter } from '@hangyul-ganada/shared-types';

import { usePronunciation } from '../../audio/PronunciationContext';
import { useEntryAudio } from '../../audio/useEntryAudio';
import { strokeGuideFor, strokeGuideText } from '../../data/strokeGuide';
import { resolveContent, useLocale } from '../../i18n';
import { HangyulMascot } from '../../ui/HangyulMascot';
import { LocalizedText } from '../../ui/LocalizedText';
import { SpeakerButton } from '../../ui/SpeakerButton';
import { StrokeOrder } from '../../ui/StrokeOrder';
import styles from './CharacterIntro.module.css';

/**
 * Meeting a letter, before writing it.
 *
 * The screen answers five questions and stops:
 *
 * ```
 * 1  what is this?          the glyph, as large as the card allows
 * 2  what is it called?     Name        기역  🔊
 * 3  what does it sound like?
 *                           Hear ㄱ in   가   🔊   + one short hint
 * 4  how do I write it?     the demonstration, Watch again · 1 stroke,
 *                           and one instruction about *this* character
 * 5  what do I do now?      Trace it — in the session's safe footer
 * ```
 *
 * Anything that does not answer one of those is either secondary (the mascot's
 * pronunciation tip, which the lesson still makes complete sense without) or
 * gone.
 *
 * ## Name and sound are different things, and the labels now say so
 *
 * ㄱ is *named* 기역 and *sounds like* the g in 가, and a learner who never
 * hears the second one sounds out 가 as "giyeok-a". The two rows have always
 * been here; what was wrong was the label. "Its sound — 가" invites exactly one
 * reading from a complete beginner: that ㄱ *is* 가. So a consonant's row now
 * says **Hear ㄱ in**, which is what the syllable is for, and the row is a
 * demonstration rather than a definition.
 *
 * A vowel keeps the plain "Sound", because for a vowel it is the truth: ㅏ is
 * called 아 and says 아, so there is one row and it needs no hedging. Forcing
 * one sentence onto both would make one of them wrong, and it is the harder one
 * that would break.
 *
 * ## One romanisation, in a sentence
 *
 * The glyph card used to carry a bare `g / k` under the ㄱ, and the hint under
 * it said "between g and k" — the same idea twice, one of them at a visual
 * weight that invited a beginner to learn the Latin instead of the Hangul. The
 * bare label is gone. What remains is one short human sentence, and the
 * romanisation still appears where it is genuinely scaffolding: quietly, beside
 * the prompt on the writing steps.
 *
 * ## The demonstration plays; the sound plays once
 *
 * Hearing the letter is part of meeting it and a learner who has to press a
 * button to find that out often never does. See `audio/useEntryAudio.ts`: it
 * plays once per *arrival at this letter*, so a re-render — a locale change, a
 * screen-reader focus move, coming back from the background — cannot make it
 * speak twice, and leaving stops it rather than letting it follow the learner.
 */
export function CharacterIntro({
  character,
  fontFamily,
  onHeard,
  onDemoWatched,
}: {
  character: HangulCharacter;
  fontFamily: string;
  onHeard: () => void;
  /** The demonstration ran all the way through. */
  onDemoWatched: () => void;
}) {
  const { t } = useTranslation(['learning', 'common']);
  const { t: tw } = useTranslation('handwriting');
  const { locale } = useLocale();
  const { preload, has } = usePronunciation();
  const copy = resolveContent(character.translations, locale);

  const soundId = character.audio.sound;
  const nameId = character.audio.name;
  const isSyllable = character.letter_name === null;
  // A vowel's name *is* its sound — ㅏ is called 아 and says 아 — so showing
  // both rows would be the same word twice under two labels. Consonants are the
  // case that needs both, and they are the case where a learner goes wrong.
  const nameDiffersFromSound = character.letter_name !== character.sound_example;
  const showsName = !isSyllable && nameDiffersFromSound && has(nameId);

  const guide = strokeGuideFor(character);
  const instruction = strokeGuideText(
    guide,
    (key, params) => tw(key, params ?? {}) as string,
    character.stroke_count,
  );

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
      <div className={styles.glyphCard}>
        <span className={styles.glyph} style={{ fontFamily }} lang="ko">
          {character.character}
        </span>
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

      <LocalizedText as="p" locale={copy.locale} className={styles.hint}>
        {copy.value.pronunciation_hint}
      </LocalizedText>

      {/*
        Watching it written, before being asked to write it. A beginner shown
        only the finished shape invents their own stroke order, and an invented
        one is hard to unlearn — so this plays once, by itself, and stays
        replayable for as long as they want it.
      */}
      <section className={styles.strokes} aria-labelledby="stroke-order-heading">
        <h2 id="stroke-order-heading" className={styles.strokesHeading}>
          {tw('strokeOrder.heading')}
        </h2>
        <StrokeOrder
          character={character.character}
          strokes={character.strokes}
          size={208}
          onWatched={onDemoWatched}
        />
        {/* What to do with *this* character, derived from its own stroke data.
            See `data/strokeGuide.ts`. */}
        <p className={styles.instruction}>{instruction}</p>
      </section>

      {copy.value.mnemonic && (
        <div className={styles.mnemonic}>
          <HangyulMascot mood="thinking" size={28} />
          <LocalizedText locale={copy.locale}>{copy.value.mnemonic}</LocalizedText>
        </div>
      )}
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
