/**
 * The learning corpus, for a script running in plain Node.
 *
 * The app fetches its corpus from `public/corpus/` — see `data/corpus.ts` for
 * why it is no longer imported. A script that imports `data/vocabulary.ts`
 * therefore gets a correctly-wired module with nothing in it until something
 * has done the fetching, and in Node there is no server to fetch from.
 *
 * This maps that one prefix onto the file system and loads every band, so a
 * script sees the whole curriculum synchronously afterwards, exactly as the app
 * does once it has finished loading. Anything that is not the corpus goes to
 * the real `fetch`, so a script that genuinely talks to the network still can.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'web', 'public');
const LOCAL = /^\/(corpus|level-test|dictionary)\//;

let loading = null;

export function loadCorpusForNode() {
  loading ??= (async () => {
    const network = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input.url ?? String(input));
      if (!LOCAL.test(url)) return network(input, init);
      const body = await readFile(join(PUBLIC, url)).catch(() => null);
      if (!body) return new Response('not found', { status: 404 });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const corpus = await import('../../apps/web/src/data/corpus.ts');
    await corpus.loadCorpusCore();
    await corpus.loadCorpusRest();
  })();
  return loading;
}
