#!/usr/bin/env node
/**
 * Do the translations still say what the Korean says?
 *
 *   npm run translation:semantics          report
 *   npm run translation:semantics -- --check   fail on any finding
 *
 * ## What this is, and is not
 *
 * A translation can be in the right script, end in the right mark, collide
 * with nothing — and still negate a sentence the Korean affirms, or turn a
 * question into a statement. Those are the defects a learner cannot detect
 * and cannot forgive, and they are (partially) decidable: negation and
 * interrogativity leave surface markers in every language this product
 * ships.
 *
 * So this gate checks, for every written row of every learner language:
 *
 *   script     — the translation is written in the language's own script,
 *                with no Hangul and (for non-Latin scripts) no English words
 *   terminal   — the sentence ends the way the language ends sentences
 *                (। for hi/bn, ; as the Greek question mark, none for Thai)
 *   question   — a Korean question stays a question
 *   negation   — a grammatically negated Korean sentence shows a negation
 *                marker in the target language
 *   emptiness  — no empty or whitespace row ships
 *
 * ## What it deliberately does not claim
 *
 * Negation detection is a heuristic in both languages. Korean lexical
 * negatives (모르다, 없다-compounds: the word itself is the negation) are
 * excluded, because their natural translations are often positive-form
 * antonyms; suffix-negating languages (Turkish, the Turkic three, Tamil,
 * Telugu, Mongolian) match broad marker sets. Every rule here is a proxy,
 * and `content/vocabulary/semantics-exceptions.json` records each row a
 * person read and accepted with the reason — the same shape as
 * unobserved.json. An empty exception file plus a green run means "no known
 * polarity or feature mismatch", not "proven equivalent".
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const style = read('content/vocabulary/locale-style.json').locales;
const exceptions = existsSync(join(ROOT, 'content/vocabulary/semantics-exceptions.json'))
  ? read('content/vocabulary/semantics-exceptions.json').rows
  : {};

const vocabulary = read('apps/web/src/data/generated/vocabulary.json');
const wordsById = new Map(vocabulary.words.map((w) => [w.id, w]));

const SCRIPTS = {
  Arabic: /[؀-ۿ]/, Bengali: /[ঀ-৿]/, Greek: /[Ͱ-Ͽ]/,
  Devanagari: /[ऀ-ॿ]/, Cyrillic: /[Ѐ-ӿ]/, Tamil: /[஀-௿]/,
  Telugu: /[ఀ-౿]/, Thai: /[฀-๿]/, Latin: /\p{Script=Latin}/u,
  Hangul: /[가-힯]/, Japanese: /[぀-ヿ一-鿿]/, Han: /[一-鿿]/,
};
const scriptFor = (loc) => {
  const s = style[loc]?.script ?? 'Latin';
  for (const [name, re] of Object.entries(SCRIPTS)) if (s.includes(name)) return re;
  return SCRIPTS.Latin;
};
const HANGUL = /[가-힯]/;
const LATIN_WORD = /[A-Za-z]{3,}/;

/**
 * A Korean sentence that is *grammatically* negated. Lexical negatives
 * (모르다, X없다 adjectives, 아니다 as the taught word itself) are excluded —
 * the word is the negation, and its translation is a positive-form word.
 */
const koNegated = (ex, headword) => {
  if (/없다$|모르다$|아니다$|말다$|^아니$|^잘못하다$/.test(headword)) return false;
  return /지 않|않아|않았|않습|않으|(?:^|\s)못 |(?<!잘)못했|(?<!잘)못해|지 마세요|지 마요|아니에요|아니었|(?:^|\s)안 [가-힣]/.test(ex);
};

// JS \b is ASCII-defined, so word boundaries are written as (^|\P{L}) via the
// u flag for every non-ASCII script — \bне\b can never match Cyrillic text.
const NEGATION = {
  ru: /(?:^|\P{L})(?:не|нет|нельзя|ник[тч]|нич|без|переста|редко)/iu, uk: /(?:^|\P{L})(?:не|нема|ні)(?:\P{L}|$)?/iu,
  pl: /\bnie/i, cs: /\bne\b|\bne\p{L}|\bnení|\bnikd|\bpřesta|\bzřídka/iu, it: /\bnon\b|\bniente|\bnessun|\bsmett|\bdi rado|\braramente/i,
  nl: /\bniet\b|\bgeen\b|\bnooit/i, sv: /\binte\b|\bingen|\binga|\baldrig/i,
  de: /\bnicht\b|\bkein|\bnie\b|\bniemand|\bniemals|\bnichts\b|\bkaum\b|\bh[öo]r(?:en)? .{0,14}auf\b|\bauf zu\b/iu, es: /\bno\b|\bnunca|\bnada\b|\bnadie\b|\bjam[aá]s|\brara vez|\bdej[ae] de/iu,
  fr: /\bne\b|\bn['’]|\bpas\b|\bjamais|\bpersonne\b|\brarement|\barr[eê]te|\bfaute d/iu, 'pt-BR': /\bnão\b|\bnunca|\bnada\b|\bningu[eé]m|\bjamais\b|\braramente|\bnem\b|\bpare de|\bde forma alguma/iu,
  ro: /\bnu\b|\bnicio/i, el: /(?:^|\P{L})(?:δεν|μην?|όχι|ποτέ|σπάνια|σταμάτ)/iu, hu: /\bnem\b|\bnincs|\bne\b|\bsoha/i,
  tr: /değil|yok|m[aeıi]yor|m[ae]d[ıi]|m[ae]z(?:\P{L}|$)|mey[ıi]n|may[ıi]n|mam(?:\P{L}|$)|mem(?:\P{L}|$)/iu,
  id: /\btidak\b|\bbukan\b|\bbelum\b|\bjangan\b|\btak\b|\bsulit\b|\bberhenti/i, fil: /\bhindi\b|\bwala|\bhuwag\b|\bdi\b|\bwag\b|\bayaw|\bayok|\bbihira|\btigil/i,
  hi: /नहीं|मत |बिना| न /, bn: /না|নেই|নয়|নি(?:\P{L}|$)/u, ta: /இல்லை|ில்லை|மாட்|வேண்டாம்|ாதே|ாது|ாமல்|வேண்டா|ாதீர்கள்|ாதீர்/, te: /లేదు|కాదు|వద్దు|కూడదు|కుండా|కండి|కు(?:\P{L}|$)|రు(?:\P{L}|$)|దు(?:\P{L}|$)|ను(?:\P{L}|$)/u,
  th: /ไม่|อย่า|ห้าม|เลิก|หยุด/, vi: /(?:^|\P{L})(?:không|chưa|đừng|chẳng|chớ|hiếm khi|xin đừng)/iu,
  ar: /لا|ليس|لم|لن|غير|ما\s|كف|توقف|نادرا|نادرًا/, kk: /емес|жоқ|ма[ңйғс]|ме[ңйс]|ба[ңй]|бе[ңй]|па[ңй]|пе[ңй]|мау|меу|майды|мейді|лма|лме|рма|рме|збе|зба/iu,
  ky: /эмес|жок|элек|ба[йң]|бе[йң]|па[йң]|пе[йң]|бо[йң]|бө[йң]|мой|бол?бо|байт|бейт|лба|лбе|рба|рбе|збе|зба|түк/iu, mn: /гүй|биш|үгүй|болохгүй|бүү|битгий/iu,
  ja: /ない|ません|ぬ|ず|な[かく]|誰も|めったに|やめ|無理/, 'zh-CN': /不|没|别|勿|无|谁也|难得/, ko: null,
  en: /\bnot\b|\bno\b|n['’]t|\bnever\b|\bnothing\b|\bnobody\b|\bwithout\b|\bcannot\b|\brarely\b|\bhardly\b|\bstop\b/i,
};

const findings = [];
const flag = (loc, id, rule, detail) => {
  const key = `${loc}/${id}/${rule}`;
  if (exceptions[key]) return;
  findings.push({ loc, id, rule, detail });
};

/** Every written row of every learner language: copy files + generated packs. */
function* rowsFor(loc) {
  const copyPath = `content/vocabulary/copy/${loc}.json`;
  if (existsSync(join(ROOT, copyPath))) {
    const doc = read(copyPath).words;
    for (const [id, row] of Object.entries(doc)) {
      if (row && row[0]) yield { id, meaning: row[0], translation: row[1] ?? '' };
    }
    return;
  }
  const packPath = `apps/web/src/data/generated/vocabulary.${loc}.json`;
  if (!existsSync(join(ROOT, packPath))) return;
  const pack = read(packPath).words;
  vocabulary.words.forEach((w, i) => {
    if (pack[i] && pack[i][0]) {
      // generator-consumed inside the loop below
    }
  });
  for (let i = 0; i < vocabulary.words.length; i += 1) {
    const row = pack[i];
    if (row && row[0]) yield { id: vocabulary.words[i].id, meaning: row[0], translation: row[1] ?? '' };
  }
}

const LOCALES = Object.keys(style).filter((l) => l !== 'ko');
let checked = 0;
for (const loc of LOCALES) {
  const conf = style[loc];
  const script = scriptFor(loc);
  const neg = NEGATION[loc];
  for (const { id, meaning, translation } of rowsFor(loc)) {
    const word = wordsById.get(id);
    if (!word) continue;
    checked += 1;
    const ex = word.example ?? '';
    if (!meaning.trim()) flag(loc, id, 'empty-meaning', '');
    if (!script.test(meaning)) flag(loc, id, 'script-meaning', meaning.slice(0, 40));
    if (HANGUL.test(meaning) || HANGUL.test(translation)) flag(loc, id, 'hangul', translation.slice(0, 40));
    if (!translation.trim()) { flag(loc, id, 'empty-translation', ''); continue; }
    if (!script.test(translation)) flag(loc, id, 'script', translation.slice(0, 50));
    if (!conf.script.includes('Latin') && LATIN_WORD.test(translation))
      flag(loc, id, 'english-leak', translation.slice(0, 60));
    const t = translation.trim();
    if (conf.terminal) {
      if (ex.endsWith('?')) {
        const q = conf.question && conf.question.length === 1 ? conf.question : '?';
        const ok = t.endsWith(q) || t.endsWith('?') || t.endsWith('？') ||
          (loc === 'ja' && /[かの]。$/.test(t)) || (loc === 'el' && t.endsWith(';'));
        if (!ok) flag(loc, id, 'question-lost', t.slice(-12));
      } else if (!ex.endsWith('!') && !/[.?!。？！।؟;]$/.test(t)) {
        flag(loc, id, 'terminal', t.slice(-12));
      }
    }
    if (neg && koNegated(ex, word.word) && !neg.test(t)) {
      flag(loc, id, 'polarity', `${word.word}: ${ex} → ${t.slice(0, 60)}`);
    }
  }
}

console.log('Translation semantics — the features the Korean fixes\n');
console.log(`  rows checked        ${checked.toLocaleString('en')}`);
console.log(`  locales             ${LOCALES.length}`);
console.log(`  exceptions honoured ${Object.keys(exceptions).length}`);
console.log(`  findings            ${findings.length}\n`);
const byRule = new Map();
for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
for (const [rule, n] of byRule) console.log(`  ${String(n).padStart(5)}  ${rule}`);
for (const f of findings.slice(0, 50)) console.log(`  ! ${f.loc} ${f.id} ${f.rule} ${f.detail}`);
if (findings.length > 50) console.log(`  … and ${findings.length - 50} more`);
if (findings.length === 0) console.log('  every written row keeps the script, the mood and the polarity the Korean has.');
console.log('\n  Heuristics, not proof: see the file comment for what is and is not claimed.');
if (CHECK && findings.length > 0) process.exit(1);
