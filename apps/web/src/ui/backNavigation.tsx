import { createContext, useContext } from 'react';
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
 * a pure function. Its last case *opens a dialog* — leaving the app is not
 * something to do silently — and a dialog has to belong to a component. So the
 * rule and its dialog live in one place, `SystemBack`, and everything that
 * needs to go back asks that place to do it.
 *
 * ## The rule
 *
 * ```
 * depth > 0            → navigate(-1)     the screen they came from
 * depth 0, not Home    → Home, replacing  a deep link, or a refresh
 * Home, depth 0        → offer to leave
 * ```
 *
 * `depth` is what *this app* has pushed since it opened — see
 * `native/useHistoryDepth`. It is deliberately not `window.history.length`,
 * which counts whatever the learner was looking at before they arrived and
 * would send Back out of the app sideways into an unrelated page.
 *
 * ## The fallback, and why it is not a throw
 *
 * `useBackNavigation` outside a provider goes back one entry rather than
 * failing. Dozens of component tests render a screen — and therefore an
 * `AppHeader` — without mounting the app shell, and a hook that threw would
 * turn "this test does not exercise Back" into "this test does not run". The
 * behaviour they get is the common case of the rule, so a test that *does*
 * press the button still sees something honest.
 */
export interface BackNavigation {
  /** Go back, by the rule above. */
  goBack: () => void;
}

export const BackNavigationContext = createContext<BackNavigation | null>(null);

export function useBackNavigation(): BackNavigation {
  const provided = useContext(BackNavigationContext);
  const navigate = useNavigate();
  if (provided) return provided;
  return { goBack: () => navigate(-1) };
}
