import type { LevelTestItem } from '../domain/levelTestTypes';

/**
 * The assessment bank, fetched when somebody starts the test and not before.
 *
 * 345 kB gzipped of questions that most learners will never open. It sits in
 * `public/` for the same reason the dictionary does: an import would go through
 * Vite's `manualChunks` catch-all onto the critical path, so every learner would
 * download the level test in order to see the home screen.
 *
 * Content-hashed, like the dictionary, so the offline worker can cache it
 * permanently and a rebuilt bank gets a new name rather than a stale hit.
 */
interface Manifest {
  levels: number;
  options: number;
  items: number;
  bank: string;
  perLevel: Record<string, number>;
}

export interface LevelTestBank {
  levels: number;
  items: LevelTestItem[];
  /** Items indexed by level, which is how the engine asks for them. */
  byLevel: Map<number, LevelTestItem[]>;
}

function base(): string {
  const url = import.meta.env?.BASE_URL ?? '/';
  return `${url}level-test/`;
}

let bankPromise: Promise<LevelTestBank> | null = null;

/** One fetch per session, on the first sitting. A failure is not cached. */
export function loadLevelTestBank(): Promise<LevelTestBank> {
  bankPromise ??= (async () => {
    const manifest = (await (await fetch(`${base()}manifest.json`)).json()) as Manifest;
    const response = await fetch(`${base()}${manifest.bank}`);
    if (!response.ok) throw new Error(`level test: ${manifest.bank} — ${response.status}`);
    const raw = (await response.json()) as { items: LevelTestItem[] };
    const byLevel = new Map<number, LevelTestItem[]>();
    for (const item of raw.items) {
      const list = byLevel.get(item.level);
      if (list) list.push(item);
      else byLevel.set(item.level, [item]);
    }
    return { levels: manifest.levels, items: raw.items, byLevel };
  })().catch((error: unknown) => {
    bankPromise = null;
    throw error;
  });
  return bankPromise;
}

/** Test seam. */
export function resetLevelTestBank(): void {
  bankPromise = null;
}
