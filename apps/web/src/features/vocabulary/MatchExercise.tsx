import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { hapticPass, hapticRetry, hapticSelection } from '../../native/haptics';
import { Button } from '../../ui/Button';
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
  /** Called once per word, when the whole grid is done. */
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
 * ## How it behaves
 *
 * Tap a Korean word, tap a meaning. Right, and the two lock together and stay
 * on screen greyed and struck through, so the learner can see what they have
 * used up. Wrong, and both flash and clear — nothing is revealed, nothing is
 * removed, and they can try again.
 *
 * Tap-tap rather than drag. A drag on a phone competes with the scroll, needs a
 * pointer-events dance to work at all, and is unusable one-handed on a large
 * screen; two taps work everywhere, are reachable by keyboard for free because
 * both sides are real buttons, and can be undone by tapping the selected word
 * again.
 *
 * ## What counts as knowing a word
 *
 * A word is correct if its pair was made **without a wrong attempt involving
 * it**. Getting 물 wrong once and then right does not count as knowing 물 — the
 * grid would otherwise mark everything correct eventually, since a learner who
 * keeps tapping must finish. Mistakes are attributed to *both* sides of the
 * wrong attempt, because either one of them might have been the misunderstood
 * one and there is no way to tell which from a single tap.
 */
export function MatchExercise({ pairs, fontFamily, isLast, onAnswered, onContinue }: Props) {
  const { t } = useTranslation(['learning', 'vocabulary']);
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

  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [missed, setMissed] = useState<string[]>([]);
  const [wrong, setWrong] = useState<{ korean: string; meaning: string } | null>(null);
  const [reported, setReported] = useState(false);

  const done = matched.length === pairs.length;

  const pick = (wordId: string) => {
    if (matched.includes(wordId)) return;
    hapticSelection();
    setWrong(null);
    setSelected((current) => (current === wordId ? null : wordId));
  };

  const answer = (wordId: string) => {
    if (matched.includes(wordId) || selected === null) return;
    if (selected === wordId) {
      hapticPass();
      const now = [...matched, wordId];
      setMatched(now);
      setSelected(null);
      setWrong(null);
      if (now.length === pairs.length && !reported) {
        setReported(true);
        const responseMs = Date.now() - startedAt;
        onAnswered(
          pairs.map((pair) => ({
            wordId: pair.wordId,
            correct: !missed.includes(pair.wordId),
            responseMs,
          })),
        );
      }
      return;
    }
    hapticRetry();
    // Both sides of a wrong attempt are marked. Which of the two the learner
    // actually misunderstood is not knowable from one tap, and crediting the
    // one they happened to tap second would be a guess dressed as a measurement.
    setMissed((current) => [...new Set([...current, selected, wordId])]);
    setWrong({ korean: selected, meaning: wordId });
    setSelected(null);
  };

  return (
    <div className={styles.exercise}>
      <p className={styles.prompt}>{t('learning:review.prompt.match')}</p>

      <div className={styles.grid} role="group" aria-label={t('learning:review.prompt.match')}>
        <ul className={styles.column}>
          {korean.map((pair) => (
            <li key={pair.wordId}>
              <button
                type="button"
                lang="ko"
                dir="ltr"
                style={{ fontFamily }}
                className={`${styles.tile} ${styles.koreanTile} ${
                  matched.includes(pair.wordId) ? styles.matched : ''
                } ${selected === pair.wordId ? styles.selected : ''} ${
                  wrong?.korean === pair.wordId ? styles.wrong : ''
                }`}
                aria-pressed={selected === pair.wordId}
                disabled={matched.includes(pair.wordId)}
                onClick={() => pick(pair.wordId)}
              >
                {pair.korean}
              </button>
            </li>
          ))}
        </ul>

        <ul className={styles.column}>
          {meanings.map((pair) => (
            <li key={pair.wordId}>
              <button
                type="button"
                className={`${styles.tile} ${styles.meaningTile} ${
                  matched.includes(pair.wordId) ? styles.matched : ''
                } ${wrong?.meaning === pair.wordId ? styles.wrong : ''}`}
                disabled={matched.includes(pair.wordId) || selected === null}
                onClick={() => answer(pair.wordId)}
              >
                <LocalizedText as="span" locale={pair.meaningLocale}>
                  {pair.meaning}
                </LocalizedText>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {!done && (
        <p className={styles.help} aria-live="polite">
          {selected === null
            ? t('learning:review.matchPickWord')
            : t('learning:review.matchPickMeaning')}
        </p>
      )}

      {done && (
        <Button size="lg" fullWidth onClick={onContinue}>
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
