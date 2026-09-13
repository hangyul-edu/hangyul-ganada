import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { hapticPass, hapticRetry, hapticSelection } from '../../native/haptics';
import { Button } from '../../ui/Button';
import { CheckIcon, CloseIcon } from '../../ui/icons';
import { LocalizedText } from '../../ui/LocalizedText';
import type { MatchPair } from './dailyQuestions';
import styles from './MatchExercise.module.css';

/** What the session is told about one word once the grid is finished. */
export interface MatchResult {
  wordId: string;
  correct: boolean;
  responseMs: number;
}

interface Props {
  pairs: readonly MatchPair[];
  fontFamily: string;
  isLast: boolean;
  /** Called once per word, when the whole grid is checked. */
  onAnswered: (results: MatchResult[]) => void;
  onContinue: () => void;
}

/**
 * Four words, four meanings, paired.
 *
 * ## Why this exercise exists
 *
 * Every other vocabulary question in the product is one word and four options.
 * That is a good question and it was the *only* question, which is why a first
 * sitting read as twenty screens of the same thing. Matching is a genuinely
 * different one: four pairs at once, where every pair made narrows the rest, so
 * the last one is deduced rather than recognised and a learner who half-knows
 * three words can reason their way to the fourth.
 *
 * It is also the one exercise that asks about several words in a single screen,
 * which is why `ScheduledStep` grew a `group` and `completes` — see the notes
 * there. The accounting is the hard part of this feature; the grid is not.
 *
 * ## The first action is said, shown, and only one thing is tappable
 *
 * A customer met this screen and did not know what to do. The instruction
 * named the goal (*match each word to its meaning*) and a caption under the
 * grid said 한국어 단어를 골라요 — a fragment, disconnected from the grid it was
 * about. Now:
 *
 * * the instruction is the action, in order: *tap a Korean word on the left,
 *   then tap its meaning on the right*;
 * * the two columns are headed **한국어 단어** and **뜻**, so the two kinds of
 *   thing are named where they are;
 * * before a word is chosen, only the Korean column is enabled — the meanings
 *   are visibly waiting — so a first tap can only be the right kind of tap;
 * * once a word is chosen it is outlined in the accent, the meanings become
 *   the marked target, and the caption says *now tap the meaning of 물*;
 * * a made pair is shown as a pair: both tiles carry the same numbered badge
 *   and the same tint, and tapping either takes the pair apart again.
 *
 * ## Pairs are checked together, not one at a time
 *
 * The grid used to grade each pair the moment it was made — a wrong pair
 * flashed and cleared, a right pair locked — which gave the answer away by
 * elimination and punished the first guess. Now every word is paired first,
 * *Check* is disabled until all four are, and the grade comes once. A learner
 * can change any pair before checking; nothing about the layout, the order or
 * the styling says which pairing is right until they ask.
 *
 * ## What counts as knowing a word
 *
 * A word is correct if the pair it is in at Check is the right one. The grid
 * reports one result per word, so the per-skill memory learns about each of
 * them rather than about "the grid". Two columns are shuffled by different
 * coprime offsets so no word lands opposite its own meaning.
 */
export function MatchExercise({ pairs, fontFamily, isLast, onAnswered, onContinue }: Props) {
  const { t } = useTranslation(['learning', 'vocabulary', 'common']);
  const startedAt = useMemo(() => Date.now(), []);

  /*
   * The two columns, shuffled independently and once.
   *
   * Deterministic in the pair order — the grid is built from a deterministic
   * schedule and a reshuffle on re-render would move a row out from under a
   * finger. The offsets are coprime with any grid size this uses, so no word
   * can land opposite its own meaning and turn the puzzle into a straight line.
   */
  const korean = useMemo(() => rotate(pairs, 0), [pairs]);
  const meanings = useMemo(() => rotate(pairs, pairs.length > 3 ? 3 : 2), [pairs]);

  /** The Korean word waiting for its meaning. */
  const [selected, setSelected] = useState<string | null>(null);
  /** Korean word id → meaning's word id, in the order the pairs were made. */
  const [made, setMade] = useState<Array<[string, string]>>([]);
  /** Null until Check; then the set of words whose pair was right. */
  const [graded, setGraded] = useState<Set<string> | null>(null);

  const pairOf = (koreanId: string) => made.find(([k]) => k === koreanId)?.[1] ?? null;
  const wordFor = (meaningId: string) => made.find(([, m]) => m === meaningId)?.[0] ?? null;
  const badge = (koreanId: string) => made.findIndex(([k]) => k === koreanId) + 1;
  const allPaired = made.length === pairs.length;
  const done = graded !== null;

  const pickWord = (wordId: string) => {
    if (done) return;
    hapticSelection();
    const existing = pairOf(wordId);
    if (existing !== null) {
      // Taking a pair apart and holding the word, ready to pair it again.
      setMade((current) => current.filter(([k]) => k !== wordId));
      setSelected(wordId);
      return;
    }
    setSelected((current) => (current === wordId ? null : wordId));
  };

  const pickMeaning = (meaningId: string) => {
    if (done) return;
    const owner = wordFor(meaningId);
    if (selected === null) {
      // Nothing is held: a tap on a paired meaning takes that pair apart.
      if (owner !== null) {
        hapticSelection();
        setMade((current) => current.filter(([, m]) => m !== meaningId));
        setSelected(owner);
      }
      return;
    }
    hapticSelection();
    setMade((current) => [
      // A meaning belongs to one word: an earlier pair using it is released.
      ...current.filter(([k, m]) => k !== selected && m !== meaningId),
      [selected, meaningId],
    ]);
    setSelected(null);
  };

  const check = () => {
    if (done || !allPaired) return;
    const right = new Set(made.filter(([k, m]) => k === m).map(([k]) => k));
    setGraded(right);
    setSelected(null);
    if (right.size === pairs.length) hapticPass();
    else hapticRetry();
    const responseMs = Date.now() - startedAt;
    onAnswered(
      pairs.map((pair) => ({ wordId: pair.wordId, correct: right.has(pair.wordId), responseMs })),
    );
  };

  const selectedWord = selected ? pairs.find((p) => p.wordId === selected) : undefined;
  /*
   * The verdict, in words.

   * After Check the caption used to go blank: the tiles took their blue and
   * red and each carried a hidden 정답 / 틀렸어요, but the one live region on
   * the screen said nothing, so a screen reader heard the Check press and
   * then silence, and a sighted learner got colour and a tick where every
   * other question in the product says *Correct.* or *Incorrect.* All right
   * is the shared two words; anything less says how many of the pairs held.
   */
  const status = done
    ? graded.size === pairs.length
      ? t('common:verdict.correct')
      : t('learning:review.matchRight', { right: graded.size, total: pairs.length })
    : selected !== null
      ? t('learning:review.matchPickMeaning', { word: selectedWord?.korean ?? '' })
      : allPaired
        ? t('learning:review.matchAllPaired')
        : t('learning:review.matchPickWord');

  return (
    <div className={styles.exercise} data-testid="match-exercise" data-state={done ? 'checked' : 'open'}>
      <p className={styles.prompt} id="match-instruction">
        {t('learning:review.prompt.match')}
      </p>

      <div className={styles.grid} role="group" aria-labelledby="match-instruction">
        <div className={styles.columnBlock}>
          <h3 className={styles.heading} id="match-heading-korean">
            {t('learning:review.matchColumnKorean')}
          </h3>
          <ul className={styles.column} aria-labelledby="match-heading-korean" data-testid="match-korean">
            {korean.map((pair) => {
              const meaningId = pairOf(pair.wordId);
              const isSelected = selected === pair.wordId;
              const right = done && graded.has(pair.wordId);
              const wrong = done && !graded.has(pair.wordId);
              const n = badge(pair.wordId);
              return (
                <li key={pair.wordId}>
                  <button
                    type="button"
                    lang="ko"
                    dir="ltr"
                    style={{ fontFamily }}
                    className={`${styles.tile} ${styles.koreanTile} ${isSelected ? styles.selected : ''} ${
                      meaningId !== null && !done ? styles.paired : ''
                    } ${right ? styles.right : ''} ${wrong ? styles.wrong : ''}`}
                    aria-pressed={isSelected}
                    aria-describedby={meaningId !== null ? `match-pair-${pair.wordId}` : undefined}
                    disabled={done}
                    onClick={() => pickWord(pair.wordId)}
                    data-testid="match-word"
                    data-state={
                      done ? (right ? 'right' : 'wrong') : isSelected ? 'selected' : meaningId !== null ? 'paired' : 'available'
                    }
                  >
                    {n > 0 && (
                      <span className={styles.badge} aria-label={t('learning:review.matchPairLabel', { n })}>
                        {n}
                      </span>
                    )}
                    <span className={styles.tileText}>{pair.korean}</span>
                    {done && (
                      <span className={right ? styles.markRight : styles.markWrong} aria-hidden="true">
                        {right ? <CheckIcon size={16} /> : <CloseIcon size={16} />}
                      </span>
                    )}
                    {done && (
                      <span className="hg-sr-only">
                        {t(right ? 'learning:review.markCorrect' : 'learning:review.markWrong')}
                      </span>
                    )}
                  </button>
                  {meaningId !== null && (
                    <span className="hg-sr-only" id={`match-pair-${pair.wordId}`}>
                      {t('learning:review.matchPaired', {
                        word: pair.korean,
                        meaning: pairs.find((p) => p.wordId === meaningId)?.meaning ?? '',
                      })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.columnBlock}>
          <h3 className={styles.heading} id="match-heading-meaning">
            {t('learning:review.matchColumnMeaning')}
          </h3>
          <ul className={styles.column} aria-labelledby="match-heading-meaning" data-testid="match-meanings">
            {meanings.map((pair) => {
              const owner = wordFor(pair.wordId);
              const n = owner !== null ? badge(owner) : 0;
              /*
                Enabled as a *target* while a word is held, and as a handle on
                its own pair once it is in one. With nothing held and nothing
                paired it is visibly waiting, which is what makes "the left
                column first" true without a sentence.
              */
              const target = selected !== null && !done;
              const enabled = !done && (target || owner !== null);
              const right = done && owner === pair.wordId;
              const wrong = done && owner !== null && owner !== pair.wordId;
              const answerOf = done && owner !== pair.wordId ? pair.wordId : null;
              return (
                <li key={pair.wordId}>
                  <button
                    type="button"
                    className={`${styles.tile} ${styles.meaningTile} ${target && owner === null ? styles.target : ''} ${
                      owner !== null && !done ? styles.paired : ''
                    } ${right ? styles.right : ''} ${wrong ? styles.wrong : ''} ${
                      answerOf ? styles.answerHint : ''
                    }`}
                    disabled={!enabled}
                    onClick={() => pickMeaning(pair.wordId)}
                    data-testid="match-meaning"
                    data-state={
                      done
                        ? right
                          ? 'right'
                          : wrong
                            ? 'wrong'
                            : 'unpaired'
                        : owner !== null
                          ? 'paired'
                          : target
                            ? 'target'
                            : 'waiting'
                    }
                  >
                    {n > 0 && (
                      <span className={styles.badge} aria-label={t('learning:review.matchPairLabel', { n })}>
                        {n}
                      </span>
                    )}
                    <LocalizedText as="span" locale={pair.meaningLocale} className={styles.tileText}>
                      {pair.meaning}
                    </LocalizedText>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/*
        The caption is the *next action*, and it changes with the state: what
        to tap first, which word is held, and when Check is ready. Polite, so
        a screen reader hears it after the tile it announced.
      */}
      <p
        className={`${styles.help} ${done ? (graded.size === pairs.length ? styles.helpRight : styles.helpWrong) : ''}`}
        aria-live="polite"
        data-testid="match-status"
      >
        {status}
      </p>

      {!done ? (
        <Button size="lg" fullWidth onClick={check} disabled={!allPaired} data-testid="match-check">
          {t('learning:review.matchCheck')}
        </Button>
      ) : (
        <Button size="lg" fullWidth onClick={onContinue} data-testid="match-next">
          {isLast ? t('learning:session.finish') : t('vocabulary:intro.next')}
        </Button>
      )}
    </div>
  );
}

/** `pairs`, rotated by `offset`. Stable, and never the identity for offset > 0. */
function rotate(pairs: readonly MatchPair[], offset: number): MatchPair[] {
  if (pairs.length === 0) return [];
  const shift = offset % pairs.length;
  return [...pairs.slice(shift), ...pairs.slice(0, shift)];
}
