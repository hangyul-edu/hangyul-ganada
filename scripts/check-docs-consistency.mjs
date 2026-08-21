#!/usr/bin/env node
/**
 * One current value per metric, everywhere it is written down.
 *
 *   npm run docs:consistency          list every figure and where it appears
 *   npm run docs:consistency:check    fail if any of them disagrees with source
 *
 * ## Why
 *
 * `docs/report.md` said **18 semantic categories** in the feature inventory and
 * **17** four hundred lines later in the dataset table, and the built corpus
 * actually has 18. The study-set count said 519 and the corpus makes 523. None
 * of those numbers was wrong when it was written; they were written down more
 * than once and only one copy was ever updated.
 *
 * A document that states two different current values for the same thing is
 * worse than one that states none, because a reader has no way to tell which
 * half is stale — and a PDF of it goes to a store submission.
 *
 * ## What it does, and what it deliberately does not
 *
 * Every metric below is **derived from source** — the built vocabulary file, the
 * curriculum module, the locale bundles, the test files, the artifacts in
 * `result/`. The documents are then searched for figures that claim to be that
 * metric, and each one has to match.
 *
 * It does not try to parse prose. A number is only checked when it sits in a
 * shape that pins its meaning: a table row whose label is the metric, or a
 * phrase like "18 semantic categories". Historical statements — "the previous
 * model could not measure 51% of them" — are about the past and are none of its
 * business, which is why the patterns are narrow and listed rather than
 * inferred.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');
/** Test counts cost a minute to establish honestly. `--no-tests` skips them. */
const withTests = !process.argv.includes('--no-tests');

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const exists = (path) => existsSync(join(ROOT, path));

// --- what the source actually says ------------------------------------------

const vocabulary = JSON.parse(read('apps/web/src/data/generated/vocabulary.json'));

/** Categories that actually hold a word. A defined-but-empty one teaches nobody. */
const usedCategories = new Set(vocabulary.words.map((word) => vocabulary.categories[word.c]));

/**
 * Study sets, counted the way `data/vocabulary.ts` builds them: five words at a
 * time *within* a category, so a category of 42 makes nine sets and not eight
 * and a half. Dividing the corpus by five gives a different, wrong number, and
 * that is the arithmetic the stale figure in the report came from.
 */
const setsPerCategory = new Map();
for (const word of vocabulary.words) {
  const category = vocabulary.categories[word.c];
  setsPerCategory.set(category, (setsPerCategory.get(category) ?? 0) + 1);
}
const studySets = [...setsPerCategory.values()].reduce(
  (total, count) => total + Math.ceil(count / vocabulary.words_per_lesson),
  0,
);

/**
 * How many test cases a suite really has.
 *
 * By running the runner, not by counting `it(` in the source. A table-driven
 * `it.each([...eight locales])` is one line and eight cases, and a report that
 * says 310 when the suite runs 329 is the same class of error as the category
 * count this script exists for.
 */
function countVitest(workspace) {
  if (!withTests) return null;
  // Through a file rather than through stdout: vitest's JSON reporter shares
  // stdout with anything the suite logs, and a single stray line makes the
  // parse fail in a way that looks like the suite failing.
  const out = join(tmpdir(), `hangyul-vitest-${workspace.replace(/\W+/g, '-')}.json`);
  execFileSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`, '--silent'], {
    cwd: join(ROOT, workspace),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: 'ignore',
  });
  return JSON.parse(readFileSync(out, 'utf8')).numTotalTests;
}

/** Playwright counts per project; the report states both the total and the split. */
function countPlaywright() {
  if (!withTests) return null;
  const output = execFileSync('npx', ['playwright', 'test', '--list', '--reporter=list'], {
    cwd: join(ROOT, 'apps/web'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const total = Number(output.match(/Total: (\d+) tests/)?.[1] ?? 0);
  const projects = new Set([...output.matchAll(/^\s*\[([\w-]+)\]/gm)].map((m) => m[1]));
  return { total, projects: projects.size, perProject: total / Math.max(1, projects.size) };
}

/**
 * The size of a built artefact, in MB, found by extension rather than by name.
 *
 * It used to take a literal path. That path was right — `build-result.mjs`
 * writes `hangyul-ganada-release.apk` — and the two figures this checker exists
 * to keep honest were still reported as "not built yet, skipped" on every run
 * for two release cycles, with a 63 MB APK sitting in the directory it was
 * looking in. The artefacts on disk had been produced by an older release
 * process under an older spelling of the product name and never repackaged, so
 * the checker and the directory were each correct about a different release.
 *
 * A checker that silently skips is worse than one that fails: it reads as a
 * pass. Matching on the extension means a name that drifts again cannot quietly
 * turn the check off, and finding two of the same kind is an error rather than
 * a coin toss.
 */
const megabytes = (extension) => {
  const dir = join(ROOT, 'result');
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).filter((name) => name.endsWith(extension));
  if (found.length === 0) return null;
  if (found.length > 1) {
    throw new Error(
      `result/ holds ${found.length} ${extension} files (${found.join(', ')}) — which one ships?`,
    );
  }
  return (statSync(join(dir, found[0])).size / 1024 / 1024).toFixed(1);
};

const curriculum = JSON.parse(read('content/curriculum.json'));
const playwright = countPlaywright();

const METRICS = {
  words: {
    value: vocabulary.words.length,
    what: 'words shipping in the vocabulary corpus',
    patterns: [/\|\s*Words shipping\s*\|\s*([\d,]+)\s*\|/g, /([\d,]+) words in \d+ categories/g],
  },
  categories: {
    value: usedCategories.size,
    what: 'vocabulary categories',
    patterns: [
      /\|\s*Categories\s*\|\s*([\d,]+)\s*\|/g,
      /\*\*([\d,]+) semantic categories\*\*/g,
      /[\d,]+ words in ([\d,]+) categories/g,
      /[\d,]+ words across ([\d,]+) semantic categories/g,
      /^([\d,]+) categories, each with its own progress/gm,
    ],
  },
  studySets: {
    value: studySets,
    what: 'five-word study sets',
    patterns: [
      /\|\s*Study sets\s*\|\s*([\d,]+) \(five words each\)\s*\|/g,
      /\|\s*Study sets\s*\|\s*([\d,]+)\s*\|/g,
    ],
  },
  characters: {
    value: curriculum.characters.length,
    what: 'characters the curriculum teaches',
    patterns: [
      /all ([\d,]+) character entries/g,
      /([\d,]+) taught characters/g,
      /\|\s*Characters taught\s*\|\s*([\d,]+)\s*\|/g,
    ],
  },
  locales: {
    value: readdirSync(join(ROOT, 'apps/web/src/locales'), { withFileTypes: true }).filter((e) =>
      e.isDirectory(),
    ).length,
    what: 'interface languages',
    patterns: [
      /\|\s*Interface languages\s*\|\s*([\d,]+)\s*\|/g,
      /\|\s*Languages\s*\|\s*([\d,]+)\s*\|/g,
    ],
  },
  unitTests: {
    value: countVitest('apps/web'),
    what: 'web unit test cases',
    /*
     * `**671** (39 files)` as well as a bare `671`.
     *
     * The original pattern required the cell to contain the number and nothing
     * else, and the report has emphasised its headline figures and annotated
     * them with the file count since before this check existed. So it matched
     * nothing, reported "not stated anywhere", and passed — while the cell it
     * could not see said 664 against an actual 671, for two cycles.
     */
    patterns: [/\|\s*Web unit \(`vitest`\)\s*\|\s*\*{0,2}([\d,]+)\*{0,2}/g],
  },
  handwritingTests: {
    value: countVitest('packages/handwriting-core'),
    what: 'handwriting-core test cases',
    patterns: [/\|\s*Handwriting core \(`vitest`\)\s*\|\s*\*{0,2}([\d,]+)\*{0,2}/g],
  },
  e2eTests: {
    value: playwright?.total ?? null,
    what: 'end-to-end test cases, both projects',
    patterns: [
      /\|\s*End-to-end \(`playwright`\)\s*\|\s*\*{0,2}([\d,]+)\*{0,2} \(\*{0,2}[\d,]+\*{0,2} × \d+ projects\)/g,
    ],
  },
  e2ePerProject: {
    value: playwright ? playwright.perProject : null,
    what: 'end-to-end specs per project',
    patterns: [
      /\|\s*End-to-end \(`playwright`\)\s*\|\s*\*{0,2}[\d,]+\*{0,2} \(\*{0,2}([\d,]+)\*{0,2} × \d+ projects\)/g,
    ],
  },
  pronunciationNotes: {
    value: vocabulary.words.filter((word) => word.say).length,
    what: 'words carrying a pronunciation note',
    patterns: [
      /\|\s*With a pronunciation note[^|]*\|\s*([\d,]+)/g,
      /^([\d,]+) of the [\d,]+ words are not said the way they are written/gm,
      /\|\s*Pronunciation notes\s*\|\s*([\d,]+)\s*\|/g,
    ],
  },
  audioClips: {
    value: (() => {
      const manifest = JSON.parse(read('apps/web/public/audio/manifest.json'));
      const files = new Set();
      for (const entry of manifest.entries) {
        for (const voice of ['female', 'male']) if (entry[voice]) files.add(entry[voice].src);
      }
      return files.size;
    })(),
    what: 'distinct audio files shipped',
    patterns: [
      /\|\s*Audio clips\s*\|\s*([\d,]+)\s*\|/g,
      /\|\s*Files\s*\|\s*([\d,]+), [\d.]+ MB/g,
      /([\d,]+) distinct files/g,
      /over ([\d,]+) files/g,
    ],
  },
  apkMegabytes: {
    value: megabytes('.apk'),
    what: 'signed release APK, MB',
    /*
     * Both the filename the artefact has had over time and both table labels
     * the report has used for it. A figure that moves between two spellings of
     * its own row heading is exactly what this check is for.
     */
    patterns: [
      /`(?:app|hangyul-ganada)-release\.apk` \(([\d.]+) MB\)/g,
      /\|\s*(?:Release|Signed) APK[^|]*\|\s*\*{0,2}([\d.]+)\*{0,2}\s*MB/g,
    ],
  },
  aabMegabytes: {
    value: megabytes('.aab'),
    what: 'release AAB, MB',
    patterns: [
      /`(?:app|hangyul-ganada)-release\.aab` \(([\d.]+) MB\)/g,
      /\|\s*(?:Release|Signed) AAB[^|]*\|\s*\*{0,2}([\d.]+)\*{0,2}\s*MB/g,
    ],
  },
};

// --- where they are written down --------------------------------------------

const DOCUMENTS = [
  'docs/report.md',
  'README.md',
  'docs/VOCABULARY_DATA.md',
  'docs/ARCHITECTURE.md',
  'store/google-play/listing.md',
  'store/app-store/listing.md',
  'result/RELEASE_VALIDATION.md',
];

const problems = [];
let checked = 0;

for (const [name, metric] of Object.entries(METRICS)) {
  if (metric.value === null) {
    console.log(`· ${name.padEnd(14)} — not built yet, skipped`);
    continue;
  }
  const canonical = String(metric.value);
  const found = [];
  for (const document of DOCUMENTS) {
    if (!exists(document)) continue;
    const text = read(document);
    const lines = text.split('\n');
    for (const pattern of metric.patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const claimed = match[1].replace(/,/g, '');
        const line = text.slice(0, match.index).split('\n').length;
        checked += 1;
        found.push({ document, line, claimed });
        if (claimed !== canonical) {
          problems.push(
            `${document}:${line} claims ${name} = ${match[1]}, source says ${canonical}\n` +
              `    ${lines[line - 1]?.trim().slice(0, 120)}`,
          );
        }
      }
    }
  }
  /*
   * A metric nothing states is a metric nothing is guarding.
   *
   * This used to print `not stated anywhere` and pass, and it did so for four
   * of the thirteen figures at once — the web and handwriting test counts and
   * the APK and AAB sizes — every one of which *was* written in the report. The
   * patterns simply did not match the cell they were in. So the check ended
   * with "No document states two different current values", which was true and
   * read as "every figure agrees", and meanwhile §2.3 said 664 unit tests
   * against an actual 671 and nothing noticed for two cycles.
   *
   * A figure that has drifted and a figure the matcher cannot see are the same
   * failure from the reader's point of view: the number in the document is
   * unchecked. So an unmatched metric is now a problem, and the fix for it is
   * either to state the figure in a shape the pattern recognises or to stop
   * tracking it — both of which are decisions somebody should make on purpose.
   */
  if (found.length === 0) {
    problems.push(
      `${name} = ${canonical} (${metric.what}) is tracked but appears in no document.\n` +
        '    Either state it where a pattern can find it, or remove it from METRICS.',
    );
  }
  const where = found.length === 0 ? '**not stated anywhere**' : `${found.length} mention(s)`;
  const ok = found.length > 0 && !found.some((f) => f.claimed !== canonical);
  console.log(
    `${ok ? '✓' : '✗'} ${name.padEnd(14)} ${String(canonical).padStart(7)}  ${metric.what} — ${where}`,
  );
}

console.log(`\n${checked} figure(s) checked across ${DOCUMENTS.filter(exists).length} document(s).`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  if (check) {
    console.error('\nDocumentation follows implementation. Update the document, not the corpus.');
    process.exit(1);
  }
} else {
  console.log('No document states two different current values for the same metric.');
}
