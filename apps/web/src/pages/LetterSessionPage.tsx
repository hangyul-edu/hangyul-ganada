import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { EvaluationResult, Stroke } from '@hangyul-ganada/handwriting-core';
import type { HangulCharacter } from '@hangyul-ganada/shared-types';

import { usePronunciation } from '../audio/PronunciationContext';
import { CURRICULUM_UNITS, getLesson, getLessonCharacters } from '../data/characters';
import { getFont } from '../data/fonts';
import { CharacterIntro } from '../features/learning/CharacterIntro';
import { RecognitionStep } from '../features/learning/RecognitionStep';
import { UnitIntro } from '../features/learning/UnitIntro';
import { canRecognise } from '../features/learning/lookAlikes';
import { SessionCompleteModal } from '../features/session/SessionCompleteModal';
import { PracticeCanvasCard } from '../features/writing/PracticeCanvasCard';
import type { GuideLevel } from '../features/writing/guide';
import { gradingFor } from '../features/writing/useEvaluator';
import {
  feedbackFor,
  scoreBreakdownParams,
  strokeOrderNotes,
  type StrokeOrderNote,
} from '../features/writing/feedback';
import { StrokeOrder } from '../ui/StrokeOrder';
import { useStudyClock } from '../features/session/useStudyClock';
import { resolveContent, useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { FocusScreen } from '../ui/FocusScreen';
import { Badge } from '../ui/Chip';
import { FeedbackState } from '../ui/FeedbackState';
import { ProgressBar } from '../ui/Progress';
import { SpeakerButton } from '../ui/SpeakerButton';
import { StepTrail } from '../ui/StepTrail';
import { NotFoundBody } from './NotFoundPage';
import styles from './SessionPage.module.css';

/**
 * One letter lesson, as a loop rather than a screen.
 *
 * ```
 * meet it ─▶ hear it ─▶ watch it written ─▶ trace ─▶ practise ─▶ read it ─▶ next
 *                                            full     lighter      ▲
 *                                            guide     guide       │
 *                                              ▲         │         │
 *                                              └─ retry ─┴─────────┘
 * ```
 *
 * Every letter walks the same path, and the path is the lesson. Each step
 * proves something the one before it did not: watching shows where the pen
 * starts and which way it moves, tracing turns that into a movement of the
 * learner's own hand, practising takes most of the model away, and reading it
 * back among its look-alikes is the thing they actually came for.
 *
 * ## Both writing steps show the character
 *
 * There used to be a third, with an empty box: write it from memory. It is
 * gone. Someone who met their first Korean letter ninety seconds earlier cannot
 * recall a shape they have never once recalled, and asking them to was not a
 * test of learning — it was a wall placed where the lesson should have been.
 * The second step is now the same box with the model much lighter: still enough
 * to write by, light enough that the learner is doing the work.
 *
 * ## What each step is worth
 *
 * ```
 * meet             nothing — seeing a letter is not learning it
 * hear             the listening rung
 * watch            the demonstration rung (the animation has to finish)
 * trace            a pass over the full guide
 * practise         a pass over the light guide
 * read             the reading pass
 * ```
 *
 * A letter is `learned` when it has all of them. See `domain/mastery.ts`.
 *
 * Focused practice skips the tracing step and starts on the light guide, for a
 * learner who finds tracing slow. It never removes the guide. Reading is
 * skipped for the handful of characters with no plausible look-alikes, because
 * a multiple-choice question with three obviously-wrong answers teaches nothing.
 */
type Step = 'trace' | 'practise' | 'read';

/** How much of the reference glyph each writing step leaves on screen. */
const STEP_GUIDE: Record<Exclude<Step, 'read'>, GuideLevel> = {
  trace: 'full',
  practise: 'light',
};

interface StepState {
  step: Step;
  status: 'idle' | 'correct' | 'incorrect';
  result: EvaluationResult | null;
}

export function LetterSessionPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const {
    state,
    recordAttempt,
    recordHeard,
    recordDemoSeen,
    recordIntroduced,
    recordRecognition,
    progressFor,
    startSession,
    completeSession,
  } = useLearner();
  const { t } = useTranslation(['learning', 'handwriting', 'common']);
  const { locale } = useLocale();
  const { preload } = usePronunciation();

  const lesson = lessonId ? getLesson(lessonId) : undefined;
  const characters = useMemo(() => (lesson ? getLessonCharacters(lesson) : []), [lesson]);
  const unit = lesson ? CURRICULUM_UNITS.find((u) => u.id === `unit-${lesson.unit}`) : undefined;

  const startsWithTrace = state.settings.practice_style === 'guided';
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'unit' | 'intro' | 'practice'>(() =>
    unit?.has_intro && unit.lesson_ids[0] === lessonId ? 'unit' : 'intro',
  );
  const [stepState, setStepState] = useState<StepState>({
    step: startsWithTrace ? 'trace' : 'practise',
    status: 'idle',
    result: null,
  });
  const [showDetail, setShowDetail] = useState(false);
  const [orderNotes, setOrderNotes] = useState<StrokeOrderNote[]>([]);

  // Time on this screen is study time; time on the unit introduction is not.
  useStudyClock(phase === 'practice');
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);
  const sessionId = useRef<string | null>(null);

  const font = getFont(state.settings.selected_font_id);
  const current: HangulCharacter | undefined = characters[index];
  // `true`: the recognition step asks from the clip, so the question only
  // exists if there are three wrong answers that do not *sound* like the right
  // one. See `lookAlikes.ts`.
  const recognitionRequired = current ? canRecognise(current.character, true) : false;
  const demoSeen = current
    ? (progressFor('character', current.character)?.demo_seen ?? false)
    : false;

  useEffect(() => {
    if (!lesson || sessionId.current) return;
    sessionId.current = startSession('letters', lesson.id, characters.length);
  }, [lesson, characters.length, startSession]);

  // Warm the next two letters' audio while the learner is still on this one.
  useEffect(() => {
    preload(
      characters
        .slice(index, index + 3)
        .flatMap((character) => [character.audio.sound, character.audio.name]),
    );
  }, [preload, characters, index]);

  useEffect(() => {
    if (current) recordIntroduced('character', current.character);
  }, [current, recordIntroduced]);

  const steps = useMemo<Step[]>(() => {
    const list: Step[] = startsWithTrace ? ['trace', 'practise'] : ['practise'];
    if (recognitionRequired) list.push('read');
    return list;
  }, [startsWithTrace, recognitionRequired]);

  const advanceCharacter = useCallback(() => {
    setShowDetail(false);
    if (index + 1 >= characters.length) {
      if (sessionId.current) completeSession(sessionId.current);
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setPhase('intro');
    setStepState({ step: steps[0]!, status: 'idle', result: null });
  }, [index, characters.length, completeSession, steps]);

  const advanceStep = useCallback(() => {
    setShowDetail(false);
    const position = steps.indexOf(stepState.step);
    const next = steps[position + 1];
    if (!next) {
      advanceCharacter();
      return;
    }
    setStepState({ step: next, status: 'idle', result: null });
    setOrderNotes([]);
  }, [steps, stepState.step, advanceCharacter]);

  const handleEvaluated = useCallback(
    (evaluation: EvaluationResult, drawn: Stroke[]) => {
      if (!current) return;
      // Stroke order is computed here, from the strokes as they were made, and
      // kept beside the verdict rather than folded into it. It is shown after
      // the result and changes nothing about it — see `strokeOrderNotes`.
      setOrderNotes(strokeOrderNotes(drawn, current.strokes));
      setStepState((prev) => ({
        ...prev,
        status: evaluation.passed ? 'correct' : 'incorrect',
        result: evaluation,
      }));
      recordAttempt({
        kind: 'character',
        item_key: current.character,
        session_id: sessionId.current,
        mode: stepState.step === 'practise' ? ('practice' as const) : ('trace' as const),
        font_id: font.id,
        evaluator_id: 'geometry-v1',
        recognition_required: recognitionRequired,
        result: {
          passed: evaluation.passed,
          score: evaluation.score,
          mismatch_ratio: evaluation.mismatchRatio,
          outside_stroke_ratio: evaluation.outsideStrokeRatio,
          missing_coverage_ratio: evaluation.missingCoverageRatio,
          reason: evaluation.reason,
        },
      });
      // The lesson's own counter: how many letters this sitting carried all
      // the way to the light-guide pass, which is the last writing rung.
      if (evaluation.passed && stepState.step === 'practise') {
        setCompleted((prev) => new Set(prev).add(current.character));
      }
    },
    [current, recordAttempt, font.id, stepState.step, recognitionRequired],
  );

  /** Fix the attempt that is already on the canvas. */
  const retry = () => {
    setStepState((prev) => ({ ...prev, status: 'idle', result: null }));
    setShowDetail(false);
    setOrderNotes([]);
  };

  if (!lesson || !current) {
    return <NotFoundBody messageKey="notFound.lesson" />;
  }

  const lessonTitle = resolveContent(lesson.translations, locale).value.title;
  const copy = resolveContent(current.translations, locale);
  const feedback = stepState.result ? feedbackFor(stepState.result, current.character) : null;
  // The bar measures this session: how many of the lesson's letters have been
  // finished, plus how far through the current letter's steps the learner is.
  const stepShare = phase === 'practice' ? (steps.indexOf(stepState.step) + 1) / (steps.length + 1) : 0;
  const progress = (index + stepShare) / characters.length;

  /*
   * The one action that leaves this screen, in the layout's own footer row.
   *
   * Only the two screens that have exactly one — the unit explainer and meeting
   * the letter. The writing steps keep Check beside the canvas it is checking,
   * and their feedback card owns what comes after a verdict; pinning either to
   * the foot would put the primary action a screen away from the thing it acts
   * on. `FocusScreen` reserves the system inset for the scroll region in that
   * case, so neither can reach the navigation bar either way.
   */
  const footer =
    phase === 'unit' && unit ? (
      <Button size="lg" fullWidth onClick={() => setPhase('intro')}>
        {t('learning:units.continue')}
      </Button>
    ) : phase === 'intro' ? (
      <Button
        size="lg"
        fullWidth
        onClick={() => {
          setPhase('practice');
          setStepState({ step: steps[0]!, status: 'idle', result: null });
        }}
      >
        {t('learning:session.startTrace')}
      </Button>
    ) : null;

  return (
    <FocusScreen
      // The letter, and the step within it — the unit explainer, meeting it,
      // tracing, practising, reading. Each is a screen of its own to a learner.
      resetKey={`${lessonId ?? ''}:${index}:${phase}:${stepState.step}`}
      header={
        <>
          <AppHeader
            title={lessonTitle}
            onBack={() => navigate('/letters')}
            action={
              <Badge tone="primary" filled numeric>
                {t('learning:session.counter', { current: index + 1, total: characters.length })}
              </Badge>
            }
            transparent
          />
          <div className={styles.progressRow}>
            <ProgressBar
              value={progress}
              label={t('common:progress.lesson', { name: lessonTitle })}
            />
          </div>
        </>
      }
      footer={footer}
    >
      <div className={styles.body}>
        {phase === 'unit' && unit ? (
          <UnitIntro unit={unit} />
        ) : phase === 'intro' ? (
          <CharacterIntro
            character={current}
            onHeard={() => recordHeard('character', current.character, recognitionRequired)}
            onDemoWatched={() => recordDemoSeen('character', current.character, recognitionRequired)}
          />
        ) : stepState.step === 'read' ? (
          <RecognitionStep
            character={current}
            fontFamily={font.font_family}
            seed={index}
            onAnswered={(correct) => recordRecognition('character', current.character, correct)}
            onContinue={advanceCharacter}
          />
        ) : (
          <>
            <header className={styles.prompt}>
              <StepTrail
                steps={steps.map((step) => t(`learning:steps.${step}`))}
                current={steps.indexOf(stepState.step)}
                label={t('learning:steps.label')}
              />
              {/* One short sentence saying what to do now, in the voice of a
                  teacher rather than a state machine. */}
              <p className={styles.promptLabel}>
                {t(`learning:session.prompt.${stepState.step}`)}
              </p>
              <div className={styles.promptChar}>
                <span className={styles.promptGlyph} style={{ fontFamily: font.font_family }} lang="ko">
                  {current.character}
                </span>
                <span className={styles.promptRoman}>{current.romanization}</span>
                <SpeakerButton
                  audioId={current.audio.sound}
                  label={current.sound_example ?? current.character}
                  size="md"
                  onPlayed={() => recordHeard('character', current.character, recognitionRequired)}
                />
              </div>
            </header>

            <PracticeCanvasCard
              key={`${current.character}-${stepState.step}`}
              character={current.character}
              fontFamily={font.font_family}
              fontWeight={font.weight}
              grading={gradingFor(font)}
              guide={STEP_GUIDE[stepState.step as Exclude<Step, 'read'>]}
              showGrid={state.settings.show_grid}
              showCenterCrosshair={state.settings.show_center_crosshair}
              status={stepState.status}
              locked={stepState.status === 'correct'}
              resultShown={stepState.status !== 'idle'}
              onEvaluated={handleEvaluated}
            />

            {/*
              Under the pen, not over it.

              This screen has one job — write the character — and the
              demonstration used to sit between the learner and the place they
              could do it. On a 667pt phone that put the canvas below the fold:
              the step opened on an animation, and writing began with a scroll.

              It is still here, because a learner who loses their place
              mid-stroke needs it without leaving the lesson. It is just no
              longer in the way of the thing it is teaching. The pronunciation
              note came down with it for the same reason: it is worth reading
              and it is not worth a scroll.
            */}
            {stepState.status === 'idle' && (
              <section className={styles.help} aria-labelledby="stroke-help-heading">
                <h2 id="stroke-help-heading" className={styles.helpHeading}>
                  {t('handwriting:strokeOrder.heading')}
                </h2>
                <StrokeOrder
                  character={current.character}
                  size={152}
                  /*
                    Plays by itself for a learner who has not watched it yet.
                    The introduction card autoplays it too, but someone who
                    taps straight through to the pen would otherwise never see
                    it. Once it has been watched, it sits quietly with its
                    Watch again button.
                  */
                  autoPlay={!demoSeen}
                  onWatched={() =>
                    recordDemoSeen('character', current.character, recognitionRequired)
                  }
                />
                <p className={styles.promptHint}>{copy.value.pronunciation_hint}</p>
              </section>
            )}

            {feedback && stepState.result && stepState.status !== 'idle' && (
              <FeedbackState
                status={stepState.status === 'correct' ? 'correct' : 'incorrect'}
                headline={t(`handwriting:${feedback.headlineKey}`)}
                actions={
                  stepState.status === 'correct' ? (
                    <Button size="md" onClick={advanceStep}>
                      {nextLabel(t, steps, stepState.step, index + 1 >= characters.length)}
                    </Button>
                  ) : (
                    <>
                      <Button size="md" variant="ghost" onClick={() => setShowDetail((v) => !v)}>
                        {showDetail
                          ? t('handwriting:feedback.hideDetails')
                          : t('handwriting:feedback.showDetails')}
                      </Button>
                      <Button size="md" onClick={retry}>
                        {t('handwriting:feedback.retry')}
                      </Button>
                    </>
                  )
                }
              >
                <p>{t(`handwriting:${feedback.detailKey}`, feedback.detailParams)}</p>
                {orderNotes.length > 0 && (
                  <div className={styles.orderNotes}>
                    <p className={styles.orderNotesHeading}>
                      {t('handwriting:strokeOrder.notesHeading')}
                    </p>
                    <ul>
                      {orderNotes.map((note) => (
                        <li key={note.key}>
                          {t(`handwriting:${note.key}`, {
                            ...note.params,
                            ...(note.params?.corner
                              ? {
                                  corner: t(
                                    `handwriting:strokeOrder.corners.${String(note.params.corner)}`,
                                  ),
                                }
                              : {}),
                          })}
                        </li>
                      ))}
                    </ul>
                    <p className={styles.orderNotesFooter}>
                      {t('handwriting:strokeOrder.notesFooter')}
                    </p>
                  </div>
                )}
                {showDetail && (
                  <p className={styles.breakdown}>
                    {t('handwriting:feedback.breakdown', scoreBreakdownParams(stepState.result))}
                  </p>
                )}
              </FeedbackState>
            )}

            {stepState.status === 'idle' && (
              <button type="button" className={styles.skip} onClick={advanceCharacter}>
                {t('learning:session.skip')}
              </button>
            )}
          </>
        )}
      </div>

      <SessionCompleteModal
        open={finished}
        onClose={() => navigate('/letters')}
        onContinue={() => navigate('/letters')}
        title={t('learning:complete.title')}
        detail={t('learning:complete.letters', { count: completed.size, lesson: lessonTitle })}
        passed={completed.size}
        total={characters.length}
      />
    </FocusScreen>
  );
}

/**
 * The label on the button that leaves a finished step.
 *
 * Names the next thing rather than saying "Next": a learner should know what
 * they are agreeing to before they press it.
 */
function nextLabel(
  t: (key: string) => string,
  steps: Step[],
  current: Step,
  lastCharacter: boolean,
): string {
  const next = steps[steps.indexOf(current) + 1];
  if (next === 'practise') return t('learning:session.nowPractise');
  if (next === 'read') return t('learning:session.nowRead');
  return lastCharacter ? t('learning:session.finish') : t('learning:session.next');
}
