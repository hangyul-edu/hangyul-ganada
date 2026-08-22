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

import { analyse } from '@hangyul-ganada/korean-morphology';

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

/**
 * A search hit, from the index alone — no chunk has been fetched for it yet.
 *
 * Five fields, and every one of them is used: the headword and the gloss are
 * the row a learner reads, the romanisation is a way of finding it, the chunk
 * is where to go next, and the frequency is the tiebreak. The part of speech
 * and the sense count used to be here too, parsed into thirty thousand objects
 * on the first search and rendered by no screen — 27.5 kB gzipped of a file
 * somebody waits for. They are still on the full entry, where they are shown.
 */
export interface DictionaryHit {
  headword: string;
  romanization: string;
  shortGloss: string;
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
  /**
   * Rows whose headword or gloss *is* a given string. One lookup, no scan.
   */
  exact: Map<string, number[]>;
  /**
   * Rows whose headword, romanisation or gloss *starts with* a given key.
   *
   * Keyed on the first character for Hangul and the first two for Latin, which
   * is where the useful discrimination is: 1,210 distinct Hangul first
   * characters over 26,675 headwords, the largest bucket 328. A keystroke
   * therefore scores a few hundred rows instead of twenty-six thousand.
   */
  prefix: Map<string, number[]>;
  /**
   * Rows containing a given two-character sequence, built on first use.
   *
   * Substring matching is the one query shape a prefix index cannot answer, and
   * the postings for it are the expensive part — about thirteen per row once
   * the gloss is included. Building them with the rest would put that cost on
   * every learner who searches, including the ones who only ever type a word's
   * beginning, which is most of them. So it is built the first time a query
   * actually needs it and kept from then on.
   */
  bigrams: Map<string, number[]> | null;
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
          shortGloss: row[2] as string,
          chunk: row[3] as string,
          frequency: row[4] as number,
        }));
        return assemble(hits);
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
  const found: number[] = [];
  const ranks: number[] = [];
  const seen = new Set<number>();

  const consider = (i: number) => {
    if (seen.has(i)) return;
    const headword = hits[i]!.headword;
    const meaning = gloss[i]!;
    let rank: number;
    if (headword === needle || meaning === needle) rank = 0;
    else if (headword.startsWith(needle) || meaning.startsWith(needle)) rank = 1;
    else if (headword.includes(needle) || meaning.includes(needle)) rank = 2;
    else if (romanization[i]!.startsWith(needle)) rank = 3;
    else return;
    seen.add(i);
    found.push(i);
    ranks.push(rank);
  };

  /*
    Three narrowing passes instead of one scan of everything.

    Exact and prefix are answered from maps built when the index loaded. The
    substring pass is the only one that can still be broad, and it is reached
    only when the first two have not already filled the list — which for a
    dictionary is the common case, because people type the beginning of a word.
  */
  for (const i of index.exact.get(needle) ?? []) consider(i);
  for (const i of index.prefix.get(needle.slice(0, needle.length > 1 ? 2 : 1)) ?? []) consider(i);
  if (needle.length === 1) {
    // A single character never lands in a two-character Latin bucket.
    for (const i of index.prefix.get(needle) ?? []) consider(i);
  }

  if (found.length < limit) {
    for (const i of substringCandidates(index, needle)) consider(i);
  }

  const order = found.map((_, position) => position);
  order.sort(
    (a, b) => ranks[a]! - ranks[b]! || hits[found[b]!]!.frequency - hits[found[a]!]!.frequency,
  );
  return order.slice(0, limit).map((position) => hits[found[position]!]!);
}

/**
 * Whether the dictionary has this exact headword.
 *
 * The one thing the inflected-form analyser needs from the dictionary: it
 * guesses dictionary forms from the shape of what was typed and asks this
 * whether each guess is a word. One map lookup per guess, against the map the
 * search already built.
 */
export function hasHeadword(index: DictionaryIndex, headword: string): boolean {
  for (const row of index.exact.get(headword.toLowerCase()) ?? []) {
    if (index.hits[row]!.headword === headword) return true;
  }
  return false;
}

/**
 * The particles a noun can be wearing.
 *
 * Longest first, because 에서 has to be tried before 에 and 이랑 before 이 —
 * otherwise 학교에서 strips to 학교서, which is not a word.
 *
 * Korean marks a noun's role with a suffix, so the form a learner reads is
 * almost never the form a dictionary lists: 때문에, 학교에서, 친구를. The verb
 * analyser cannot help — these are not conjugations — and without this a
 * dictionary with 때문 in it answers "nothing matches" to 때문에.
 *
 * `의`, `도`, `만` and the rest are here for the same reason. What is *not*
 * here is anything one syllable long that is also a common word on its own
 * where stripping it would do more harm than good — see the guard below.
 */
const PARTICLES = [
  '이랑', '에서', '에게', '한테', '으로', '까지', '부터', '보다', '처럼', '마다',
  '조차', '밖에', '이나', '든지', '라도', '이라', '으로서', '으로써',
  '은', '는', '이', '가', '을', '를', '에', '와', '과', '랑', '도', '만', '의', '께', '나', '뿐',
];

/**
 * A noun with its particle taken off, if that leaves a word the dictionary has.
 *
 * Only ever offered when the query itself matched nothing, and only when what
 * is left is at least one syllable and is a real headword — so 나 stays 나 and
 * does not become the empty string, and 가方 does not become 가.
 */
export function stripParticle(
  index: DictionaryIndex,
  query: string,
): Array<{ lemma: string; particle: string; hit: DictionaryHit }> {
  const typed = query.trim();
  if (typed.length < 2 || !/^[가-힣]+$/.test(typed)) return [];
  const out: Array<{ lemma: string; particle: string; hit: DictionaryHit }> = [];
  const seen = new Set<string>();
  for (const particle of PARTICLES) {
    if (!typed.endsWith(particle) || typed.length - particle.length < 1) continue;
    const stem = typed.slice(0, typed.length - particle.length);
    if (seen.has(stem)) continue;
    seen.add(stem);
    const row = (index.exact.get(stem.toLowerCase()) ?? []).find(
      (i) => index.hits[i]!.headword === stem,
    );
    if (row === undefined) continue;
    out.push({ lemma: stem, particle, hit: index.hits[row]! });
  }
  return out.sort((a, b) => b.hit.frequency - a.hit.frequency);
}

/**
 * A typed word resolved back to the dictionary forms it could be.
 *
 * 먹었어요 → 먹다. 걸어요 → 걷다 *and* 걸다, because both are real and only the
 * person typing knows which they meant; they come back in the dictionary's own
 * frequency order, so the common one is first.
 *
 * Runs only when the exact and prefix passes have found nothing, which is what
 * keeps it off the keystroke path: somebody typing 먹 is matching headwords, and
 * only a completed inflected form fails to match anything.
 */
export function analyseInflection(
  index: DictionaryIndex,
  query: string,
): Array<{ lemma: string; form: string; hit: DictionaryHit }> {
  const out: Array<{ lemma: string; form: string; hit: DictionaryHit }> = [];
  for (const analysis of analyse(query.trim(), (lemma) => hasHeadword(index, lemma))) {
    const row = (index.exact.get(analysis.lemma.toLowerCase()) ?? []).find(
      (i) => index.hits[i]!.headword === analysis.lemma,
    );
    if (row === undefined) continue;
    out.push({ lemma: analysis.lemma, form: analysis.form, hit: index.hits[row]! });
  }
  // And the nouns, which wear a particle rather than a conjugation.
  for (const stripped of stripParticle(index, query)) {
    if (out.some((found) => found.lemma === stripped.lemma)) continue;
    out.push({ lemma: stripped.lemma, form: `+${stripped.particle}`, hit: stripped.hit });
  }
  return out.sort((a, b) => b.hit.frequency - a.hit.frequency);
}

/**
 * Rows that could contain the query anywhere inside them.
 *
 * For two characters or more this is the intersection of the postings for the
 * query's own bigrams, which is a small set. For a single character there are
 * no bigrams to intersect and the whole corpus is a candidate — but a
 * one-character query has already been answered by the prefix pass above, and
 * asking for every row that merely *contains* one character is not a search
 * anybody wants.
 */
function substringCandidates(index: DictionaryIndex, needle: string): readonly number[] {
  if (needle.length < 2) return [];
  index.bigrams ??= buildBigrams(index);
  let candidates: number[] | null = null;
  for (let i = 0; i + 1 < needle.length; i += 1) {
    const posting = index.bigrams.get(needle.slice(i, i + 2));
    if (!posting) return [];
    if (candidates === null || posting.length < candidates.length) candidates = posting;
  }
  return candidates ?? [];
}

/** The postings, built once, the first time a substring query needs them. */
function buildBigrams(index: DictionaryIndex): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const push = (key: string, row: number) => {
    const at = map.get(key);
    if (at) {
      if (at[at.length - 1] !== row) at.push(row);
    } else map.set(key, [row]);
  };
  for (let i = 0; i < index.hits.length; i += 1) {
    const headword = index.hits[i]!.headword;
    for (let c = 0; c + 1 < headword.length; c += 1) push(headword.slice(c, c + 2), i);
    const meaning = index.gloss[i]!;
    for (let c = 0; c + 1 < meaning.length; c += 1) push(meaning.slice(c, c + 2), i);
  }
  return map;
}

/**
 * The searchable index for a list of hits, without a fetch.
 *
 * Exported for the tests and the benchmark, so both search the structure the
 * app builds rather than a hand-assembled lookalike — a benchmark of a copy is
 * a benchmark of code nobody runs.
 */
export function buildIndexForTest(hits: DictionaryHit[]): DictionaryIndex {
  return assemble(hits);
}

/** Lower-cases once, and builds the two maps every keystroke reads. */
function assemble(hits: DictionaryHit[]): DictionaryIndex {
  const gloss = hits.map((hit) => hit.shortGloss.toLowerCase());
  const romanization = hits.map((hit) => hit.romanization.toLowerCase());
  const exact = new Map<string, number[]>();
  const prefix = new Map<string, number[]>();
  const add = (map: Map<string, number[]>, key: string, row: number) => {
    const at = map.get(key);
    if (at) at.push(row);
    else map.set(key, [row]);
  };
  for (let i = 0; i < hits.length; i += 1) {
    const headword = hits[i]!.headword;
    add(exact, headword, i);
    if (gloss[i]) add(exact, gloss[i]!, i);
    // Hangul discriminates on one character; Latin needs two.
    if (headword) add(prefix, headword.slice(0, 1), i);
    if (romanization[i]) add(prefix, romanization[i]!.slice(0, 2), i);
    if (gloss[i]) add(prefix, gloss[i]!.slice(0, 2), i);
  }
  return { hits, gloss, romanization, exact, prefix, bigrams: null };
}

/** Test seam: forget everything fetched, so a test can serve a new manifest. */
export function resetDictionaryCache(): void {
  manifestPromise = null;
  indexPromise = null;
  chunkPromises.clear();
}
