/**
 * When the learner is told their progress is not being kept — and when they
 * are not.
 *
 * This is the screen-level half of `storage/capability.test.ts`. The rule under
 * test is the one that was wrong in production: the Settings screen showed a
 * red warning in an ordinary browser window, because it read a flag that is
 * `false` for the whole of the app's first paint on *every* install, healthy or
 * not. The state has three positions now — not yet known, known good, known bad
 * — and only the third one may say anything.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MemoryDriver, type PersistenceDriver } from '../storage/driver';
import { LearnerContext } from './LearnerContext';
import { LearnerProvider } from './LearnerProvider';

/** Reports the storage verdict as the Settings screen decides it. */
function Verdict() {
  return (
    <LearnerContext.Consumer>
      {(value) => {
        const { checked, durable, engine } = value!.state.storage;
        return (
          <>
            <span data-testid="engine">{engine}</span>
            <span data-testid="verdict">
              {!checked ? 'unknown' : durable ? 'saving' : 'not-saving'}
            </span>
            {/* Exactly the condition `MyPage` renders the warning under. */}
            {checked && !durable && <span data-testid="warning">not saving</span>}
          </>
        );
      }}
    </LearnerContext.Consumer>
  );
}

/** A store that keeps what it is given and survives a reload, as IndexedDB does. */
function durableDriver(): PersistenceDriver {
  const driver = new MemoryDriver();
  return new Proxy(driver, {
    get: (target, key) =>
      key === 'durable' ? true : key === 'name' ? 'indexeddb' : Reflect.get(target, key, target),
  });
}

function mount(driver: PersistenceDriver) {
  return render(
    <LearnerProvider driver={driver}>
      <Verdict />
    </LearnerProvider>,
  );
}

describe('a normal browser window', () => {
  it('never shows the warning, at any point in the launch', async () => {
    mount(durableDriver());

    // The first paint. The old screen warned here, on every launch, on every
    // install — which is the bug, and it is invisible to a test that only ever
    // looks at the settled state.
    expect(screen.queryByTestId('warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('verdict')).toHaveTextContent('unknown');

    await waitFor(() => expect(screen.getByTestId('verdict')).toHaveTextContent('saving'));
    expect(screen.queryByTestId('warning')).not.toBeInTheDocument();
  });
});

describe('a launch that went wrong for a reason other than storage', () => {
  it('says nothing when hydration fails but the store still writes and reads', async () => {
    /*
     * Hydration reads eight collections, runs the schema migrations and parses
     * every stored row. Any of that can throw — one unreadable record is
     * enough — and the failure path used to answer it by declaring the
     * learner's storage broken. That put the red warning under a browser whose
     * IndexedDB was in perfect health, which is the exact false alarm this
     * whole path exists to prevent.
     */
    const driver = durableDriver();
    vi.spyOn(driver, 'getAll').mockRejectedValue(new Error('one bad row'));
    mount(driver);

    await waitFor(() => expect(screen.getByTestId('verdict')).not.toHaveTextContent('unknown'));
    expect(screen.queryByTestId('warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('verdict')).toHaveTextContent('saving');
  });

  it('still warns when hydration fails *and* the store cannot write', async () => {
    // The genuine failure keeps its warning: the probe is what decides, and it
    // is asked either way.
    const driver = durableDriver();
    vi.spyOn(driver, 'getAll').mockRejectedValue(new Error('cannot read'));
    // The quiet shape of a broken store — the write resolves and the row is
    // simply not there afterwards. See `storage/capability.ts`.
    vi.spyOn(driver, 'put').mockResolvedValue(undefined);
    mount(driver);

    await waitFor(() => expect(screen.getByTestId('warning')).toBeInTheDocument());
  });
});

describe('a browser that genuinely cannot keep anything', () => {
  it('warns once the round trip has actually come back negative', async () => {
    // The memory fallback: what `openDriver` returns when IndexedDB refuses to
    // open at all. It writes and reads perfectly and loses it all on reload.
    mount(new MemoryDriver());

    expect(screen.queryByTestId('warning')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('warning')).toBeInTheDocument());
    expect(screen.getByTestId('verdict')).toHaveTextContent('not-saving');
  });

  it('warns when a durable engine has stopped keeping what it is given', async () => {
    /*
     * The failure the old check could not see: IndexedDB opened, so the app
     * believed the learner's practice was safe, and the writes were going
     * nowhere. A browser out of quota, or set to clear site data, does exactly
     * this — and the quiet version, where the call resolves and the row is
     * simply not there afterwards, is the common one.
     */
    const driver = durableDriver();
    vi.spyOn(driver, 'put').mockResolvedValue(undefined);
    mount(driver);

    await waitFor(() => expect(screen.getByTestId('warning')).toBeInTheDocument());
    expect(screen.getByTestId('engine')).toHaveTextContent('indexeddb');
  });
});
