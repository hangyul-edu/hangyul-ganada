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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MemoryDriver, type PersistenceDriver } from '../storage/driver';
import { LearnerContext, type LearnerContextValue } from './LearnerContext';
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


/** The stated reason, when there is one. */
function Reason() {
  return (
    <LearnerContext.Consumer>
      {(value) => <span data-testid="reason">{value!.state.storage.reason ?? 'none'}</span>}
    </LearnerContext.Consumer>
  );
}

/** The two writes a learner makes first: an answered question and a preference. */
function Actions() {
  return (
    <LearnerContext.Consumer>
      {(value) => (
        <>
          <button
            data-testid="answer"
            onClick={() =>
              value!.recordAttempt({
                kind: 'character',
                item_key: 'ㄱ',
                result: { passed: true, score: 0.9 },
              } as Parameters<LearnerContextValue['recordAttempt']>[0])
            }
          />
          <button data-testid="prefer" onClick={() => value!.setPreferences({ locale: 'fr' })} />
        </>
      )}
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

describe('a launch that could not read the stored profile', () => {
  /*
   * Hydration reads eight collections, runs the schema migrations and parses
   * every stored row. Any of that can throw — one unreadable record is
   * enough — and the failure path used to answer it by declaring the
   * learner's storage broken, which put the red warning about a browser that
   * cannot keep data under a browser whose IndexedDB was in perfect health.
   *
   * Then it answered it by saying nothing and carrying on — and carrying on
   * meant *writing*: the repositories were wired before the read failed, so
   * the first answered question saved the fresh in-memory profile over the
   * stored one. The learner's level, streak days, daily plan and placement
   * result were replaced by defaults under a launch that had only failed to
   * read them, and the screen said "saving" while it happened.
   *
   * The rule now: a launch that cannot read the profile does not write to it.
   * It runs in memory, leaves the stored rows for the next launch, and says
   * so in its own sentence — not the one about the browser.
   */
  it('says, in its own words, that this session is not being kept', async () => {
    const driver = durableDriver();
    vi.spyOn(driver, 'getAll').mockRejectedValue(new Error('one bad row'));
    render(
      <LearnerProvider driver={driver}>
        <Verdict />
        <Reason />
      </LearnerProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('verdict')).not.toHaveTextContent('unknown'));
    expect(screen.getByTestId('verdict')).toHaveTextContent('not-saving');
    expect(screen.getByTestId('reason')).toHaveTextContent('unreadable');
  });

  it('writes nothing over the stored profile, whatever the learner then does', async () => {
    const driver = durableDriver();
    // The stored profile: a learner at level 12 with a streak. This is what
    // the first answered question used to overwrite with defaults.
    await driver.put('settings', 'settings', { locale: 'de', active_days: ['2026-09-01'], level: 12 });
    vi.spyOn(driver, 'getAll').mockRejectedValue(new Error('one bad row'));
    const put = vi.spyOn(driver, 'put');

    render(
      <LearnerProvider driver={driver}>
        <Verdict />
        <Actions />
      </LearnerProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('verdict')).toHaveTextContent('not-saving'));
    put.mockClear();

    fireEvent.click(screen.getByTestId('answer'));
    fireEvent.click(screen.getByTestId('prefer'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(put).not.toHaveBeenCalled();
    expect(await driver.get('settings', 'settings')).toMatchObject({ locale: 'de', level: 12 });
  });

  it('still warns about the browser when the store itself cannot write', async () => {
    const driver = durableDriver();
    vi.spyOn(driver, 'getAll').mockRejectedValue(new Error('cannot read'));
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
