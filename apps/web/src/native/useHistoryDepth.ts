import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * How many entries this app has pushed since it was opened.
 *
 * ## What it is for
 *
 * The phone's Back button has to answer a question the router cannot: *is
 * there somewhere of mine to go back to?* `window.history.length` is no help —
 * it counts the whole tab, including the pages the learner visited before they
 * arrived here, and going "back" into those means leaving the app sideways
 * rather than returning to the previous screen.
 *
 * So the depth is counted from this app's own navigations. Zero means the
 * current screen is the first one this session put on the stack: a cold start,
 * a deep link, or a refreshed page. Anything above zero means `navigate(-1)`
 * lands on a screen the learner actually came from.
 *
 * ## Why `REPLACE` does not count
 *
 * A replace swaps the current entry rather than adding one, so the thing
 * behind it is unchanged and the depth with it. This is the part that made the
 * old behaviour look arbitrary: switching a letter category replaces the
 * entry, so a learner who opened Letters, changed category twice and pressed
 * Back was — correctly — one step from Letters, but the rule in `SystemBack`
 * ignored history entirely and sent them Home. Counting pushes and replaces
 * differently is what lets Back mean "the screen before this one" without a
 * per-route table of where each screen thinks it came from.
 *
 * ## Why a ref and not state
 *
 * Nothing renders from this. Re-rendering the tree on every navigation to
 * store a number that only a Back press reads would be a re-render per
 * navigation for no visible change.
 */
export function useHistoryDepth(): React.RefObject<number> {
  const depth = useRef(0);
  const navigationType = useNavigationType();
  const location = useLocation();

  useEffect(() => {
    if (navigationType === 'PUSH') depth.current += 1;
    else if (navigationType === 'POP') depth.current = Math.max(0, depth.current - 1);
    // REPLACE leaves the stack the same height.
  }, [navigationType, location.key]);

  return depth;
}
