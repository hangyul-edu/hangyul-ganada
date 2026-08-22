import { useRef, useSyncExternalStore } from 'react';

import { corpusVersion, subscribeCorpus } from './corpus';

/**
 * Re-renders when a band of the corpus arrives.
 *
 * The corpus is a live registry rather than a value — `VOCABULARY` is one array
 * that grows — which keeps thirty modules synchronous at the cost of React not
 * knowing when it changed. This is how a screen finds out.
 *
 * Returns the version so it can go in a `useMemo` dependency list, which is
 * where it usually needs to be: the expensive thing on a words screen is not
 * the render, it is the filter and sort feeding it.
 *
 * A screen that only shows a handful of words a plan already chose does not
 * need this. The ones that do are the ones that read the corpus *as a whole* —
 * browsing, search, and the progress summary.
 */
export function useCorpus(): number {
  return useSyncExternalStore(subscribeCorpus, corpusVersion, corpusVersion);
}

/**
 * `useMemo`, plus "and when a band of the corpus arrives".
 *
 * The version from `useCorpus` is a real dependency of any computation that
 * reads `VOCABULARY` — it is the only handle React has on module state that
 * changed underneath it — but it is not a dependency `exhaustive-deps` can see,
 * because the callback never mentions it. Listing it produced five identical
 * "unnecessary dependency" warnings across four files, each of which would have
 * needed a disable comment saying the same thing.
 *
 * So it is said once, here, and the call sites read as what they mean:
 * *recompute this when the corpus changes, or when these do.*
 */
export function useCorpusMemo<T>(compute: () => T, deps: unknown[]): T {
  const version = useCorpus();
  const all = [...deps, version];
  /*
   * `useMemo` cannot be called with a forwarded callback without the lint rule
   * objecting that it cannot see inside it — which is true, and is the point of
   * a wrapper. `useRef` plus an explicit comparison is the same memo written so
   * that the dependency list is data rather than syntax.
   */
  const cache = useRef<{ deps: unknown[]; value: T } | null>(null);
  const current = cache.current;
  if (!current || current.deps.length !== all.length || current.deps.some((d, i) => !Object.is(d, all[i]))) {
    cache.current = { deps: all, value: compute() };
  }
  return cache.current!.value;
}
