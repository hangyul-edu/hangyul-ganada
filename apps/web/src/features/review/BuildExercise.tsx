import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { optionRows } from '../../ui/optionRows';
import { Button } from '../../ui/Button';
import { FeedbackState } from '../../ui/FeedbackState';
import { LocalizedText } from '../../ui/LocalizedText';
import { SpeakerButton } from '../../ui/SpeakerButton';
import { hapticPass, hapticRetry, hapticSelection } from '../../native/haptics';
import { usableHints } from './hints';
import type { Exercise } from './exercises';
import styles from './BuildExercise.module.css';

/**
 * Put the word together, syllable by syllable.
 *
 * ## Why this exists
 *
 * Every other vocabulary question is a choice between four finished answers.
 * Six of them, ten times a session, and the audit's largest single finding was
 * that it reads as one screen shown over and over — a learner does not remember
 * six question types, they remember four rectangles.
 *
 * This is the one that is shaped differently, and not only decorated
 * differently. The learner is given a meaning and a tray of syllables and has
 * to *assemble* 사과 out of 사 and 과. That is a different thing to know from
 * "which of these four is 사과": it is the knowledge you need before you can
 * write the word, type it, or say it without having seen it first.
 *
 * ## Still taps, never a canvas
 *
 * Vocabulary is never handwritten in this product and this does not change
 * that — §63, and the assertion in `journey.spec.ts` that no word screen
 * contains a drawing surface. Tapping tiles is the gentlest form of the
 * "limited keyboard recall" the brief asks for: the alphabet is provided, so it
 * is recall with the pieces on the table rather than production from nothing.
 *
 * ## What happens when it is wrong
 *
 * The same as everywhere else in this app: the answer is shown, and the only
 * action is to continue. There is no retry, because a retry on a question whose
 * answer is now on screen is copying — and `ChoiceExercise` made that decision
 * first, for the same reason.
 *
 * ## The first action is said, and shown
 *
 * A customer met this screen — a definition, three dashed boxes, five tiles —
 * and did not know what to do. Two things were missing. The instruction said
 * *put the word together*, which names the goal and not the action; it now
 * says *tap the syllables below in order to complete the word*. And nothing
 * on the screen said where a tap would land: the slots were three identical
 * dashed outlines. The **next slot is now marked** — a solid accent outline
 * with its number — and a tapped tile visibly leaves the tray (dashed, faded,
 * marked as placed) and appears in that slot.
 *
 * Submission is a button, and it is disabled until every slot is filled. The
 * tray used to grade itself the instant the last tile landed, which meant the
 * last tap could never be taken back: a learner who saw their mistake as
 * their finger lifted had already been marked wrong. *Check* makes the last
 * tile as reversible as the first — tap a filled slot, or *Undo*, to put a
 * tile back — and a learner who has not filled every slot cannot submit.
 *
 * A screen reader hears the instruction as the tray's name, each slot's
 * number and contents, each tile's state, and a live count of slots filled.
 */
export function BuildExercise({
  exercise,
  fontFamily,
  onAnswered,
  onContinue,
  isLast,
}: {
  exercise: Exercise;
  fontFamily: string;
  onAnswered: (result: {
    correct: boolean;
    chosen: string;
    hintLevel: number;
    responseMs: number;
    /** True when the learner asked for the answer instead of building it. */
    revealed?: boolean;
  }) => void;
  onContinue: () => void;
  isLast: boolean;
}) {
  const { t } = useTranslation(['learning', 'common', 'vocabulary']);
  const tiles = exercise.tiles ?? [];
  const target = exercise.korean ?? '';

  /** Tile ids in the order they were tapped. */
  const [picked, setPicked] = useState<string[]>([]);
  const [level, setLevel] = useState(0);
  const [settled, setSettled] = useState<boolean | null>(null);
  /**
   * The answer was shown rather than built. Same outcome as in
   * `ChoiceExercise`: the slots fill with the word in the blue "right" style,
   * the tray locks, `correct: false, revealed: true` is reported once, and the
   * word is owed again later. See the note on `revealed` there.
   */
  const [revealed, setRevealed] = useState(false);
  const startedAt = useRef(Date.now());

  const key = `${exercise.candidate.itemKey}:${exercise.mode}`;
  useEffect(() => {
    setPicked([]);
    setLevel(0);
    setSettled(null);
    setRevealed(false);
    startedAt.current = Date.now();
  }, [key]);

  const spelled = picked
    .map((id) => tiles.find((tile) => tile.id === id)?.syllable ?? '')
    .join('');
  const syllableCount = [...target].length;
  const full = picked.length >= syllableCount;

  /**
   * Submit. Only when every slot is filled and only once.
   *
   * This used to run by itself the instant the last tile landed, which made
   * the last tap the one tap that could not be undone. The button is disabled
   * until the word is the right length, so a partial answer cannot be graded
   * and a full one is graded only when the learner says so.
   */
  const check = () => {
    if (settled !== null || revealed || !full) return;
    const correct = spelled === target;
    setSettled(correct);
    if (correct) hapticPass();
    else hapticRetry();
    onAnswered({
      correct,
      chosen: spelled,
      hintLevel: level,
      responseMs: Date.now() - startedAt.current,
    });
  };

  /** Idempotent: nothing after a build or a reveal. */
  const reveal = () => {
    if (settled !== null || revealed) return;
    setRevealed(true);
    hapticSelection();
    onAnswered({
      correct: false,
      chosen: '',
      hintLevel: level + 1,
      responseMs: Date.now() - startedAt.current,
      revealed: true,
    });
  };

  const take = (id: string) => {
    if (settled !== null || revealed || picked.includes(id)) return;
    hapticSelection();
    setPicked((current) => [...current, id]);
  };

  const putBack = (id: string) => {
    if (settled !== null || revealed) return;
    hapticSelection();
    setPicked((current) => current.filter((other) => other !== id));
  };

  /** Take the most recently placed tile back. */
  const undo = () => {
    if (settled !== null || revealed || picked.length === 0) return;
    hapticSelection();
    setPicked((current) => current.slice(0, -1));
  };

  /*
   * The ladder, audited as it will read — see `usableHints`.
   *
   * The answer here is the Korean word the tiles spell, and the tiles are on
   * screen, so most rungs are safe by construction. It runs anyway: the
   * question is whether a *rendered* rung gives the answer away, and this
   * component has no more insight into a translation's own wording than the
   * choice one does.
   */
  const hints = usableHints(
    exercise.hints,
    (step) => t(`learning:${step.key}`, { ...step.values, answer: target }),
    target,
  );
  const shown = hints.slice(0, level);

  return (
    <div className={styles.exercise}>
      <p className={styles.prompt}>{t(`learning:${exercise.promptKey}`)}</p>

      <div className={styles.stimulus}>
        <LocalizedText
          as="p"
          locale={exercise.meaningLocale ?? 'en'}
          className={styles.meaning}
        >
          {exercise.meaning ?? ''}
        </LocalizedText>
        {/*
          The sound, only once the answer is in.

          Playing the word first would say it aloud, and the whole question is
          whether the learner can spell what they mean without being told.
        */}
        {exercise.audioId && settled !== null && (
          <SpeakerButton audioId={exercise.audioId} label={target} size="md" />
        )}
      </div>

      {/*
        The slots the word is being built in.

        Fixed to the number of syllables the word has, so the shape of the
        answer is visible from the start — a learner who can see three slots
        knows they are looking for three syllables, which is information the
        word itself would give them if it were written down. The next empty
        slot is marked, so the first tap has an obvious destination.
      */}
      <div
        className={`${styles.slots} ${
          settled === true || revealed ? styles.right : settled === false ? styles.wrong : ''
        }`}
        lang="ko"
        dir="ltr"
        style={{ fontFamily }}
        role="group"
        aria-label={t('learning:review.buildSlots', { total: syllableCount })}
        data-testid="build-slots"
        data-revealed={revealed ? 'true' : undefined}
        data-filled={picked.length}
      >
        {[...target].map((syllable, index) => {
          if (revealed) {
            // The answer, in the slots, in the box a right answer takes.
            return (
              <span key={`answer-${index}`} className={styles.slotFilled} data-answer="true">
                {syllable}
              </span>
            );
          }
          const id = picked[index];
          const tile = id ? tiles.find((candidate) => candidate.id === id) : undefined;
          const isNext = settled === null && index === picked.length;
          return tile ? (
            <button
              key={tile.id}
              type="button"
              className={styles.slotFilled}
              onClick={() => putBack(tile.id)}
              disabled={settled !== null}
              aria-label={t('learning:review.buildSlotFilled', { index: index + 1, syllable: tile.syllable })}
              data-testid="build-slot"
              data-state="filled"
            >
              {tile.syllable}
            </button>
          ) : (
            <span
              key={`empty-${index}`}
              className={`${styles.slotEmpty} ${isNext ? styles.slotActive : ''}`}
              aria-label={t('learning:review.buildSlotEmpty', { index: index + 1 })}
              role="img"
              data-testid="build-slot"
              data-state={isNext ? 'next' : 'empty'}
            >
              {/* The slot's number, so "the first box" is a thing on screen. */}
              <span className={styles.slotIndex} aria-hidden="true">
                {index + 1}
              </span>
            </span>
          );
        })}
      </div>

      {/*
        What the tray has done so far, for anyone listening. Polite, so it
        never interrupts the tile that was just announced.
      */}
      <p className="hg-sr-only" aria-live="polite" data-testid="build-live">
        {settled === null && !revealed
          ? full
            ? t('learning:review.buildFilled')
            : t('learning:review.buildProgress', { filled: picked.length, total: syllableCount })
          : ''}
      </p>

      {/*
        Rows the layout chose, not rows the viewport fell into.

        Five tiles are three and two. They used to be four and one, because the
        tray was a wrapping flex box and four is what fits across a 390 px
        phone — see `ui/optionRows` for why an orphan tile is a defect and not
        an inelegance.
      */}
      <div
        className={styles.tray}
        role="group"
        aria-label={t('learning:review.buildTray')}
        data-testid="build-tray"
      >
        {optionRows(tiles).map((row) => (
          <div className={styles.trayRow} key={row.map((tile) => tile.id).join('-')}>
            {row.map((tile) => {
              const placed = picked.includes(tile.id);
              return (
                <button
                  key={tile.id}
                  type="button"
                  className={`${styles.tile} ${placed ? styles.tileTaken : ''}`}
                  onClick={() => take(tile.id)}
                  disabled={settled !== null || revealed || placed}
                  aria-label={
                    placed
                      ? t('learning:review.buildTilePlaced', { syllable: tile.syllable })
                      : tile.syllable
                  }
                  data-testid="build-tile"
                  data-state={placed ? 'placed' : settled !== null || revealed ? 'done' : 'available'}
                  lang="ko"
                  dir="ltr"
                  style={{ fontFamily }}
                >
                  {tile.syllable}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {settled === null && !revealed && (
        /*
          Two controls, and the one that matters is disabled until it can do
          something. Undo is the same action as tapping a filled slot, offered
          as a named button for anyone who would not think to tap a slot.
        */
        <div className={styles.controls}>
          <Button
            size="md"
            variant="ghost"
            onClick={undo}
            disabled={picked.length === 0}
            data-testid="build-undo"
          >
            {t('learning:review.buildUndo')}
          </Button>
          <Button size="md" onClick={check} disabled={!full} data-testid="build-check">
            {t('learning:review.buildCheck')}
          </Button>
        </div>
      )}

      {revealed ? (
        <FeedbackState
          status="revealed"
          headline={t('learning:review.revealedHeadline')}
          actions={
            <Button size="md" onClick={onContinue} data-testid="revealed-next">
              {t('vocabulary:session.next')}
            </Button>
          }
        >
          <p className={styles.revealedNote}>{t('learning:review.revealedNote')}</p>
        </FeedbackState>
      ) : settled === null ? (
        hints.length > 0 ? (
          <div className={styles.hintBlock}>
            {shown.map((step) => (
              <p
                key={step.key}
                className={step.strength === 'answer' ? styles.hintAnswer : styles.hintLine}
              >
                {t(`learning:${step.key}`, { ...step.values, answer: target })}
              </p>
            ))}
            {level < hints.length && (
              <button
                type="button"
                className={styles.hint}
                data-testid={hints[level]!.strength === 'answer' ? 'show-answer' : 'show-hint'}
                onClick={() =>
                  hints[level]!.strength === 'answer' ? reveal() : setLevel((current) => current + 1)
                }
              >
                {t(
                  hints[level]!.strength === 'answer'
                    ? 'learning:review.showAnswer'
                    : 'learning:review.showHint',
                )}
              </button>
            )}
          </div>
        ) : null
      ) : (
        <FeedbackState
          status={settled ? 'correct' : 'incorrect'}
          headline={t(settled ? 'common:verdict.correct' : 'common:verdict.incorrect')}
          actions={
            <Button size="md" onClick={onContinue}>
              {isLast ? t('vocabulary:session.finish') : t('vocabulary:session.next')}
            </Button>
          }
        >
          {!settled && (
            <p className={styles.answer} lang="ko" dir="ltr" style={{ fontFamily }}>
              {target}
            </p>
          )}
        </FeedbackState>
      )}
    </div>
  );
}
