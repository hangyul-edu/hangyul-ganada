import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { EvaluationResult } from '@hangyul-ganada/handwriting-core';
import type { HangulCharacter } from '@hangyul-ganada/shared-types';

import { usePronunciation } from '../audio/PronunciationContext';
import { CURRICULUM_UNITS, getLesson, getLessonCharacters } from '../data/characters';
import { getFont, textFamily } from '../data/fonts';
import { CharacterIntro } from '../features/learning/CharacterIntro';
import { RecognitionStep } from '../features/learning/RecognitionStep';
import { UnitIntro } from '../features/learning/UnitIntro';
import { canRecognise } from '../features/learning/lookAlikes';
import { SessionCompleteModal } from '../features/session/SessionCompleteModal';
import { PracticeCanvasCard } from '../features/writing/PracticeCanvasCard';
import { gradingFor } from '../features/writing/useEvaluator';
import {
  feedbackFor,
} from '../features/writing/feedback';
import { StrokeOrder } from '../ui/StrokeOrder';
import { useStudyClock } from '../features/session/useStudyClock';
import { resolveContent, useLocale } from '../i18n';
import { requestPersistence } from '../storage/capability';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { CenteredGlyph } from '../ui/CenteredGlyph';
import { FocusScreen } from '../ui/FocusScreen';
import { Badge } from '../ui/Chip';
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
    const position = steps.indexOf(stepState.step);
    const next = steps[position + 1];
    if (!next) {
      advanceCharacter();
      return;
    }
    setStepState({ step: next, status: 'idle', result: null });
  }, [steps, stepState.step, advanceCharacter]);

  const handleEvaluated = useCallback(
    (evaluation: EvaluationResult) => {
      if (!current) return;
      /*
        The strokes as they were made are no longer read here.

        `strokeOrderNotes` turned them into a sentence about where the learner
        started and which way a stroke ran, and that sentence was shown under
        every wrong attempt. It is gone with the rest of the feedback card —
        §8. Stroke order was never part of the mark and saying so under the mark
        was the confusing part; the demonstration above the canvas is where a
        learner goes to see how the letter is written.
      */
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
            fontFamily={textFamily(font)}
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
                {/*
                  Centred on its ink, not on its advance width — §10.

                  Pretendard draws ㅏ 6.8% of an em right of the middle of the
                  space it reserves for it, and ㅜ 7.8% below. `text-align`
                  cannot see that, so the letter sat visibly to one side of the
                  square the learner was about to copy it into. The correction
                  is measured off the face by `measure-jamo.mjs`, not typed.
                */}
                <CenteredGlyph
                  character={current.character}
                  className={styles.promptGlyph}
                  style={{ fontFamily: textFamily(font) }}
                  data-testid="prompt-glyph"
                />
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
              /*
                `font_family`, not `textFamily` — the mask the evaluator grades
                against is built from this string, and Gaegu's graded face is
                one step from a false-rejection cliff. See `text_family` in
                `shared-types`: reading and grading part company at this prop.
              */
              fontFamily={font.font_family}
              fontWeight={font.weight}
              glyphScale={font.glyph_scale}
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

            {/*
              What happens after the pen lifts — §8, §9.

              This was a card: a headline ("That's it!"), a line of praise
              ("beautifully written"), a stroke-order note, a Show details
              toggle and a numeric breakdown, under a two-stroke letter, every
              single attempt. Written down it reads as thorough. In the hand it
              is a panel that appears between the learner and the next stroke,
              says something congratulatory for the fortieth time, and has to be
              dismissed.

              A learner writing ㄱ for the fourth time does not read "That's
              it!" — they have read it three times already, and repeated praise
              stops carrying information the moment it becomes certain. What
              they need after a correct attempt is to get on with the next one,
              and after a wrong one is to know *what to change* and be able to
              try again without leaving the box they were writing in.

              So: correct is one button. Wrong is one sentence and Retry. The
              sentence is kept because it is the only part of the old card that
              was ever actionable — "A little small. Try filling the box." tells
              the learner something they can do, where the headline told them
              how they had performed.

              The grade itself is unchanged and is still recorded; what was
              removed is the ceremony around reporting it. The breakdown numbers
              and the stroke-order notes are gone from the screen entirely
              rather than moved behind a toggle: a percentage of mismatch is the
              grader talking about itself.
            */}
            {stepState.status === 'correct' && (
              <div className={styles.after}>
                {/* Announced, not displayed: a sighted learner sees the box
                    lock and the button appear, and a screen-reader user needs
                    to be told the attempt was accepted. */}
                <p className="hg-sr-only" role="status">
                  {t('handwriting:feedback.accepted')}
                </p>
                <Button size="md" onClick={advanceStep}>
                  {nextLabel(t, steps, stepState.step, index + 1 >= characters.length)}
                </Button>
              </div>
            )}

            {feedback && stepState.result && stepState.status !== 'idle' && stepState.status !== 'correct' && (
              <div className={styles.after}>
                <p className={styles.retryNote} role="status">
                  {t(`handwriting:${feedback.detailKey}`, feedback.detailParams)}
                </p>
                <Button size="md" onClick={retry}>
                  {t('handwriting:feedback.retry')}
                </Button>
              </div>
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
