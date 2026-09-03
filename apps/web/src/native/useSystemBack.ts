import { useEffect, useRef } from 'react';

import { pushBackHandler, type BackTier } from './backIntent';

/**
 * Answers the phone's Back button while this component is mounted.
 *
 * Return `true` to consume the press, `false` to let it fall through to
 * whatever is behind — an overlay that is closing anyway, a screen that has
 * nothing to add. See `backIntent.ts` for the order handlers are asked in.
 *
 * `active` is how a component that is always mounted but only sometimes
 * interested — a dialog that exists whether or not it is open — takes part
 * without a second component to hold the registration.
 *
 * The handler is read through a ref, so a closure over fresh props does not
 * re-register on every render and quietly change the order handlers are asked
 * in. Registration order is the priority order within a tier, and it has to
 * follow mounting, not rendering.
 *
 * `tier` says whether this is an overlay (the default — a modal, a sheet) or
 * the app's single router-level handler, which is always asked last however
 * early it mounted. See `backIntent.ts`.
 */
export function useSystemBack(handler: () => boolean, active = true, tier: BackTier = 'overlay'): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!active) return undefined;
    return pushBackHandler(() => latest.current(), tier);
  }, [active, tier]);
}
