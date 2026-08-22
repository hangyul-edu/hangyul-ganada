/**
 * How the learning corpus arrives.
 *
 * ## Why the corpus is fetched and no longer imported
 *
 * `vocabulary.ts` used to open with `import generated from
 * './generated/vocabulary.json'`, which is the simplest thing that can work and
 * is exactly wrong at the size this corpus is being built towards. A static
 * import is in the eager module graph: every word ever added to the curriculum
 * is downloaded, parsed and held before the home screen paints. At 2,581 words
 * that was 181 kB gzipped; at the ten thousand the product is aiming for it is
 * a forecast 754 kB, against a 460 kB budget for the whole first load.
 *
 * So the corpus is now cut into bands by `scripts/content/split_corpus.py` and
 * lives in `public/corpus/`, and this module fetches it. The generated JSON is
 * still written, still authoritative, and still read by half a dozen scripts —
 * it simply is not in the bundle any more.
 *
 * ## What is waited for, and what is not
 *
 * **The core** — the shared tables and band 1, the 600 words a beginner meets
 * first — is awaited before the app renders anything. That is 45 kB gzipped and
 * it does not grow with the corpus, because band 1 is a fixed count. It arrives
 * inside the launch screen's 900 ms minimum, so the wait is one the learner
 * never sees.
 *
 * **Everything else** is fetched straight afterwards, in the background, in
 * priority order. Between the two, the app is running on a partial corpus: it
 * knows the true total (the manifest says so) and it holds the words a beginner
 * needs. `corpusReady()` is false for that window, and the two screens that
 * genuinely need every word — browsing the whole vocabulary, and search — say
 * so rather than quietly returning a short answer.
 *
 * ## Why a registry and not a promise of an array
 *
 * Because thirty modules read the corpus synchronously and should go on doing
 * so. `VOCABULARY` is a live array that grows; consumers keep calling
 * `vocabularyByPriority()` and `getWord()` and never learn that the data
 * arrived in pieces. What they do get is `subscribeCorpus`, so a screen
 * re-renders when a band lands.
 *
 * ## Offline
 *
 * Every file name carries a content hash, which is what makes the service
 * worker's cache-first strategy correct under a cache key that never changes —
 * the same rule the dictionary layer follows, and for the same reason. The
 * worker precaches the corpus on install, because unlike the dictionary this is
 * the product: an app that cannot teach a word offline is not offline-capable.
 */

export interface CorpusBandInfo {
  band: number;
  count: number;
  words: string;
  bytes: number;
  locales: Record<string, string>;
}

export interface CorpusManifest {
  generator: string;
  /** Every headword in the corpus, whatever this client has fetched of it. */
  headwords: number;
  tables: string;
  bands: CorpusBandInfo[];
}

/** The parts of the dataset that do not grow with the number of words. */
export interface CorpusTables {
  generator: string;
  letter_order: string[];
  locales: string[];
  levels: number;
  difficulty_reasons: string[];
  categories: string[];
  frequency_bands: string[];
  sound_patterns: string[];
  words_per_lesson: number;
  sources: Array<Record<string, unknown>>;
  field_sets: string[][];
}

/** One row of `band-<n>.json`, exactly as the generator writes it. */
export type CorpusRow = Record<string, unknown>;

export interface CorpusBand {
  band: number;
  words: CorpusRow[];
}

/** `[meaning, example translation | null, long definition | null]`. */
export type CopyRow = [string, string | null, string | null];

/**
 * Resolved lazily, not at module scope, so this module can be imported outside
 * Vite — `scripts/export-curriculum.mjs` and the unit tests both do.
 */
function base(): string {
  const url = import.meta.env?.BASE_URL ?? '/';
  return `${url}corpus/`;
}

async function getJson<T>(name: string): Promise<T> {
  const response = await fetch(`${base()}${name}`);
  if (!response.ok) throw new Error(`corpus: ${name} — ${response.status}`);
  return (await response.json()) as T;
}

type BandListener = (band: CorpusBand) => void;
type TableListener = (tables: CorpusTables) => void;

const bandListeners: BandListener[] = [];
const tableListeners: TableListener[] = [];
const changeListeners = new Set<() => void>();

let manifest: CorpusManifest | null = null;
let tables: CorpusTables | null = null;
const loaded = new Set<number>();
let version = 0;

/**
 * Registers a consumer of the corpus.
 *
 * Called at module scope by `vocabulary.ts` and `wordCopy.ts`, before anything
 * is fetched — and replayed against whatever has already arrived, so a module
 * imported late (a lazily-loaded route pulling in `wordCopy` for the first
 * time) is not handed an empty corpus.
 */
export function onCorpus(listeners: { tables?: TableListener; band?: BandListener }): void {
  if (listeners.tables) {
    tableListeners.push(listeners.tables);
    if (tables) listeners.tables(tables);
  }
  if (listeners.band) {
    bandListeners.push(listeners.band);
    for (const band of arrived) listeners.band(band);
  }
}

/** Bands in the order they arrived, kept so a late subscriber can catch up. */
const arrived: CorpusBand[] = [];

/** Re-render when a band lands. Returns an unsubscribe. */
export function subscribeCorpus(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/** Bumped once per band. `useSyncExternalStore` reads this as the snapshot. */
export function corpusVersion(): number {
  return version;
}

/**
 * Every headword in the corpus — the *published* total, not the loaded one.
 *
 * This is what "12 of 2,581 words" reads, so a progress figure is honest from
 * the first frame instead of climbing as bands arrive. Zero before the manifest
 * lands, which only happens before the app has rendered.
 */
export function corpusTotal(): number {
  return manifest?.headwords ?? 0;
}

/** Whether every band is in memory. False for a second or two after launch. */
export function corpusReady(): boolean {
  return manifest !== null && loaded.size === manifest.bands.length;
}

/**
 * Whether the shared tables and the first band are in memory.
 *
 * The bar a screen has to clear before it is allowed to render, and it is a
 * lower bar than `corpusReady` on purpose — band 1 is a working corpus, and
 * waiting for all of it would put the whole app behind the whole download.
 *
 * It exists because of a defect worth remembering. The launch screen is an
 * *overlay*: the route underneath renders immediately, behind it. So a screen
 * that reads corpus data once at render — the Legal screen reads
 * `CONTENT_SOURCES` and nothing tells it to look again — rendered against an
 * empty corpus and stayed that way, showing one licence credit instead of
 * three, on a screen whose entire job is to show them. Nothing failed and
 * nothing logged; the page was simply wrong, and only on a cold start.
 *
 * `useCorpusMemo` fixes that for a screen that opts in. This makes it
 * unnecessary to opt in: no route renders before there is a corpus to read.
 */
export function corpusCoreReady(): boolean {
  return tables !== null && loaded.size > 0;
}

/** How much of the corpus is here, for a progress affordance. */
export function corpusProgress(): { loaded: number; total: number } {
  return { loaded: loaded.size, total: manifest?.bands.length ?? 0 };
}

export function corpusManifest(): CorpusManifest | null {
  return manifest;
}

function announce(): void {
  version += 1;
  for (const listener of changeListeners) listener();
}

/**
 * The same signal, for content that arrives alongside a band.
 *
 * A band of words and that band's meanings are two fetches, and the words land
 * first. `wordCopy` calls this when a language's pack for a band installs, so a
 * screen already showing those words is told to read them again rather than
 * keeping the blank glosses it rendered a moment earlier.
 */
export function announceContent(): void {
  announce();
}

function ingest(band: CorpusBand): void {
  if (loaded.has(band.band)) return;
  loaded.add(band.band);
  arrived.push(band);
  for (const listener of bandListeners) listener(band);
  announce();
}

/**
 * The locale packs for a band, fetched on demand.
 *
 * `wordCopy` owns which languages are wanted; this only knows where the files
 * are. A locale the curriculum has no editorial copy for is not an error —
 * twenty-two of the thirty-two interface languages fall back through the chain
 * — so a missing entry resolves to null rather than throwing.
 */
export async function fetchBandCopy(band: number, locale: string): Promise<CopyRow[] | null> {
  const info = manifest?.bands.find((entry) => entry.band === band);
  const name = info?.locales[locale];
  if (!name) return null;
  const pack = await getJson<{ words: CopyRow[] }>(name);
  return pack.words;
}

/** Which bands are in memory, in arrival order. */
export function loadedBands(): number[] {
  return [...loaded].sort((a, b) => a - b);
}

let core: Promise<void> | null = null;
let rest: Promise<void> | null = null;

/**
 * The tables and the first band. Awaited before the app renders.
 *
 * Memoised on the promise rather than on a flag: React 19 in strict mode
 * mounts the provider twice, and two fetches of the same 45 kB on every cold
 * launch is a real cost on a phone.
 */
export function loadCorpusCore(): Promise<void> {
  core ??= (async () => {
    manifest = await getJson<CorpusManifest>('manifest.json');
    tables = await getJson<CorpusTables>(manifest.tables);
    for (const listener of tableListeners) listener(tables);
    const first = manifest.bands[0];
    if (first) ingest(await getJson<CorpusBand>(first.words));
    else announce();
  })().catch((error) => {
    // Not cached: a learner who was offline on their very first launch should
    // get the corpus when they come back, not a remembered failure.
    core = null;
    throw error;
  });
  return core;
}

/**
 * The rest of the corpus, in priority order.
 *
 * Sequential rather than parallel, deliberately. The bands are wanted in order
 * — band 2 is the words after the ones the learner has — and firing sixteen
 * fetches at once on a phone competes with the audio clip the lesson they just
 * opened is trying to play. One at a time is slower to finish and faster to be
 * useful, which is the right trade for something nothing is waiting on.
 */
export function loadCorpusRest(): Promise<void> {
  rest ??= (async () => {
    await loadCorpusCore();
    for (const info of manifest?.bands.slice(1) ?? []) {
      if (loaded.has(info.band)) continue;
      ingest(await getJson<CorpusBand>(info.words));
    }
  })().catch((error) => {
    rest = null;
    throw error;
  });
  return rest;
}

/**
 * Forgets everything. Tests only.
 *
 * The registry is module state, and a test that loads a corpus must not leak it
 * into the next one.
 */
export function resetCorpus(): void {
  manifest = null;
  tables = null;
  loaded.clear();
  arrived.length = 0;
  core = null;
  rest = null;
  version = 0;
}
