/**
 * A retired word is refused at the corpus door, whatever supplied the band.
 *
 * The published corpus no longer carries the 23 words retired under the
 * child-safe content policy; the build gate proves that and the artefact scan
 * proves it inside the APK. This is the other case: a band file that a browser
 * cached before the retirement, or that an old backup or a stale mirror hands
 * the app. The row arrives with a retired id, and it must never become a
 * `VocabularyWord` — not an answer, not a distractor, not a search hit — while
 * every other row in the same band installs normally.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import retiredIds from '@hangyul-ganada/content-safety/retired-ids';

import { loadCorpusCore, resetCorpus } from './corpus';
import { REFUSED_AT_INGEST, VOCABULARY, getWord, searchWords } from './vocabulary';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const RETIRED = (retiredIds as { ids: string[] }).ids;

describe('a stale band carrying a retired word', () => {
  it('installs every other row and refuses the retired one', async () => {
    const manifest = JSON.parse(await readFile(join(PUBLIC, 'corpus/manifest.json'), 'utf8'));
    const bandFile = manifest.bands[0].words as string;
    const band = JSON.parse(await readFile(join(PUBLIC, `corpus/${bandFile}`), 'utf8'));
    const retiredId = RETIRED[0]!;
    expect(retiredId).toBeTruthy();
    // The stale row: a real row's shape with a retired id and headword.
    const template = { ...band.words[0], id: retiredId, word: '섹스하다' };
    const stale = { ...band, words: [template, ...band.words] };

    const network = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      if (url.endsWith(`/corpus/${bandFile}`)) {
        return new Response(JSON.stringify(stale), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return network(input as RequestInfo);
    }) as typeof fetch;

    const before = VOCABULARY.length;
    resetCorpus();
    try {
      await loadCorpusCore();
    } finally {
      globalThis.fetch = network;
    }

    expect(REFUSED_AT_INGEST).toContain(retiredId);
    expect(getWord(retiredId)).toBeUndefined();
    expect(VOCABULARY.some((w) => w.id === retiredId)).toBe(false);
    expect(VOCABULARY.some((w) => w.word === '섹스하다')).toBe(false);
    expect(searchWords('섹스', () => '', 50).some((hit) => hit.word.id === retiredId)).toBe(false);
    // The rest of the band arrived: the first real row is still there.
    expect(getWord(band.words[0].id as string)).toBeDefined();
    expect(VOCABULARY.length).toBeGreaterThanOrEqual(before);
  });

  it('refuses every retired id, not only the first', () => {
    for (const id of RETIRED) expect(getWord(id), id).toBeUndefined();
  });
});
