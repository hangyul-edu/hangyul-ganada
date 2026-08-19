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
 * anywhere but Home     →  Home
 * Home                  →  "leave the app?"
 * ```
 *
 * One press to leave whatever you are doing, one more to leave the app, and a
 * question before it actually goes. The header's own back arrow is untouched
 * and still moves through the lesson step by step: the two buttons mean
 * different things and always did — the phone's is "out of here", the app's is
 * "back one".
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
 */

type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

/**
 * Registers a handler for the phone's Back button until the returned function
 * is called. The most recently registered one is asked first.
 */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const at = handlers.lastIndexOf(handler);
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
  for (let at = handlers.length - 1; at >= 0; at -= 1) {
    try {
      if (handlers[at]!()) return true;
    } catch {
      // Declined.
    }
  }
  return false;
}

/** For tests: forgets every handler. */
export function resetBackHandlers(): void {
  handlers.length = 0;
}
