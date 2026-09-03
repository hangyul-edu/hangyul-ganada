import { createContext, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * One rule for going back, wherever the press came from.
 *
 * ## Why this is a context and not a function
 *
 * The app has two Back buttons and they must not disagree. One is the phone's
 * — Android's gesture or key, and the browser's toolbar arrow — and the other
 * is the chevron in the top-left of every screen. QA has reported the
 * disagreement twice, in both directions: a period when the hardware button
 * always went Home while the header arrow went back one screen, and a period
 * when half the screens had no header arrow at all and the hardware button was
 * the only way out.
 *
 * A shared helper function would not have fixed either, because the rule is not
 * a pure function. Two of its outcomes *open a dialog* — leaving the app is not
 * something to do silently, and neither is abandoning a sitting — and a dialog
 * has to belong to a component. So the decision is a pure resolver
 * (`ui/routePolicy.ts`), its execution and its two dialogs live in one place
 * (`ui/SystemBack.tsx`), and everything that needs to go back asks that place
 * to do it.
 *
 * ## The rule
 *
 * See `ui/routePolicy.ts`. It is a table of routes, not a history depth: depth
 * is a fact about the session and Back is a question about the screen.
 *
 * ## The fallback, and why it is not a throw
 *
 * `useBackNavigation` outside a provider goes back one entry rather than
 * failing. Dozens of component tests render a screen — and therefore an
 * `AppHeader` — without mounting the app shell, and a hook that threw would
 * turn "this test does not exercise Back" into "this test does not run".
 */
export interface BackNavigation {
  /** Go back, by the policy in `routePolicy.ts`. */
  goBack: () => void;
  /**
   * Declare whether the current screen has work that leaving would abandon.
   *
   * Consulted only for routes the policy marks `guardable`, so a screen cannot
   * make a reference page start asking questions. Prefer `useLeaveGuard`.
   */
  setLeaveGuard: (dirty: boolean) => void;
}

export const BackNavigationContext = createContext<BackNavigation | null>(null);

export function useBackNavigation(): BackNavigation {
  const provided = useContext(BackNavigationContext);
  const navigate = useNavigate();
  if (provided) return provided;
  return { goBack: () => navigate(-1), setLeaveGuard: () => {} };
}

/**
 * "This screen has unfinished work in it right now."
 *
 * A session calls this with `true` once the learner has done something worth
 * asking about and `false` when there is nothing left to lose — a finished
 * sitting should not ask. Unmounting clears it, so a guard cannot outlive the
 * screen that set it and make the *next* screen ask.
 */
export function useLeaveGuard(dirty: boolean): void {
  const { setLeaveGuard } = useBackNavigation();
  useEffect(() => {
    setLeaveGuard(dirty);
    return () => setLeaveGuard(false);
  }, [dirty, setLeaveGuard]);
}
