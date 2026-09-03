import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackNavigation } from './backNavigation';
import { ChevronLeftIcon, CloseIcon } from './icons';
import { useIsDarkAppearance } from './appearance';
import styles from './AppHeader.module.css';

/** Intrinsic size of `brand/logo-lockup.png`, for the aspect ratio. */
const LOGO = { width: 2412, height: 508 };
/** Rendered height. Compact by intent — see `.brandLogo`. */
const LOGO_HEIGHT = 26;

export interface AppHeaderProps {
  title?: string;
  /**
   * What the back chevron does, when this screen needs it to do something
   * special — leave a sitting, confirm an unsaved answer, return to a parent
   * the learner did not arrive from.
   *
   * **Omitting it does not remove the chevron.** On a titled header there is no
   * way to remove the chevron, which is the point: every screen a learner
   * navigates *to* has one, in the same corner, and a screen that omits this
   * simply gets the app's own rule — see `useBackNavigation`. Six screens used
   * to have no back arrow at all because the prop was optional and opting in
   * was easy to forget: Letters, Numbers, Words, a word category, Review and My
   * Learning. On a phone with gesture navigation and no visible system bar,
   * those were screens with no visible way back.
   *
   * The `brand` variant — Home, and only Home — draws no chevron at all, and
   * this prop is meaningless there. See the comment at that branch.
   *
   * `true` is accepted and means the same as omitting it; it is kept because
   * several screens say it explicitly and reading `onBack` as "the default" is
   * clearer than reading its absence.
   */
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
  const { t } = useTranslation('common');
  const { goBack } = useBackNavigation();
  const handleBack = () => {
    if (typeof onBack === 'function') onBack();
    else goBack();
  };

  /*
   * The chevron itself, so the branded header and the titled one draw the same
   * control rather than two that look alike.
   *
   * 44 by 44 and its own accessible name in all thirty-two languages; the
   * padding and the hit area are in `.iconButton`, which is shared with the
   * close cross opposite it.
   */
  const back = (
    <button
      type="button"
      className={styles.iconButton}
      onClick={handleBack}
      aria-label={t('actions.back')}
      data-testid="app-back"
    >
      <ChevronLeftIcon />
    </button>
  );

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
        {/*
          Home draws no back control, and it is the only screen that does not.

          It had one for exactly one release. The argument was consistency — a
          corner that is a control on every screen but one is a corner people
          stop looking at — and a screenshot of it beside the product's own
          logo answered the argument: on the screen the app opens to, a back
          arrow reads as *go back from the beginning*, and on a first launch
          there is nothing behind it to go back to.

          Nothing replaces it and no space is held for it: the logo starts on
          the same rule as the cards below. Android's system back still works
          here and offers to leave the app — see `SystemBack` — because that is
          the platform's own gesture and removing a painted control is not a
          reason to break it.
        */}
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
      <div className={styles.side}>{back}</div>

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
