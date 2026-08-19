import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';


import { usePronunciation } from '../audio/PronunciationContext';
import { getFont } from '../data/fonts';
import { getLessonWords, getVocabularyLesson } from '../data/vocabulary';
import { WordIntro } from '../features/learning/WordIntro';
import { WordReadingStep } from '../features/learning/WordReadingStep';
import { useStudyClock } from '../features/session/useStudyClock';
import { SessionCompleteModal } from '../features/session/SessionCompleteModal';
import { WordWritingCarousel } from '../features/writing/WordWritingCarousel';
import type { SyllableEvaluation } from '../features/writing/evaluateWord';
import { gradingFor } from '../features/writing/useEvaluator';
import { useLocale } from '../i18n';
import { wordCopy } from '../data/wordCopy';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { FocusScreen } from '../ui/FocusScreen';
import { Badge } from '../ui/Chip';
import { LocalizedText } from '../ui/LocalizedText';
import { ProgressBar } from '../ui/Progress';
import { SpeakerButton } from '../ui/SpeakerButton';
import { NotFoundBody } from './NotFoundPage';
import styles from './SessionPage.module.css';

/**
 * Word practice keeps the light guide, always.
 *
 * A learner reaching vocabulary has already traced these letters and produced
 * them over the light guide in the letter curriculum, so the full tracing guide
 * would be a step backwards — and an empty box was never an option here either.
 * The light guide is the level that matches what they can already do, and it is
 * the same at every setting: no practice style in the product removes the model
 * from a word.
 */
const WORD_GUIDE = 'light' as const;
const WORD_PRACTICE_MODE = 'practice' as const;

/**
 * Learning a word.
 *
 * ```
 * see the picture ─▶ see the word ─▶ hear it ─▶ understand it
 *                                                     │
 *                     write each syllable ◀───────────┘
 *                              │
 *                     the sentence it lives in
 *                              │
 *                     read it ◀─┘   ← the word alone, no picture, no sound
 * ```
 *
 * The picture and the sound come *before* the pen, because the point of the
 * word is its meaning and a learner who writes 사과 without knowing it is an
 * apple has practised calligraphy, not Korean.
 *
 * Then one writing box per syllable, each graded on its own. 사과 means writing
 * 사 *and* 과 — which is the point, and the per-syllable state is what lets the
 * feedback name exactly which box needs another go instead of failing the whole
 * word.
 *
 * The last step is the one that makes the rest mean something. Everything
 * before it happens with the answer on screen — the picture, the meaning, the
 * sound, the syllable in the tracing guide — so none of it can distinguish a
 * learner who has read the word from one who has looked at it. The reading step
 * shows the Korean alone and asks what it says.
 *
 * A word therefore counts as learned once it has been seen, heard, written, and
 * *read*. That is the rule in `domain/mastery.ts`, reached here by passing
 * `recognition_required` for words the same way the letter curriculum does.
 */
export function WordSessionPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const {
    state,
    recordAttempt,
    recordHeard,
    recordIntroduced,
    recordRecognition,
    startSession,
    completeSession,
    isSaved,
    toggleSaved,
  } = useLearner();
  const { t } = useTranslation(['vocabulary', 'learning', 'handwriting', 'common']);
  const { locale } = useLocale();
  const { preload } = usePronunciation();
  const lesson = lessonId ? getVocabularyLesson(lessonId) : undefined;
  const words = useMemo(() => (lesson ? getLessonWords(lesson) : []), [lesson]);

  const [wordIndex, setWordIndex] = useState(0);
  const [phase, setPhase] = useState<'meet' | 'write' | 'read'>('meet');
  const [wordWritten, setWordWritten] = useState(false);
  const [learnedCount, setLearnedCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const sessionId = useRef<string | null>(null);

  const font = getFont(state.settings.selected_font_id);
  const current = words[wordIndex];

  // Every phase of a word lesson is study — meeting it, writing it, reading it.
  useStudyClock(!finished);

  useEffect(() => {
    if (!lesson || sessionId.current) return;
    sessionId.current = startSession('vocabulary', lesson.id, words.length);
  }, [lesson, words.length, startSession]);

  useEffect(() => {
    preload(words.slice(wordIndex, wordIndex + 3).flatMap((w) => [w.audio.word, w.audio.example]));
  }, [preload, words, wordIndex]);

  useEffect(() => {
    setWordWritten(false);
    setPhase('meet');
    if (current) recordIntroduced('word', current.id);
  }, [current, recordIntroduced]);

  /**
   * One syllable's share of a whole-word check.
   *
   * The learner performs one action; the grader is still called once per
   * syllable, and each of those is a character attempt in its own right. So the
   * character ladder is told about all of them — a syllable inside a word is a
   * character the learner is practising.
   */
  const handleSyllableEvaluated = useCallback(
    (syllableIndex: number, verdict: SyllableEvaluation) => {
      if (!current) return;
      const syllable = current.syllables[syllableIndex];
      // No result means the box was empty and the evaluator was never called.
      // Not writing something is not an attempt at it.
      if (!syllable || !verdict.result) return;

      const evaluation = verdict.result;
      recordAttempt({
        kind: 'character',
        item_key: syllable,
        session_id: sessionId.current,
        mode: WORD_PRACTICE_MODE,
        font_id: font.id,
        evaluator_id: 'geometry-v1',
        // The recognition step for a letter lives in the letter curriculum, so
        // it is not asked for here.
        recognition_required: false,
        result: {
          passed: evaluation.passed,
          score: evaluation.score,
          mismatch_ratio: evaluation.mismatchRatio,
          outside_stroke_ratio: evaluation.outsideStrokeRatio,
          missing_coverage_ratio: evaluation.missingCoverageRatio,
          reason: evaluation.reason,
        },
      });
    },
    [current, recordAttempt, font.id],
  );

  /**
   * The word is written — every syllable of it passed.
   *
   * Guarded on `wordWritten` rather than on the verdict alone, because the
   * learner can check again after passing and this must not record twice.
   * Opening the screen, moving between syllables, or writing one part well are
   * none of them this event.
   */
  const handleWordWritten = useCallback(() => {
    if (!current || wordWritten) return;
    setWordWritten(true);
    recordAttempt({
      kind: 'word',
      item_key: current.id,
      session_id: sessionId.current,
      mode: WORD_PRACTICE_MODE,
      font_id: font.id,
      evaluator_id: 'geometry-v1',
      // Writing every syllable is not the whole word yet: the reading step
      // still has to be passed, so the ladder is told to expect it.
      recognition_required: true,
      result: {
        passed: true,
        score: 1,
        mismatch_ratio: 0,
        outside_stroke_ratio: 0,
        missing_coverage_ratio: 0,
        reason: null,
      },
    });
  }, [current, wordWritten, recordAttempt, font.id]);

  const next = () => {
    if (wordIndex + 1 >= words.length) {
      if (sessionId.current) completeSession(sessionId.current);
      setFinished(true);
      return;
    }
    setWordIndex((i) => i + 1);
  };

  if (!lesson || !current) {
    return <NotFoundBody messageKey="notFound.wordLesson" />;
  }

  /**
   * The set's name, which is what the header used to get wrong.
   *
   * `set_index` is a position inside a category — "the 13th set of Food &
   * Drink" — and the Korean bundle rendered it as `13단계`, a word that means
   * *stage* or *level*. Every other language already said "Set 13". A learner
   * reading 단계 is being told they are at Korean proficiency level 13, which
   * is not a thing this product measures and not a claim the data supports.
   *
   * The category is the useful half, so the header leads with it and the set
   * number rides along as a subtitle.
   */
  const lessonTitle = t(`vocabulary:categories.${lesson.category}`, {
    defaultValue: t('vocabulary:lesson.title', { index: lesson.set_index }),
  });
  const copy = wordCopy(current, locale);

  const wordShare = phase === 'meet' ? 0 : phase === 'read' ? 0.8 : wordWritten ? 0.6 : 0.4;
  const progress = (wordIndex + wordShare) / words.length;

  /*
   * Meeting a word has one action and it belongs in the safe footer. The
   * writing carousel keeps its own check beside the canvas it is checking, and
   * the reading question keeps its answers with the question — see
   * `ui/FocusScreen.tsx` for why those two are not pinned to the foot.
   */
  const footer =
    phase === 'meet' ? (
      <Button size="lg" fullWidth onClick={() => setPhase('write')}>
        {t('vocabulary:intro.write')}
      </Button>
    ) : null;

  return (
    <FocusScreen
      // A word, and which part of learning it: three screens on one route.
      resetKey={`${lesson?.id ?? ''}:${wordIndex}:${phase}`}
      header={
        <>
          <AppHeader
            title={lessonTitle}
            onBack={() => navigate('/words')}
            action={
              <Badge tone="primary" filled numeric>
                {t('learning:session.counter', { current: wordIndex + 1, total: words.length })}
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
        {phase === 'read' ? (
          <WordReadingStep
            word={current}
            fontFamily={font.font_family}
            // The word's own index, so a retry re-asks the same question and a
            // second visit to the lesson does not shuffle the answers about.
            seed={wordIndex + 1}
            onAnswered={(right) => {
              recordRecognition('word', current.id, right);
              if (right) setLearnedCount((n) => n + 1);
            }}
            onContinue={next}
          />
        ) : phase === 'meet' ? (
          <WordIntro
            word={current}
            fontFamily={font.font_family}
            onHeard={() => recordHeard('word', current.id, true)}
            saved={isSaved('word', current.id)}
            onToggleSaved={() => toggleSaved('word', current.id)}
          />
        ) : (
          <>
            {/*
              What the learner is learning, then what to do about it. The set
              position lives in the header and the syllable position lives in
              the navigator, so neither is repeated here.
            */}
            <header className={styles.wordHeader}>
              <div className={styles.wordHeaderTop}>
                <p
                  className={styles.wordWord}
                  style={{ fontFamily: font.font_family }}
                  lang="ko"
                  dir="ltr"
                  data-testid="word-title"
                >
                  {current.word}
                </p>
                <SpeakerButton
                  audioId={current.audio.word}
                  label={current.word}
                  size="md"
                  onPlayed={() => recordHeard('word', current.id, true)}
                />
              </div>
              <LocalizedText locale={copy.locale} className={styles.wordMeaning}>
                {copy.value.meaning}
              </LocalizedText>
            </header>

            <WordWritingCarousel
              // The word is the identity of the writing state, so moving to the
              // next word starts it cleanly at its first syllable.
              key={current.id}
              word={current.word}
              syllables={current.syllables}
              fontFamily={font.font_family}
              fontWeight={font.weight}
              grading={gradingFor(font)}
              guide={WORD_GUIDE}
              showGrid={state.settings.show_grid}
              showCenterCrosshair={state.settings.show_center_crosshair}
              onSyllableEvaluated={handleSyllableEvaluated}
              // Recorded when the word is written correctly...
              onChecked={(evaluation) => {
                if (evaluation.passed) handleWordWritten();
              }}
              // ...and left when the learner says so, which is not the same
              // moment. The success state is worth seeing.
              onComplete={() => setPhase('read')}
              continueLabel={t('vocabulary:session.toReading')}
            />
          </>
        )}
      </div>

      <SessionCompleteModal
        open={finished}
        onClose={() => navigate('/words')}
        onContinue={() => navigate('/words')}
        title={t('learning:complete.title')}
        detail={t('vocabulary:session.complete', { count: learnedCount, lesson: lessonTitle })}
        passed={learnedCount}
        total={words.length}
      />
    </FocusScreen>
  );
}
