import { afterEach, describe, expect, it, vi } from 'vitest';

import { offerBackIntent, pushBackHandler, resetBackHandlers } from './backIntent';

/**
 * The priority order behind the phone's Back button.
 *
 * What is being defended is that the order follows what is on screen: whatever
 * opened last answers first. Get that wrong and Back closes the lesson from
 * under an open sheet, which is the sort of thing that is obvious on a device
 * and invisible in a component test.
 */

afterEach(() => resetBackHandlers());

describe('back intent', () => {
  it('asks the most recently registered handler first', () => {
    const order: string[] = [];
    pushBackHandler(() => {
      order.push('page');
      return true;
    });
    pushBackHandler(() => {
      order.push('sheet');
      return true;
    });

    expect(offerBackIntent()).toBe(true);
    expect(order).toEqual(['sheet']);
  });

  it('falls through to the handler underneath when one declines', () => {
    const page = vi.fn(() => true);
    pushBackHandler(page);
    pushBackHandler(() => false);

    expect(offerBackIntent()).toBe(true);
    expect(page).toHaveBeenCalledOnce();
  });

  it('reports that nobody took it, so the shell can leave the app', () => {
    expect(offerBackIntent()).toBe(false);
    pushBackHandler(() => false);
    expect(offerBackIntent()).toBe(false);
  });

  it('stops asking once a handler unregisters', () => {
    const sheet = vi.fn(() => true);
    const remove = pushBackHandler(sheet);
    const page = vi.fn(() => true);
    pushBackHandler(page);

    remove();
    offerBackIntent();

    expect(sheet).not.toHaveBeenCalled();
    expect(page).toHaveBeenCalledOnce();
  });

  it('treats a handler that throws as having declined', () => {
    // A screen in a bad state must not be able to swallow the button.
    const page = vi.fn(() => true);
    pushBackHandler(page);
    pushBackHandler(() => {
      throw new Error('mid-render');
    });

    expect(offerBackIntent()).toBe(true);
    expect(page).toHaveBeenCalledOnce();
  });

  it('survives the same handler being registered twice', () => {
    const handler = vi.fn(() => false);
    const first = pushBackHandler(handler);
    pushBackHandler(handler);

    first();
    offerBackIntent();

    // One registration left, so it is asked once.
    expect(handler).toHaveBeenCalledOnce();
  });
});
