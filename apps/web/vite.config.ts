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
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright specs live under e2e/ and must not be collected by Vitest.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
