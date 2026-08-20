import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { requestPersistence } from '../storage/capability';
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
import { letterCopy } from '../data/letterCopy';
import styles from './SessionPage.module.css';

/**
 * One letter lesson, as a loop rather than a screen.
 *
 * ```
 * meet it ─▶ hear it ─▶ watch it written ─▶ write it ─▶ read it ─▶ next
 *                                             over a       ▲
 *                                             guide        │
 *                                               │          │
 *                                               └─ retry ──┘
 * ```
 *
 * Every letter walks the same path, and the path is the lesson. Each step
 * proves something the one before it did not: watching shows where the pen
 * starts and which way it moves, writing turns that into a movement of the
 * learner's own hand, and reading it back among its look-alikes is the thing
 * they actually came for.
 *
 * ## One writing step, and it shows the character
 *
 * There used to be three. The last was an empty box — write it from memory —
 * and it went first: someone who met their first Korean letter ninety seconds
 * earlier cannot recall a shape they have never once recalled, and asking them
 * to was not a test of learning but a wall placed where the lesson should have
 * been.
 *
 * Then there were two, the same box twice with a fainter model the second time,
 * and that has gone too. It was never a second skill. It asked for the
 * identical movement with less ink on the paper, so the only thing it could
 * measure was whether the learner would do it twice — and for someone facing
 * forty letters the answer is a lesson twice as long for the same learning. It
 * is not replaced by anything: one guided attempt is the step.
 *
 * There is no setting attached to what is left. There used to be one — *Guided*
 * or *Focused*, full model or fainter model — and it asked a learner four
 * minutes into Hangul to decide how much help they needed before they had tried
 * once. The model is always there and always the same. See `writing/guide.ts`.
 *
 * ## What each step is worth
 *
 * ```
 * meet             nothing — seeing a letter is not learning it
 * hear             the listening rung
 * watch            the demonstration rung (the animation has to finish)
 * write            the writing rung
 * read             the reading pass
 * ```
 *
 * A letter is `learned` when it has all of them. See `domain/mastery.ts`.
 *
 * Reading is skipped for the handful of characters with no plausible
 * look-alikes, because a multiple-choice question with three obviously-wrong
 * answers teaches nothing.
 */
type Step = 'write' | 'read';

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

  const [params] = useSearchParams();
  const restart = params.get('from') === 'start';

  const lesson = lessonId ? getLesson(lessonId) : undefined;
  const characters = useMemo(() => (lesson ? getLessonCharacters(lesson) : []), [lesson]);
  const unit = lesson ? CURRICULUM_UNITS.find((u) => u.id === `unit-${lesson.unit}`) : undefined;

  /**
   * Where a returning learner picks up: the first letter they have not finished.
   *
   * Leaving at 5 / 6 and coming back to letter 1 is the app throwing away four
   * minutes of work and then asking for them again. What is *not* done here is
   * skipping anything: the resume point is the first unfinished item, so a
   * learner who left in the middle of letter three restarts letter three rather
   * than landing on four.
   *
   * `?from=start` overrides it, which is the secondary "start from the
   * beginning" route — see the Letters screen. Read once, as the initial state,
   * because after the first render the learner's position is theirs and not
   * the store's: finishing a letter must not move the cursor twice.
   */
  const [index, setIndex] = useState(() => {
    if (restart) return 0;
    const at = characters.findIndex(
      (character) => progressFor('character', character.character)?.stage !== 'learned',
    );
    return at < 0 ? 0 : at;
  });
  const [phase, setPhase] = useState<'unit' | 'intro' | 'practice'>(() =>
    unit?.has_intro && unit.lesson_ids[0] === lessonId ? 'unit' : 'intro',
  );
  const [stepState, setStepState] = useState<StepState>({
    step: 'write',
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
    const list: Step[] = ['write'];
    if (recognitionRequired) list.push('read');
    return list;
  }, [recognitionRequired]);

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
        // Which guide was on the paper. There is only one now, so this is
        // always `trace`; the field stays because rows written by earlier
        // builds carry the other value and the Activity screen reads them.
        mode: 'trace' as const,
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
      // The lesson's own counter: how many of this sitting's letters were
      // written correctly.
      if (evaluation.passed) setCompleted((prev) => new Set(prev).add(current.character));
    },
    [current, recordAttempt, font.id, recognitionRequired],
  );

  /** Fix the attempt that is already on the canvas. */
  const retry = () => {
    setStepState((prev) => ({ ...prev, status: 'idle', result: null }));
    setShowDetail(false);
    setOrderNotes([]);
  };

  /*
   * The first finished lesson is when we ask the browser to keep the data.
   *
   * §49. Not at startup: `persist()` is a permission request, and a request
   * made before the learner has anything stored is one Chromium's engagement
   * heuristics have no reason to grant and Firefox puts a prompt in front of.
   * Here they have just finished something, which is both the first moment the
   * request has a reason and the moment they are most likely to agree to it.
   *
   * Nothing is shown either way. A refusal leaves ordinary storage in place,
   * which is what the app has always used; the only storage message a learner
   * ever sees is the one after a real write-then-read failure.
   */
  const asked = useRef(false);
  useEffect(() => {
    if (!finished || asked.current) return;
    asked.current = true;
    void requestPersistence();
  }, [finished]);

  if (!lesson || !current) {
    return <NotFoundBody messageKey="notFound.lesson" />;
  }

  const lessonTitle = resolveContent(lesson.translations, locale).value.title;
  const copy = letterCopy(current, locale);
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
        {t('learning:session.startWriting')}
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
                <span
                  className={styles.promptGlyph}
                  style={{ fontFamily: font.font_family }}
                  lang="ko"
                  data-testid="prompt-glyph"
                >
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
                {/*
                  One note, not a list of them.

                  This block used to be a heading, up to three bullets and a
                  closing sentence about what stroke order is for — five
                  paragraphs of feedback under a two-stroke letter, every time.
                  `strokeOrderNotes` already returns them in the order they
                  matter (count, then where you started, then direction), so
                  the first one is the one worth saying and the rest are things
                  the learner will notice on the next attempt anyway.

                  The heading is gone because it labelled a list of one, and
                  the closing sentence has moved into Show details, where
                  somebody who wants the reasoning can find it.
                */}
                {orderNotes[0] && (
                  <p className={styles.orderNote}>
                    {t(`handwriting:${orderNotes[0].key}`, {
                      ...orderNotes[0].params,
                      ...(orderNotes[0].params?.corner
                        ? {
                            corner: t(
                              `handwriting:strokeOrder.corners.${String(orderNotes[0].params.corner)}`,
                            ),
                          }
                        : {}),
                    })}
                  </p>
                )}
                {showDetail && (
                  <>
                    <p className={styles.breakdown}>
                      {t('handwriting:feedback.breakdown', scoreBreakdownParams(stepState.result))}
                    </p>
                    {orderNotes.length > 0 && (
                      <p className={styles.breakdown}>
                        {t('handwriting:strokeOrder.notesFooter')}
                      </p>
                    )}
                  </>
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
 * they are agreeing to before they press it — which is exactly why this button
 * used to be wrong. The step after writing is called `read` in the code, so the
 * button said *Now read it* (이제 읽어 보기, Giờ đọc nào, in all ten languages),
 * and what it opened was a multiple-choice question: hear a sound, pick the
 * letter that makes it. Nobody reads anything. A learner who pressed it
 * expecting to read had been told the wrong thing about their own lesson by the
 * one control on the screen whose whole job is to say what happens next.
 */
function nextLabel(
  t: (key: string) => string,
  steps: Step[],
  current: Step,
  lastCharacter: boolean,
): string {
  const next = steps[steps.indexOf(current) + 1];
  if (next === 'read') return t('learning:session.nowRecognise');
  return lastCharacter ? t('learning:session.finish') : t('learning:session.next');
}
