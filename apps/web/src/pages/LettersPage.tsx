import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { CURRICULUM_UNITS, LETTER_LESSONS, getLessonCharacters } from '../data/characters';
import { alphabetProgress, isIntroduced, lessonProgress, unitProgress } from '../domain/progress';
import { resolveContent, useFormatters, useLocale } from '../i18n';
import { NextStepCard } from '../features/learning/NextStepCard';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Badge } from '../ui/Chip';
import { Card } from '../ui/Card';
import { LocalizedText } from '../ui/LocalizedText';
import { ProgressBar } from '../ui/Progress';
import { CheckIcon, ChevronRightIcon } from '../ui/icons';
import styles from './LettersPage.module.css';

/**
 * The Hangul curriculum, as the twelve units it is taught in.
 *
 * Units rather than a flat list of lessons, because "lesson 11 of 15" tells a
 * learner nothing while "Unit 3 — your first syllables" tells them what they
 * are about to be able to do. The unit headline is also where the payoff sits:
 * by the end of unit 3 they can read 가 나 다, and the screen should say so.
 *
 * Nothing here is locked. A learner who wants to look ahead at 받침 on their
 * first evening should be able to; the curriculum is an order, not a gate, and
 * the one thing that *is* gated — which words are offered — is gated on the
 * letters they have actually met rather than on a lesson counter.
 */
export function LettersPage() {
  const { state } = useLearner();
  const { t } = useTranslation(['learning', 'numbers', 'common']);
  const { locale } = useLocale();
  const format = useFormatters();

  const alphabet = alphabetProgress(state.progress);

  /*
   * The alphabet is finished, so there is somewhere else to go now.
   *
   * §32. Placed on the letters screen and nowhere in the lesson flow: a learner
   * who has just come back to see their progress is the person who is deciding
   * what to do next, and a learner in the middle of a session is not. It sits
   * *below* the alphabet grid, so the achievement is the thing on screen and
   * this is what follows it.
   */
  const alphabetDone = alphabet.done >= alphabet.total;

  return (
    <div className={styles.page}>
      <AppHeader title={t('learning:letters.title')} />

      <div className={styles.body}>
        <Card tone="warm" padding="md" className={styles.summary}>
          <div className={styles.summaryText}>
            <p className={styles.summaryTitle}>{t('learning:letters.alphabetTitle')}</p>
            <p className={styles.summaryMeta}>
              <strong className="hg-numeric">{format.fraction(alphabet.done, alphabet.total)}</strong>{' '}
              {t('learning:letters.alphabetCaption')}
            </p>
          </div>
          <ProgressBar
            value={alphabet.ratio}
            label={t('learning:letters.alphabetCaption')}
            size="sm"
          />
        </Card>

        {CURRICULUM_UNITS.map((unit) => {
          const lessons = LETTER_LESSONS.filter((lesson) => unit.lesson_ids.includes(lesson.id));
          const progress = unitProgress(state.progress, unit.id);
          const complete = progress.total > 0 && progress.done === progress.total;
          const unitTitle = t(`learning:units.unit-${unit.index}.title`);

          return (
            <section key={unit.id} className={styles.unit} aria-labelledby={`unit-${unit.index}`}>
              <header className={styles.unitHead}>
                <span className={styles.unitIndex} aria-hidden="true">
                  {complete ? <CheckIcon size={14} /> : unit.index}
                </span>
                <div className={styles.unitText}>
                  <h2 id={`unit-${unit.index}`} className={styles.unitTitle}>
                    {unitTitle}
                  </h2>
                  <p className={styles.unitGoal}>{t(`learning:units.unit-${unit.index}.goal`)}</p>
                </div>
                <span className={`${styles.unitCount} hg-numeric`}>
                  {format.fraction(progress.done, progress.total)}
                </span>
              </header>

              <ul className={styles.list}>
                {lessons.map((lesson) => {
                  const characters = getLessonCharacters(lesson);
                  const done = lessonProgress(state.progress, lesson);
                  const title = resolveContent(lesson.translations, locale);

                  return (
                    <li key={lesson.id}>
                      <Link to={`/letters/${lesson.id}`} className={styles.rowLink}>
                        <Card padding="md" className={styles.row}>
                          <div className={styles.rowHead}>
                            <div className={styles.rowText}>
                              {/*
                                A card that repeats its unit's heading.

                                Eight of the twelve units are named after their
                                first lesson, so the card under the heading says
                                the same words again, forty vertical pixels
                                lower. The condition used to be `lessons.length
                                > 1` — a proxy for the same idea, on the
                                reasoning that a single-lesson unit is the case
                                where the two coincide. Unit 11 has two lessons
                                and is still called after the first of them, so
                                the proxy passed it through and the screen read
                                "A letter at the foot" twice. Comparing the two
                                strings is the thing the proxy was standing in
                                for.
                              */}
                              {title.value.title !== unitTitle && (
                                <LocalizedText
                                  as="h3"
                                  locale={title.locale}
                                  className={styles.rowTitle}
                                >
                                  {title.value.title}
                                </LocalizedText>
                              )}
                              <p className={styles.rowChars} lang="ko" dir="ltr">
                                {characters.map((character) => {
                                  const row = state.progress[`character:${character.character}`];
                                  const className =
                                    row?.stage === 'learned'
                                      ? styles.charDone
                                      : isIntroduced(state.progress, character.character)
                                        ? styles.charSeen
                                        : styles.char;
                                  return (
                                    <span key={character.id} className={className}>
                                      {character.character}
                                    </span>
                                  );
                                })}
                              </p>
                            </div>
                            {done.ratio === 1 ? (
                              <Badge tone="mint" filled>
                                {t('learning:letters.complete')}
                              </Badge>
                            ) : done.done > 0 ? (
                              /*
                                Part-way through, and the card says so.

                                The lesson resumes at the first unfinished
                                letter rather than restarting — see
                                `LetterSessionPage` — so the label has to match
                                what tapping it does. "Continue" over a 5 / 6
                                bar is a promise the screen now keeps.
                              */
                              <Badge tone="primary">
                                {t('learning:letters.resume')}
                              </Badge>
                            ) : (
                              <ChevronRightIcon size={20} />
                            )}
                          </div>

                          <div className={styles.rowFoot}>
                            <ProgressBar
                              value={done.ratio}
                              label={t('common:progress.lesson', { name: title.value.title })}
                              size="sm"
                            />
                            <span className={`${styles.rowCount} hg-numeric`}>
                              {format.fraction(done.done, done.total)}
                            </span>
                          </div>
                        </Card>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {/*
          The sound-change lesson, at the foot of the alphabet rather than
          inside it.

          It is not a unit — there are no letters to learn in it and nothing to
          write — but it is the thing that stands between reading Hangul and
          reading Korean, and a learner who has met 받침 will otherwise say
          학교 as *hak-gyo* forever. So it sits where they arrive after the last
          unit, and it is offered rather than required.
        */}
        <Link to="/letters/sounds" className={styles.rowLink}>
          <Card padding="md" className={styles.sounds}>
            <div className={styles.rowText}>
              <h2 className={styles.rowTitle}>{t('learning:sounds.title')}</h2>
              <p className={styles.soundsBlurb}>{t('learning:sounds.blurb')}</p>
            </div>
            <ChevronRightIcon size={20} />
          </Card>
        </Link>

        {/*
          Numbers, offered beside the sound changes rather than inside a unit.

          Same argument as `/letters/sounds`: there are no letters to learn in
          it and nothing to write, and it is not part of the alphabet's twelve
          units — but it is the other thing standing between reading Hangul and
          using Korean, and a learner who can read 스물 still cannot say their
          own age without it. Reachable from the first evening, because a
          learner who wants to count to ten before they can write ㄱ should be
          able to.
        */}
        <Link to="/letters/numbers" className={styles.rowLink}>
          <Card padding="md" className={styles.sounds}>
            <div className={styles.rowText}>
              <h2 className={styles.rowTitle}>{t('numbers:title')}</h2>
              <p className={styles.soundsBlurb}>{t('numbers:subtitle')}</p>
            </div>
            <ChevronRightIcon size={20} />
          </Card>
        </Link>

        {alphabetDone && <NextStepCard variant="earned" />}
      </div>
    </div>
  );
}
