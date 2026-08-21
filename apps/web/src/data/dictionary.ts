/**
 * The dictionary layer: everything Korean, as opposed to everything taught.
 *
 * ## Why this is not part of the corpus
 *
 * `vocabulary.ts` holds the 2,581 words the app *teaches* — curated, scheduled,
 * illustrated, translated into ten languages by hand, and each one carrying
 * exactly one taught sense. This holds 7,000-odd headwords the app can merely
 * *look up*: Wiktionary's Korean entries, all their senses, no curation. A
 * learner who searches 나가다 should find it whether or not it is on the syllabus.
 *
 * The two must never be confused, and the type system is where that is enforced:
 * a `DictionaryEntry` has no difficulty score, no lesson, no category and no
 * `letters_ready_after`, so there is no way to hand one to the scheduler. Nothing
 * here is ever scheduled, reviewed, or counted as progress. It answers questions;
 * it does not set homework.
 *
 * ## Why it is fetched rather than imported
 *
 * 4.3 MB of it. An import would put every byte through Vite's `manualChunks`,
 * where a catch-all sends `src/data/generated` to the `curriculum-data` chunk —
 * on the critical path, downloaded before the first screen paints, by every
 * learner including the ones who never open search. So it lives in `public/`
 * and arrives over `fetch`, in three stages, none of which happen until someone
 * actually searches:
 *
 *   manifest.json   ~2 kB   which files exist, named by content hash
 *   index-<hash>    431 kB  one row per headword: enough to search and rank
 *   entries/<chunk> ~150 kB the full senses for one initial consonant
 *
 * The index is the only large fetch a searcher always pays, and it buys every
 * headword in the dictionary. Senses are fetched a bucket at a time, and only
 * for a word someone opened.
 */

/** Where a sense came from, carried so the licence can be honoured on screen. */
export interface DictionarySource {
  id: string;
  entryId: string;
  license: string;
  retrievedAt: string;
  url: string;
}

export interface DictionaryExample {
  korean: string;
  translation?: string;
}

export interface DictionarySense {
  /** Canonical, and the same shape as a learning card's: `dict_naga#go`. */
  senseId: string;
  rank: number;
  partOfSpeech: string;
  gloss: string;
  shortGloss: string;
  labels?: string[];
  examples: DictionaryExample[];
}

export interface DictionaryEntry {
  id: string;
  headword: string;
  romanization: string;
  senses: DictionarySense[];
  frequency: number;
  source: DictionarySource;
}

/** A search hit, from the index alone — no chunk has been fetched for it yet. */
export interface DictionaryHit {
  headword: string;
  romanization: string;
  partOfSpeech: string;
  shortGloss: string;
  senseCount: number;
  chunk: string;
  frequency: number;
}

interface Manifest {
  generatedAt: string;
  headwords: number;
  senses: number;
  examples: number;
  index: string;
  chunks: Record<string, { file: string; entries: number }>;
  source: { name: string; license: string; url: string };
}

/**
 * Where the files live, resolved on use rather than at import.
 *
 * `import.meta.env` exists only inside Vite, so reading it at module scope made
 * this module unimportable anywhere else — which is exactly where the ranking
 * benchmark wanted it, and would have forced that benchmark to keep its own
 * copy of the loop it is meant to be measuring. Nothing here needs the base URL
 * until a fetch actually happens.
 */
function base(): string {
  const url = import.meta.env?.BASE_URL ?? '/';
  return `${url}dictionary/`;
}

/**
 * Promises, not values.
 *
 * Two components searching on the same keystroke must produce one fetch, not
 * two, so what is memoised is the in-flight promise. A rejected one is dropped
 * rather than kept, because a learner who was offline when they first searched
 * should get a dictionary when they come back, not a cached failure.
 */
let manifestPromise: Promise<Manifest> | null = null;
let indexPromise: Promise<DictionaryIndex> | null = null;
const chunkPromises = new Map<string, Promise<Map<string, DictionaryEntry>>>();

function fetchJson<T>(path: string): Promise<T> {
  return fetch(`${base()}${path}`).then((response) => {
    if (!response.ok) throw new Error(`dictionary: ${path} — ${response.status}`);
    return response.json() as Promise<T>;
  });
}

function forget<T>(promise: Promise<T>, drop: () => void): Promise<T> {
  promise.catch(drop);
  return promise;
}

export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= forget(fetchJson<Manifest>('manifest.json'), () => {
    manifestPromise = null;
  });
  return manifestPromise;
}

/**
 * The searchable index, with the per-query work already done.
 *
 * `hits` is the data; the parallel arrays beside it exist because ranking runs
 * on **every keystroke** over every row. Lower-casing the gloss and the
 * romanisation inside that loop meant 26,675 `toLowerCase()` calls per
 * character typed, which measured at 9.0 ms on a phone against a budget of half
 * a frame. Doing it once when the index arrives costs 7 ms, and brings a
 * keystroke to 3.2 ms. See `scripts/perf-dictionary.mjs`, which is what caught
 * it: the same code was comfortably inside budget at 7,865 headwords and went
 * over when the corpus grew, with nothing else changing.
 */
export interface DictionaryIndex {
  hits: DictionaryHit[];
  /** Lower-cased once, in the same order as `hits`. */
  gloss: string[];
  romanization: string[];
}

/** Every headword, searchable. One fetch per session, on the first search. */
export function loadIndex(): Promise<DictionaryIndex> {
  indexPromise ??= forget(
    loadManifest()
      .then((manifest) => fetchJson<{ rows: unknown[][] }>(manifest.index))
      .then(({ rows }) => {
        const hits = rows.map((row) => ({
          headword: row[0] as string,
          romanization: row[1] as string,
          partOfSpeech: row[2] as string,
          shortGloss: row[3] as string,
          senseCount: row[4] as number,
          chunk: row[5] as string,
          frequency: row[6] as number,
        }));
        return {
          hits,
          gloss: hits.map((hit) => hit.shortGloss.toLowerCase()),
          romanization: hits.map((hit) => hit.romanization.toLowerCase()),
        };
      }),
    () => {
      indexPromise = null;
    },
  );
  return indexPromise;
}

/** The full senses for one bucket, fetched when a word in it is opened. */
export function loadChunk(chunk: string): Promise<Map<string, DictionaryEntry>> {
  const cached = chunkPromises.get(chunk);
  if (cached) return cached;
  const promise = forget(
    loadManifest()
      .then((manifest) => {
        const file = manifest.chunks[chunk]?.file;
        if (!file) throw new Error(`dictionary: no chunk ${chunk}`);
        return fetchJson<{ entries: DictionaryEntry[] }>(file);
      })
      .then(({ entries }) => new Map(entries.map((entry) => [entry.headword, entry]))),
    () => chunkPromises.delete(chunk),
  );
  chunkPromises.set(chunk, promise);
  return promise;
}

export function loadEntry(headword: string, chunk: string): Promise<DictionaryEntry | null> {
  return loadChunk(chunk).then((entries) => entries.get(headword) ?? null);
}

/**
 * Rank a query against the index.
 *
 * The same ladder `searchWords` uses on the taught corpus — exact, prefix,
 * substring, then romanization — so that a learner typing into one box gets one
 * ordering, whichever half of the app answers. Where it differs is the
 * tiebreak: the corpus sorts by difficulty, which the dictionary does not have
 * and should not, so ties go to the more frequent word. Someone typing "나" has
 * far more use for 나가다 than for a headword nobody says.
 */
export function rankDictionary(
  index: DictionaryIndex,
  query: string,
  limit: number,
): DictionaryHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const { hits, gloss, romanization } = index;
  // Two parallel arrays of primitives rather than an array of objects: at this
  // size the allocation per match is a measurable share of the keystroke.
  const found: number[] = [];
  const ranks: number[] = [];
  for (let i = 0; i < hits.length; i += 1) {
    const headword = hits[i]!.headword;
    const meaning = gloss[i]!;
    let rank: number;
    if (headword === needle || meaning === needle) rank = 0;
    else if (headword.startsWith(needle) || meaning.startsWith(needle)) rank = 1;
    else if (headword.includes(needle) || meaning.includes(needle)) rank = 2;
    else if (romanization[i]!.startsWith(needle)) rank = 3;
    else continue;
    found.push(i);
    ranks.push(rank);
  }

  const order = found.map((_, position) => position);
  order.sort(
    (a, b) => ranks[a]! - ranks[b]! || hits[found[b]!]!.frequency - hits[found[a]!]!.frequency,
  );
  return order.slice(0, limit).map((position) => hits[found[position]!]!);
}

/** Test seam: forget everything fetched, so a test can serve a new manifest. */
export function resetDictionaryCache(): void {
  manifestPromise = null;
  indexPromise = null;
  chunkPromises.clear();
}
