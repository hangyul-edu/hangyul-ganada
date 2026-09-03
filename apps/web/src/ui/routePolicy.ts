import { matchPath } from 'react-router-dom';

/**
 * Where Back goes, for every route in the product, written down once.
 *
 * ## What this replaces
 *
 * Two things that could not agree with each other:
 *
 * 1. **A depth heuristic.** `SystemBack` asked how many entries this app had
 *    pushed and, above zero, called `navigate(-1)`. The
 *    number is a fact about the session, not about the screen, so the same
 *    screen behaved differently depending on how the learner arrived at it —
 *    and Home, the one screen with a defined answer, inherited whatever the
 *    stack happened to hold. A learner who had walked Words → Letters → Review
 *    and pressed Back at Home was walked back through the tabs instead of being
 *    offered the exit, which is neither of the two things Back means.
 * 2. **Fifteen hand-written handlers.** Every page passed its own
 *    `onBack={() => navigate('/letters')}` or `onBack={() => navigate(-1)}`, so
 *    the header chevron and the phone's button ran different code on the same
 *    screen. `LevelTestPage` alone had `navigate(-1)` on four headers and
 *    `navigate('/me')` on a fifth.
 *
 * Both are gone. There is one table, one resolver, and one component that
 * executes the answer.
 *
 * ## The policy
 *
 * | Where the learner is | What Back does |
 * | --- | --- |
 * | a modal or popup is open | the overlay answers first and this is never asked |
 * | Home | offer to leave the app, immediately |
 * | a bottom-tab root | Home, replacing |
 * | a nested screen | the screen they came from, or its declared parent |
 * | a session with work in it | ask before abandoning, then the declared parent |
 *
 * The modal case is not in the table below because it is not a route question:
 * `Modal` registers its own back handler while it is open and consumes the
 * press before the router-level handler is asked. See `native/backIntent.ts`.
 *
 * ## Why a tab root goes Home rather than back one
 *
 * Because the bottom bar is a *switch*, not a trail. `navigate(-1)` from Words
 * after a learner had tapped Letters, then Review, then Words walks them back
 * through Review and Letters — a history chain nobody built on purpose and
 * nobody can predict. Every non-Home tab root goes to Home, and the tab bar
 * navigates with `replace` so the chain is never created in the first place.
 * Both halves are needed: replace alone still leaves Home behind a single tab,
 * and the Home rule alone still walks a chain built before this shipped.
 *
 * ## Why Home is unconditional
 *
 * "Offer to leave, but only when there is nothing behind us" is the rule that
 * produced the bug above. Home is the root of this app; the question a learner
 * is asking at Home is always the same one, and the answer should not depend on
 * how they got there. So the exit confirmation is offered whatever the stack
 * holds.
 *
 * ## The declared parent, and when it is used
 *
 * A nested screen prefers **the screen the learner actually came from** — that
 * is what makes Back mean what it means everywhere else — and falls back to
 * `parent` when there is no in-app history to pop: a cold start on a deep link,
 * a refreshed page, or a share URL opened from outside. `parent` is therefore a
 * *safe* destination rather than the usual one: `/me/activity` is reached from
 * the streak on Home and declares `/me`, because a learner who opened it from a
 * link should land somewhere that explains it, and a learner who opened it from
 * Home goes back to Home without this table being consulted.
 */

/** Home. The root of the app and the only route with no destination behind it. */
export const HOME = '/';

export type RouteKind =
  /** The app's root. Back offers to leave. */
  | 'home'
  /** One of the four non-Home bottom tabs. Back goes Home. */
  | 'tabRoot'
  /** Anything reached from a root. Back goes to the previous screen or `parent`. */
  | 'nested'
  /** A sitting. Like `nested`, and may ask before abandoning unfinished work. */
  | 'session';

export interface RouteRule {
  /** The router pattern, exactly as `App.tsx` spells it. */
  path: string;
  kind: RouteKind;
  /**
   * The bottom tab this route belongs under, for the tab bar's own highlight
   * and for reasoning about the inventory. Home is its own tab.
   */
  tab: '/' | '/letters' | '/words' | '/review' | '/me';
  /**
   * Where Back goes when there is no in-app history to pop — a deep link, a
   * refresh, a cold start. Required for everything but Home.
   */
  parent?: string;
  /**
   * Whether abandoning this screen can lose work the learner has done.
   *
   * Declared here rather than discovered, so the confirmation is a property of
   * the route and not of whichever component remembered to ask. A screen that
   * declares it still decides *at the moment of the press* whether there is
   * anything to lose — see `BackNavigation.setLeaveGuard`. The flag says "this
   * route may guard"; the guard says "right now, it does".
   */
  guardable?: boolean;
}

/**
 * Every route in the product, in the order `App.tsx` declares them.
 *
 * Order matters: `matchPath` is tried top to bottom and `/letters/numbers` has
 * to be found before `/letters/:lessonId` would swallow it, exactly as in the
 * router. `route-policy:check` reads `App.tsx` and fails if the two lists ever
 * disagree, so a route added tomorrow is in this table tomorrow or the build
 * stops.
 */
export const ROUTES: readonly RouteRule[] = [
  { path: '/', kind: 'home', tab: '/' },

  { path: '/letters', kind: 'tabRoot', tab: '/letters', parent: HOME },
  { path: '/letters/numbers', kind: 'nested', tab: '/letters', parent: '/letters' },
  { path: '/letters/sounds', kind: 'nested', tab: '/letters', parent: '/letters' },
  {
    path: '/letters/numbers/:lessonId',
    kind: 'session',
    tab: '/letters',
    parent: '/letters/numbers',
    guardable: true,
  },
  {
    path: '/letters/:lessonId',
    kind: 'session',
    tab: '/letters',
    parent: '/letters',
    guardable: true,
  },

  { path: '/words', kind: 'tabRoot', tab: '/words', parent: HOME },
  /*
   * Today's Vocabulary returns to Words, never to Home.
   *
   * The learner came here from the Words tab and is part-way through a plan
   * that Words is the home of; dropping them on Home after a session is the app
   * losing their place. `guardable` because a sitting with answered questions
   * in it is work — the plan itself is persisted, so what the confirmation
   * protects is the learner's *attention*, not their data.
   */
  { path: '/words/today', kind: 'session', tab: '/words', parent: '/words', guardable: true },
  { path: '/words/category/:category', kind: 'nested', tab: '/words', parent: '/words' },
  { path: '/words/word/:wordId', kind: 'nested', tab: '/words', parent: '/words' },
  { path: '/words/dictionary/:headword', kind: 'nested', tab: '/words', parent: '/words' },
  /* Linked from both the Words tab and the Review hub; `/words` is the safe one. */
  { path: '/words/saved', kind: 'nested', tab: '/words', parent: '/words' },

  { path: '/review', kind: 'tabRoot', tab: '/review', parent: HOME },
  { path: '/review/mistakes', kind: 'nested', tab: '/review', parent: '/review' },
  { path: '/review/session', kind: 'session', tab: '/review', parent: '/review', guardable: true },

  { path: '/me', kind: 'tabRoot', tab: '/me', parent: HOME },
  /* Reached from the streak on Home; `/me` is where it lives when deep-linked. */
  { path: '/me/activity', kind: 'nested', tab: '/me', parent: '/me' },
  { path: '/me/level-test', kind: 'session', tab: '/me', parent: '/me', guardable: true },
  { path: '/me/language', kind: 'nested', tab: '/me', parent: '/me' },
  { path: '/me/privacy', kind: 'nested', tab: '/me', parent: '/me' },
  { path: '/me/legal', kind: 'nested', tab: '/me', parent: '/me' },

  /* Development only — removed from the production bundle. See `App.tsx`. */
  { path: '/dev/stroke-gallery', kind: 'nested', tab: '/', parent: HOME },

  /* Anything else. A typed URL or a stale link: Home is the only safe answer. */
  { path: '*', kind: 'nested', tab: '/', parent: HOME },
] as const;

/** The rule for a pathname. Never null: `*` is in the table. */
export function ruleFor(pathname: string): RouteRule {
  for (const rule of ROUTES) {
    if (rule.path === '*') continue;
    if (matchPath({ path: rule.path, end: true }, pathname)) return rule;
  }
  return ROUTES[ROUTES.length - 1]!;
}

/** Whether this route draws a back control in its top-left. Home does not. */
export function drawsBackControl(pathname: string): boolean {
  return ruleFor(pathname).kind !== 'home';
}

/**
 * What a Back press should do here.
 *
 * Pure, and deliberately ignorant of React: the resolver is the part worth
 * testing exhaustively — thirty routes × three history states × two guard
 * states — and none of that needs a renderer. `SystemBack` executes it.
 */
export type BackOutcome =
  /** Offer to leave the app. Home only. */
  | { action: 'exit' }
  /** Pop one entry — the screen the learner actually came from. */
  | { action: 'pop' }
  /** Go somewhere named, replacing so no ping-pong entry is left behind. */
  | { action: 'replace'; to: string }
  /** Ask first; on confirmation do `then`. */
  | { action: 'confirmLeave'; then: BackOutcome };

export interface BackState {
  /** Whether this app has pushed an entry this session that Back could pop. */
  hasInAppHistory: boolean;
  /**
   * Whether the current screen says it has unfinished work right now.
   *
   * Only consulted for a route with `guardable: true`, so a screen cannot make
   * a reference page ask a question by leaving a stale guard registered.
   */
  dirty?: boolean;
}

export function resolveBack(pathname: string, state: BackState): BackOutcome {
  const rule = ruleFor(pathname);

  // Home is unconditional. See the note above: making it depend on the stack is
  // what let a walk through the tab bar swallow the exit confirmation.
  if (rule.kind === 'home') return { action: 'exit' };

  // A tab is a switch, not a trail. Replace, so Back from Home next time is the
  // exit rather than a walk back into the tab we just left.
  if (rule.kind === 'tabRoot') return { action: 'replace', to: HOME };

  /*
   * A sitting returns to the context that owns it, never to whatever is behind.
   *
   * This is the one place the declared parent outranks the actual previous
   * screen, and Today's Vocabulary is why. It is reachable from Home as well as
   * from Words; popping would drop a learner who started from Home onto Home,
   * which is the app losing their place in the middle of a plan. A lesson
   * returns to its lesson list, a review sitting to the Review hub, the level
   * test to My Learning — in every case the screen that explains what they
   * just did, whichever way they came in.
   *
   * A reference screen is the opposite case and keeps the pop: `/me/activity`
   * opened from the streak on Home goes back to Home, because that genuinely is
   * where the learner was and nothing there is theirs to return to.
   */
  const leave: BackOutcome =
    rule.kind === 'session' || !state.hasInAppHistory
      ? { action: 'replace', to: rule.parent ?? HOME }
      : { action: 'pop' };

  if (rule.kind === 'session' && rule.guardable && state.dirty) {
    return { action: 'confirmLeave', then: leave };
  }
  return leave;
}
