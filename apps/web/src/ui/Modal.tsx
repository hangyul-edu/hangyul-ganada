import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useSystemBack } from '../native/useSystemBack';
import { CloseIcon } from './icons';
import { lockScroll } from './scrollLock';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * `center` is the celebration dialog, `sheet` slides up from the bottom, and
   * `confirm` is the two-answer dialog specified in the design file. See
   * `ConfirmDialog`, which is what callers should reach for rather than this.
   */
  variant?: 'center' | 'sheet' | 'confirm';
  /** Accessible name. Rendered as the heading unless `hideTitle`. */
  title: string;
  hideTitle?: boolean;
  description?: string;
  showClose?: boolean;
  /** Blocks dismissal by backdrop or Escape — used for required decisions. */
  dismissible?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Modal / bottom sheet, following the celebration dialog on `p101` / `p243`:
 * cream surface, generous radius, illustration, orange headline, full-width
 * confirm.
 *
 * Focus is moved into the dialog on open, trapped while it is open, and
 * returned to the trigger on close.
 */
export function Modal({
  open,
  onClose,
  variant = 'center',
  title,
  hideTitle = false,
  description,
  showClose = true,
  dismissible = true,
  children,
  footer,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const { t } = useTranslation('common');

  /*
   * The phone's Back button closes this before it means anything else.
   *
   * Every modal and sheet in the app comes through here, so registering once
   * covers all of them — and covers them in the right order, because the
   * handler stack is asked newest-first and a sheet opened over a dialog is
   * mounted after it. A modal that refuses to be dismissed declines the press
   * rather than consuming it: it is asking a question that has to be answered,
   * and swallowing Back would leave the learner with no way out at all.
   */
  useSystemBack(() => {
    if (!dismissible) return false;
    onClose();
    return true;
  }, open);

  useEffect(() => {
    if (!open) return undefined;

    returnFocusTo.current = document.activeElement as HTMLElement | null;
    // Focus the dialog itself rather than its first control, so a screen reader
    // announces the title before the confirm button.
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    /*
     * The counted lock, not this component's own save-and-restore.
     *
     * What was here locked `document.body`, which is not what scrolls in this
     * app, and restored a remembered value — which is only correct while
     * dialogs close in the order they opened. See `ui/scrollLock.ts` for the
     * two ways that failed and the ordering that produced them.
     */
    const unlock = lockScroll();

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      unlock();
      returnFocusTo.current?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  const titleId = 'hg-modal-title';
  const descId = description ? 'hg-modal-desc' : undefined;

  return (
    <div
      className={`${styles.overlay} ${variant === 'sheet' ? styles.overlaySheet : ''}`}
      onClick={dismissible ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className={`${styles.dialog} ${styles[variant]}`}
        onClick={(event) => event.stopPropagation()}
      >
        {variant === 'sheet' && <div className={styles.grabber} aria-hidden="true" />}

        {showClose && dismissible && (
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('actions.close')}>
            <CloseIcon size={22} />
          </button>
        )}

        <h2 id={titleId} className={hideTitle ? 'hg-sr-only' : styles.title}>
          {title}
        </h2>
        {description && (
          <p id={descId} className={styles.description}>
            {description}
          </p>
        )}

        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
