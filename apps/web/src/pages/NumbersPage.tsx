import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { NumbersLessonStatus } from '@hangyul-ganada/shared-types';

import { NUMBER_LESSONS, NUMBER_MODULES, getNumberLesson } from '../data/numbers';
import { isReviewDue, lessonActivityProgress, lessonStatus } from '../domain/numbersProgress';
import { useFormatters } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/Progress';
import { CheckIcon, ChevronRightIcon, LockIcon } from '../ui/icons';
import styles from './NumbersPage.module.css';

/**
 * The Numbers course: six modules, eighteen lessons, and an honest account of
 * where the learner is in each.
 *
 * ## What the screen may and may not claim
 *
 * Every row carries a *status word* — Locked, Available, Opened, In progress,
 * Completed, Mastered, Review due — and the word comes from one function,
 * `lessonStatus`, reading the evidence record. The check mark is drawn for
 * `completed` and `mastered` and for nothing else. The first build of this
 * screen drew it from a per-item flag that the session wrote on the way *in*,
 * which is how a lesson a learner had merely opened came to look finished.
 *
 * ## Numbers are labelled
 *
 * "3 of 5 activities done" and "2 of 4 lessons completed" rather than a bare
 * fraction or a percentage. The denominator names what is being counted, so a
 * learner is never left to guess whether 3/5 means items, questions or lessons.
 *
 * ## Locked means locked
 *
 * A lesson whose prerequisites are unfinished is shown, named and explained,
 * but is not a link. The alphabet lets learners look ahead because a letter is
 * a letter wherever you meet it; a Numbers lesson assumes the forms taught
 * before it, and a learner who opens "hours" without "counting forms" meets
 * 두 시 with no way to know why it is not 둘 시.
 */
export function NumbersPage() {
  const { state, numbersLessonsComplete } = useLearner();
  const { t } = useTranslation(['numbers', 'common']);
  const format = useFormatters();
  const now = new Date();

  const statusOf = (lessonId: string): NumbersLessonStatus => {
    const lesson = getNumberLesson(lessonId)!;
    const record = state.numbers[lessonId];
    return lessonStatus(record, lesson, {
      prerequisitesComplete: numbersLessonsComplete(lesson.prerequisites),
      reviewDue: isReviewDue(record, now),
    });
  };

  const isDone = (status: NumbersLessonStatus) =>
    status === 'completed' || status === 'mastered' || status === 'review_due';

  const completedLessons = NUMBER_LESSONS.filter((l) => isDone(statusOf(l.id))).length;

  return (
    <div className={styles.page}>
      <AppHeader title={t('numbers:title')} />

      <div className={styles.body}>
        <Card tone="warm" padding="md" className={styles.summary}>
          <div className={styles.summaryText}>
            <p className={styles.summaryTitle}>{t('numbers:subtitle')}</p>
          </div>
          <p className={styles.summaryMeta} data-testid="numbers-lessons-completed">
            {t('numbers:lessonsCompleted', { done: completedLessons, total: NUMBER_LESSONS.length })}
          </p>
          <ProgressBar
            value={NUMBER_LESSONS.length === 0 ? 0 : completedLessons / NUMBER_LESSONS.length}
            label={t('numbers:lessonsCompleted', { done: completedLessons, total: NUMBER_LESSONS.length })}
            size="sm"
          />
        </Card>

        {NUMBER_MODULES.map((module) => {
          const lessons = module.lesson_ids.map((id) => getNumberLesson(id)!);
          const done = lessons.filter((l) => isDone(statusOf(l.id))).length;
          return (
            <section
              key={module.id}
              className={styles.unit}
              aria-labelledby={`num-module-${module.id}`}
              data-testid={`numbers-module-${module.id}`}
            >
              <div className={styles.moduleHead}>
                <div className={styles.moduleText}>
                  <h2 id={`num-module-${module.id}`} className={styles.moduleTitle}>
                    <span className={`${styles.moduleIndex} hg-numeric`} aria-hidden="true">
                      {format.number(module.index)}
                    </span>
                    {t(`numbers:${module.title}`)}
                  </h2>
                  <p className={styles.moduleGoal}>{t(`numbers:${module.goal}`)}</p>
                </div>
                <span className={styles.moduleCount}>
                  {t('numbers:moduleLessons', { done, total: lessons.length })}
                </span>
              </div>
              <ul className={styles.lessons}>
                {lessons.map((lesson) => {
                  const status = statusOf(lesson.id);
                  const progress = lessonActivityProgress(state.numbers[lesson.id], lesson);
                  const locked = status === 'locked';
                  const finished = isDone(status);
                  const inner = (
                    <>
                      <span className={styles.lessonIcon} aria-hidden="true">
                        {finished ? <CheckIcon size={14} /> : locked ? <LockIcon size={14} /> : null}
                      </span>
                      <span className={styles.lessonText}>
                        <span className={styles.lessonTitle}>{t(`numbers:${lesson.title}`)}</span>
                        <span className={styles.lessonSystem}>
                          {t(
                            lesson.system === 'sino'
                              ? 'numbers:systemSino'
                              : lesson.system === 'native'
                                ? 'numbers:systemNative'
                                : 'numbers:systemBoth',
                          )}
                        </span>
                        {locked && (
                          <span id={`${lesson.id}-locked`} className={styles.lessonLocked}>
                            {t('numbers:lockedNote')}
                          </span>
                        )}
                      </span>
                      <span className={styles.lessonMeta}>
                        <span
                          className={`${styles.status} ${styles[`status_${status}`] ?? ''}`}
                          data-status={status}
                        >
                          {t(`numbers:status.${status}`)}
                        </span>
                        {!locked && !finished && progress.done > 0 && (
                          <span className={styles.lessonCount}>
                            {t('numbers:activitiesDone', progress)}
                          </span>
                        )}
                      </span>
                      {!locked && <ChevronRightIcon size={16} />}
                    </>
                  );
                  return (
                    <li key={lesson.id} data-testid={`numbers-lesson-${lesson.id}`} data-status={status}>
                      {locked ? (
                        <div
                          className={`${styles.lesson} ${styles.lessonLockedRow}`}
                          aria-describedby={`${lesson.id}-locked`}
                          aria-disabled="true"
                        >
                          {inner}
                        </div>
                      ) : (
                        <Link to={`/letters/numbers/${lesson.id}`} className={styles.lesson}>
                          {inner}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
