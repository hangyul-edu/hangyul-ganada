import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../ui/Button';
import { AlertIcon, CheckIcon } from '../../ui/icons';
import type { SyllableWritingState } from './useWordWriting';
import { syllableAdvice } from './wordFeedback';
import styles from './WordFeedbackSheet.module.css';

export interface WordFeedbackSheetProps {
  open: boolean;
  word: string;
  syllables: readonly SyllableWritingState[];
  /** Indices needing another attempt, in writing order. */
  needsWork: readonly number[];
  passed: boolean;
  onFix: (index: number) => void;
  onClose: () => void;
  onContinue: () => void;
  continueLabel: string;
}

/**
 * One result for one word.
 *
 * The old screen could produce four verdicts for 기도하다 — one per box, each
 * arriving whenever that box was checked. This replaces all of them with a
 * single card that says which parts are right, which need another go, and what
 * to do about each one.
 *
 * The tone is a teacher's, not a test's. "Almost there" and "two parts need
 * another try", never "2/4" or "FAILED" — a learner who has written half a word
 * correctly has done something, and a score sheet is the wrong way to say so.
 * Nor is it a celebration: this is an adult learning an alphabet, so a pass gets
 * "nice work" and not confetti.
 */
export function WordFeedbackSheet({
  open,
  word,
  syllables,
  needsWork,
  passed,
  onFix,
  onClose,
  onContinue,
  continueLabel,
}: WordFeedbackSheetProps) {
  const { t } = useTranslation(['handwriting', 'vocabulary', 'common']);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Moving focus to the heading is what makes the result reachable without a
  // pointer, and what a screen reader reads first when the card appears.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const remaining = needsWork.length;
  const headline = passed
    ? t('handwriting:word.result.passed')
    : remaining === syllables.length
      ? t('handwriting:word.result.allAgain')
      : t('handwriting:word.result.almost');

  return (
    <div className={styles.scrim} role="presentation" onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-result-heading"
        onClick={(event) => event.stopPropagation()}
        data-testid="word-feedback"
      >
        <h2
          id="word-result-heading"
          className={styles.headline}
          ref={headingRef}
          tabIndex={-1}
          data-testid="word-feedback-headline"
        >
          {headline}
        </h2>

        {!passed && (
          <p className={styles.summary} data-testid="word-feedback-summary">
            {t('handwriting:word.result.needsWork', { count: remaining })}
          </p>
        )}

        {/* Every syllable, so the learner sees what stands as well as what does
            not — the passes are the reason they do not have to write it again. */}
        <ul className={styles.list} dir="ltr">
          {syllables.map((syllable, i) => {
            const ok = syllable.status === 'passed';
            const advice = ok ? null : syllableAdvice(syllable);
            return (
              <li
                key={`${word}-result-${i}`}
                className={`${styles.item} ${ok ? styles.ok : styles.todo}`}
                data-status={ok ? 'passed' : 'needsWork'}
                data-testid="word-feedback-item"
              >
                <span className={`${styles.mark} ${ok ? styles.markOk : styles.markTodo}`} aria-hidden="true">
                  {ok ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
                </span>
                <span className={styles.syllable} lang="ko">
                  {syllable.text}
                </span>
                <span className={styles.advice}>
                  {ok
                    ? t('handwriting:word.advice.passed')
                    : t(`handwriting:${advice!.key}`, advice!.params)}
                </span>
                {!ok && (
                  <Button
                    size="sm"
                    variant="outline"
                    pill
                    onClick={() => onFix(i)}
                    aria-label={t('handwriting:word.fixSyllable', { syllable: syllable.text })}
                    data-testid="word-feedback-fix"
                  >
                    {t('handwriting:word.fix')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        <div className={styles.actions}>
          {passed ? (
            <Button size="lg" fullWidth onClick={onContinue} data-testid="word-feedback-continue">
              {continueLabel}
            </Button>
          ) : (
            <Button
              size="lg"
              fullWidth
              onClick={() => {
                // Straight to the first part that needs work — the summary has
                // been read, and the next thing to do is the repair.
                onClose();
                if (needsWork.length > 0) onFix(needsWork[0]!);
              }}
              data-testid="word-feedback-primary"
            >
              {/*
                Names the syllable rather than saying "that part". With two
                parts to fix, "try that part again" is wrong about which — and
                the honest answer is the one the button actually does: it opens
                the first of them. The rest are listed directly above with their
                own Fix buttons.
              */}
              {t('handwriting:word.fixSyllable', {
                syllable: syllables[needsWork[0] ?? 0]?.text ?? '',
              })}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
