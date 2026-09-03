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
/**
 * Without `--check`, the documents are *rewritten* from the derived values.
 *
 * The brief that produced this asked for report figures to be generated from
 * one source rather than typed and then reconciled by hand, and a gate that
 * only reports a mismatch still leaves a person editing numbers in prose — the
 * activity that produced every drift this file exists to catch. So the default
 * run fixes what it finds and prints what it changed, and `--check` is the
 * read-only form that belongs in `verify:release`.
 */
const WRITE = !check;
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

/*
 * The Numbers course, from the module the app renders rather than from a
 * generated copy of it — there is no generated copy. Imported through `tsx`,
 * which is why this script is run with it; `numbers:qa` does the same for the
 * same reason.
 */
const numbers = await import('../apps/web/src/data/numbers.ts');
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
      /([\d,]+) pronunciation clips in two voices/g,
      /\*\*([\d,]+) distinct files over [\d,]+ voice slots/g,
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
  audioSlots: {
    value: JSON.parse(read('apps/web/public/audio/manifest.json')).entries.length * 2,
    what: 'audio voice slots (two per manifest entry)',
    patterns: [
      /\|\s*Audio voice slots\s*\|\s*([\d,]+)\s*\|/g,
      /over \*{0,2}([\d,]+)\*{0,2} voice slots/g,
      /([\d,]+) voice slots over [\d,]+ files/g,
    ],
  },
  levelTestItems: {
    value: JSON.parse(read('apps/web/public/level-test/manifest.json')).items,
    what: 'level-test items in the English bank',
    patterns: [
      /\|\s*Level-test items, English\s*\|\s*([\d,]+)\s*\|/g,
      /a \*\*([\d,]+)-item\*\* bank/g,
      /\|\s*Level-test items\s*\|\s*([\d,]+) = [\d,]+\s*\|/g,
      /over\s*\nall ([\d,]+) items and passes/g,
    ],
  },
  unobservedWords: {
    value: (() => {
      const doc = JSON.parse(read('content/vocabulary/unobserved.json'));
      return Object.keys(doc.words).length;
    })(),
    what: 'unobserved words carrying a written reason',
    patterns: [
      /\|\s*Unobserved words with a written reason\s*\|\s*([\d,]+)\s*\|/g,
      /all ([\d,]+) unobserved words carry a written reason/g,
    ],
  },
  moreAboutIt: {
    value: (() => {
      const en = JSON.parse(read('apps/web/src/data/generated/vocabulary.en.json'));
      return en.words.filter((row) => row.length > 2 && row[2]).length;
    })(),
    what: 'words carrying the long More-about-it definition in English',
    patterns: [
      /\|\s*Long \*More about it\* definitions\s*\|\s*([\d,]+)\s*\|/g,
      /block is on \*{0,2}([\d,]+)\*{0,2} words of [\d,]+/g,
    ],
  },
  wordsAt28to30: {
    value: vocabulary.words.filter((w) => w.level >= 28).length,
    what: 'words at levels 28-30',
    patterns: [
      /\|\s*Words at levels 28–30\s*\|\s*([\d,]+)\s*\|/g,
      /[Ll]evels 28–30(?: now)? hold \*{0,2}([\d,]+)\*{0,2} words/g,
    ],
  },
  issuesTracked: {
    value: JSON.parse(read('docs/issues.json')).issues.length,
    what: 'issues tracked in the ledger',
    patterns: [/\|\s*Issues tracked\s*\|\s*([\d,]+)\s*\|/g],
  },
  issuesOpen: {
    value: JSON.parse(read('docs/issues.json')).issues.filter((i) => i.status === 'OPEN').length,
    what: 'open issues',
    patterns: [/citations on the ([\d,]+) open/g],
  },
  issuesPartial: {
    value: JSON.parse(read('docs/issues.json')).issues.filter((i) => i.status === 'PARTIAL').length,
    what: 'partial issues',
    patterns: [/citations on the [\d,]+ open, ([\d,]+) partial/g],
  },
  issuesBlocked: {
    value: JSON.parse(read('docs/issues.json')).issues.filter((i) => i.status === 'BLOCKED').length,
    what: 'blocked issues',
    patterns: [/citations on the [\d,]+ open, [\d,]+ partial and ([\d,]+) blocked/g],
  },
  dictionaryHeadwords: {
    value: JSON.parse(read('apps/web/public/dictionary/manifest.json')).headwords,
    what: 'dictionary headwords',
    patterns: [/\|\s*Dictionary headwords\s*\|\s*([\d,]+)\s*\|/g],
  },
  numbersLessons: {
    value: numbers.NUMBER_LESSONS.length,
    what: 'Numbers lessons',
    patterns: [
      /\|\s*Numbers lessons\s*\|\s*([\d,]+)\s*\|/g,
      /\*\*([\d,]+) lessons\*\* in the Numbers course/g,
      /six modules, ([\d,]+) lessons/g,
    ],
  },
  numbersItems: {
    value: numbers.NUMBER_ITEMS.length,
    what: 'Numbers items taught',
    patterns: [
      /\|\s*Numbers items\s*\|\s*([\d,]+)\s*\|/g,
      /([\d,]+) items across the Numbers course/g,
    ],
  },
  relationsWords: {
    value: JSON.parse(read('content/vocabulary/relations.json')).counts.words_with_relations,
    what: 'taught words carrying a verified lexical relation',
    patterns: [/([\d,]+) of [\d,]+ words carry any verified lexical relation/g],
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
const updates = [];
let checked = 0;

// --- the canonical metrics artifact (docs/report-metrics.json) ---------------
//
// One generated file that current-value report sections are derived from, so a
// current figure always has a source a reader can regenerate. Historical prose
// deliberately does not consume it.
{
  const { writeFileSync } = await import('node:fs');
  const perLevel = {};
  for (const w of vocabulary.words) perLevel[w.level] = (perLevel[w.level] ?? 0) + 1;
  const issueDoc = JSON.parse(read('docs/issues.json')).issues;
  const count = (status) => issueDoc.filter((i) => i.status === status).length;
  const dict = JSON.parse(read('apps/web/public/dictionary/manifest.json'));
  const artifact = {
    generated_from: 'scripts/check-docs-consistency.mjs — regenerate with npm run docs:consistency',
    taught_words: vocabulary.words.length,
    words_per_level: perLevel,
    categories: usedCategories.size,
    dictionary_headwords: dict.headwords,
    dictionary_senses: dict.senses,
    dictionary_examples: dict.examples,
    audio_files: METRICS.audioClips.value,
    audio_slots: METRICS.audioSlots.value,
    unobserved_words: METRICS.unobservedWords.value,
    more_about_it: METRICS.moreAboutIt.value,
    level_test_items: METRICS.levelTestItems.value,
    words_at_28_to_30: METRICS.wordsAt28to30.value,
    relations_words: METRICS.relationsWords.value,
    issues: { open: count('OPEN'), partial: count('PARTIAL'), blocked: count('BLOCKED'), resolved: count('RESOLVED'), tracked: issueDoc.length },
    apk_mb: METRICS.apkMegabytes.value,
    aab_mb: METRICS.aabMegabytes.value,
  };
  writeFileSync(join(ROOT, 'docs/report-metrics.json'), JSON.stringify(artifact, null, 1) + '\n');
}

/**
 * Writes the derived value back into a claim, keeping the claim's own spelling.
 *
 * `13,608` and `13608` are the same figure written for two different readers —
 * a table cell and a sentence — and rewriting one into the other would churn
 * the document every run. So the replacement copies the grouping of the text it
 * replaces.
 */
function asWritten(previous, value) {
  const grouped = new Intl.NumberFormat('en-US').format(value);
  return previous.includes(',') || (previous.includes('.') && !Number.isInteger(value))
    ? grouped
    : String(value);
}

/** How far a `<!-- issues:x -->` region runs: to the next blank-line heading. */
function regionLength(text, start) {
  const next = text.indexOf('\n# ', start);
  return (next === -1 ? text.length : next) - start;
}

const rewritten = new Map();

for (const [name, metric] of Object.entries(METRICS)) {
  if (metric.value === null) {
    console.log(`· ${name.padEnd(14)} — not built yet, skipped`);
    continue;
  }
  const canonical = String(metric.value);
  const found = [];
  for (const document of DOCUMENTS) {
    if (!exists(document)) continue;
    const text = rewritten.get(document) ?? read(document);
    const lines = text.split('\n');
    /*
     * The issue tables belong to another generator.
     *
     * `build-issues.mjs` writes the regions between `<!-- issues:* -->` markers
     * from `docs/issues.json`, so a figure rewritten inside one of them is
     * reverted the next time that generator runs — and the two gates then take
     * turns failing, which is exactly what happened when the corpus re-levelling
     * moved `wordsAt28to30`. A stale figure in an issue's evidence is fixed in
     * the ledger, where the sentence lives.
     */
    const generated = [...text.matchAll(/<!-- issues:[a-z]+ -->/g)].map((m) => m.index);
    const insideGenerated = (at) =>
      generated.some((start) => at > start && at < start + regionLength(text, start));
    /*
     * Collected first, applied afterwards.
     *
     * A replacement shifts every later index in the string, so rewriting inside
     * the `exec` loop would corrupt the second match of the same pattern. The
     * edits are gathered with their positions and applied from the end.
     */
    const edits = [];
    for (const pattern of metric.patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const claimed = match[1].replace(/,/g, '');
        const line = text.slice(0, match.index).split('\n').length;
        checked += 1;
        found.push({ document, line, claimed });
        if (claimed !== canonical) {
          if (insideGenerated(match.index)) {
            problems.push(
              `${document}:${line} claims ${name} = ${match[1]} inside a generated issue table; ` +
                'fix the sentence in docs/issues.json and run npm run issues',
            );
          } else if (WRITE) {
            const at = match.index + match[0].indexOf(match[1]);
            edits.push({ at, length: match[1].length, text: asWritten(match[1], metric.value) });
          } else {
            problems.push(
              `${document}:${line} claims ${name} = ${match[1]}, source says ${canonical}\n` +
                `    ${lines[line - 1]?.trim().slice(0, 120)}`,
            );
          }
        }
      }
    }
    if (edits.length) {
      let updated = text;
      for (const edit of edits.sort((a, b) => b.at - a.at)) {
        updated = updated.slice(0, edit.at) + edit.text + updated.slice(edit.at + edit.length);
      }
      rewritten.set(document, updated);
      updates.push(`${document}: ${edits.length} × ${name} → ${canonical}`);
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

/*
 * Four rules that are not "one figure, stated twice".
 *
 * Everything above compares a number in a document against the same number
 * derived from source. These four compare *documents against artefacts* — the
 * class of contradiction that produced an audit-metadata block reading
 * versionCode 3 and an uncommitted tree while the verdict eight hundred lines
 * later claimed a clean commit at versionCode 4. No pattern over prose can
 * catch that, because neither statement is a figure the other repeats.
 */
{
  const buildInfoPath = 'result/build-info.json';
  if (exists(buildInfoPath)) {
    const info = JSON.parse(read(buildInfoPath));

    // 1 · the manifest against the binary it describes.
    const sdk = process.env.ANDROID_HOME ?? join(process.env.HOME ?? '', 'android-sdk');
    const aapt2 = join(sdk, 'build-tools/36.0.0/aapt2');
    const apk = join(ROOT, 'result/hangyul-ganada-release.apk');
    if (existsSync(aapt2) && existsSync(apk)) {
      try {
        const badging = execFileSync(aapt2, ['dump', 'badging', apk], { encoding: 'utf8', maxBuffer: 1 << 24 });
        const code = /versionCode='(\d+)'/.exec(badging)?.[1];
        const name = /versionName='([^']+)'/.exec(badging)?.[1];
        if (code && Number(code) !== info.android.version_code) {
          problems.push(
            `${buildInfoPath} says versionCode ${info.android.version_code}, but the APK it describes is ${code}`,
          );
        }
        if (name && name !== info.android.version_name) {
          problems.push(
            `${buildInfoPath} says versionName ${info.android.version_name}, but the APK it describes is ${name}`,
          );
        }
      } catch {
        // aapt2 present but unhappy: not this gate's failure to report.
      }
    }

    // 2 · every commit a document names for the delivered build.
    const shortBuilt = String(info.commit ?? '').slice(0, 8);
    for (const document of ['docs/report.md', 'result/RELEASE_VALIDATION.md']) {
      if (!exists(document)) continue;
      const text = rewritten.get(document) ?? read(document);
      for (const match of text.matchAll(/\*\*Source:\*\* commit `([0-9a-f]{7,40})`/g)) {
        if (!match[1].startsWith(shortBuilt) && !shortBuilt.startsWith(match[1])) {
          problems.push(
            `${document} names commit ${match[1]} as the source of the delivered build; ` +
              `${buildInfoPath} was built from ${shortBuilt}`,
          );
        }
      }
    }

    // 3 · a document may not call the tree clean while a product file differs.
    const claimsClean = ['docs/report.md', 'result/RELEASE_VALIDATION.md'].filter(
      (document) =>
        exists(document) && /clean working tree|working tree clean|from a clean checkout/i.test(rewritten.get(document) ?? read(document)),
    );
    if (claimsClean.length > 0) {
      const notProduct = [/^docs\//, /^result\//, /^app_result\//, /^README\.md$/, /^\.gitattributes$/, /^\.gitignore$/];
      let dirtyProduct = [];
      try {
        dirtyProduct = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
          .split('\n')
          .map((line) => /^..\s+(?:.*? -> )?(.*)$/.exec(line)?.[1] ?? '')
          .filter(Boolean)
          .filter((file) => !notProduct.some((pattern) => pattern.test(file)));
      } catch {
        dirtyProduct = [];
      }
      if (dirtyProduct.length > 0) {
        problems.push(
          `${claimsClean.join(' and ')} calls the tree clean, but ${dirtyProduct.length} product file(s) differ — ` +
            `${dirtyProduct.slice(0, 4).join(', ')}`,
        );
      }
    }
  }

  // 4 · no issue may hold two statuses at once.
  const ledger = JSON.parse(read('docs/issues.json'));
  const seen = new Map();
  for (const issue of ledger.issues) {
    if (seen.has(issue.id) && seen.get(issue.id) !== issue.status) {
      problems.push(`docs/issues.json lists ${issue.id} as both ${seen.get(issue.id)} and ${issue.status}`);
    } else if (seen.has(issue.id)) {
      problems.push(`docs/issues.json lists ${issue.id} twice`);
    }
    seen.set(issue.id, issue.status);
    if (!Object.keys(ledger.statuses).includes(issue.status)) {
      problems.push(`docs/issues.json gives ${issue.id} the status ${issue.status}, which is not in the vocabulary`);
    }
  }
  /*
   * And the report's own tables, which are generated from that ledger and could
   * still disagree with it if somebody edited one by hand — which is exactly
   * what "an issue simultaneously open and resolved" would look like to a
   * reader.
   */
  if (exists('docs/report.md')) {
    const text = rewritten.get('docs/report.md') ?? read('docs/report.md');
    for (const [, id, stated] of text.matchAll(/\|\s*\*\*(I-\d+)\*\*[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|\s*\*\*(OPEN|PARTIAL|RESOLVED|BLOCKED)\*\*\s*\|/g)) {
      const actual = seen.get(id);
      if (actual && actual !== stated) {
        problems.push(`docs/report.md shows ${id} as ${stated}; docs/issues.json has it as ${actual}`);
      }
    }
  }
}

/*
 * The rewrites, flushed once at the end.
 *
 * Held in memory until here so a document mentioned by several metrics is
 * written once rather than once per metric, and so a run that throws part-way
 * leaves the documents untouched rather than half-updated.
 */
if (WRITE && rewritten.size > 0) {
  const { writeFileSync: write } = await import('node:fs');
  for (const [document, text] of rewritten) write(join(ROOT, document), text);
  console.log(`\nRewrote ${rewritten.size} document(s) from source:`);
  for (const update of updates) console.log(`  ${update}`);
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
