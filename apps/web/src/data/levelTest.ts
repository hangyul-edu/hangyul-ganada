import type {
  LevelTestItem,
  RenderedItem,
  RenderedOption,
} from '../domain/levelTestTypes';

/**
 * The assessment bank, fetched when somebody starts the test and not before.
 *
 * A hundred-odd kilobytes gzipped of questions that most learners never open. It sits in
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
  /** One meanings file per language, keyed by locale. */
  meanings: Record<string, string>;
  /** What each language can actually ask: how many items, and how far up. */
  reach: Record<string, { items: number; ceiling: number }>;
  perLevel: Record<string, number>;
}

export interface LevelTestBank {
  levels: number;
  items: LevelTestItem[];
  /** Items indexed by level, which is how the engine asks for them. */
  byLevel: Map<number, LevelTestItem[]>;
  /**
   * And by level *and kind*, which is how a sitting asks for them.
   *
   * A sitting is twelve contextual questions, nine each way on the word. The
   * engine chooses the level and the plan chooses the kind, so the lookup has
   * to answer both at once — and has to be able to say "nothing", because the
   * contextual bank thins out at the top of the scale and level 27 has one.
   */
  byLevelKind: Map<string, LevelTestItem[]>;
  /** Anchor id to meaning, in the language this bank was loaded for. */
  meanings: Map<string, string>;
  /** The language those meanings are in. */
  locale: string;
  /**
   * The highest level this language has enough items to ask about.
   *
   * Below 30 for a language whose taught-word content is unfinished. The test
   * stops climbing there and the result says so, which is the honest form of
   * the alternative — asking the question in English.
   */
  ceiling: number;
}

/** The key `byLevelKind` is indexed on. */
export function levelKind(level: number, kind: LevelTestItem['kind']): string {
  return `${level}:${kind}`;
}

function base(): string {
  const url = import.meta.env?.BASE_URL ?? '/';
  return `${url}level-test/`;
}

/**
 * Every string in this item, in one language — or nothing.
 *
 * Nothing is the important half. An item whose meanings are not written in the
 * learner's language is **not asked**, rather than asked in English: that is
 * the invariant §3 states, and it is enforced here because here is the only
 * place that knows both the item and the locale.
 *
 * A `context` item resolves in every language by construction — a Korean
 * sentence with a Korean word blanked out of it, and Korean choices — which is
 * why a language with a hundred words written can still run a real test.
 */
export function resolveItem(
  item: LevelTestItem,
  meanings: Map<string, string>,
  locale: string,
): RenderedItem | null {
  const korean = (text: string, correct: boolean): RenderedOption => ({
    text,
    resolvedLocale: 'ko',
    correct,
  });

  if (item.kind === 'meaning') {
    const ids = item.optionIds ?? [];
    const options: RenderedOption[] = [];
    for (const id of ids) {
      const text = meanings.get(id);
      if (!text) return null;
      options.push({ text, resolvedLocale: locale, correct: id === item.answerId });
    }
    if (!options.some((option) => option.correct)) return null;
    return {
      id: item.id,
      kind: item.kind,
      level: item.level,
      prompt: item.prompt ?? '',
      promptLocale: 'ko',
      options,
    };
  }

  if (item.kind === 'produce') {
    const prompt = item.promptId ? meanings.get(item.promptId) : undefined;
    if (!prompt) return null;
    return {
      id: item.id,
      kind: item.kind,
      level: item.level,
      prompt,
      promptLocale: locale,
      options: (item.options ?? []).map((word) => korean(word, word === item.answer)),
    };
  }

  return {
    id: item.id,
    kind: item.kind,
    level: item.level,
    prompt: item.prompt ?? '',
    promptLocale: 'ko',
    options: (item.options ?? []).map((word) => korean(word, word === item.answer)),
  };
}

const bankPromises = new Map<string, Promise<LevelTestBank>>();

/**
 * One fetch per language per session, on the first sitting.
 *
 * Keyed by locale, because the bank a learner gets *is* language-dependent now:
 * the items are shared and the meanings are not, and a learner who changes
 * language mid-session must not keep the previous language's strings.
 */
export function loadLevelTestBank(locale: string): Promise<LevelTestBank> {
  const cached = bankPromises.get(locale);
  if (cached) return cached;

  const promise = (async () => {
    const manifest = (await (await fetch(`${base()}manifest.json`)).json()) as Manifest;
    const response = await fetch(`${base()}${manifest.bank}`);
    if (!response.ok) throw new Error(`level test: ${manifest.bank} — ${response.status}`);
    const raw = (await response.json()) as { items: LevelTestItem[] };

    /*
      A language with no meanings file gets an empty table, not English.

      That is not a degradation to guard against — it is the rule. Such a
      learner is asked the `context` questions, which are Korean throughout,
      and the ceiling reported below says how far that reaches.
    */
    const meanings = new Map<string, string>();
    const file = manifest.meanings?.[locale];
    if (file) {
      const table = (await (await fetch(`${base()}${file}`)).json()) as {
        meanings: Record<string, string>;
      };
      for (const [id, text] of Object.entries(table.meanings)) meanings.set(id, text);
    }

    const byLevel = new Map<number, LevelTestItem[]>();
    const byLevelKind = new Map<string, LevelTestItem[]>();
    const askable: LevelTestItem[] = [];
    for (const item of raw.items) {
      // Resolvability is decided once, here, so no later code has to remember.
      if (!resolveItem(item, meanings, locale)) continue;
      askable.push(item);
      const list = byLevel.get(item.level);
      if (list) list.push(item);
      else byLevel.set(item.level, [item]);
      const key = levelKind(item.level, item.kind);
      const kindList = byLevelKind.get(key);
      if (kindList) kindList.push(item);
      else byLevelKind.set(key, [item]);
    }

    return {
      levels: manifest.levels,
      items: askable,
      byLevel,
      byLevelKind,
      meanings,
      locale,
      ceiling: manifest.reach?.[locale]?.ceiling ?? manifest.levels,
    };
  })().catch((error: unknown) => {
    bankPromises.delete(locale);
    throw error;
  });

  bankPromises.set(locale, promise);
  return promise;
}

/** Test seam. */
export function resetLevelTestBank(): void {
  bankPromises.clear();
}
