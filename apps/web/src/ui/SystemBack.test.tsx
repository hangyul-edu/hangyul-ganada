import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { offerBackIntent, resetBackHandlers } from '../native/backIntent';
import { Modal } from './Modal';
import { SystemBack } from './SystemBack';

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
 * The phone's Back button, end to end through the component that owns the rule.
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
});

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

/**
 * A control that navigates the way the app does.
 *
 * The seeded `initialEntries` below are *not* navigations this session made —
 * they are the tab's history, which is exactly what `useHistoryDepth` refuses
 * to walk back into. So a test about returning to the previous screen has to
 * actually go there first, and this is the button that does it.
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

function app(at: string, extra?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/', '/letters', at]}>
      <SystemBack />
      <Where />
      {extra}
      <Routes>
        <Route path="*" element={<span />} />
      </Routes>
    </MemoryRouter>,
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

  it('falls back to Home when nothing of ours is behind — a deep link or a refresh', () => {
    app('/letters/lesson-vowels-core');
    expect(screen.getByTestId('where')).toHaveTextContent('/letters/lesson-vowels-core');

    press();

    expect(screen.getByTestId('where')).toHaveTextContent('/');
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
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });
});
