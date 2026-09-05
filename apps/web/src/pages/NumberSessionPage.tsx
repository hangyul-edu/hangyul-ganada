import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { NumberItem, NumberLesson, NumbersLessonProgress } from '@hangyul-ganada/shared-types';

import { NumberBreakdown } from '../features/numbers/NumberBreakdown';
import { getNumberItem, getNumberLesson, getNumberModule, numberLessonItems, spokenExample } from '../data/numbers';
import {
  type LessonPhase,
  passMark,
  blankLessonProgress,
  isComplete,
  isReviewDue,
  lessonStatus,
  resumePhase,
} from '../domain/numbersProgress';
import {
  type ExerciseOption,
  type NumbersExercise,
  MEANING_PROMPT_KEY,
  masteryExercises,
  practiceExercises,
} from '../features/numbers/exercises';
import { exampleMeaning, formatValue, numberMeaning } from '../features/numbers/meaning';
import { useLocale } from '../i18n';
import { usePronunciation } from '../audio/PronunciationContext';
import { useEntryAudio } from '../audio/useEntryAudio';
import { hapticPass, hapticRetry, hapticSelection } from '../native/haptics';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { useLeaveGuard } from '../ui/backNavigation';
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
 *
 * ## A learner who cannot hear can finish the course
 *
 * A `listen_choose` question's whole stimulus is a clip — the prompt has an
 * audio id and deliberately no text, because printing the word would be
 * printing the answer. Every one of the nineteen lessons lists that kind, and
 * a mastery check is what completes a lesson, so a learner who could not hear
 * had no route through the Numbers course: not a harder route, none.
 *
 * `settings.sound_free` has existed since §36 and has always been honoured by
 * the review scheduler. This screen asks it now, and asks the player as well —
 * a build with no clips in it, or a manifest that failed to load, is the same
 * situation arriving from the other side — and builds the run without the
 * heard-only kind. Every lesson still asks every item; see `numbers:qa` §11.
 *
 * The decision is taken once, when the run mounts, and held for the run: a
 * manifest that finishes loading half-way through a mastery check must not
 * change the questions under the learner or the count printed on the way in.
 *
 * That is the accommodation for a learner the app *knows* about. The second one
 * is for the learner who meets a listening question anyway — because the
 * setting is unreachable in the interface, or because the phone is somewhere
 * quiet, or because the clip simply did not play. Under the prompt there is a
 * **Can't use audio?**, and pressing it swaps the clip for an equivalent visual
 * question: same item, same options, same answer, same scoring. The letter side
 * did this first and its note is the argument — a *setting* is remembered, and
 * the cost of a remembered setting is that nobody who has not already found it
 * can turn it on. See `soundFreeFor` in `features/numbers/exercises.ts`.
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
      const i = lesson.explanation.findIndex(
        (s) => !(record?.explanation_steps_viewed ?? []).includes(s.text),
      );
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
        <AppHeader title={lesson ? t(`numbers:${lesson.title}`) : t('numbers:title')} />
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
        <AppHeader title={title} />
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
    const current = steps[Math.min(step, steps.length - 1)]!;
    const shown = (current.show ?? [])
      .map((id) => getNumberItem(id))
      .filter((found): found is NumberItem => found !== undefined);
    return (
      <div className={styles.page}>
        <AppHeader title={title} />
        <div className={styles.body} data-scroll-region="numbers" data-testid="numbers-phase-explain">
          <PhaseProgress
            label={t('numbers:phase.explain')}
            detail={t('numbers:stepOf', { current: step + 1, total: steps.length })}
            value={step / steps.length}
          />
          {/*
            The drawing first, then the sentence.

            A step whose subject is how a number is *built* leads with the
            number: three cards for 11, 20 and 35, each one numeral, sound,
            parts, whole. The sentence under them is a caption on what is
            already visible rather than the whole of the teaching, which is what
            it had to be when it was carrying three worked examples and three
            hyphenated pseudo-spellings on its own. See `NumberBreakdown`.
          */}
          {shown.map((item) => (
            <NumberBreakdown key={item.id} item={item} />
          ))}
          <Card padding="lg" className={styles.explain}>
            <p className={styles.explainText}>{t(`numbers:${current.text}`)}</p>
          </Card>
          <Button
            onClick={() => {
              recordNumbersEvent(lesson.id, { type: 'explanation_viewed', step: current.text });
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
        <AppHeader title={title} />
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
        
        onDone={() => goto(phase === 'practice' ? 'mastery' : 'summary')}
      />
    );
  }

  // --- summary ---------------------------------------------------------------
  const current = record ?? blankLessonProgress(lesson.id, new Date());
  const complete = isComplete(current, lesson);
  const mastery = current.mastery;
  /*
   * What is left, named by what it actually is.
   *
   * The final check and *every item answered at least once* used to be one
   * line, `summaryMissing.mastery`, reading 마무리 확인 통과하기. A learner who
   * had just been told 마무리 확인 통과 — 10문제 중 9개 then read *pass the
   * final check* underneath it, and the two sentences were about different
   * conditions with no way to tell them apart. They are two entries now.
   */
  const missing: string[] = [];
  if (lesson.explanation.some((s) => !current.explanation_steps_viewed.includes(s.text)))
    missing.push('explain');
  if (lesson.item_ids.some((id) => !current.examples_viewed.includes(id))) missing.push('examples');
  if (current.practice_completed_at === null) missing.push('practice');
  if (!mastery?.passed) missing.push('mastery');
  else if (lesson.item_ids.some((id) => !current.items[id]?.mastered_at)) missing.push('everyItem');
  /*
   * And the one line that is not drawn: *마무리 확인 풀기* under a score that
   * already says the check was taken and missed. `masteryFailed` carries the
   * score and the mark needed, which is the whole of what a learner has to
   * know, so the list entry would be the third sentence about one fact.
   */
  const listed = missing.filter((what) => !(what === 'mastery' && mastery));
  const retryable = missing[0] === 'mastery' || missing[0] === 'everyItem';
  return (
    <div className={styles.page}>
      <AppHeader title={title} />
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
                {
                  correct: mastery.correct,
                  total: mastery.total,
                  pass: passMark(mastery.total),
                },
              )}
            </p>
          )}
          {!complete && listed.length > 0 && (
            <ul className={styles.missing}>
              {listed.map((m) => (
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

        {!complete && retryable && (
          <Button onClick={() => goto('mastery')}>{t('numbers:action.retryMastery')}</Button>
        )}
        {!complete && !retryable && (
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
          {/*
            *이렇게 써요* is two sentences in Korean — this is how you write it,
            and this is how you use it. On 유월 육일 a learner reads the first,
            and the card exists to teach the second: that June is *said* 유월 and
            never 육월. The heading is chosen from the item's declared
            `example_kind` so a pronunciation card cannot be labelled a spelling
            rule, and `numbers:qa` fails an item whose kind and content disagree.
          */}
          <span className={styles.label}>
            {t(`numbers:exampleLabel.${item.example_kind ?? 'example'}`)}
          </span>
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
  onDone,
}: {
  lesson: NumberLesson;
  record: NumbersLessonProgress;
  phase: 'practice' | 'mastery' | 'review';
  title: string;
  onDone: () => void;
}) {
  const { t } = useTranslation(['numbers', 'common', 'learning']);
  const { locale } = useLocale();
  const { state, recordNumbersEvent } = useLearner();
  const settings = state.settings;

  /*
    The attempt number seeds the question order, and it is read once, when the
    run mounts. Reading it from the live record would change the seed after
    every answer — `attempts.total` grows with each one — and regenerate the
    list under the learner, which is the defect the seeded shuffle exists to
    prevent. Practice is seeded by how many attempts preceded this run; mastery
    by how many mastery checks have been taken.
  */
  const [attempt] = useState(() => (phase === 'mastery' ? record.mastery_attempts : record.attempts.total));

  /*
    Heard-only questions, or not — decided once, on the same terms and for the
    same reason as the attempt number above.

    `ready && !available` rather than `!available`: before the manifest has been
    read the player reports nothing, and treating "not answered yet" as "no
    audio" would quietly drop the listening questions from a run that was about
    to have sound. A learner who has `sound_free` set never waits for that.
  */
  const audio = usePronunciation();
  const [soundFree] = useState(
    () => settings.sound_free || (audio.ready && !audio.available),
  );
  const exercises = useMemo(
    () =>
      phase === 'mastery'
        ? masteryExercises(lesson, attempt, { soundFree })
        : practiceExercises(lesson, attempt, { soundFree }),
    [lesson, phase, attempt, soundFree],
  );

  const [index, setIndex] = useState(0);
  const [intro, setIntro] = useState(true);
  /*
    Per question, and reset with it — a choice about the question in front of
    the learner rather than a mode they have to remember they are in. One way
    only: once pressed the question stays visual for as long as it is on screen,
    because a way back would make it a toggle, and a toggle on a question is one
    more thing to decide about before answering.
  */
  const [askedVisually, setAskedVisually] = useState(false);
  useEffect(() => setAskedVisually(false), [index]);
  const [answer, setAnswer] = useState<Attempt>({ picked: null, sequence: [], correct: null });
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const submitted = useRef(false);

  /*
   * A mastery check abandoned part-way is a mastery check that did not happen.
   *
   * Every practice answer is written the moment it is graded, so leaving
   * practice or a review loses nothing and asks nothing. Mastery is the one run
   * whose *verdict* — `mastery_completed`, with the score that decides whether
   * the lesson passes — is only written when the last question is answered.
   * Walking out at question five of eight throws that away, so this is where
   * the policy's leave confirmation earns its interruption. See
   * `ui/routePolicy.ts`.
   */
  useLeaveGuard(phase === 'mastery' && score.total > 0);

  const exercise = exercises[index];
  const item = exercise ? getNumberItem(exercise.item_id) : undefined;

  // Listening questions speak on arrival; the speaker button is replay.
  const listening = exercise?.kind === 'listen_choose';
  const visual = listening && askedVisually && exercise?.soundFree !== undefined;
  useEntryAudio(exercise && !intro ? exercise.id : null, exercise?.prompt.audio, {
    enabled: listening && !visual,
  });

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
        <AppHeader title={title} />
        <div className={styles.body} data-scroll-region="numbers">
          <Button onClick={onDone}>{t('numbers:action.continue')}</Button>
        </div>
      </div>
    );
  }

  if (intro) {
    return (
      <div className={styles.page}>
        <AppHeader title={title} />
        <div className={styles.body} data-scroll-region="numbers" data-testid={`numbers-phase-${phase}-intro`}>
          <Card tone="warm" padding="md">
            <p className={styles.phaseLabel}>{t(`numbers:phase.${phase === 'review' ? 'practice' : phase}`)}</p>
            <p className={styles.note}>
              {phase === 'mastery'
                ? t('numbers:masteryIntro', {
                    count: exercises.length,
                    pass: passMark(exercises.length),
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
  return (
    <div className={styles.page}>
      <AppHeader title={title} />
      <div className={styles.body} data-scroll-region="numbers" data-testid={`numbers-phase-${phase}`} data-exercise-kind={exercise.kind} data-question-type={exercise.question_type}>
        <PhaseProgress
          label={t(`numbers:phase.${phase === 'review' ? 'practice' : phase}`)}
          detail={t('numbers:questionOf', { current: index + 1, total: exercises.length })}
          value={(index + (answered ? 1 : 0)) / exercises.length}
        />

        <Prompt exercise={exercise} item={item} locale={locale} t={t} visual={visual} />

        {/*
          The way out of a question whose whole prompt is a sound.

          Offered only while the question is unanswered and only where an honest
          substitution exists — `soundFreeFor` returns nothing rather than
          inventing a worse question, and the button then is not drawn.
        */}
        {listening && !visual && !answered && exercise.soundFree && (
          <button
            type="button"
            className={styles.soundFreeSwitch}
            data-testid="numbers-sound-free"
            onClick={() => setAskedVisually(true)}
          >
            {t('learning:review.cannotUseAudio')}
          </button>
        )}

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
              The verdict, and nothing under it.

              This box used to carry a sentence: the item's authored note, the
              lesson's teaching line, or one written for the misconception the
              tapped distractor carried. Four passes were spent trimming those
              — the generated *사는 4예요*, then *정답은 8*, then the
              counting-word line under questions about numerals — and each pass
              removed the worst of them and left the rest.

              None of them is here now, because the screen has already said what
              a learner needs: the option they tapped is marked with a cross,
              the right one with a tick, and both marks carry their own
              screen-reader text on the option itself. The teaching is in the
              explanation steps, which are read before the exercise and are
              recorded as evidence towards completing the lesson.

              `FeedbackState` draws no wrapper when it is given nothing, and it
              is given nothing here rather than an empty fragment — a JSX
              fragment is truthy whatever is inside it, and an empty padded box
              under the verdict is the shape of the same defect as the sentence
              that used to fill it.
            */}
            <FeedbackState
              status={answer.correct ? 'correct' : 'incorrect'}
              headline={t(answer.correct ? 'numbers:feedback.correct' : 'numbers:feedback.incorrect')}
            />
            <Button onClick={advance}>{t('numbers:action.continue')}</Button>
          </>
        )}
      </div>
    </div>
  );
}

function Prompt({
  exercise,
  item,
  locale,
  t,
  visual = false,
}: {
  exercise: NumbersExercise;
  item: NumberItem;
  locale: string;
  t: T;
  /** Draw the listening question's visual substitute instead of its clip. */
  visual?: boolean;
}) {
  const p = exercise.prompt;
  let heading: string;
  let body: { text: string; lang?: string } | null = null;

  /*
   * The substitution, before the switch rather than inside it.
   *
   * A `listenAndChoose` that is being asked visually is not a different
   * question type — the options, the answer, the grading and the evidence are
   * identical — so it does not get a branch in the table below, which is the
   * table that decides *what is being asked*. It gets a different stimulus.
   */
  if (visual && exercise.soundFree) {
    const variant = exercise.soundFree;
    return (
      <Card padding="lg" className={styles.prompt}>
        <p className={styles.promptHeading} data-testid="numbers-prompt">
          {t(`numbers:${variant.promptKey}`)}
        </p>
        <p className={styles.promptKorean} data-testid="numbers-prompt-visual">
          {variant.value !== undefined
            ? formatValue(variant.value, locale)
            : t(`numbers:${variant.glossKey}`)}
        </p>
      </Card>
    );
  }
  /*
   * The instruction comes from what the question *asks*, never from how it was
   * built and never from what the options happen to say.
   *
   * `spot_mistake` used to be headed *어느 쪽이 맞을까요?* — which one is right?
   * — over an option list whose answer is the one that is wrong, so the
   * instruction and the grader disagreed and the learner lost. `read_choose`
   * used to be headed *이건 무슨 뜻일까요?* whether its options were meanings or
   * whole grammar rules, so the pitfalls lesson asked what 한 개 *meant* and
   * offered four sentences about spacing.
   *
   * Switching on `question_type` is what makes both impossible: the type is
   * resolved once, in the builder, from declared content metadata, and there is
   * no branch here that can be reached by a question of a different kind.
   */
  switch (exercise.question_type) {
    case 'listenAndChoose':
      heading = t('numbers:prompt.listenAndChoose');
      break;
    case 'chooseMeaning':
      /*
       * The instruction names what is being asked for. *무슨 뜻일까요?* over
       * four prices told the learner the question was about definitions; the
       * key comes from the answer's own domain now. See `MEANING_PROMPT_KEY`.
       */
      heading = t(`numbers:${MEANING_PROMPT_KEY[exercise.schema.answerDomain] ?? 'prompt.meaning.definition'}`);
      body = { text: p.text ?? item.korean, lang: 'ko' };
      break;
    case 'chooseCorrectExplanation':
      heading = t('numbers:prompt.chooseCorrectExplanation');
      body = { text: p.text ?? item.korean, lang: 'ko' };
      break;
    case 'chooseSystem':
      heading = t('numbers:prompt.chooseSystem');
      body = { text: p.text ?? item.korean, lang: 'ko' };
      break;
    case 'sayTheNumber':
      heading = t(`numbers:${p.key ?? 'prompt.digitsToKorean.both'}`);
      body = { text: formatValue(p.value ?? 0, locale) };
      break;
    case 'writeTheDigits':
      heading = t('numbers:prompt.koreanToDigits');
      body = { text: p.text ?? item.korean, lang: 'ko' };
      break;
    case 'chooseCounterForm':
      heading = t('numbers:prompt.counterForm', {
        value: p.value !== undefined ? formatValue(p.value, locale) : '',
        counter: p.text ?? '',
      });
      body = { text: p.text ?? '', lang: 'ko' };
      break;
    case 'findIncorrectExpression':
      heading = t('numbers:prompt.findIncorrectExpression');
      break;
    case 'fillTheBlank':
      heading = t('numbers:prompt.fill');
      body = { text: p.sentence ?? '', lang: 'ko' };
      break;
    case 'orderTheParts':
      heading = t('numbers:prompt.orderParts', { value: formatValue(p.value ?? 0, locale) });
      body = { text: formatValue(p.value ?? 0, locale) };
      break;
  }
  return (
    <Card padding="lg" className={styles.prompt}>
      <p className={styles.promptHeading} data-testid="numbers-prompt">
        {heading}
      </p>
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
