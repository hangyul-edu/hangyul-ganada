import { useTranslation } from 'react-i18next';

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
 * ## It disappears entirely when there is nowhere to send anyone
 *
 * `HANGYUL_URL` is unset in a plain checkout, and then this renders `null`
 * rather than a card whose link goes nowhere. See the note on that constant.
 */
export function NextStepCard({ variant }: { variant: 'earned' | 'row' }) {
  const { t } = useTranslation('learning');
  if (!HANGYUL_URL) return null;

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
