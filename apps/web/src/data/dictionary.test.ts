import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildIndexForTest,
  type DictionaryHit,
  loadChunk,
  loadEntry,
  loadIndex,
  rankDictionary,
  resetDictionaryCache,
} from './dictionary';

const MANIFEST = {
  generatedAt: '2026-08-21',
  headwords: 2,
  senses: 2,
  examples: 0,
  index: 'index-abc123.json',
  chunks: { 'ㄴ': { file: 'entries/ㄴ-def456.json', entries: 2 } },
  source: { name: 'English Wiktionary', license: 'CC BY-SA 4.0', url: 'https://en.wiktionary.org' },
};

const INDEX = {
  rows: [
    ['나가다', 'nagada', 'verb', 'to go out', 3, 'ㄴ', 500],
    ['나', 'na', 'pronoun', 'I', 1, 'ㄴ', 10042],
  ],
};

const CHUNK = {
  entries: [
    {
      id: 'dict_nagada',
      headword: '나가다',
      romanization: 'nagada',
      senses: [
        {
          senseId: 'dict_nagada#go',
          rank: 1,
          partOfSpeech: 'verb',
          gloss: 'to go out; to leave',
          shortGloss: 'to go out',
          examples: [],
        },
      ],
      frequency: 500,
      source: {
        id: 'en-wiktionary',
        entryId: '나가다',
        license: 'CC BY-SA 4.0',
        retrievedAt: '2026-08-21',
        url: 'https://en.wiktionary.org/wiki/나가다#Korean',
      },
    },
  ],
};

function serve(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => {
    const body = url.endsWith('manifest.json')
      ? MANIFEST
      : url.includes('index-')
        ? INDEX
        : CHUNK;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => resetDictionaryCache());
afterEach(() => vi.unstubAllGlobals());

describe('lazy delivery', () => {
  it('fetches the manifest and index once however many callers ask', async () => {
    const fetchMock = serve();
    const [a, b] = await Promise.all([loadIndex(), loadIndex()]);

    expect(a).toBe(b);
    // Two files, not four: the in-flight promise is what is memoised, so two
    // components searching on one keystroke produce one download.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url).split('/').pop())).toEqual([
      'manifest.json',
      'index-abc123.json',
    ]);
  });

  it('does not fetch a chunk to answer a search', async () => {
    const fetchMock = serve();
    const loaded = await loadIndex();

    expect(rankDictionary(loaded, '나', 5)).toHaveLength(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('entries/'))).toBe(false);
  });

  it('fetches one chunk when a word is opened, and reuses it', async () => {
    const fetchMock = serve();
    await loadEntry('나가다', 'ㄴ');
    await loadChunk('ㄴ');

    const chunks = fetchMock.mock.calls.filter(([url]) => String(url).includes('entries/'));
    expect(chunks).toHaveLength(1);
  });

  it('forgets a failure so a learner who was offline can try again', async () => {
    let ok = false;
    const fetchMock = vi.fn((url: string) => {
      if (!ok) return Promise.reject(new Error('offline'));
      const body = url.endsWith('manifest.json') ? MANIFEST : INDEX;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadIndex()).rejects.toThrow();
    ok = true;
    await expect(loadIndex().then((i) => i.hits)).resolves.toHaveLength(2);
  });

  it('rejects rather than resolving to nothing when a file is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)),
    );
    await expect(loadIndex()).rejects.toThrow('404');
  });
});

describe('ranking', () => {
  const hits: DictionaryHit[] = INDEX.rows.map((row) => ({
    headword: row[0] as string,
    romanization: row[1] as string,
    partOfSpeech: row[2] as string,
    shortGloss: row[3] as string,
    senseCount: row[4] as number,
    chunk: row[5] as string,
    frequency: row[6] as number,
  }));
  /*
    Built through the loader rather than hand-assembled, so the test exercises
    the index the app actually searches — the maps included.
  */
  const index = buildIndexForTest(hits);

  it('puts an exact headword above a word that merely starts with it', () => {
    expect(rankDictionary(index, '나', 5).map((hit) => hit.headword)).toEqual(['나', '나가다']);
  });

  it('breaks ties on frequency, not on alphabet', () => {
    // Both are prefix matches for "na" in romanisation; 나 is said far more.
    expect(rankDictionary(index, 'na', 5)[0]!.headword).toBe('나');
  });

  it('matches the meaning as well as the Korean', () => {
    expect(rankDictionary(index, 'go out', 5).map((hit) => hit.headword)).toEqual(['나가다']);
  });

  it('answers an empty query with nothing rather than with everything', () => {
    expect(rankDictionary(index, '   ', 5)).toEqual([]);
  });
});
