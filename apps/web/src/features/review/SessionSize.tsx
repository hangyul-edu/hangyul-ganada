import { useTranslation } from 'react-i18next';

import { sessionSizes } from './sessionSizes';
import styles from './SessionSize.module.css';

/**
 * How long a practice session should be, chosen by the learner.
 *
 * ## Why the options are computed rather than listed
 *
 * The obvious control is three buttons reading 5, 10, 20. With seven saved
 * words that is one usable button and two that lie: pressing 20 gives a session
 * of seven, so the number on the button is not the number of questions, and the
 * learner finds that out afterwards. Every option this renders is a session
 * that can actually be run.
 *
 * So: the standard rungs that fit, and then **All** — which names the count, so
 * "All 7" is as precise as "5" is. When the whole list is smaller than the
 * first rung there is nothing to choose and the control is not drawn at all.
 *
 * ## Why ten is the default
 *
 * It is the daily vocabulary goal, so it is the length of session this learner
 * already knows the shape of. A first tap should be a familiar amount of work.
 */

export function SessionSize({
  available,
  value,
  onChange,
}: {
  available: number;
  value: number;
  onChange: (size: number) => void;
}) {
  const { t } = useTranslation(['learning']);
  const sizes = sessionSizes(available);
  // One option is not a choice. A control that can only be pressed to confirm
  // what is already true is a control that costs a tap and a line of screen.
  if (sizes.length < 2) return null;

  return (
    <div className={styles.row} role="group" aria-label={t('learning:practice.sizeLabel')}>
      <span className={styles.label}>{t('learning:practice.sizeLabel')}</span>
      <div className={styles.options}>
        {sizes.map((size) => {
          const whole = size === available;
          return (
            <button
              key={size}
              type="button"
              className={`${styles.option} ${size === value ? styles.optionOn : ''}`}
              onClick={() => onChange(size)}
              aria-pressed={size === value}
            >
              {whole ? t('learning:practice.sizeAll', { count: size }) : String(size)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
