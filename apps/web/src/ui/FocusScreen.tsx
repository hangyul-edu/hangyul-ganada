import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useScrollReset } from './useScrollReset';
import styles from './FocusScreen.module.css';

export interface FocusScreenProps {
  /** Header and progress: pinned above the scroll, never scrolled away. */
  header?: ReactNode;
  children: ReactNode;
  /**
   * What counts as a new screen for the learner.
   *
   * A lesson stays on one route while moving through many items and steps, so
   * the router cannot tell when the content has been replaced — only the screen
   * can. Give this the identity of what is currently being shown (the letter
   * and its step, the word and its step, the review question's position) and
   * the scroll region returns to the top each time that changes, and stays put
   * for everything that is not a change of item: answering, opening a sheet,
   * a re-render.
   */
  resetKey?: string;
  /**
   * The one action that leaves this screen, pinned to the foot.
   *
   * A screen whose primary action lives deep inside a component — the Check
   * button under a writing box — leaves this empty and lets that component
   * place itself here with `<FocusFooter>`. Either way the action ends up in
   * the same row, and the row is the one that reserves the system inset.
   */
  footer?: ReactNode;
}

/**
 * The shape of a learning screen, and the reason a button cannot end up under
 * the navigation bar.
 *
 * ```
 * ┌───────────────────────────┐  ← the shell has already cleared the status
 * │ header      (auto)        │    bar, the cutout and both side insets
 * ├───────────────────────────┤
 * │                           │
 * │ scrolling   (minmax(0,1fr))
 * │                           │
 * ├───────────────────────────┤
 * │ footer      (auto)        │  padding-bottom: gap + --hg-safe-bottom
 * │▓▓▓▓ system navigation ▓▓▓▓│  ← the footer's *background* reaches here.
 * └───────────────────────────┘    Nothing you can press does.
 * ```
 *
 * ## Why three rows and not a button at the end of a long page
 *
 * The lesson screens used to be one scrolling column with the primary action as
 * its last child and a fixed 32 px of padding under it. On a phone with a
 * three-button navigation bar that padding is smaller than the bar, so
 * scrolling to the very bottom still left the foot of the orange Trace it
 * button inside Android's furniture — which is what a physical Samsung
 * photographed. Adding more padding fixes that phone and is wrong on the next
 * one.
 *
 * A grid row settles it structurally instead. The footer is a **sibling** of
 * the scroll region rather than something floating over the end of it, so the
 * scroll region is by construction the height that is left after the footer has
 * taken what it needs — and what it needs is its own visual padding *plus*
 * whatever the platform says the system furniture is, measured at runtime.
 * There is no arrangement of content length, font scale or navigation mode in
 * which the two overlap, because they are not in the same box.
 *
 * ## The background goes under the bar; the button does not
 *
 * With edge-to-edge layouts the app owns the pixels behind a transparent
 * navigation bar, and leaving them a different colour is what makes an app look
 * like a web page someone dropped into a frame. So the footer's ground —
 * `--hg-gradient-ground`, the same fade Home and the word carousel use — is
 * painted all the way to the bottom edge, and only the *interactive* content is
 * held above the inset. Background may sit behind system UI. A control may not.
 *
 * ## The scroll region reserves it too
 *
 * A screen can have no action at all — the sound-changes reference is a page of
 * reading — and a long one has to be scrollable to its very last line without
 * that line ending up behind the bar. So the reservation lives on the scroll
 * region by default and moves to the footer when there is one. Either way it is
 * reserved exactly once.
 */

/**
 * The footer row's element, for a descendant that wants to place its action in
 * it. `null` outside a `FocusScreen`, which is what makes `FocusFooter`
 * degrade to rendering in place on the web layouts that have no such row.
 */
const FooterSlot = createContext<HTMLElement | null>(null);

export function FocusScreen({ header, children, footer, resetKey = '' }: FocusScreenProps) {
  /*
   * State rather than a ref, because a descendant portalling into this element
   * has to re-render once the element exists — a ref would still be null on the
   * pass that mattered, and the action would silently render nowhere.
   */
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  // The middle row is the scroller on a learning screen; `AppShell` has handed
  // it a fixed height precisely so that it is. See `useScrollReset`.
  useScrollReset(scroll, resetKey);

  return (
    <div className={styles.screen}>
      {header ? <div className={styles.header}>{header}</div> : null}
      <FooterSlot.Provider value={slot}>
        {/* Named so a test, and the on-device QA script, can find the element
            that actually scrolls rather than guessing at a hashed class. */}
        <div className={styles.scroll} ref={scroll} data-scroll-region="focus">
          {children}
        </div>
        {/*
          Always rendered, never conditionally: a descendant cannot portal into
          an element that is not there yet. `.footer:empty` collapses it when
          nothing has claimed it, so a screen with no action costs no space.
        */}
        <div className={styles.footer} ref={setSlot}>
          {footer}
        </div>
      </FooterSlot.Provider>
    </div>
  );
}

/**
 * Places this screen's primary action in the safe footer, from wherever the
 * component that owns it happens to live in the tree.
 *
 * The Check button is the case this exists for. It belongs to the writing card
 * — it knows whether the canvas is empty and whether a verdict is already
 * showing — but it is the one thing on the screen a learner has to be able to
 * press, and a control that scrolls with its content can be scrolled to the
 * bottom edge of the screen, which on a phone is where Android draws its
 * navigation. Rendering it into the footer row makes it structurally impossible
 * for that to happen, without moving ownership of the state that drives it.
 *
 * Outside a `FocusScreen` — the desktop shell, a test rendering the card on its
 * own — there is no row to portal into and the children render where they are.
 */
export function FocusFooter({ children }: { children: ReactNode }) {
  const slot = useContext(FooterSlot);
  if (!slot) return <>{children}</>;
  return createPortal(children, slot);
}
