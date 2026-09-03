import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { NumberItem, NumberLesson, NumbersLessonProgress } from '@hangyul-ganada/shared-types';

import { getNumberItem, getNumberLesson, getNumberModule, numberLessonItems, spokenExample } from '../data/numbers';
import {
  type LessonPhase,
  MASTERY_PASS,
  blankLessonProgress,
  isComplete,
  isReviewDue,
  lessonStatus,
  resumePhase,
} from '../domain/numbersProgress';
import {
  MISCONCEPTION_FEEDBACK,
  type ExerciseOption,
  type NumbersExercise,
  masteryExercises,
  practiceExercises,
} from '../features/numbers/exercises';
import { exampleMeaning, formatValue, numberMeaning } from '../features/numbers/meaning';
import { useLocale } from '../i18n';
import { withParticle } from '../i18n/josa';
import { useEntryAudio } from '../audio/useEntryAudio';
import { hapticPass, hapticRetry, hapticSelection } from '../native/haptics';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FeedbackState } from '../ui/FeedbackState';
import { ProgressBar } from '../ui/Progress';
import { SpeakerButton } from '../ui/SpeakerButton';
import { CheckIcon, CloseIcon } from '../ui/icons';
import styles from './NumberSessionPage.module.css';

/**
 * One Numbers lesson, in six phases, each of which leaves evidence.
 *
 * ```
 *  objective → explain → examples → practice → mastery → summary
 * ```
 *
 * ## The screen records; the domain decides
 *
 * Nothing here writes "complete". Each phase sends the events it produces —
 * a step read, an example looked at, an exercise answered, a mastery check
 * finished — to `recordNumbersEvent`, and `domain/numbersProgress.ts` decides
 * whether the record now qualifies. The summary screen then *reads* the status
 * back and says "Lesson complete" or "Not complete yet — here is what is
 * missing". The first build of this page set every item to `learned` when the
 * last question was answered, regardless of the answers, which is the defect
 * this rewrite exists to remove.
 *
 * ## Resume is from the evidence
 *
 * On arrival the phase is `resumePhase(record)`: whatever the record says the
 * learner still owes. A learner who read two of three steps and left comes back
 * to the third step, not to the objective and not to the practice.
 *
 * ## Exercises are seeded, not fixed
 *
 * The option order for every question comes from a hash of the lesson, item,
 * kind, phase and *attempt number*. The same attempt shows the same order, so
 * leaving and returning does not move the answer; the next attempt shows a
 * different order, so a retake cannot be passed from memory of positions. In
 * the first build the correct answer sat at index 1 in ten of ten questions.
 *
 * ## One tap, one answer
 *
 * Options are disabled the moment one is chosen, and the handler also checks a
 * ref, so a second tap in the same frame — a double tap, a tap during a
 * re-render — cannot record a second attempt or flip the shown result.
 */

const LESSON_ROOT = '/letters/numbers';

type Attempt = { picked: number | null; sequence: string[]; correct: boolean | null };

export function NumberSessionPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(['numbers', 'common', 'learning']);
  const { locale } = useLocale();
  const { state, recordNumbersEvent } = useLearner();

  const lesson = lessonId ? getNumberLesson(lessonId) : undefined;
  const record: NumbersLessonProgress | undefined = lesson ? state.numbers[lesson.id] : undefined;
  const items = useMemo(() => (lesson ? numberLessonItems(lesson) : []), [lesson]);

  /*
    The phase is decided once, from the evidence, when the lesson is entered —
    and not before the evidence has loaded. The store hydrates asynchronously;
    a phase computed from the empty pre-hydration state would say "Start
    lesson" to a learner who is half-way through, and would never be
    recomputed. `storage.checked` is the hydration signal.
  */
  const hydrated = state.storage.checked;
  const [phase, setPhase] = useState<LessonPhase | 'review' | null>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!hydrated || phase !== null || !lesson) return;
    const next = resumePhase(record, lesson);
    // Resume at the first step or example the record has not seen.
    if (next === 'explain') {
      const i = lesson.explanation.findIndex((s) => !(record?.explanation_steps_viewed ?? []).includes(s));
      setStep(Math.max(0, i));
    } else if (next === 'examples') {
      const i = lesson.item_ids.findIndex((id) => !(record?.examples_viewed ?? []).includes(id));
      setStep(Math.max(0, i));
    }
    setPhase(next);
  }, [hydrated, phase, lesson, record]);
  // Counts entries into an exercise run, so each run is a fresh mount with a
  // question list built once. Nothing about the record is in the key: the
  // record changes on every answer, and a remount mid-run would shuffle the
  // questions under the learner.
  const [run, setRun] = useState(0);

  // One `lesson_opened` per arrival. Opening records that fact and nothing else.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated || !lesson || openedFor.current === lesson.id) return;
    openedFor.current = lesson.id;
    recordNumbersEvent(lesson.id, { type: 'lesson_opened' });
  }, [hydrated, lesson, recordNumbersEvent]);

  if (!lesson || phase === null) {
    // Unknown lesson, or the record has not loaded yet: the header and nothing
    // else, so nothing is drawn that the record could contradict a moment later.
    return (
      <div className={styles.page}>
        <AppHeader title={lesson ? t(`numbers:${lesson.title}`) : t('numbers:title')} onBack={() => navigate(LESSON_ROOT)} />
      </div>
    );
  }

  const title = t(`numbers:${lesson.title}`);
  const back = () => navigate(LESSON_ROOT);

  const goto = (next: LessonPhase | 'review') => {
    setStep(0);
    setRun((n) => n + 1);
    setPhase(next);
  };

  // --- objective -------------------------------------------------------------
  if (phase === 'objective') {
    const module = getNumberModule(lesson.module);
    const status = lessonStatus(record, lesson, { reviewDue: isReviewDue(record, new Date()) });
    const resuming = record !== undefined && record.started_at !== null;
    return (
      <div className={styles.page}>
        <AppHeader title={title} onBack={back} />
        <div className={styles.body} data-scroll-region="numbers" data-testid="numbers-phase-objective">
          <Card tone="warm" padding="md" className={styles.objective}>
            <p className={styles.phaseLabel}>{t('numbers:phase.objective')}</p>
            <p className={styles.note}>{t(`numbers:${lesson.objective}`)}</p>
            {module && <p className={styles.moduleGoal}>{t(`numbers:${module.goal}`)}</p>}
            {/*
              The status pill, only when it has something to say.

              This screen used to open with *열림* — Opened — under the lesson's
              own objective, which told a learner the one thing they could see
              for themselves: they are looking at the lesson. It is drawn now
              for the states that describe work actually done, and a lesson
              nobody has started shows its objective and nothing else.
            */}
            {status !== 'available' && status !== 'not_started' && (
              <p className={styles.statusLine}>
                <span className={styles.statusWord} data-status={status}>
                  {t(`numbers:status.${status}`)}
                </span>
              </p>
            )}
          </Card>

          <ul className={styles.itemList} aria-label={t('numbers:phase.examples')}>
            {items.map((item) => (
              <li key={item.id} className={styles.itemChip} lang="ko">
                {item.korean}
              </li>
            ))}
          </ul>

          {/*
            Always a way in. This used to be a fork — the lesson, or a card
            explaining that other lessons had to be finished first — and the
            second branch is gone with the rest of the locking. See
            `pages/NumbersPage`.
          */}
          <Button
            data-testid="numbers-start"
            onClick={() => {
              const next = resumePhase(record, lesson);
              goto(next === 'objective' ? 'explain' : next);
            }}
          >
            {t(resuming ? 'numbers:action.resume' : 'numbers:action.start')}
          </Button>
        </div>
      </div>
    );
  }

  // --- explanation -----------------------------------------------------------
  if (phase === 'explain') {
    const steps = lesson.explanation;
    const key = steps[Math.min(step, steps.length - 1)]!;
    return (
      <div className={styles.page}>
        <AppHeader title={title} onBack={back} />
        <div className={styles.body} data-scroll-region="numbers" data-testid="numbers-phase-explain">
          <PhaseProgress
            label={t('numbers:phase.explain')}
            detail={t('numbers:stepOf', { current: step + 1, total: steps.length })}
            value={step / steps.length}
          />
          <Card padding="lg" className={styles.explain}>
            <p className={styles.explainText}>{t(`numbers:${key}`)}</p>
          </Card>
          <Button
            onClick={() => {
              recordNumbersEvent(lesson.id, { type: 'explanation_viewed', step: key });
              if (step + 1 < steps.length) setStep(step + 1);
              else goto('examples');
            }}
          >
            {t('numbers:action.next')}
          </Button>
        </div>
      </div>
    );
  }

  // --- examples --------------------------------------------------------------
  if (phase === 'examples') {
    const item = items[Math.min(step, items.length - 1)]!;
    return (
      <div className={styles.page}>
        <AppHeader title={title} onBack={back} />
        <div className={styles.body} data-scroll-region="numbers" data-testid="numbers-phase-examples">
          <PhaseProgress
            label={t('numbers:phase.examples')}
            detail={t('numbers:stepOf', { current: step + 1, total: items.length })}
            value={step / items.length}
          />
          <ItemCard item={item} locale={locale} t={t} entryKey={`${lesson.id}:${item.id}`} />
          <Button
            onClick={() => {
              recordNumbersEvent(lesson.id, { type: 'example_viewed', item_id: item.id });
              if (step + 1 < items.length) setStep(step + 1);
              else goto('practice');
            }}
          >
            {t('numbers:action.next')}
          </Button>
        </div>
      </div>
    );
  }

  // --- practice, mastery, review ---------------------------------------------
  if (phase === 'practice' || phase === 'mastery' || phase === 'review') {
    return (
      <ExerciseRun
        key={`${lesson.id}:${phase}:${run}`}
        lesson={lesson}
        record={record ?? blankLessonProgress(lesson.id, new Date())}
        phase={phase}
        title={title}
        onBack={back}
        onDone={() => goto(phase === 'practice' ? 'mastery' : 'summary')}
      />
    );
  }

  // --- summary ---------------------------------------------------------------
  const current = record ?? blankLessonProgress(lesson.id, new Date());
  const complete = isComplete(current, lesson);
  const missing: string[] = [];
  if (lesson.explanation.some((s) => !current.explanation_steps_viewed.includes(s))) missing.push('explain');
  if (lesson.item_ids.some((id) => !current.examples_viewed.includes(id))) missing.push('examples');
  if (current.practice_completed_at === null) missing.push('practice');
  if (!current.mastery?.passed || lesson.item_ids.some((id) => !current.items[id]?.mastered_at)) {
    missing.push('mastery');
  }
  const mastery = current.mastery;
  return (
    <div className={styles.page}>
      <AppHeader title={title} onBack={back} />
      <div className={styles.body} data-scroll-region="numbers" data-testid="numbers-phase-summary" data-complete={complete}>
        <FeedbackState
          status={complete ? 'correct' : 'incorrect'}
          headline={t(complete ? 'numbers:summaryComplete' : 'numbers:summaryIncomplete')}
        >
          {mastery && (
            <p className={styles.note}>
              {t(
                mastery.passed
                  ? mastery.correct === mastery.total
                    ? 'numbers:masteryPerfect'
                    : 'numbers:masteryPassed'
                  : 'numbers:masteryFailed',
                { correct: mastery.correct, total: mastery.total },
              )}
            </p>
          )}
          {!complete && (
            <ul className={styles.missing}>
              {missing.map((m) => (
                <li key={m}>{t(`numbers:summaryMissing.${m}`)}</li>
              ))}
            </ul>
          )}
        </FeedbackState>

        <ul className={styles.itemList} aria-label={t('numbers:phase.examples')}>
          {items.map((item) => (
            <li key={item.id} className={styles.itemChip} lang="ko">
              {item.korean}
              <span className={styles.itemChipMeaning}>{numberMeaning(item, locale, (k) => t(k))}</span>
            </li>
          ))}
        </ul>

        {!complete && missing[0] === 'mastery' && (
          <Button onClick={() => goto('mastery')}>{t('numbers:action.retryMastery')}</Button>
        )}
        {!complete && missing[0] !== 'mastery' && (
          <Button onClick={() => goto(missing[0] as LessonPhase)}>{t('numbers:action.resume')}</Button>
        )}
        {complete && (
          <Button variant="secondary" onClick={() => goto('review')}>
            {t('numbers:action.review')}
          </Button>
        )}
        <Button variant={complete ? 'primary' : 'secondary'} onClick={back}>
          {t('numbers:action.backToCourse')}
        </Button>
      </div>
    </div>
  );
}

// --- pieces ------------------------------------------------------------------

function PhaseProgress({ label, detail, value }: { label: string; detail: string; value: number }) {
  return (
    <div className={styles.phaseHead}>
      <p className={styles.phaseLabel}>{label}</p>
      <p className={`${styles.phaseDetail} hg-numeric`}>{detail}</p>
      <ProgressBar value={value} label={`${label} — ${detail}`} size="sm" />
    </div>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

function ItemCard({ item, locale, t, entryKey }: { item: NumberItem; locale: string; t: T; entryKey: string }) {
  // The word plays itself on arrival; the button is replay.
  useEntryAudio(entryKey, item.audio.word);
  const example = exampleMeaning(item, (k) => t(k));
  return (
    <Card padding="md" className={styles.item} data-testid="numbers-example-card">
      <div className={styles.itemHead}>
        <p className={styles.korean} lang="ko">
          {item.korean}
        </p>
        <SpeakerButton audioId={item.audio.word} label={item.korean} size="lg" />
      </div>
      <p className={styles.romanization}>{item.romanization}</p>
      {item.reading && (
        <p className={styles.reading}>
          <span className={styles.label}>{t('numbers:readingLabel')}</span>{' '}
          <span lang="ko">{item.reading}</span>
        </p>
      )}
      <p className={styles.meaning}>{numberMeaning(item, locale, (k) => t(k))}</p>
      {item.example && (
        <div className={styles.example}>
          <span className={styles.label}>{t('numbers:exampleLabel')}</span>
          <span className={styles.exampleRow}>
            <span lang="ko" className={styles.exampleKorean}>
              {item.example}
            </span>
            {item.audio.example && (
              <SpeakerButton audioId={item.audio.example} label={spokenExample(item) ?? item.example} size="sm" tone="plain" />
            )}
          </span>
          {example && <span className={styles.exampleGloss}>{example}</span>}
        </div>
      )}
    </Card>
  );
}

/**
 * A run of exercises: guided practice, the mastery check, or a review.
 *
 * Remounted (by key) whenever the phase or the attempt number changes, so its
 * question list is built once per attempt and never re-shuffled mid-run.
 */
function ExerciseRun({
  lesson,
  record,
  phase,
  title,
  onBack,
  onDone,
}: {
  lesson: NumberLesson;
  record: NumbersLessonProgress;
  phase: 'practice' | 'mastery' | 'review';
  title: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['numbers', 'common', 'learning']);
  const { locale } = useLocale();
  const { recordNumbersEvent } = useLearner();

  /*
    The attempt number seeds the question order, and it is read once, when the
    run mounts. Reading it from the live record would change the seed after
    every answer — `attempts.total` grows with each one — and regenerate the
    list under the learner, which is the defect the seeded shuffle exists to
    prevent. Practice is seeded by how many attempts preceded this run; mastery
    by how many mastery checks have been taken.
  */
  const [attempt] = useState(() => (phase === 'mastery' ? record.mastery_attempts : record.attempts.total));
  const exercises = useMemo(
    () => (phase === 'mastery' ? masteryExercises(lesson, attempt) : practiceExercises(lesson, attempt)),
    [lesson, phase, attempt],
  );

  const [index, setIndex] = useState(0);
  const [intro, setIntro] = useState(true);
  const [answer, setAnswer] = useState<Attempt>({ picked: null, sequence: [], correct: null });
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const submitted = useRef(false);

  const exercise = exercises[index];
  const item = exercise ? getNumberItem(exercise.item_id) : undefined;

  // Listening questions speak on arrival; the speaker button is replay.
  const listening = exercise?.kind === 'listen_choose';
  useEntryAudio(exercise && !intro ? exercise.id : null, exercise?.prompt.audio, { enabled: listening });

  const grade = useCallback(
    (correct: boolean, picked: number | null, sequence: string[]) => {
      if (!exercise || submitted.current) return;
      submitted.current = true;
      setAnswer({ picked, sequence, correct });
      setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
      if (correct) hapticPass();
      else hapticRetry();
      if (phase === 'review') {
        recordNumbersEvent(lesson.id, { type: 'review_completed', item_id: exercise.item_id, correct });
      } else {
        recordNumbersEvent(lesson.id, {
          type: 'exercise_attempted',
          exercise_id: exercise.id,
          item_id: exercise.item_id,
          correct,
          phase,
        });
      }
    },
    [exercise, lesson.id, phase, recordNumbersEvent],
  );

  const advance = () => {
    submitted.current = false;
    setAnswer({ picked: null, sequence: [], correct: null });
    if (index + 1 < exercises.length) {
      setIndex(index + 1);
      return;
    }
    if (phase === 'practice') recordNumbersEvent(lesson.id, { type: 'practice_completed' });
    if (phase === 'mastery') {
      recordNumbersEvent(lesson.id, { type: 'mastery_completed', correct: score.correct, total: score.total });
    }
    onDone();
  };

  if (!exercise || !item) {
    // A lesson whose exercises cannot be built: `numbers:qa` fails the build on
    // this, so it is unreachable in a release, but a blank screen is never the
    // right fallback.
    return (
      <div className={styles.page}>
        <AppHeader title={title} onBack={onBack} />
        <div className={styles.body} data-scroll-region="numbers">
          <Button onClick={onDone}>{t('numbers:action.continue')}</Button>
        </div>
      </div>
    );
  }

  if (intro) {
    return (
      <div className={styles.page}>
        <AppHeader title={title} onBack={onBack} />
        <div className={styles.body} data-scroll-region="numbers" data-testid={`numbers-phase-${phase}-intro`}>
          <Card tone="warm" padding="md">
            <p className={styles.phaseLabel}>{t(`numbers:phase.${phase === 'review' ? 'practice' : phase}`)}</p>
            <p className={styles.note}>
              {phase === 'mastery'
                ? t('numbers:masteryIntro', {
                    count: exercises.length,
                    pass: Math.round(MASTERY_PASS * 100),
                  })
                : t('numbers:practiceIntro')}
            </p>
          </Card>
          <Button onClick={() => setIntro(false)}>
            {t(phase === 'mastery' ? 'numbers:action.beginMastery' : 'numbers:action.beginPractice')}
          </Button>
        </div>
      </div>
    );
  }

  const answered = answer.correct !== null;
  const optionText = (o: ExerciseOption) =>
    o.isKey ? t(`numbers:${o.text}`) : o.value !== undefined ? formatValue(o.value, locale) : o.text;
  const answerText =
    exercise.kind === 'order_parts'
      ? exercise.parts!.join(' ')
      : optionText(exercise.options[exercise.answer]!);
  const pickedOption = answer.picked !== null ? exercise.options[answer.picked] : undefined;
  /*
   * The body under the verdict — and, for most correct answers, no body at all.
   *
   * Three sources, in order of how much they know about what just happened:
   *
   * 1. the line written for the *specific* mistake, when the option the learner
   *    tapped carries a misconception;
   * 2. the item's own authored note, or the lesson's teaching line, from
   *    `feedback.incorrect`;
   * 3. after a correct answer, `feedback.correct` — which is `null` unless the
   *    item has a note, because a learner who tapped *4* under 사 and read
   *    맞았어요 has been told everything the question held.
   */
  const bodyKey = answer.correct
    ? exercise.feedback.correct
    : pickedOption?.misconception
      ? MISCONCEPTION_FEEDBACK[pickedOption.misconception] ?? exercise.feedback.incorrect
      : exercise.feedback.incorrect;
  /*
   * What the item is, for the sentences that name it.
   *
   * Only the misconception lines interpolate now — *‘사’는 4예요* is a
   * correction when a learner picked something else, and was a tautology when
   * it followed a right answer. `subject` and `object` carry the Korean
   * particle already attached, since 만은 and 하나는 are not a suffix a
   * translation string can choose for itself.
   */
  const rationaleValues = {
    korean: item.korean,
    subject: withParticle(item.korean, '은/는'),
    object: withParticle(item.korean, '을/를'),
    value: item.value !== null ? formatValue(item.value, locale) : '',
    example: item.example ?? '',
  };

  return (
    <div className={styles.page}>
      <AppHeader title={title} onBack={onBack} />
      <div className={styles.body} data-scroll-region="numbers" data-testid={`numbers-phase-${phase}`} data-exercise-kind={exercise.kind}>
        <PhaseProgress
          label={t(`numbers:phase.${phase === 'review' ? 'practice' : phase}`)}
          detail={t('numbers:questionOf', { current: index + 1, total: exercises.length })}
          value={(index + (answered ? 1 : 0)) / exercises.length}
        />

        <Prompt exercise={exercise} item={item} locale={locale} t={t} />

        {exercise.kind === 'order_parts' ? (
          <OrderParts
            exercise={exercise}
            sequence={answer.sequence}
            answered={answered}
            onChange={(seq) => {
              hapticSelection();
              if (seq.length === exercise.parts!.length) {
                grade(seq.join('') === exercise.parts!.join(''), null, seq);
              } else {
                setAnswer({ picked: null, sequence: seq, correct: null });
              }
            }}
            clearLabel={t('numbers:action.clear')}
          />
        ) : (
          <div className={styles.options} role="group" aria-label={t(`numbers:phase.${phase === 'review' ? 'practice' : phase}`)}>
            {exercise.options.map((option, i) => {
              const isAnswer = i === exercise.answer;
              const isPicked = i === answer.picked;
              const mark = !answered ? null : isAnswer ? 'correct' : isPicked ? 'incorrect' : null;
              return (
                <button
                  key={`${exercise.id}:${i}`}
                  type="button"
                  className={`${styles.option} ${
                    !answered ? '' : isAnswer ? styles.right : isPicked ? styles.wrong : styles.dimmed
                  }`}
                  disabled={answered}
                  aria-pressed={isPicked || undefined}
                  lang={option.isKey || option.value !== undefined ? undefined : 'ko'}
                  onClick={() => {
                    if (answered) return;
                    hapticSelection();
                    grade(isAnswer, i, []);
                  }}
                >
                  {mark && (
                    <span className={mark === 'correct' ? styles.markRight : styles.markWrong} aria-hidden="true">
                      {mark === 'correct' ? <CheckIcon size={16} /> : <CloseIcon size={16} />}
                    </span>
                  )}
                  {mark && (
                    <span className="hg-sr-only">
                      {t(mark === 'correct' ? 'learning:review.markCorrect' : 'learning:review.markWrong')}
                    </span>
                  )}
                  {optionText(option)}
                </button>
              );
            })}
          </div>
        )}

        {answered && (
          <>
            {/*
              The body is built first and passed only if it exists.
              
              `FeedbackState` already declines to draw its body wrapper when it
              is given nothing — but a JSX fragment is truthy whatever is inside
              it, so passing `<>{cond && …}{cond && …}</>` handed it an element
              that rendered to nothing and it drew the wrapper anyway. On a
              correct answer with no note that is an empty padded box under the
              verdict, which is the *shape* of the same defect as the sentence
              that used to fill it.
            */}
            <FeedbackState
              status={answer.correct ? 'correct' : 'incorrect'}
              headline={t(answer.correct ? 'numbers:feedback.correct' : 'numbers:feedback.incorrect')}
            >
              {answer.correct && !bodyKey ? null : (
                <>
                  {!answer.correct && (
                    <p className={styles.note}>
                      <span className={styles.label}>{t('numbers:feedback.answerWas')}</span>{' '}
                      <strong lang="ko">{answerText}</strong>
                    </p>
                  )}
                  {bodyKey && (
                    <p className={styles.rationale}>{t(`numbers:${bodyKey}`, rationaleValues)}</p>
                  )}
                </>
              )}
            </FeedbackState>
            <Button onClick={advance}>{t('numbers:action.continue')}</Button>
          </>
        )}
      </div>
    </div>
  );
}

function Prompt({ exercise, item, locale, t }: { exercise: NumbersExercise; item: NumberItem; locale: string; t: T }) {
  const p = exercise.prompt;
  let heading: string;
  let body: { text: string; lang?: string } | null = null;
  switch (exercise.kind) {
    case 'listen_choose':
      heading = t('numbers:prompt.listen');
      break;
    case 'read_choose':
      heading = t('numbers:prompt.read');
      body = { text: p.text ?? item.korean, lang: 'ko' };
      break;
    case 'choose_system':
      heading = t('numbers:prompt.chooseSystem');
      body = { text: p.text ?? item.korean, lang: 'ko' };
      break;
    case 'digits_to_korean':
      heading = t(`numbers:${p.key ?? 'prompt.digitsToKorean.both'}`);
      body = { text: formatValue(p.value ?? 0, locale) };
      break;
    case 'korean_to_digits':
      heading = t('numbers:prompt.koreanToDigits');
      body = { text: p.text ?? item.korean, lang: 'ko' };
      break;
    case 'counter_form':
      heading = t('numbers:prompt.counterForm', {
        value: p.value !== undefined ? formatValue(p.value, locale) : '',
        counter: p.text ?? '',
      });
      body = { text: p.text ?? '', lang: 'ko' };
      break;
    case 'spot_mistake':
      heading = t('numbers:prompt.spotMistake');
      break;
    case 'fill_sentence':
      heading = t('numbers:prompt.fill');
      body = { text: p.sentence ?? '', lang: 'ko' };
      break;
    case 'order_parts':
      heading = t('numbers:prompt.orderParts', { value: formatValue(p.value ?? 0, locale) });
      body = { text: formatValue(p.value ?? 0, locale) };
      break;
  }
  return (
    <Card padding="lg" className={styles.prompt}>
      <p className={styles.promptHeading}>{heading}</p>
      {body && (
        <p className={styles.promptKorean} lang={body.lang}>
          {body.text}
        </p>
      )}
      {p.audio && (
        <div className={styles.promptAudio}>
          <SpeakerButton audioId={p.audio} label={item.korean} size="lg" />
        </div>
      )}
    </Card>
  );
}

function OrderParts({
  exercise,
  sequence,
  answered,
  onChange,
  clearLabel,
}: {
  exercise: NumbersExercise;
  sequence: string[];
  answered: boolean;
  onChange: (seq: string[]) => void;
  clearLabel: string;
}) {
  // Options are parts; each may be used once. Tapped parts fill the slots in
  // order, and the last tap grades the whole sequence.
  const used = new Set(sequence.map((_, i) => i));
  const usedIndexes = new Set<number>();
  for (const part of sequence) {
    const idx = exercise.options.findIndex((o, i) => o.text === part && !usedIndexes.has(i));
    if (idx >= 0) usedIndexes.add(idx);
  }
  void used;
  return (
    <div className={styles.orderWrap}>
      <div className={styles.slots} aria-live="polite" lang="ko">
        {exercise.parts!.map((_, i) => (
          <span key={i} className={`${styles.slot} ${sequence[i] ? styles.slotFilled : ''}`}>
            {sequence[i] ?? ''}
          </span>
        ))}
      </div>
      <div className={styles.parts} role="group">
        {exercise.options.map((option, i) => (
          <button
            key={`${exercise.id}:${i}`}
            type="button"
            lang="ko"
            className={`${styles.option} ${styles.part} ${usedIndexes.has(i) ? styles.dimmed : ''}`}
            disabled={answered || usedIndexes.has(i)}
            onClick={() => onChange([...sequence, option.text])}
          >
            {option.text}
          </button>
        ))}
      </div>
      {!answered && sequence.length > 0 && (
        <Button variant="secondary" size="sm" onClick={() => onChange([])}>
          {clearLabel}
        </Button>
      )}
    </div>
  );
}
