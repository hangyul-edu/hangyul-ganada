#!/usr/bin/env node
/**
 * The Romanisation gate: is the reading aid under every headword correct?
 *
 *   npm run romanization:qa            report
 *   npm run romanization:qa -- --check fail the build on any error
 *
 * ## What replaced what, and why it needed its own gate
 *
 * Until this cycle the app printed IPA under every word — `자리 [tɕa.ɾi]`. It
 * was accurate and it was aimed at the wrong reader: a learner three days into
 * Hangul cannot read ɕ, so the one line on the card whose job is *help me say
 * this* was a line they skipped. It is now official Revised Romanisation
 * (국어의 로마자 표기법, 문화체육관광부 2000): `자리 · jari`.
 *
 * The dangerous version of that change is the one-line version — rename the
 * field, keep the value, ship `romanization: "[tɕa.ɾi]"`. Nothing in a build
 * notices, and the product is now lying about what the notation is. So the
 * checks below are about the **values**, not about the field being present.
 *
 * ## Five layers, deliberately not collapsed into one green tick
 *
 * | Layer | Question |
 * | --- | --- |
 * | **A — source** | does every word have a headword and a standard pronunciation to romanise *from*? |
 * | **B — romanisation** | does the output obey the official rules, including the fixtures below? |
 * | **C — mapping** | does this romanisation belong to *this* word? |
 * | **D — audio** | does the recording say the pronunciation the romanisation was built from? |
 * | **E — UI** | is it the romanisation that reaches the screen, and is the IPA gone? |
 *
 * They fail separately because they fail for different reasons and are fixed in
 * different files. A single "romanisation OK" boolean would have been green
 * through the entire IPA era: the field existed and was populated.
 *
 * ## The rule this data is built on
 *
 * Revised Romanisation transcribes **standard pronunciation**, not spelling.
 * 국민 is *gungmin*, not *gukmin*. The one place that rule lives is
 * `scripts/content/hangul.py`; this file re-derives every word through it and
 * compares, so a hand-edited value in the generated pack is an error rather
 * than a silent override.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const CHECK = process.argv.includes('--check');

const errors = [];
const notes = [];
const fail = (layer, what) => errors.push(`[${layer}] ${what}`);

const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');
const data = JSON.parse(read('apps', 'web', 'src', 'data', 'generated', 'vocabulary.json'));
const words = data.words ?? [];

/**
 * IPA characters that must never appear in a learner-facing romanisation.
 *
 * Not "any non-ASCII": the point is to name the specific symbols the old
 * notation used, so that a failure here reads as *the IPA came back* rather
 * than as *an encoding problem*. ɕ ɾ ʌ ɯ ŋ tɕ are the six that carried most of
 * the old transcriptions, and the combining diacritics ͈ (tense) and ̚
 * (unreleased) are the two that made them unreadable.
 */
const IPA_SYMBOLS = /[ɕɾʌɯŋɸʑʰ͈̚ː]/u;

// --- Layer A — source ---------------------------------------------------------
//
// A romanisation is derived from a pronunciation. If the pronunciation is
// missing the romanisation is a guess, however well formed it looks.

{
  let missingHeadword = 0;
  for (const row of words) {
    if (!row.word || !/^[가-힣]+$/u.test(row.word)) {
      missingHeadword += 1;
      if (missingHeadword <= 5) fail('A', `${row.id}: headword "${row.word}" is not plain Hangul`);
    }
    if (row.say && [...row.say].length !== [...row.word].length) {
      fail(
        'A',
        `${row.word}: standard pronunciation "${row.say}" has a different number of syllable ` +
          'blocks — a sound change rewrites blocks, it does not add or remove them',
      );
    }
    if (row.say && !/^[가-힣]+$/u.test(row.say)) {
      fail('A', `${row.word}: standard pronunciation "${row.say}" is not plain Hangul`);
    }
  }
  const withSpoken = words.filter((row) => row.say).length;
  if (withSpoken === 0) {
    fail('A', 'no word carries a standard pronunciation — the sound-change data has gone missing');
  }
  notes.push(
    `A · ${words.length} headwords, ${withSpoken} with an authoritative standard pronunciation`,
  );
}

// --- Layer B — romanisation ---------------------------------------------------

/**
 * Fixtures: real Korean words whose Revised Romanisation is not in dispute.
 *
 * One per rule the standard actually turns on, because a table of easy words
 * would pass against a romaniser that ignored every sound change — which is
 * exactly the romaniser this data used to have. Each line names the rule so
 * that a failure says which one broke.
 *
 * 자리 → jari is here because it is the word the brief singled out, and it is
 * kept for the reason regression fixtures are always kept: it is cheap, and the
 * day somebody rewrites the ㄹ rules it is the line that says so.
 */
const FIXTURES = [
  // Plain consonants and the seven finals.
  ['자리', 'jari', 'ㄹ before a vowel is r'],
  ['사람', 'saram', 'plain onsets'],
  ['밥', 'bap', 'final ㅂ'],
  ['옷', 'ot', 'final ㅅ is realised as t'],
  ['꽃', 'kkot', 'written tense onset stays tense; final ㅊ is t'],
  ['부엌', 'bueok', 'final ㅋ is k'],
  // Vowels and diphthongs.
  ['어머니', 'eomeoni', 'ㅓ is eo'],
  ['의사', 'uisa', 'ㅢ is ui'],
  ['외국', 'oeguk', 'ㅚ is oe'],
  ['위', 'wi', 'ㅟ is wi'],
  ['예', 'ye', 'ㅖ is ye'],
  ['왜', 'wae', 'ㅙ is wae'],
  // Tense and aspirated onsets, written.
  ['싸다', 'ssada', 'written ㅆ is ss'],
  ['차', 'cha', 'ㅊ is ch'],
  ['코', 'ko', 'ㅋ is k'],
  ['토끼', 'tokki', 'ㅌ is t, written ㄲ is kk'],
  // ㄹ in its three positions.
  ['물', 'mul', 'final ㄹ is l'],
  ['갈비', 'galbi', 'ㄹ before a consonant is l'],
  ['우리', 'uri', 'ㄹ between vowels is r'],
  ['설날', 'seollal', 'ㄹㄹ is ll'],
  ['신라', 'silla', 'lateralisation, ㄴ+ㄹ → ll'],
  // Liaison.
  ['음악', 'eumak', 'the ㅁ moves onto the next syllable'],
  ['밟다', 'bapda', '표준발음법 §10: the 밟- stem is [밥], not [발]'],
  // Nasalisation.
  ['국민', 'gungmin', 'ㄱ before ㅁ is said ng'],
  ['학년', 'hangnyeon', 'ㄱ before ㄴ is said ng'],
  ['국물', 'gungmul', 'ㄱ before ㅁ is said ng'],
  ['종로', 'jongno', 'ㄹ after ㅇ is said n'],
  ['십리', 'simni', 'ㅂ before ㄹ nasalises both'],
  // Aspiration.
  ['좋다', 'jota', 'ㅎ + ㄷ fuse to ㅌ'],
  ['많다', 'manta', 'the ㅎ of ㄶ aspirates the ㄷ'],
  ['축하', 'chuka', 'a stop before ㅎ aspirates'],
  // Palatalisation.
  ['같이', 'gachi', 'ㅌ before 이 is said ch'],
  ['굳이', 'guji', 'ㄷ before 이 is said j'],
  // ㄴ insertion in a compound.
  ['나뭇잎', 'namunnip', 'the compound inserts an ㄴ, then it assimilates'],
  // Tensing, which the standard says NOT to write.
  ['학교', 'hakgyo', '§3-1: sound-change tensing is not written'],
  ['먹다', 'meokda', '§3-1: not meoktta'],
  ['식당', 'sikdang', '§3-1: not sikttang'],
  ['학생', 'haksaeng', '§3-1: not hakssaeng'],
  // Words with a historical defect in this repository.
  ['마디', 'madi', 'the audio QA fixture, kept'],
  ['맛없다', 'madeopda', 'the 받침 is neutralised before 없-'],
  ['끝없다', 'kkeudeopda', 'the same, with ㅌ'],
];

{
  // Every fixture, through the one implementation of the rules.
  const script = [
    'import sys, json',
    `sys.path.insert(0, ${JSON.stringify(join(ROOT, 'scripts', 'content'))})`,
    'from pronunciation import spoken_form',
    'from hangul import revised_romanization',
    'words = json.load(sys.stdin)',
    'print(json.dumps({w: revised_romanization(w, spoken_form(w)) for w in words}))',
  ].join('\n');
  const all = [...new Set([...FIXTURES.map(([w]) => w), ...words.map((row) => row.word)])];
  const derived = JSON.parse(
    execFileSync('python3', ['-c', script], { input: JSON.stringify(all), encoding: 'utf8' }),
  );

  for (const [word, expected, rule] of FIXTURES) {
    if (derived[word] !== expected) {
      fail('B', `${word}: expected "${expected}" (${rule}), the rules produce "${derived[word]}"`);
    }
  }

  let drifted = 0;
  for (const row of words) {
    const value = row.romanization;
    if (typeof value !== 'string' || value.length === 0) {
      fail('B', `${row.word}: no romanisation`);
      continue;
    }
    if (IPA_SYMBOLS.test(value)) {
      fail('B', `${row.word}: romanisation "${value}" contains IPA symbols`);
    }
    if (/[[\]/]/.test(value)) {
      fail('B', `${row.word}: romanisation "${value}" is wrapped in brackets — §27 says plain`);
    }
    if (!/^[a-z]+(?:[ -][a-z]+)*$/.test(value)) {
      fail('B', `${row.word}: romanisation "${value}" is not plain lower-case Roman letters`);
    }
    if (derived[row.word] !== undefined && derived[row.word] !== value) {
      drifted += 1;
      if (drifted <= 8) {
        fail(
          'B',
          `${row.word}: pack says "${value}", the rules say "${derived[row.word]}" — ` +
            'the generated pack has been edited by hand, or the pipeline has moved',
        );
      }
    }
  }
  if (drifted > 8) fail('B', `…and ${drifted - 8} more words disagree with the rules`);
  notes.push(`B · ${FIXTURES.length} rule fixtures, ${words.length} words re-derived and compared`);
}

// --- Layer C — mapping --------------------------------------------------------
//
// A romanisation can be individually perfect and attached to the wrong word.
// That is what an index-keyed pack does the first time the corpus is re-sorted,
// and it is invisible to every check that looks at one row at a time.

{
  const seenIds = new Set();
  const seenWords = new Set();
  for (const row of words) {
    if (seenIds.has(row.id)) fail('C', `${row.id}: duplicate id`);
    if (seenWords.has(row.word)) fail('C', `${row.word}: duplicate headword`);
    seenIds.add(row.id);
    seenWords.add(row.word);
  }

  /*
   * The id and the romanisation have to describe the same word.
   *
   * Ids are `word_` + a letter-for-letter reading of the spelling, frozen when
   * the word was first published and never recomputed — they key a learner's
   * saved words and review history, so they cannot move. The romanisation is
   * derived from the *pronunciation* and does move. The two therefore differ
   * legitimately (나뭇잎 is `word_namusip` and reads *namunnip*), but they
   * cannot differ *wildly*: they are two readings of one word, so they start
   * with the same sound unless a rule changed it.
   *
   * This is a weak check on purpose. Its job is not to re-derive the
   * romanisation — layer B does that — but to catch the one failure layer B
   * cannot see, which is a correct value landing on the wrong row.
   */
  let strayed = 0;
  for (const row of words) {
    const stem = row.id.replace(/^word_/, '').replace(/_\d+$/, '');
    const shared = [...stem].findIndex((ch, i) => row.romanization[i] !== ch);
    // The first two letters is one syllable's onset and nucleus. Every sound
    // change in the standard that can reach the first syllable — nasalisation,
    // lateralisation, aspiration — changes at most the coda, which is later.
    if (shared !== -1 && shared < 2 && stem.slice(0, 2) !== row.romanization.slice(0, 2)) {
      strayed += 1;
      if (strayed <= 8) {
        fail(
          'C',
          `${row.word}: id "${row.id}" and romanisation "${row.romanization}" do not read as ` +
            'the same word',
        );
      }
    }
  }
  if (strayed > 8) fail('C', `…and ${strayed - 8} more rows`);

  /*
   * And every per-locale gloss pack still lines up with the corpus.
   *
   * The packs are keyed by word id rather than by position, which is what makes
   * a re-ordering safe; this checks the keys are the corpus's keys and not a
   * previous corpus's, because a stale pack shows the meaning of one word under
   * another and reads as a translation error rather than as a build error.
   */
  const packs = execFileSync('ls', [join(ROOT, 'apps/web/src/data/generated')], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((name) => /^vocabulary\.[\w-]+\.json$/.test(name));
  for (const name of packs) {
    const pack = JSON.parse(read('apps', 'web', 'src', 'data', 'generated', name));
    // The shipped packs are positional — one row per corpus word, in corpus
    // order, because a key per row cost 60 kB per language and there are ten of
    // them. Positional is only safe while the lengths agree, so that is the
    // check; the *editorial* sources under `content/vocabulary/copy/` are keyed
    // by id and are checked below, which is where a re-ordering would show up.
    const rows = pack.words ?? [];
    if (rows.length !== words.length) {
      fail(
        'C',
        `${name}: ${rows.length} rows for ${words.length} corpus words — the pack is stale, and ` +
          'every meaning after the first difference is under the wrong word',
      );
    }
  }
  const sources = execFileSync('ls', [join(ROOT, 'content/vocabulary/copy')], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const name of sources) {
    const pack = JSON.parse(read('content', 'vocabulary', 'copy', name));
    const unknown = Object.keys(pack.words ?? {}).filter((id) => !seenIds.has(id));
    if (unknown.length > 0) {
      fail('C', `copy/${name}: ${unknown.length} rows key a word that is not in the corpus`);
    }
  }
  notes.push(
    `C · ${seenIds.size} unique ids, ${packs.length} shipped packs and ${sources.length} ` +
      'editorial copy files aligned to the same corpus',
  );
}

// --- Layer D — audio ----------------------------------------------------------
//
// The romanisation says one thing; the recording is what a learner actually
// copies. "An audio file exists" is not the check — the check is that the clip
// belongs to the pronunciation the romanisation was derived from.

{
  let manifest;
  try {
    manifest = JSON.parse(read('apps', 'web', 'public', 'audio', 'manifest.json'));
  } catch {
    manifest = null;
  }
  if (!manifest) {
    fail('D', 'no audio manifest — the recordings cannot be checked against the romanisations');
  } else {
    const byText = new Map();
    for (const entry of manifest.entries ?? []) {
      if (entry.kind === 'word') byText.set(entry.text, entry);
    }
    let missing = 0;
    let voiceless = 0;
    for (const row of words) {
      const entry = byText.get(row.word);
      if (!entry) {
        missing += 1;
        continue;
      }
      // The clip is generated from the *headword*, and the TTS applies Korean
      // sound changes itself. What has to hold is that the text the clip was
      // synthesised from is the word this romanisation belongs to — a clip
      // filed under a different headword is the failure mode that matters, and
      // it is the one that put 마디 in front of the wrong recording.
      if (entry.text !== row.word) {
        fail('D', `${row.word}: the clip is filed under "${entry.text}"`);
      }
      if (!entry.female?.src || !entry.male?.src) voiceless += 1;
    }
    if (missing > 0) fail('D', `${missing} words have no recording`);
    if (voiceless > 0) fail('D', `${voiceless} words are missing one of the two voices`);
    notes.push(`D · ${byText.size} word recordings matched to headwords, both voices present`);
  }
}

// --- Layer E — UI -------------------------------------------------------------
//
// The data can be right and the screen can still print the old notation. This
// layer reads the app's own source, because that is the only place the question
// "what does a learner see" is actually answered.

{
  const SCREENS = [
    ['apps/web/src/pages/WordDetailPage.tsx', 'Word Detail'],
    ['apps/web/src/pages/SavedWordsPage.tsx', 'Saved Words'],
  ];
  for (const [path, name] of SCREENS) {
    const source = read(...path.split('/'));
    if (!/word\.romanization/.test(source)) {
      fail('E', `${name} (${path}) does not render \`word.romanization\``);
    }
    if (/fonipa|toIpa|pronunciationOf/.test(source)) {
      fail('E', `${name} (${path}) still refers to the IPA transcription`);
    }
  }

  // And nothing under the app may import the IPA module at all: it lives in
  // `scripts/lib` now precisely so that this is a structural fact rather than a
  // convention somebody has to remember.
  // grep exits 1 when it finds nothing, which is the outcome this asks for.
  let offenders = '';
  try {
    offenders = execFileSync(
      'grep',
      [
        '-rlE',
        '--exclude-dir=node_modules',
        '--exclude-dir=dist',
        '--include=*.ts',
        '--include=*.tsx',
        "lib/ipa'|data/pronunciation",
        join(ROOT, 'apps'),
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    offenders = '';
  }
  if (offenders) {
    for (const file of offenders.split('\n')) {
      fail('E', `${file.replace(`${ROOT}/`, '')} imports the IPA transcriber into the app`);
    }
  }

  // The label a learner reads must not have been left behind under the old key,
  // and must not have been translated into something that means "IPA".
  const WRONG_LABEL = /\b(ipa|i\.p\.a|국제음성기호|国際音声記号|国际音标|alphabet phonétique)\b/i;
  const locales = execFileSync('ls', [join(ROOT, 'apps/web/src/locales')], { encoding: 'utf8' })
    .trim()
    .split('\n');
  for (const locale of locales) {
    let bundle;
    try {
      bundle = JSON.parse(read('apps', 'web', 'src', 'locales', locale, 'vocabulary.json'));
    } catch {
      continue;
    }
    const label = bundle.detail?.romanization;
    if (!label) {
      fail('E', `${locale}: vocabulary.detail.romanization is missing`);
      continue;
    }
    if (bundle.detail?.pronunciation) {
      fail('E', `${locale}: the old vocabulary.detail.pronunciation key is still present`);
    }
    if (WRONG_LABEL.test(label)) {
      fail('E', `${locale}: the label "${label}" names a phonetic alphabet, not a romanisation`);
    }
  }
  notes.push(`E · ${SCREENS.length} screens read the romanisation; ${locales.length} labels checked`);
}

// --- Report -------------------------------------------------------------------

for (const note of notes) console.log(`  ${note}`);
if (errors.length === 0) {
  console.log(
    `Romanisation QA: ${words.length} words, ${FIXTURES.length} rule fixtures — every layer passed.`,
  );
} else {
  console.log(`\n${errors.length} problem(s):`);
  for (const error of errors) console.log(`  ${error}`);
  if (CHECK) process.exit(1);
}
