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
import { CheckIcon, ChevronRightIcon } from '../ui/icons';
import styles from './NumbersPage.module.css';

/**
 * The Numbers course: six modules, eighteen lessons, and an honest account of
 * where the learner is in each.
 *
 * ## What the screen may and may not claim
 *
 * Every row carries a *status word* — Available, Opened, In progress,
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
 * ## Nothing is locked
 *
 * Every lesson on this screen is a link, always. It was not: a lesson whose
 * prerequisites were unfinished was shown, named, explained and not openable,
 * on the reasoning that "hours" assumes "counting forms" and a learner meeting
 * 두 시 without them cannot know why it is not 둘 시.
 *
 * That reasoning is a good argument for the *order* and a bad argument for the
 * gate. Somebody who has just been asked their age in Korean wants to know how
 * to answer, today, and a course that answers "finish four other lessons
 * first" has told them to go and look it up somewhere else. It is also the
 * wrong shape for the subject: numbers are what a learner meets on the first
 * day, out of order, on a price tag and a bus.
 *
 * So the order survives as a recommendation and not as a door:
 *
 * * the lessons are listed in it;
 * * **Continue** goes to the first one that is not finished;
 * * the status word says where the learner is in each.
 *
 * Unlocking a lesson is not the same as having done any of it. `available`,
 * `not_started` and `in_progress` are three different words on this screen for
 * that reason, and completion is derived from evidence in
 * `domain/numbersProgress` and from nothing this screen knows about.
 */
export function NumbersPage() {
  const { state } = useLearner();
  const { t } = useTranslation(['numbers', 'common']);
  const format = useFormatters();
  const now = new Date();

  const statusOf = (lessonId: string): NumbersLessonStatus => {
    const lesson = getNumberLesson(lessonId)!;
    const record = state.numbers[lessonId];
    return lessonStatus(record, lesson, { reviewDue: isReviewDue(record, now) });
  };

  const isDone = (status: NumbersLessonStatus) =>
    status === 'completed' || status === 'mastered' || status === 'review_due';

  const completedLessons = NUMBER_LESSONS.filter((l) => isDone(statusOf(l.id))).length;
  /** The recommended next lesson: the first in course order that is not finished. */
  const next = NUMBER_LESSONS.find((l) => !isDone(statusOf(l.id))) ?? null;

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
          {/*
            The recommended order, as the one thing a learner can press without
            choosing. It is what is left of the prerequisite chain: the first
            lesson that is not finished, in course order, so somebody who wants
            to be led is led and somebody who wants lesson eleven can tap
            lesson eleven.
          */}
          {next && (
            <Link
              to={`/letters/numbers/${next.id}`}
              className={styles.continue}
              data-testid="numbers-continue"
            >
              {t(completedLessons === 0 ? 'numbers:action.start' : 'numbers:action.continue')}
            </Link>
          )}
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
                  const finished = isDone(status);
                  const recommended = next?.id === lesson.id;
                  const inner = (
                    <>
                      <span className={styles.lessonIcon} aria-hidden="true">
                        {finished ? <CheckIcon size={14} /> : null}
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
                      </span>
                      <span className={styles.lessonMeta}>
                        <span
                          className={`${styles.status} ${styles[`status_${status}`] ?? ''}`}
                          data-status={status}
                        >
                          {t(`numbers:status.${status}`)}
                        </span>
                        {!finished && progress.done > 0 && (
                          <span className={styles.lessonCount}>
                            {t('numbers:activitiesDone', progress)}
                          </span>
                        )}
                      </span>
                      <ChevronRightIcon size={16} />
                    </>
                  );
                  return (
                    <li key={lesson.id} data-testid={`numbers-lesson-${lesson.id}`} data-status={status}>
                      <Link
                        to={`/letters/numbers/${lesson.id}`}
                        className={styles.lesson}
                        // The recommendation, said rather than enforced. A
                        // learner who wants the next step can find it without
                        // reading every row; everything else is still a link.
                        aria-current={recommended ? 'step' : undefined}
                        data-recommended={recommended ? 'true' : undefined}
                      >
                        {inner}
                      </Link>
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
