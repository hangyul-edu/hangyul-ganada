import { useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useLearner } from '../store/LearnerContext';
import { useScrollReset } from './useScrollReset';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: ReactNode;
  /** Rendered below the scroll area — the bottom navigation. */
  footer?: ReactNode;
  /** Warm vertical gradient, as the learning-session screens use. */
  tone?: 'plain' | 'warm' | 'session';
  /**
   * Whether the shell scrolls its own content.
   *
   * True for every tabbed screen, which is a single column of cards. False for
   * the learning screens, which own their own three-row layout — a header, a
   * scroll region and a safe action footer — and would be scrolled *twice* if
   * the shell scrolled them as well: the footer would drift up and down inside
   * an outer scroller instead of being pinned to the foot of the screen, which
   * is the one thing it exists to be. See `FocusScreen`.
   */
  scroll?: boolean;
}

/**
 * The phone-shaped surface every screen lives inside.
 *
 * On wide viewports this centres at a phone width rather than stretching: the
 * design is drawn at 375 pt, the learning interaction wants a focused column,
 * and a 1440 px-wide writing canvas would be worse, not better. The surround
 * gets the warm page tint so the desktop view still reads as Hangyul.
 */
export function AppShell({ children, footer, tone = 'plain', scroll = true }: AppShellProps) {
  const { state } = useLearner();
  const main = useRef<HTMLElement>(null);
  const location = useLocation();
  /*
   * A new screen opens at the top.
   *
   * `<main>` is the element that scrolls on a tabbed screen, so it is the one
   * reset — the window is not a scroller here and never has been. The key is
   * the path *and* the query, because `/review/session?mode=listen` and
   * `?mode=write` are two different sittings. A learning screen leaves this
   * alone: it does not scroll here, and resets its own middle row per item.
   * See `FocusScreen`.
   */
  useScrollReset(main, `${location.pathname}${location.search}`);

  return (
    <div className={styles.viewport}>
      <div
        className={`${styles.shell} ${styles[tone]}`}
        /*
         * Which engine the learner's progress is actually in.
         *
         * Settings says this in words, for the learner. This says it in a form
         * a test can read, because "is the native build really using SQLite and
         * not quietly falling back to the WebView's storage?" is a question
         * only answerable on a device, and the answer is invisible when it is
         * wrong. `scripts/qa-native-android.mjs` asserts on it against the
         * installed app.
         */
        data-storage-engine={state.storage.engine}
        data-storage-durable={String(state.storage.durable)}
      >
        <main
          id="main"
          ref={main}
          data-scroll-region={scroll ? 'shell' : undefined}
          className={`${styles.content} ${scroll ? styles.scrolls : styles.fills}`}
          tabIndex={-1}
        >
          {children}
        </main>
        {footer}
      </div>
    </div>
  );
}
