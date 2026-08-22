import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const src = fileURLToPath(new URL('./src', import.meta.url));
const publicDir = fileURLToPath(new URL('./public', import.meta.url));

/**
 * Stamps the service worker with the audio build it is shipping alongside.
 *
 * The recordings are named after the words they say, so a corrected clip keeps
 * the name of the wrong one — and a worker that caches audio under a constant
 * key goes on serving the wrong one for the life of the installation. Injecting
 * the audio manifest's own version into the worker's cache name means a release
 * with new recordings cannot be answered out of the old cache.
 *
 * The placeholder is replaced in the emitted worker, never in the source, so
 * running from source keeps a readable `dev` and the file in `public/` stays
 * the thing that is actually reviewed.
 */
function stampAudioVersion(): Plugin {
  return {
    name: 'hangyul-audio-cache-version',
    apply: 'build',
    closeBundle() {
      const outDir = fileURLToPath(new URL('./dist', import.meta.url));
      const worker = join(outDir, 'sw.js');
      let version = 'dev';
      try {
        version = JSON.parse(
          readFileSync(join(publicDir, 'audio', 'manifest.json'), 'utf8'),
        ).version;
      } catch {
        /* No audio in this tree; the worker still works, it just cannot version. */
      }
      try {
        const source = readFileSync(worker, 'utf8');
        writeFileSync(worker, source.replace('__HANGYUL_AUDIO_VERSION__', String(version)));
      } catch {
        /* No worker emitted — nothing to stamp. */
      }
    },
  };
}

/**
 * Writes the list of emitted assets the service worker must precache.
 *
 * The worker used to learn the bundle's hashed names by reading them out of
 * `index.html`. That worked while every chunk was referenced there, and stopped
 * being true the moment routes and per-locale word copy became dynamic imports:
 * those chunks appear in no markup, so an install that had never opened a word
 * screen cached nothing for one, and the first offline launch found a shell it
 * could not fill.
 *
 * Emitting the list from the build itself cannot drift from what shipped, needs
 * no manifest plugin, and keeps the worker free of anything build-specific.
 */
function offlineAssetList(): Plugin {
  return {
    name: 'hangyul-offline-asset-list',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
        /*
         * Every language's interface strings, except the one being read.
         *
         * Thirty-one locale chunks is about 320 kB, and precaching them put a
         * third of a megabyte of languages nobody in this install will ever see
         * into the offline store — on the first launch, before the learner has
         * finished a letter. A Thai learner needs Thai offline; they do not need
         * Kazakh offline.
         *
         * They are left out of the *precache* only. The worker still caches a
         * locale chunk the first time it is fetched, so the language a learner
         * actually chose is on the device from the moment they choose it, and a
         * cold start in aeroplane mode has it. English is not excluded — it is
         * in the main bundle, and it is the fallback that must always be there.
         */
        .filter((name) => !/(^|\/)assets\/locale-[\w-]+-[\w-]+\.js$/.test(name))
        /*
         * And every language's *word meanings*, for the same reason.
         *
         * Nine packs, forty kilobytes each. `LocaleProvider` fetches the
         * learner's own the moment the app resolves their language — on the
         * first launch, before they reach a word screen — so it is in the cache
         * from that point and a cold start offline has it. What precaching
         * bought was the one case where somebody installs, never opens the app
         * again while online, and later opens a word screen offline in a
         * language they never selected. That is not a case worth 350 kB on
         * every device.
         */
        .filter((name) => !/(^|\/)assets\/vocabulary\.[\w-]+-[\w-]+\.js$/.test(name))
        /*
         * And every language's *letter explanations*, on the same argument.
         *
         * Thirty packs, two kilobytes each, fetched beside the word pack by the
         * same call in `LocaleProvider`. Sixty kilobytes is small enough that
         * precaching them would not have shown up in the budget, which is
         * exactly why the rule has to be the rule rather than a size judgement:
         * the set grows with every language added, and the reason not to send a
         * learner twenty-nine languages they cannot read does not depend on how
         * much they weigh.
         */
        .filter((name) => !/(^|\/)assets\/letters\.[\w-]+-[\w-]+\.js$/.test(name))
        .map((name) => `/${name}`)
        .sort();
      this.emitFile({
        type: 'asset',
        fileName: 'offline-assets.json',
        source: `${JSON.stringify({ assets: files }, null, 1)}\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineAssetList(), stampAudioVersion()],
  build: {
    rollupOptions: {
      output: {
        /**
         * Chunks that change at different rates, and copy that is per-language.
         *
         * The curriculum data is the largest single thing the app ships and it
         * changes only when the content build runs; React and the router change
         * only when a dependency is upgraded; the app's own code changes every
         * release. Putting them in one file meant a one-line copy fix made every
         * returning learner re-download the whole vocabulary.
         *
         * `vocabulary.<locale>.json` is excluded from the data chunk on purpose.
         * Those files are `import()`ed by `data/wordCopy.ts`, and naming them
         * here would pull them back into one bundle — a manual chunk beats a
         * dynamic import — which is exactly the 696 KB of unread languages the
         * split exists to avoid. English stays in the data chunk because it is
         * statically imported: it is the end of every fallback chain.
         *
         * None of this makes the app online-only. Every locale pack is a
         * precached asset, so a cold start in aeroplane mode still has the
         * learner's language; the split decides how much is *parsed* at boot
         * and how much is re-fetched after a content build, not whether the
         * bytes are on the device.
         */
        manualChunks(id: string) {
          if (/src[\\/]data[\\/]generated[\\/]vocabulary\.(?!en\.)[\w-]+\.json/.test(id)) {
            return undefined;
          }
          /*
           * The letter explanations, one lazy chunk per language.
           *
           * Same rule as the word packs above and for the same reason, and it
           * has to be stated before the `src/data/generated` catch-all below or
           * that line sweeps all thirty of them into `curriculum-data`, which
           * is loaded before the home screen paints. It did, for one build:
           * splitting the copy out of the module bought nothing at all until
           * this line was added.
           */
          if (/src[\\/]data[\\/]generated[\\/]letters\.[\w-]+\.json/.test(id)) {
            return undefined;
          }
          /*
           * One chunk per interface language, named after it.
           *
           * The nine namespace files of a locale are always wanted together and
           * never wanted apart, and left to itself Rollup emitted each of them
           * as its own file: 279 chunks called `common-B1w1z7ui.js` and
           * `settings-CfK2p9xr.js`, indistinguishable from each other and from
           * app code in every listing, cache report and precache manifest.
           *
           * Grouping them by locale is the same nine requests turned into one,
           * and gives the file a name — `locale-th` — that says what it is. The
           * source locale is *not* grouped: English is statically imported by
           * `i18n/resources.ts` and belongs in the main bundle, because it is
           * the end of every fallback chain.
           */
          const locale = /src[\\/]locales[\\/]([\w-]+)[\\/]/.exec(id)?.[1];
          if (locale && locale !== 'en') return `locale-${locale}`;
          /*
           * The instructional stroke geometry is lesson material, not curriculum
           * data.
           *
           * Only the demonstration, the numbered diagram and the gallery import
           * it, which means it is only ever needed once a learner opens a
           * lesson. Left in `curriculum-data` — which is loaded before the home
           * screen paints — it pushed the first load towards its budget for a
           * screen that never draws a single stroke. Its own chunk is fetched
           * with the lesson route instead.
           *
           * It used to be ~190 kB of generated path outlines cut from the
           * reference glyph. It is now the code that builds the paths, which is
           * a fraction of that; the chunk is kept anyway, because the reason for
           * splitting it was never the size but *when* it is needed.
           */
          if (
            id.includes('src/data/strokeVectors') ||
            id.includes('src/data/strokes.') ||
            id.includes('src/data/compose.') ||
            id.includes('src/data/generated/jamoMetrics')
          ) {
            return 'stroke-geometry';
          }
          /*
           * The word corpus gets a chunk of its own, apart from the alphabet.
           *
           * They were one `curriculum-data` chunk, and that made the single
           * largest thing in the build unmeasurable: forty letters' worth of
           * curriculum and two and a half thousand words' worth of vocabulary
           * summed into one number that nobody could attribute. The corpus is
           * the half that grows — it is heading for ten thousand entries — and
           * `check-bundle-budget.mjs` projects it forward to that target and
           * fails the build if the projection does not fit. It can only do that
           * if it can see the corpus by itself.
           *
           * Splitting it is also the seam the eventual lazy load needs: the
           * alphabet is genuinely required before the home screen paints, and
           * the corpus is not.
           */
          if (id.includes('src/data/generated/vocabulary')) return 'word-corpus';
          if (id.includes('src/data/generated')) return 'curriculum-data';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react';
          }
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) {
            return 'i18n';
          }
          return undefined;
        },
      },
    },
    // The curriculum data chunk is legitimately large and is meant to be: see
    // the note above. The limit is set where an *app code* chunk growing past
    // it would still be a finding.
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: { '@': src },
  },
  server: {
    port: 5173,
    /*
     * The test suite reaches one directory outside this workspace.
     *
     * `scripts/lib/ipa.test.ts` is collected here (see `test.include` below)
     * and Vite's dev server will not serve a file outside its own root unless
     * it is allowed to. Without this the file resolves to "does the file
     * exist?" — which it does, one level up.
     */
    fs: { allow: [join(src, '..', '..', '..')] },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright specs live under e2e/ and must not be collected by Vitest.
    //
    // `scripts/lib` is collected too, and only because of one file: the IPA
    // transcriber moved out of the app when Revised Romanisation replaced it on
    // the word card, and a suite that stopped running the moment its subject
    // moved would have quietly deleted the tests rather than the code. It is
    // QA tooling now; it is still tested here.
    include: ['src/**/*.test.{ts,tsx}', '../../scripts/lib/**/*.test.ts'],
  },
});
