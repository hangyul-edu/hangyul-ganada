import { useEffect, useState } from 'react';

import {
  type DictionaryEntry,
  type DictionaryHit,
  type DictionaryIndex,
  loadEntry,
  loadIndex,
  rankDictionary,
} from './dictionary';

/**
 * What a fetch is doing, for a screen that has to say something either way.
 *
 * `idle` is the state before anyone has typed, and it is distinct from `empty`
 * on purpose: "the dictionary found nothing" and "the dictionary has not been
 * asked" look the same to a `null` and read very differently to a person.
 */
export type DictionaryState = 'idle' | 'loading' | 'ready' | 'unavailable';

/**
 * Search the dictionary, fetching it the first time anybody does.
 *
 * The 431 kB index is not downloaded when the app starts, when the words screen
 * opens, or when the search box is focused — only when a query is actually
 * typed. A learner who never searches never pays for it, and one who searches
 * twice pays once.
 *
 * `unavailable` rather than an error: the dictionary needs a network the first
 * time it is used, and a learner offline in a train should get their lessons
 * and a quiet line explaining the missing half, not a failure.
 */
export function useDictionarySearch(
  query: string,
  limit: number,
): { hits: DictionaryHit[]; state: DictionaryState } {
  const [index, setIndex] = useState<DictionaryIndex | null>(null);
  const [state, setState] = useState<DictionaryState>('idle');
  const wanted = query.trim().length > 0;

  useEffect(() => {
    if (!wanted || index) return;
    let live = true;
    setState('loading');
    loadIndex().then(
      (loaded) => {
        if (!live) return;
        setIndex(loaded);
        setState('ready');
      },
      () => {
        if (live) setState('unavailable');
      },
    );
    return () => {
      live = false;
    };
  }, [wanted, index]);

  if (!wanted) return { hits: [], state: 'idle' };
  if (!index) return { hits: [], state: state === 'ready' ? 'loading' : state };
  return { hits: rankDictionary(index, query, limit), state: 'ready' };
}

/**
 * The full senses of one headword.
 *
 * Two fetches behind it — the index, to learn which bucket the word is in, and
 * then that bucket — but both are cached, so opening a second word from the
 * same search costs one small fetch and often none.
 */
export function useDictionaryEntry(headword: string | null): {
  entry: DictionaryEntry | null;
  state: DictionaryState;
} {
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [state, setState] = useState<DictionaryState>('idle');

  useEffect(() => {
    if (!headword) {
      setEntry(null);
      setState('idle');
      return;
    }
    let live = true;
    setState('loading');
    loadIndex()
      .then(({ hits }) => {
        const row = hits.find((hit) => hit.headword === headword);
        return row ? loadEntry(headword, row.chunk) : null;
      })
      .then(
        (found) => {
          if (!live) return;
          setEntry(found);
          setState('ready');
        },
        () => {
          if (live) setState('unavailable');
        },
      );
    return () => {
      live = false;
    };
  }, [headword]);

  return { entry, state };
}
