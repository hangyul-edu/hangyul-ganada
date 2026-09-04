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
 * A row carries a *status word* only when it has something to say — In
 * progress, Completed, Mastered, Review due — and the word comes from one
 * function, `lessonStatus`, reading the evidence record. The check mark is
 * drawn for `completed` and `mastered` and for nothing else. The first build of
 * this screen drew it from a per-item flag that the session wrote on the way
 * *in*, which is how a lesson a learner had merely opened came to look
 * finished.
 *
 * ## A lesson nobody has opened carries no badge at all
 *
 * It used to say *학습 가능* — Available — on every untouched row, and *열림*,
 * Opened, on every row a learner had merely looked at. Nineteen rows, nineteen
 * badges, all saying the one thing that is true of every lesson in the course:
 * you may do this. A label that is on everything distinguishes nothing, and
 * repeating it down a list teaches a learner to read past the place where the
 * real states — in progress, review due — appear.
 *
 * So `available` and `not_started` draw nothing, and their strings are gone
 * from all thirty-two bundles rather than merely hidden. The row is still a
 * link, its title still names the lesson, and the badge column is not reserved
 * when it is empty — see `.lessonMeta`. Availability was never the same fact as
 * completion, and the screen no longer states the one that is always true.
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
 * Unlocking a lesson is not the same as having done any of it, and the screen
 * says so by saying nothing: an untouched lesson is a plain row. Completion is
 * derived from evidence in `domain/numbersProgress` and from nothing this
 * screen knows about.
 *
 * ## One rail, and nothing reserved beside it
 *
 * Every row used to begin with a 20-pixel `<span>` holding a tick when the
 * lesson was finished and **nothing at all** the rest of the time — which is
 * most of the course, most of the time. With the row's own 12-pixel gap that is
 * 32 px of blank paper down the left of eighteen cards, so a lesson title
 * started 49 px from the edge of the phone while the module heading above it
 * started at 20 and the summary card above that at 32. Three left edges on one
 * screen, and the one the eye actually follows — the titles — was the furthest
 * in.
 *
 * It cost the titles their width as well, which is the part a learner feels:
 * on a 320 px phone the row had 256 px inside its padding, the empty column and
 * the chevron took 48 of them, and a three-word lesson title wrapped to three
 * lines beside a quarter-row of nothing.
 *
 * There is no leading column now. The tick moved inside the **Completed** pill
 * — the same fact said once instead of twice — and everything on the screen
 * starts on one rail:
 *
 * ```
 * ├─ 16 ─┼─ 16 ─┤
 *        ①  Module title              2 of 3   ← padded to the rail
 *        Module goal
 *        ┌────────────────────────────────────┐
 *        │ Lesson title            [pill]  ›  │ ← the card's padding, less its
 *        │ Sino-Korean                        │   1px border, lands on it too
 * ```
 *
 * The things that must sit on it carry `data-rail="numbers"`, and the things
 * that end on the right-hand rule carry `data-rail-end="numbers"`.
 * `npm run numbers:layout:check` measures the *ink* of each at six phone
 * widths, landscape, two text scales, both appearances and the longest locales.
 * Boxes were never the problem: an empty box is perfectly aligned.
 *
 * ## The title has the flexible width, and keeps it
 *
 * The row is one flex line — the title block, the status and count, the chevron
 * — and the title block is `flex: 1 1 9rem`. When 9rem of title cannot fit
 * beside the badge, the *badge* wraps to a second line rather than the title
 * being squeezed into a column. A `rem` basis rather than a pixel one because
 * it has to give way at 200% text too, where 9rem is most of a 320 px screen
 * and everything belongs on its own line anyway.
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
            <p className={styles.summaryTitle} data-rail="numbers">
              {t('numbers:subtitle')}
            </p>
          </div>
          <p
            className={styles.summaryMeta}
            data-rail="numbers"
            data-testid="numbers-lessons-completed"
          >
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
                    <span
                      className={`${styles.moduleIndex} hg-numeric`}
                      data-rail="numbers"
                      /*
                        Measured as a box, not as ink. The number is centred
                        inside a 24 px disc, so its *glyph* starts eight or
                        nine pixels in from the disc's edge — and it is the
                        disc that sits on the rail. Everything else on this
                        screen is text, where the ink is what a reader lines
                        up against.
                      */
                      data-rail-measure="box"
                      aria-hidden="true"
                    >
                      {format.number(module.index)}
                    </span>
                    {t(`numbers:${module.title}`)}
                  </h2>
                  <p className={styles.moduleGoal} data-rail="numbers">
                    {t(`numbers:${module.goal}`)}
                  </p>
                </div>
                <span className={styles.moduleCount} data-rail-end="numbers">
                  {t('numbers:moduleLessons', { done, total: lessons.length })}
                </span>
              </div>
              <ul className={styles.lessons}>
                {lessons.map((lesson) => {
                  const status = statusOf(lesson.id);
                  const progress = lessonActivityProgress(state.numbers[lesson.id], lesson);
                  const finished = isDone(status);
                  const recommended = next?.id === lesson.id;
                  /*
                   * `available` and `not_started` both mean *you have not
                   * started this*, which is true of most of the course and is
                   * what the row already looks like.
                   */
                  const showStatus = status !== 'available' && status !== 'not_started';
                  const showCount = !finished && progress.done > 0;
                  /*
                   * The tick, on the two statuses that mean the work is done.
                   *
                   * It used to be drawn from `finished`, which also covers
                   * `review_due` — a lesson that has *come back round*, and is
                   * the one state on this screen asking the learner to act. A
                   * tick beside it says the opposite of what the word beside it
                   * says. The doc comment at the top of this file has always
                   * described the rule below; the code did not follow it.
                   */
                  const ticked = status === 'completed' || status === 'mastered';
                  const inner = (
                    <>
                      {/*
                        The title, the badges and the count, on one line while
                        there is room for them and on two when there is not.
                        There is no leading column: an icon slot that is empty
                        on most rows most of the time is 32 px of the title's
                        width spent on nothing.
                      */}
                      <span className={styles.lessonBody}>
                        <span className={styles.lessonText}>
                          <span className={styles.lessonTitle} data-rail="numbers">
                            {t(`numbers:${lesson.title}`)}
                          </span>
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
                        {/*
                          No badge for a lesson nobody has opened: "Available"
                          on every row is a word a learner learns to skip, and
                          skipping it costs them "Review due" as well.

                          The wrapper goes with it rather than being left empty
                          — an empty flex child still takes the row's gap,
                          which is the "unused layout space" a removed badge
                          leaves behind.
                        */}
                        {(showStatus || showCount) && (
                          <span className={styles.lessonMeta}>
                            {showStatus && (
                              <span
                                className={`${styles.status} ${styles[`status_${status}`] ?? ''}`}
                                data-status={status}
                              >
                                {ticked && <CheckIcon size={12} aria-hidden="true" />}
                                {t(`numbers:status.${status}`)}
                              </span>
                            )}
                            {showCount && (
                              <span className={styles.lessonCount}>
                                {t('numbers:activitiesDone', progress)}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      <ChevronRightIcon
                        size={16}
                        className={styles.chevron}
                        data-rail-end="numbers"
                      />
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
