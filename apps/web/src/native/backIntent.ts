/**
 * What the phone's Back button means.
 *
 * ## The behaviour this replaced
 *
 * Back used to retrace the app's own steps: `history.back()` until the launch
 * entry, then exit. That is what a browser does, and on a phone it reads as
 * one. A learner who went Home → Letters → a lesson → a character → the pen had
 * to press Back five times to get out of the lesson, watching the app replay
 * screens they had already finished with. Nothing about that is what the button
 * means on Android.
 *
 * ## What it means now
 *
 * ```
 * an overlay is open    →  close the overlay
 * otherwise             →  whatever `ui/routePolicy.ts` says for this route
 * ```
 *
 * The route half of that is a table, not a rule of thumb — see `routePolicy`.
 * This module is only concerned with *who is asked first*, and the answer is
 * always: the thing on top.
 *
 * ## Why a stack rather than one handler
 *
 * The rule is a priority order, and the things it prioritises are components
 * that come and go. A bottom sheet has to answer Back while it is open and stop
 * answering the moment it closes, and it cannot know what else is open behind
 * it. So each of them registers while it is mounted and the newest registered
 * handler is asked first — which is the same order they are stacked on screen.
 *
 * Handlers say whether they consumed the press. Anything that returns false
 * passes it down. If nothing at all is registered — the press arrived before
 * React mounted — the shell falls back to leaving the app, because a Back
 * button that does nothing is worse than one that does something.
 *
 * ## Two tiers, because mount order is not stacking order
 *
 * Newest-first is right *among overlays* and wrong for the one handler that is
 * not an overlay. The router-level handler mounts once, at startup, above the
 * routes; React runs a child's effects before its parent's, so a screen that
 * opens a modal **on its first render** — a deep link straight into a lesson
 * whose completion sheet is already up, a placement prompt on a cold start —
 * registers that modal *before* the router handler and would therefore lose the
 * press to it. The learner would watch the route change underneath an open
 * dialog.
 *
 * It worked in practice only because modals usually open later than launch, and
 * "usually" is not a rule anybody can rely on. So the router handler declares
 * itself `'route'` and is asked after every `'overlay'`, whatever order they
 * mounted in. Within a tier the newest still wins, which is what keeps two
 * stacked sheets closing top-down.
 */

type BackHandler = () => boolean;

/**
 * `overlay` is anything drawn over the page — a modal, a sheet, a dialog.
 * `route` is the single router-level handler in `ui/SystemBack.tsx`, and it is
 * always the last thing asked. See the note above.
 */
export type BackTier = 'overlay' | 'route';

interface Registration {
  handler: BackHandler;
  tier: BackTier;
}

const handlers: Registration[] = [];

/**
 * Registers a handler for the phone's Back button until the returned function
 * is called.
 *
 * Overlays are asked before the route handler, and within a tier the most
 * recently registered is asked first.
 */
export function pushBackHandler(handler: BackHandler, tier: BackTier = 'overlay'): () => void {
  const registration: Registration = { handler, tier };
  handlers.push(registration);
  return () => {
    const at = handlers.lastIndexOf(registration);
    if (at !== -1) handlers.splice(at, 1);
  };
}

/**
 * Offers a Back press to the registered handlers, newest first.
 *
 * Returns whether one of them took it. A handler that throws is treated as
 * having declined rather than being allowed to swallow the press: the button
 * has to keep working even if a screen is in a bad state.
 */
export function offerBackIntent(): boolean {
  for (const tier of ['overlay', 'route'] as const) {
    for (let at = handlers.length - 1; at >= 0; at -= 1) {
      const registration = handlers[at]!;
      if (registration.tier !== tier) continue;
      try {
        if (registration.handler()) return true;
      } catch {
        // Declined.
      }
    }
  }
  return false;
}

/**
 * The same press, reachable from outside the bundle.
 *
 * Android delivers Back through Capacitor and `native/shell.ts` forwards it to
 * `offerBackIntent`. A browser has no such event, so the end-to-end suite —
 * which runs against the *production* build, where a `DEV` guard would be
 * compiled out — has no way to press the button the policy exists for. Without
 * this, the only Back a Playwright spec could exercise is the header chevron,
 * and the hardware path would be covered by unit tests alone.
 *
 * Publishing it is not a widening of anything. The press it delivers is one the
 * platform can already deliver, it consumes no arguments, and the worst a page
 * can do with it is what the learner can already do with the button. It is
 * named for what it is so nobody mistakes it for an API.
 */
declare global {
  interface Window {
    /** Delivers one Back press, exactly as the Android shell does. */
    __hangyulBackIntent?: () => boolean;
  }
}

if (typeof window !== 'undefined') {
  window.__hangyulBackIntent = offerBackIntent;
}

/** For tests: forgets every handler. */
export function resetBackHandlers(): void {
  handlers.length = 0;
}
