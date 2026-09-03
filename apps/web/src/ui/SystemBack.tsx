import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { BackNavigationContext } from './backNavigation';
import { exitApp } from '../native/platform';
import { hasInAppHistory } from '../native/appHistory';
import { useSystemBack } from '../native/useSystemBack';
import { ConfirmDialog } from './ConfirmDialog';
import { resolveBack, type BackOutcome } from './routePolicy';

/**
 * Executes the back policy, and owns the two dialogs it can ask for.
 *
 * The decision is not made here — it is `resolveBack` in `ui/routePolicy.ts`,
 * a pure function over (pathname, history state, guard state) that the unit
 * suite walks route by route. This component supplies the three inputs, runs
 * the answer, and holds the two pieces of state a dialog needs.
 *
 * ## What it replaced
 *
 * A depth heuristic — `navigate(-1)` whenever this app had pushed anything,
 * Home only when it had not — and fifteen hand-written `onBack` props. See the
 * long note at the top of `routePolicy.ts` for why both had to go and what the
 * table says instead.
 *
 * ## The header's chevron presses the same button
 *
 * Every screen a learner navigates *to* draws a back arrow in its top-left —
 * see `AppHeader` — and that arrow does not have its own idea of where back is.
 * It calls `goBack` from here, through `BackNavigationContext`, so the two
 * controls cannot drift apart. They have drifted twice.
 *
 * **Home draws no arrow.** The policy still answers there — a press offers to
 * leave — but on the screen the app opens to there is nothing behind, and a
 * painted control saying otherwise is a control that lies. `drawsBackControl`
 * is the same table's answer to that question, so the two cannot disagree.
 *
 * ## Why the dialogs are here and not in a page
 *
 * The exit dialog belongs to the button, not to Home: Home does not otherwise
 * know or care that this app can be left. The leave dialog belongs to the
 * button for the same reason — the session that owns the work only has to
 * declare *that* it has some, through `useLeaveGuard`, not to build a second
 * confirmation.
 *
 * Keeping both next to the handler is also what makes a second press while one
 * is open impossible to get wrong: each is a `Modal`, `Modal` registers an
 * `overlay` back handler while it is open, and overlays are always asked before
 * this component's `route` handler — see `native/backIntent.ts`. So the second
 * press closes the dialog rather than reaching the policy again. There is one
 * piece of state per dialog and neither can open twice: a rapid double press on
 * Home opens one dialog and then dismisses it, never stacks two.
 */
export function SystemBack({ children }: { children?: ReactNode }) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const [leaving, setLeaving] = useState(false);
  const [abandoning, setAbandoning] = useState<BackOutcome | null>(null);
  /*
   * Whether the screen currently on top says it has work in it.
   *
   * A ref rather than state: nothing renders from it, and a screen that reports
   * "dirty" on every answered question would otherwise re-render the whole
   * router subtree once per answer to store a boolean only a Back press reads.
   */
  const dirty = useRef(false);
  const setLeaveGuard = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  const run = useCallback(
    (outcome: BackOutcome) => {
      switch (outcome.action) {
        case 'exit':
          setLeaving(true);
          return;
        case 'pop':
          navigate(-1);
          return;
        case 'replace':
          /*
           * Replacing rather than pushing, always.
           *
           * Pushing Home on top of a tab root leaves a stack of Homes for the
           * next press to walk back through — the ping-pong this policy exists
           * to end. The same applies to a session returning to its parent.
           */
          navigate(outcome.to, { replace: true });
          return;
        case 'confirmLeave':
          setAbandoning(outcome.then);
          return;
      }
    },
    [navigate],
  );

  const goBack = useCallback(() => {
    /*
     * Both inputs are read at press time, not at render time.
     *
     * `hasInAppHistory` reads the history entry the browser is actually on —
     * see `native/appHistory` for why a React-derived count was wrong under a
     * deferred transition — and the guard is a ref the current screen writes.
     */
    run(
      resolveBack(location.pathname, {
        hasInAppHistory: hasInAppHistory(),
        dirty: dirty.current,
      }),
    );
  }, [location.pathname, run]);

  /*
   * The route tier: asked only after every open overlay has declined, whatever
   * order they mounted in. A screen deep-linked with a modal already open would
   * otherwise lose the press to this handler, because React runs a child's
   * effects before its parent's. See `native/backIntent.ts`.
   */
  useSystemBack(
    useCallback(() => {
      goBack();
      return true;
    }, [goBack]),
    true,
    'route',
  );

  const value = useMemo(() => ({ goBack, setLeaveGuard }), [goBack, setLeaveGuard]);

  return (
    <BackNavigationContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={leaving}
        title={t('exit.title')}
        body={t('exit.body')}
        cancelLabel={t('exit.stay')}
        confirmLabel={t('exit.leave')}
        onCancel={() => setLeaving(false)}
        onConfirm={() => void exitApp()}
        cancelTestId="exit-stay"
        confirmTestId="exit-confirm"
      />
      <ConfirmDialog
        open={abandoning !== null}
        title={t('leaveSession.title')}
        body={t('leaveSession.body')}
        cancelLabel={t('leaveSession.stay')}
        confirmLabel={t('leaveSession.leave')}
        onCancel={() => setAbandoning(null)}
        onConfirm={() => {
          const next = abandoning;
          setAbandoning(null);
          if (next) run(next);
        }}
        cancelTestId="leave-session-stay"
        confirmTestId="leave-session-confirm"
      />
    </BackNavigationContext.Provider>
  );
}
