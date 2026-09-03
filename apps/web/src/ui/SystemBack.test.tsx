import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { offerBackIntent, resetBackHandlers } from '../native/backIntent';
import { Modal } from './Modal';
import { SystemBack } from './SystemBack';
import { useLeaveGuard } from './backNavigation';

const exitApp = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../native/platform', () => ({
  exitApp,
  isNative: false,
  isAndroid: false,
  isIOS: false,
  platform: 'web',
  hasPlugin: () => false,
}));

/**
 * The phone's Back button, end to end through the component that runs the rule.
 *
 * The *decision* is `resolveBack` and is covered route by route in
 * `routePolicy.test.ts`. What is checked here is the wiring: that a press
 * reaches the resolver at all, that `replace` really replaces, that the two
 * dialogs open once and answer correctly, and that an overlay is asked first.
 *
 * `press()` is the button: `offerBackIntent` is exactly what the native shell
 * calls, so these exercise the real path rather than a component's internals.
 *
 * Labels are asserted by test id rather than by text because i18n is not
 * initialised in unit tests — the wording is covered by the i18n check, and
 * what matters here is which control does what.
 */

/** One press of the phone's Back button. */
function press() {
  act(() => {
    offerBackIntent();
  });
}

afterEach(() => {
  resetBackHandlers();
  exitApp.mockClear();
  // jsdom keeps one history across the file; a test that pushed would otherwise
  // leave the next one believing it had somewhere to go back to.
  window.history.replaceState(null, '', '/');
});

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

/**
 * A control that navigates the way the app does.
 *
 * `app()` only *places* the test at a URL, which is a cold start — there is
 * nothing of ours behind it, and that is exactly the state a deep link or a
 * refresh is in. A test about returning to the previous screen has to actually
 * go there first, and this is the button that does it.
 */
function Go({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  return (
    <button data-testid={`go-${to}`} onClick={() => navigate(to, { replace })}>
      {to}
    </button>
  );
}

function go(to: string) {
  act(() => {
    fireEvent.click(screen.getByTestId(`go-${to}`));
  });
}

/**
 * The app, cold, at `at`.
 *
 * A real `BrowserRouter` over jsdom's history rather than a `MemoryRouter`,
 * because the policy reads `history.state.idx` — the index React Router writes
 * into the history entry itself. See `native/appHistory`. A memory router keeps
 * that index in a closure the app cannot see, so these tests would have run
 * against a permanently empty history and passed whatever the policy did.
 *
 * Placing the test at a URL is a *cold start*: nothing of ours is behind it,
 * which is the state a deep link or a refresh is in. Use `go()` to build
 * history.
 */
function app(at: string, extra?: React.ReactNode) {
  window.history.replaceState(null, '', at);
  return render(
    <BrowserRouter>
      {/*
        Everything inside, because that is how the app mounts it: `SystemBack`
        provides `BackNavigationContext`, and a screen that declares a leave
        guard has to be a descendant to reach it. Rendered as a sibling — which
        is what this helper used to do — `useLeaveGuard` silently took its
        no-provider fallback and the guard tests passed against nothing.
      */}
      <SystemBack>
        <Where />
        {extra}
        <Routes>
          <Route path="*" element={<span />} />
        </Routes>
      </SystemBack>
    </BrowserRouter>,
  );
}

describe('the phone’s back button', () => {
  it('returns to the screen before this one', () => {
    app('/', <><Go to="/letters" /><Go to="/letters/lesson-vowels-core" /></>);
    go('/letters');
    go('/letters/lesson-vowels-core');
    expect(screen.getByTestId('where')).toHaveTextContent('/letters/lesson-vowels-core');

    press();
    expect(screen.getByTestId('where')).toHaveTextContent('/letters');

    press();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('does not jump Home when a screen replaced its own entry', () => {
    /*
      Switching a letter category replaces the entry rather than pushing one.
      The reported defect was that Back from there landed on Home instead of
      the screen the learner opened the category from.
    */
    app('/', <><Go to="/letters" /><Go to="/letters?category=vowels" replace /></>);
    go('/letters');
    go('/letters?category=vowels');

    press();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('returns a deep-linked lesson to its own lesson list, not to Home', () => {
    /*
      A sitting returns to the context that owns it. Before the route policy
      this landed on Home, because the only thing the rule could see was that
      this session had pushed nothing.
    */
    app('/letters/lesson-vowels-core');
    expect(screen.getByTestId('where')).toHaveTextContent('/letters/lesson-vowels-core');

    press();

    expect(screen.getByTestId('where')).toHaveTextContent('/letters');
  });

  it('goes straight Home from a tab root rather than walking the tab bar', () => {
    /*
      The reported defect: Words → Letters → Review, then Back, walked back
      through Letters and Words. Every non-Home tab is one press from Home.
    */
    app('/', <><Go to="/words" /><Go to="/letters" /><Go to="/review" /></>);
    go('/words');
    go('/letters');
    go('/review');

    press();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('offers the exit at Home even after a walk through the app', () => {
    /*
      Home is unconditional. The old depth rule popped instead, so a learner who
      had been anywhere had to press Back several times to reach the offer.
    */
    app('/', <><Go to="/words" /><Go to="/review" /></>);
    go('/words');
    go('/review');
    press();
    expect(screen.getByTestId('where')).toHaveTextContent('/');

    press();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('asks before leaving when the learner is already Home', () => {
    app('/');
    expect(screen.queryByRole('dialog')).toBeNull();

    press();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('opens exactly one dialog however fast the button is pressed', () => {
    app('/');
    press();
    press();
    press();

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('dismisses the dialog on the next press rather than leaving', () => {
    app('/');
    press();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    press();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('stays put when the learner says stay, and leaves when they say leave', () => {
    app('/');
    press();
    fireEvent.click(screen.getByTestId('exit-stay'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(exitApp).not.toHaveBeenCalled();

    press();
    act(() => {
      fireEvent.click(screen.getByTestId('exit-confirm'));
    });
    expect(exitApp).toHaveBeenCalledOnce();
  });

  it('closes an open sheet before it considers the route at all', () => {
    function Sheet() {
      const [open, setOpen] = React.useState(true);
      return (
        <Modal open={open} onClose={() => setOpen(false)} variant="sheet" title="How you did">
          <span data-testid="sheet">results</span>
        </Modal>
      );
    }
    app('/letters/lesson-vowels-core', <Sheet />);
    expect(screen.getByTestId('sheet')).toBeInTheDocument();

    press();

    // The sheet took it; the lesson is still open behind it.
    expect(screen.queryByTestId('sheet')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/letters/lesson-vowels-core');

    press();
    expect(screen.getByTestId('where')).toHaveTextContent('/letters');
  });

  it('asks before abandoning a sitting that says it has work in it', () => {
    function Guarded({ dirty }: { dirty: boolean }) {
      useLeaveGuard(dirty);
      return null;
    }
    app('/me/level-test', <Guarded dirty />);

    press();
    // Still on the test, with the question in front of the learner.
    expect(screen.getByTestId('where')).toHaveTextContent('/me/level-test');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId('leave-session-confirm'));
    });
    expect(screen.getByTestId('where')).toHaveTextContent('/me');
  });

  it('stays in the sitting when the learner says keep going', () => {
    function Guarded() {
      useLeaveGuard(true);
      return null;
    }
    app('/me/level-test', <Guarded />);

    press();
    fireEvent.click(screen.getByTestId('leave-session-stay'));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/me/level-test');
  });

  it('does not ask once the sitting has nothing left to lose', () => {
    function Guarded() {
      useLeaveGuard(false);
      return null;
    }
    app('/me/level-test', <Guarded />);

    press();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/me');
  });
});
