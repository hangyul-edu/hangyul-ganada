import { useEffect, useMemo, useState } from 'react';

import {
  type DictionaryEntry,
  type DictionaryHit,
  type DictionaryIndex,
  analyseInflection,
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
/** A typed inflection, and the dictionary form it belongs to. */
export interface InflectionHit {
  lemma: string;
  form: string;
  hit: DictionaryHit;
}

export function useDictionarySearch(
  query: string,
  limit: number,
): { hits: DictionaryHit[]; state: DictionaryState; inflections: InflectionHit[] } {
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

  if (!wanted) return { hits: [], state: 'idle', inflections: [] };
  if (!index) return { hits: [], state: state === 'ready' ? 'loading' : state, inflections: [] };
  const hits = rankDictionary(index, query, limit);
  /*
    Only when the dictionary has nothing to say about the string as typed.

    A learner typing 먹 is part-way through a word and wants headwords; one who
    has typed 먹었어요 has finished, and no dictionary contains it. So the
    analyser runs on the miss rather than on every keystroke, which is also what
    keeps it off the 8 ms budget — it does about six hundred string comparisons
    and it does them once, at the end of typing.
  */
  const inflections = hits.length === 0 ? analyseInflection(index, query) : [];
  return { hits, state: 'ready', inflections };
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

/**
 * Short glosses for a handful of headwords, from the index.
 *
 * For the Saved words screen, which can now hold words the app does not teach:
 * a saved 귀족 has a headword and nothing else until the dictionary index is in
 * memory. One fetch for the whole screen rather than one per row, and only when
 * there is at least one such word to look up — a learner whose saved list is
 * all taught cards never downloads the index.
 *
 * Returns an empty map while it loads and if it fails. A row with no gloss
 * shows its headword, which is still the word they saved.
 */
export function useDictionaryGlosses(headwords: readonly string[]): Map<string, DictionaryHit> {
  const [index, setIndex] = useState<DictionaryIndex | null>(null);
  const wanted = headwords.length > 0;

  useEffect(() => {
    if (!wanted || index) return;
    let live = true;
    loadIndex().then(
      (loaded) => live && setIndex(loaded),
      () => {
        /* offline, or never fetched. The rows fall back to the headword. */
      },
    );
    return () => {
      live = false;
    };
  }, [wanted, index]);

  return useMemo(() => {
    const out = new Map<string, DictionaryHit>();
    if (!index) return out;
    for (const headword of headwords) {
      for (const row of index.exact.get(headword.toLowerCase()) ?? []) {
        const hit = index.hits[row]!;
        if (hit.headword === headword) {
          out.set(headword, hit);
          break;
        }
      }
    }
    return out;
  }, [index, headwords]);
}
