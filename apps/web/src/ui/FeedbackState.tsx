import type { ReactNode } from 'react';

import { AlertIcon, CheckIcon } from './icons';
import styles from './FeedbackState.module.css';

export interface FeedbackStateProps {
  status: 'correct' | 'incorrect';
  headline: string;
  children?: ReactNode;
  /** Secondary actions — retry, hint, show the guide again. */
  actions?: ReactNode;
}

/**
 * The answer-feedback card from `docs/design-refs/p235` (correct) and `p237`
 * (incorrect): white card, 1px semantic border, semantic icon and headline.
 * Hangyul never uses a filled green or red banner, so neither does this.
 *
 * `role="status"` announces the result without stealing focus, so a learner on
 * a screen reader hears the verdict and can then reach the retry button.
 */
export function FeedbackState({ status, headline, children, actions }: FeedbackStateProps) {
  const correct = status === 'correct';
  return (
    <div className={`${styles.card} ${correct ? styles.correct : styles.incorrect}`} role="status">
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          {correct ? <CheckIcon size={18} /> : <AlertIcon size={18} />}
        </span>
        <p className={styles.headline}>{headline}</p>
      </div>
      {children ? <div className={styles.body}>{children}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
