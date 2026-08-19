import { useEffect, useRef } from 'react';

import { useLearner } from '../../store/LearnerContext';

/**
 * Measures how long the learner actually spends studying.
 *
 * ## The problem it replaces
 *
 * Study time used to be inferred from the gaps between recorded events: two
 * attempts forty seconds apart contributed forty seconds. That is the only
 * thing available without a timer, and it is wrong in a specific, always-low
 * direction — the stretch after the *last* event of a session has nothing
 * following it, so it counts as zero. A learner who wrote their last letter and
 * closed the app lost every second spent on it. Sessions reported roughly a
 * fifth less time than they took, and the number on the Activity screen was
 * quietly a fiction.
 *
 * ## What it does instead
 *
 * Counts wall-clock time while the study screen is mounted **and** the app is
 * in the foreground, and stops the moment it is not. The two conditions matter
 * separately:
 *
 * - **Mounted** — time on the Words list is not study time. This runs on the
 *   session screens only.
 * - **Visible** — a phone that is locked, an app that is switched away from, a
 *   tab in the background. `visibilitychange` fires for all three on every
 *   platform the app ships to, including inside the Capacitor WebView.
 *
 * ## Why it flushes rather than counting up
 *
 * Time is added in short stretches — every fifteen seconds, plus once whenever
 * the app is hidden or the screen unmounts — rather than accumulated and
 * written once at the end. A session that ends because the phone died, the tab
 * was closed, or the learner navigated away with the back gesture still has all
 * but its last few seconds recorded, and no path exists where a long session
 * records nothing at all.
 *
 * ## Monotonic time
 *
 * `performance.now()`, not `Date.now()`. A device that corrects its clock, or
 * crosses a daylight-saving boundary mid-session, must not be able to add or
 * remove an hour from the learner's study record.
 */

/** How often measured time is written out while the learner is working. */
const FLUSH_MS = 15_000;

export function useStudyClock(active = true): void {
  const { recordStudyTime } = useLearner();
  // Held in a ref so a re-render of the session screen — which happens on every
  // stroke — never restarts the clock.
  const since = useRef<number | null>(null);
  const record = useRef(recordStudyTime);
  record.current = recordStudyTime;

  useEffect(() => {
    if (!active) return;
    if (typeof document === 'undefined' || typeof performance === 'undefined') return;

    const now = () => performance.now();

    const start = () => {
      if (since.current === null) since.current = now();
    };

    const flush = () => {
      if (since.current === null) return;
      const elapsed = now() - since.current;
      since.current = now();
      if (elapsed > 0) record.current(elapsed);
    };

    const stop = () => {
      flush();
      since.current = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    // `pagehide` rather than `unload`: it is the one that fires on iOS when the
    // app is swiped away, and the one bfcache does not skip.
    window.addEventListener('pagehide', stop);
    const timer = setInterval(flush, FLUSH_MS);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [active]);
}
