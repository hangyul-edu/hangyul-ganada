import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ChevronLeftIcon, CloseIcon } from './icons';
import { useIsDarkAppearance } from './appearance';
import styles from './AppHeader.module.css';

/** Intrinsic size of `brand/logo-lockup.png`, for the aspect ratio. */
const LOGO = { width: 2412, height: 508 };
/** Rendered height. Compact by intent — see `.brandLogo`. */
const LOGO_HEIGHT = 26;

export interface AppHeaderProps {
  title?: string;
  /** Shows a back chevron. `true` goes back in history. */
  onBack?: (() => void) | true;
  /** Shows a close cross on the right. */
  onClose?: () => void;
  /** Content rendered on the right, when there is no close button. */
  action?: ReactNode;
  /**
   * `brand` shows the Hangyul logo on the left instead of a centred title —
   * the home style. `title` is then the logo's accessible name, so it is
   * required rather than optional in practice.
   */
  variant?: 'title' | 'brand';
  transparent?: boolean;
}

/**
 * The app bar from the reference screens: back chevron on the left, title
 * optically centred, one action on the right.
 */
export function AppHeader({
  title,
  onBack,
  onClose,
  action,
  variant = 'title',
  transparent = false,
}: AppHeaderProps) {
  const dark = useIsDarkAppearance();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const handleBack = () => {
    if (onBack === true) navigate(-1);
    else onBack?.();
  };

  /**
   * Brand first, then straight into the lesson.
   *
   * The logo *is* the page's heading — it is what names the screen — so it
   * lives inside the `<h1>` and lends it the alt text as its accessible name.
   * A separate visible greeting above the learning content was the previous
   * design and it cost a third of the first screen to say nothing the learner
   * did not already know.
   *
   * The real asset, not a text approximation: it is the only place in the app
   * the product's own mark appears, and a paid app whose logo is a `<span>` in
   * the UI font looks exactly as unfinished as that sounds.
   */
  if (variant === 'brand') {
    return (
      <header className={`${styles.header} ${styles.brand}`}>
        <h1 className={styles.brandTitle}>
          <img
            className={styles.brandLogo}
            src={`${import.meta.env.BASE_URL}brand/logo-lockup${dark ? '-dark' : ''}.png`}
            alt={title ?? ''}
            width={Math.round((LOGO.width / LOGO.height) * LOGO_HEIGHT)}
            height={LOGO_HEIGHT}
            decoding="async"
            // First paint on the screen the app opens to: never lazy.
            fetchPriority="high"
          />
        </h1>
        {action ? <div className={styles.action}>{action}</div> : null}
      </header>
    );
  }

  // A pill in the right slot is wider than the icon-button track it sits in, so
  // the header reserves room for it on *both* sides. See `.withAction`.
  const hasAction = !onClose && Boolean(action);

  return (
    <header
      className={`${styles.header} ${hasAction ? styles.withAction : ''} ${
        transparent ? styles.transparent : ''
      }`}
    >
      <div className={styles.side}>
        {onBack ? (
          <button type="button" className={styles.iconButton} onClick={handleBack} aria-label={t('actions.back')}>
            <ChevronLeftIcon />
          </button>
        ) : null}
      </div>

      <h1 className={styles.title}>{title}</h1>

      {/*
        The action slot is inset further than the close button, and that is
        deliberate — see `.sideAction`. A close cross is an icon button and
        belongs on the same rule as the back chevron opposite it; the progress
        badge is a filled pill, and a pill's own edge is not its optical edge.
      */}
      <div className={`${styles.side} ${styles.sideEnd} ${hasAction ? styles.sideAction : ''}`}>
        {onClose ? (
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label={t('actions.close')}>
            <CloseIcon />
          </button>
        ) : (
          action
        )}
      </div>
    </header>
  );
}
