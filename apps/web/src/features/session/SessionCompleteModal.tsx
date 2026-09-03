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
  /**
   * A second line, only where there is a second thing to say.
   *
   * Optional because on three of the four screens that use this dialog there
   * was not one, and each of them said something anyway. Review said
   * *1 practised · 1 came straight back to you · 1 will return soon* — three
   * counts for one item, which reads as three items and contradicts itself
   * besides. Words said *10 words learned* above a badge already reading 10/10.
   * Letters named a lesson the header behind the dialog was already naming.
   *
   * The rule this leaves: a subtitle earns its place by saying something the
   * title and the badge do not.
   */
  detail?: string;
  /** Items passed in this session. */
  passed: number;
  total: number;
  /** Overrides the confirm label; defaults to the shared "OK". */
  continueLabel?: string;
}

/**
 * The completion dialog, following `docs/design-refs/p243`: illustration inside
 * a dashed orange ring, a count badge, a headline, and a single full-width
 * confirm.
 *
 * The grey subline the reference sheet drew is now optional and, on every
 * screen in the product today, absent — see `detail`. What is left is the
 * shape a result screen needs and nothing else: what finished, how much of it,
 * one way on.
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
