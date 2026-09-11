import type { ReactNode } from 'react';

import { AlertIcon, CheckIcon, EyeIcon } from './icons';
import styles from './FeedbackState.module.css';

export interface FeedbackStateProps {
  /**
   * `revealed` is the third outcome a question can have: the learner asked for
   * the answer instead of giving one. Neither a pass nor a slip, and drawn as
   * neither — a neutral border and an eye, because what happened is that
   * something was *seen*. The item is owed again later.
   */
  status: 'correct' | 'incorrect' | 'revealed';
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
  const tone = styles[status];
  return (
    <div className={`${styles.card} ${tone}`} role="status" data-feedback={status}>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          {status === 'correct' ? (
            <CheckIcon size={18} />
          ) : status === 'revealed' ? (
            <EyeIcon size={18} />
          ) : (
            <AlertIcon size={18} />
          )}
        </span>
        <p className={styles.headline}>{headline}</p>
      </div>
      {children ? <div className={styles.body}>{children}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
