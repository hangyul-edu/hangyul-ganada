import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { HANGYUL_URL } from '../../config/product';
import { Card } from '../../ui/Card';
import styles from './NextStepCard.module.css';

/**
 * What comes after this product.
 *
 * ## The dead end this closes
 *
 * Hangyul ganada teaches the alphabet, the syllable blocks and a first
 * vocabulary, and then stops. Speaking and TOPIK are the main Hangyul product's
 * job, which is the stated reason this one exists — and until now a learner who
 * finished all forty letters was shown a completed progress ring and nothing
 * else. The journey had no next step in it anywhere.
 *
 * ## Why it is a card and not a banner
 *
 * The brief is emphatic about restraint, and it is right to be: a cross-sell
 * that interrupts, repeats, or follows the learner around stops reading as
 * advice and starts reading as advertising, at which point it is worth less
 * than nothing to a paid product. So:
 *
 * * It appears in exactly two places — once at the end of the alphabet, and
 *   permanently as one quiet row at the bottom of My Learning.
 * * It never interrupts a lesson, never covers anything, and has no dismiss
 *   button because there is nothing to dismiss.
 * * It is worded as the next thing to learn, not as an offer.
 *
 * ## When there is nowhere to send anyone, it points inside this app
 *
 * `HANGYUL_URL` is unset in a plain checkout and in the web build. The My
 * Learning row then renders `null` rather than a link that goes nowhere; the
 * earned card at the end of the alphabet still renders, naming Today's Words
 * as the next step, because the alphabet has to end somewhere. See the note
 * on that constant.
 */
export function NextStepCard({ variant }: { variant: 'earned' | 'row' }) {
  const { t } = useTranslation('learning');
  if (!HANGYUL_URL) {
    /*
     * No destination, so no hand-off — but the alphabet still ends somewhere.
     *
     * A learner who has just finished the fortieth letter used to be shown the
     * completed units and the two side rows, and nothing that said what to do
     * next. The onward product is a business fact this repository does not
     * hold (I-03) and nothing here guesses at it; what the product *does* hold
     * is the rest of itself. So the earned card names the next thing inside
     * this app — Today's Words, which is what the alphabet was for — and the
     * My Learning row stays absent, because that screen already lists it.
     */
    if (variant !== 'earned') return null;
    return (
      <Card padding="md" className={styles.card} data-testid="next-step-in-product">
        <h2 className={styles.title}>{t('nextStep.inProduct.title')}</h2>
        <p className={styles.body}>{t('nextStep.inProduct.body')}</p>
        <Link to="/words" className={styles.cta}>
          {t('nextStep.inProduct.cta')}
        </Link>
      </Card>
    );
  }

  if (variant === 'row') {
    return (
      <a className={styles.row} href={HANGYUL_URL} target="_blank" rel="noreferrer noopener">
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{t('nextStep.rowTitle')}</span>
          <span className={styles.rowBody}>{t('nextStep.rowBody')}</span>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </a>
    );
  }

  return (
    <Card padding="md" className={styles.card}>
      <h2 className={styles.title}>{t('nextStep.title')}</h2>
      <p className={styles.body}>{t('nextStep.body')}</p>
      <a className={styles.cta} href={HANGYUL_URL} target="_blank" rel="noreferrer noopener">
        {t('nextStep.cta')}
      </a>
    </Card>
  );
}
