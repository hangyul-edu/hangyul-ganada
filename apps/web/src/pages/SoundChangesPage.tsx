import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { SOUND_PATTERNS, VOCABULARY } from '../data/vocabulary';
import { useCorpusMemo } from '../data/useCorpus';
import { AppHeader } from '../ui/AppHeader';
import { FocusScreen } from '../ui/FocusScreen';
import { Card } from '../ui/Card';
import { SpeakerButton } from '../ui/SpeakerButton';
import { getFont } from '../data/fonts';
import { useLearner } from '../store/LearnerContext';
import styles from './SoundChangesPage.module.css';

/**
 * When sounds meet.
 *
 * The short lesson that comes after 받침. A learner who has finished the
 * alphabet can read every letter and will still say 학교 as *hak-gyo*, because
 * Korean spelling writes the pieces a word is made of and leaves the reader to
 * apply what happens where those pieces touch. That is not an advanced topic —
 * it is the difference between reading Hangul and reading Korean, and it hits
 * on the first day.
 *
 * ## Blocks, sound, and one sentence
 *
 * Each pattern is one card: the word as it is written, the word as it is said,
 * a speaker for each, and a single line naming the pattern. No phonology
 * vocabulary — not "regressive assimilation", not "tensification". A beginner
 * does not need the name of the rule, they need to know that the second block
 * changes and roughly why.
 *
 * ## Where the examples come from
 *
 * The corpus, not a hand-written list. Every word here is one the app already
 * teaches, already has both recordings for, and already carries a
 * `sound_pattern` from the build — so the lesson cannot demonstrate a pattern
 * with a word the product does not know, and adding a pattern to
 * `pronunciation.py` puts it on this page automatically.
 */
export function SoundChangesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['learning', 'vocabulary', 'common']);
  const { state } = useLearner();
  const font = getFont(state.settings.selected_font_id);
  // The examples are chosen out of the whole corpus, so the list has to be
  // rebuilt when a band arrives. See `data/corpus.ts`.
  const lessons = useCorpusMemo(() => {
    // The easiest example of each pattern: the lowest-difficulty word that
    // demonstrates it, so a learner meeting 경음화 meets it on 학교 and not on
    // a four-syllable noun they have never seen.
    return SOUND_PATTERNS.map((pattern) => {
      const examples = VOCABULARY.filter((word) => word.sound_pattern === pattern)
        .sort((a, b) => a.difficulty_score - b.difficulty_score)
        .slice(0, 3);
      return { pattern, examples };
    }).filter((lesson) => lesson.examples.length > 0);
  }, []);

  return (
    <FocusScreen
      header={<AppHeader title={t('learning:sounds.title')} onBack={() => navigate('/letters')} />}
    >
      <div className={styles.body}>
        <p className={styles.intro}>{t('learning:sounds.intro')}</p>

        {lessons.map(({ pattern, examples }) => {
          const lead = examples[0]!;
          return (
            <Card key={pattern} padding="md" className={styles.lesson}>
              <h2 className={styles.lessonTitle}>{t(`learning:sounds.name.${pattern}`)}</h2>

              {/* Written, then said. The arrow between them is the lesson. */}
              <div className={styles.pair}>
                <div className={styles.side}>
                  <span className={styles.sideLabel}>{t('learning:sounds.written')}</span>
                  <span className={styles.block} style={{ fontFamily: font.font_family }} lang="ko" dir="ltr">
                    {lead.word}
                  </span>
                  {/*
                    No speaker on this side.
                    There is one recording of this word and it is a recording of
                    how the word is *said*, so a speaker under the spelling would
                    play the sound from the other half of the row — two buttons,
                    one clip, and an implied promise that the left one reads the
                    spelling out literally. It does not, and it must not: that
                    would be the app teaching the mistake the page exists to
                    correct.
                  */}
                </div>
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
                <div className={styles.side}>
                  <span className={styles.sideLabel}>{t('learning:sounds.said')}</span>
                  <span
                    className={`${styles.block} ${styles.spoken}`}
                    style={{ fontFamily: font.font_family }}
                    lang="ko"
                    dir="ltr"
                  >
                    {lead.spoken}
                  </span>
                  <SpeakerButton audioId={lead.audio.word} label={lead.spoken ?? lead.word} size="sm" tone="plain" />
                </div>
              </div>

              <p className={styles.why}>
                {t(`vocabulary:sound.${pattern}`, { word: lead.word, spoken: lead.spoken })}
              </p>

              {examples.length > 1 && (
                <ul className={styles.more}>
                  {examples.slice(1).map((word) => (
                    <li key={word.id} className={styles.moreRow}>
                      <span lang="ko" dir="ltr">
                        {word.word} → {word.spoken}
                      </span>
                      <SpeakerButton
                        audioId={word.audio.word}
                        label={word.word}
                        size="sm"
                        tone="plain"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}

        <p className={styles.note}>{t('learning:sounds.note')}</p>
      </div>
    </FocusScreen>
  );
}
