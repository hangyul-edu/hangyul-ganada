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
 * Zero means the current screen is the first one this session put on the stack:
 * a cold start, a deep link, or a refreshed page. Anything above zero means
 * `navigate(-1)` lands on a screen the learner actually came from.
 *
 * ## Where the number comes from, and why it is not counted here any more
 *
 * It is `history.state.idx`, which React Router writes into the history entry
 * itself on every `pushState`. It starts at 0 on a fresh load — a deep link and
 * a refresh both land on 0 — increments on a push, is left alone by a replace,
 * and comes back with the entry on a pop. That is precisely the definition
 * above, maintained by the layer that does the navigating.
 *
 * This used to be a hook that counted the pushes itself, out of
 * `useNavigationType()`, in an effect. It was wrong in a way that only showed
 * up under load, and the reason is worth writing down because the same trap is
 * waiting for anything else that tries to read navigation state out of React:
 *
 * **React Router navigates inside a transition, so React's idea of the location
 * lags the browser's.** `history.pushState` runs synchronously when a `<Link>`
 * is tapped; the re-render that would tell an effect about it is a transition,
 * and React is entitled to hold that commit — and does hold it — while a lazy
 * route chunk is still being fetched. In that window `window.location` already
 * says `/me/activity` while any React-derived counter still says the app has
 * pushed nothing. A Back press landing there is answered as though the screen
 * had been deep-linked, and the learner is sent to the route's declared parent
 * instead of to the screen they came from.
 *
 * Moving the counter from `useEffect` to `useLayoutEffect` narrowed the window
 * and did not close it, because the problem is not *when in the commit* the
 * callback runs — it is that the commit itself is deferred. Measured: the
 * end-to-end back-policy spec passed the Learning-activity case in isolation
 * and failed it in a full-file run, where the chunk was fetched cold.
 *
 * Reading the history entry has no such window. It is also less code, and it
 * cannot drift from the navigations React Router actually performed.
 *
 * ## The shape it reads
 *
 * `{ idx: number }` is React Router's own history state. If it is ever missing
 * or malformed — another router, a hand-written `pushState`, a browser that
 * dropped the state — this reports 0, which makes Back fall back to the route's
 * declared parent. That is the conservative answer: a named destination the
 * policy chose, rather than a pop into whatever the tab happened to hold.
 */

/** Entries this app has pushed since it opened. 0 on a cold start or deep link. */
export function appHistoryDepth(): number {
  if (typeof window === 'undefined') return 0;
  const state: unknown = window.history.state;
  if (typeof state !== 'object' || state === null) return 0;
  const idx = (state as { idx?: unknown }).idx;
  return typeof idx === 'number' && Number.isFinite(idx) && idx > 0 ? idx : 0;
}

/** Whether Back has a screen of ours to return to. See `ui/routePolicy`. */
export function hasInAppHistory(): boolean {
  return appHistoryDepth() > 0;
}
