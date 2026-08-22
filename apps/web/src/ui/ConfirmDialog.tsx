import { useTranslation } from 'react-i18next';

import { Button } from './Button';
import { Modal } from './Modal';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  /** The question, as a question. */
  title: string;
  /** One or two lines under it, where the question needs them. */
  body?: string;
  /** The answer that does the thing. */
  confirmLabel: string;
  /** The answer that does not. */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Test hooks, so a spec can name the two answers apart. */
  confirmTestId?: string;
  cancelTestId?: string;
}

/**
 * "Are you sure?", in the product's own visual language.
 *
 * ## Why this exists as a component
 *
 * There were two of these — leaving the app, and erasing everything a learner
 * has done — and each assembled its own buttons in its own order out of the
 * generic `Modal`. One stacked them, one put them in a row. A learner meets a
 * confirmation perhaps twice in the life of the app and should not have to read
 * the layout afresh each time, and a dialog that looks improvised is a bad
 * place to be asked whether to delete something.
 *
 * So the shape is one component. What a caller supplies is the question and the
 * two answers; where they go, how large they are and which is which is settled
 * here, once.
 *
 * ## Which dialogs belong here, and which do not
 *
 * Only the ones that ask a yes/no question about an action. The session
 * celebration is a different thing wearing a similar frame — it announces
 * rather than asks — and *Report a problem* is a menu in a bottom sheet. Both
 * keep their own treatment, because making three unlike things share a
 * component is how a design system starts describing nothing.
 *
 * ## The two answers are equals
 *
 * Side by side, the same width, filled in different colours: grey for the
 * answer that changes nothing, orange for the one that acts. Not a loud button
 * and a faint one — the quiet answer is a real answer, and on the exit dialog
 * it is the one most people want. Cancel reads first, which puts the
 * consequential answer where a right thumb has to travel to reach it.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmTestId,
  cancelTestId,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common');
  return (
    <Modal
      open={open}
      onClose={onCancel}
      variant="confirm"
      title={title}
      description={body}
      showClose={false}
      footer={
        <div className={styles.answers}>
          <Button variant="neutral" fullWidth onClick={onCancel} data-testid={cancelTestId}>
            {cancelLabel}
          </Button>
          <Button fullWidth onClick={onConfirm} data-testid={confirmTestId}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {/*
        The dialog's whole content is its question, which `Modal` renders from
        `title` and `description`. This exists so a screen reader is told a
        decision is required before it reaches the two buttons.
      */}
      <span className="hg-sr-only">{t('a11y.confirmationRequired')}</span>
    </Modal>
  );
}
