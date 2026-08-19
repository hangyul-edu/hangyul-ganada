import { useTranslation } from 'react-i18next';

import { useFormatters } from '../../i18n';
import { Button } from '../../ui/Button';
import { HangyulMascot } from '../../ui/HangyulMascot';
import { Modal } from '../../ui/Modal';
import styles from './SessionCompleteModal.module.css';

export interface SessionCompleteModalProps {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  title: string;
  detail: string;
  /** Items passed in this session. */
  passed: number;
  total: number;
  /** Overrides the confirm label; defaults to the shared "OK". */
  continueLabel?: string;
}

/**
 * The celebration dialog, following `docs/design-refs/p243`: illustration inside
 * a dashed orange ring, a count badge, orange headline, grey subline, and a
 * single full-width confirm.
 */
export function SessionCompleteModal({
  open,
  onClose,
  onContinue,
  title,
  detail,
  passed,
  total,
  continueLabel,
}: SessionCompleteModalProps) {
  const { t } = useTranslation('common');
  const format = useFormatters();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={detail}
      footer={
        <Button size="lg" fullWidth onClick={onContinue}>
          {continueLabel ?? t('actions.confirm')}
        </Button>
      }
    >
      <div className={styles.art}>
        <span className={styles.ring} aria-hidden="true" />
        <HangyulMascot mood="cheer" size={92} />
        <span className={`${styles.badge} hg-numeric`}>{format.fraction(passed, total)}</span>
      </div>
    </Modal>
  );
}
