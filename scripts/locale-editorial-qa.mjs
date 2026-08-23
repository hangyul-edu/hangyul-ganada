#!/usr/bin/env node
/**
 * The editorial pass, as far as a machine can take it.
 *
 *   node scripts/locale-editorial-qa.mjs           print the findings
 *   node scripts/locale-editorial-qa.mjs --check   fail the build on an error
 *
 * ## What this is, and what it is not
 *
 * It is **not** a native-speaker review, it does not claim to be one, and
 * nothing it passes may be described as reviewed. A native reviewer is I-17 and
 * is people. This is the pass that should happen *before* one: the class of
 * defect that a careful editor finds in an afternoon, that no existing check
 * looks for, and that a person should not have to spend their afternoon on.
 *
 * What already exists is mechanical and passes: `i18n:check` compares key
 * coverage, `copy:audit` looks for forbidden claims, `qa:locales` renders every
 * screen in every language and looks for clipping and sideways scroll. None of
 * them reads a sentence. Between them a language can be complete, unclipped,
 * claim-free — and still address the learner as *du* on one screen and *Sie* on
 * the next, or call the same thing two different things in two places.
 *
 * ## The four things it reads for
 *
 * **1. Register.** Most of the shipping languages choose between a familiar and
 * a polite second person, and the choice has to be the same on every screen. A
 * learner addressed as *tu* in the lesson and *vous* in the settings is reading
 * two products. This counts the markers of each register per language and
 * reports a language that uses both, with the minority usage listed — which is
 * almost always the finding, because a slip is a handful of strings against
 * hundreds.
 *
 * **2. One English sentence, two translations.** Where two keys hold the same
 * English string, their translations should match. When they do not it is
 * usually not a nuance; it is two people, or one person twice, and the learner
 * meets the same sentence worded differently on two screens.
 *
 * **3. Typographic slips.** A double space, `...` where the language's own
 * ellipsis belongs, a straight quote in a language whose English source uses
 * curly ones, a space before a colon in a language that does not take one (and
 * the absence of one in French, which does).
 *
 * **4. A label that became a paragraph.** A translation several times the
 * length of its English source is usually an explanation written where a button
 * label belongs, and it is the thing that breaks a layout at 200% text.
 *
 * Findings are **warnings, not errors**, with one exception: a language that
 * mixes registers is an error, because there is no reading of it that is right.
 * The rest need a person to look, which is the point — this narrows what a
 * person has to read from 19,000 strings to a page.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCALES = join(here, '..', 'apps', 'web', 'src', 'locales');
const CHECK = process.argv.includes('--check');
const SOURCE = 'en';

/**
 * How each language marks the two ways of addressing a reader.
 *
 * Pronouns and possessives only — verb morphology would need a parser, and the
 * pronoun is what a slip shows up in first. `polite` and `familiar` are the two
 * registers; a language appears here only if the product genuinely has to
 * choose, so English and the languages with no T–V distinction are absent.
 *
 * Korean is absent from *this* table and checked by `KOREAN_REGISTER` below,
 * because Korean marks the choice in the verb rather than in a pronoun. This
 * comment used to say Korean had "no competing form in this product's copy",
 * which was a claim about the copy that the copy did not support: six strings
 * were in 합쇼체, one of them mixing both registers inside a single pair of
 * sentences.
 *
 * The chosen register per language is not written down here on purpose. It is
 * whichever one the language already uses for the overwhelming majority of its
 * strings — writing it down would be a second source of truth that could
 * disagree with the copy, and the finding worth having is *inconsistency*, not
 * disagreement with a table in a script.
 */
const REGISTER = {
  // German and Italian mark the polite form by *capitalising* an otherwise
  // ordinary pronoun, so both are read through `lowerSentenceStarts` first —
  // otherwise "Sie ist es, die deine Schrift richtig aussehen lässt" (a
  // sentence about the stroke order, in the familiar register) reads as polite
  // because of where the full stop before it fell.
  de: { polite: /(Sie|Ihnen|Ihre[nmrs]?|Ihr)/, familiar: /(du|dich|dir|dein(e[nmrs]?)?)/i, sentenceCase: true },
  it: { polite: /(Lei|Suo|Sua|Suoi|Sue)/, familiar: /(tu|tuo|tua|tuoi|tue|ti)/i, sentenceCase: true },
  fr: { polite: /(vous|votre|vos)/i, familiar: /(tu|toi|ton|ta|tes)/i },
  // `su`/`sus` is left out on purpose: it is the polite possessive *and* the
  // ordinary third-person one, so "a su derecha" — "to its right", about a
  // letter — counted as addressing the reader politely.
  es: { polite: /(usted|ustedes)/i, familiar: /(tú|tu|tus|ti|tuyo)/i },
  nl: { polite: /(u|uw)/, familiar: /(je|jij|jouw|jou)/i, except: ['activity:units.hour_one', 'activity:units.hour_other'] },
  'pt-BR': { polite: /(o\s+senhor|a\s+senhora)/i, familiar: /(você|seu|sua|teu|tua)/i },
  ru: { polite: /(вы|вам|вас|ваш(а|е|и|его|ему)?)/i, familiar: /(ты|тебе|тебя|тво(й|я|е|и))/i },
  uk: { polite: /(ви|вам|вас|ваш(а|е|і|ого|ому)?)/i, familiar: /(ти|тобі|тебе|тві(й|я|є|ї))/i },
  pl: { polite: /(Pan|Pani|Państwo|Pana|Panią)/, familiar: /(ty|twój|twoja|twoje|ci|cię)/i },
  // Bare `ty` is left out for Czech: it is the nominative "you" *and* the
  // plural demonstrative, so "pod ty dvě ostatní" — "under those other two",
  // about a syllable block — counted as addressing the reader.
  cs: { polite: /(vy|vám|vás|váš|vaše)/i, familiar: /(tobě|tebe|tvůj|tvoje|tvá|tvé)/i },
  hu: { polite: /(Ön|Önnek|Önt|Öné)/, familiar: /(te|téged|neked|tiéd)/i },
  ro: { polite: /(dumneavoastr[ăa]|dvs)/i, familiar: /(tu|tău|ta|tăi|tale|ție)/i },
  tr: { polite: /(siz|sizin|size)/i, familiar: /(sen|senin|sana)/i },
  hi: { polite: /(आप|आपक[ीेा])/, familiar: /(तुम|तुम्ह[ाे]र[ीेा]|तू)/ },
  id: { polite: /(Anda)/, familiar: /(kamu|kau)/ },
  vi: { polite: /(quý\s+vị)/i, familiar: /(bạn)/i },
  el: { polite: /(σας|εσείς)/i, familiar: /(σου|εσύ)/i },
  kk: { polite: /(сіз|сізд(ің|і|ер))/i, familiar: /(сен|сен(ің|і))/i },
  ky: { polite: /(сиз|сизд(ин|и))/i, familiar: /(сен|сен(ин|и))/i },
  uz: { polite: /(siz|sizning)/i, familiar: /(sen|sening)/i },
  mn: { polite: /(та|таны|танд)/i, familiar: /(чи|чиний|чамд)/i },
};

/**
 * Korean, where the register is in the verb ending rather than in a pronoun.
 *
 * The product speaks 해요체 throughout — 배워요, 없어요, 시작해 보세요 — which
 * is the register a friendly app uses. 합쇼체 (배웁니다, 따릅니다) is the
 * register of an announcement, and a sentence of it among a hundred of the
 * other reads as a paragraph lifted from somewhere else. Both are polite, so
 * neither is a mistake in isolation; mixing them is.
 *
 * Matched at the end of a sentence, because that is where the ending lives.
 * 습니까/ㅂ니까 is the same register asking a question. Nothing here looks for
 * 한다체 or 해라체: neither appears, and both would be caught by the same shape
 * if they did.
 */
const KOREAN_REGISTER = {
  formal: /(니다|니까)[.!?"'”’)\]]*\s*$/m,
  friendly: /(요|죠|봐요|세요)[.!?"'”’)\]]*\s*$/m,
};

/**
 * One thing, one name — in Korean, where the two are near-synonyms.
 *
 * 단어 is a word; 어휘 is the vocabulary a person has. English says "words" on
 * every one of these screens, and Korean said 어휘 on eleven of them and 단어 on
 * the rest, so the home screen showed 오늘의 어휘 above a tab reading 단어 and
 * the saved list was 저장한 어휘 saved with a button reading 단어 저장.
 *
 * 어휘 is right where the thing being named really is a person's lexicon rather
 * than an item — 어휘 레벨, 어휘 수준 — so the rule is scoped to the namespace
 * that measures it rather than banning the word.
 */
const KOREAN_GLOSSARY = [
  {
    avoid: '어휘',
    prefer: '단어',
    allowedIn: ['levelTest'],
    why: 'a countable thing the learner studies is 단어; 어휘 is the lexicon they have',
  },
];

/**
 * 낱자 and 글자, told apart by what the English says.
 *
 * Both mean "letter" loosely, and the app itself draws the line in unit 1:
 * 낱자는 네모난 블록으로 묶이고, 블록 하나가 한 글자예요 — the forty things you
 * learn are 낱자, and the block they combine into is a 글자. Having taught that,
 * the product then called the letters tab 글자, counted 완료한 글자 in the
 * activity page and 배운 낱자 in the settings, and put 오늘의 글자 above a card
 * reading 낱자 0/40.
 *
 * A word list cannot decide this one, because 글자 is right wherever the thing
 * really is a block. The English is the referent instead: where the source
 * string says "letter", the Korean is about a 낱자. A Korean string that uses
 * *both* words is exempt — that is a sentence drawing the distinction on
 * purpose, which is where 글자 belongs.
 */
const KOREAN_LETTER = {
  english: /\bletters?\b/i,
  avoid: '글자',
  prefer: '낱자',
};

/**
 * A whole-word match that understands letters outside ASCII.
 *
 * JavaScript's `\b` is defined against `\w`, which is `[A-Za-z0-9_]`. In
 * "prêtes" the `ê` is not a word character, so `\btes\b` matches the last three
 * letters and the French for "revisions ready" was reported as addressing the
 * reader familiarly. Every pattern in this file goes through here instead.
 */
function whole(pattern) {
  return new RegExp(`(?<![\\p{L}\\p{M}])(?:${pattern.source})(?![\\p{L}\\p{M}])`, `u${pattern.flags.includes('i') ? 'i' : ''}`);
}

/**
 * Lower-cases the first letter of every sentence.
 *
 * For the two languages where politeness *is* capitalisation. After this, a
 * capital in the middle of a sentence is the polite form and a capital at the
 * start is only a capital.
 */
function lowerSentenceStarts(value) {
  return value.replace(/(^|[.!?…]\s+|\n\s*)(\p{Lu})/gu, (_, before, letter) => before + letter.toLowerCase());
}

/** Ellipsis and quotation, by what the language actually writes. */
const TYPOGRAPHY = [
  { id: 'ascii-ellipsis', pattern: /\.\.\./, why: 'three dots where the ellipsis character belongs' },
  { id: 'double-space', pattern: /\S {2,}\S/, why: 'two spaces inside a sentence' },
  { id: 'space-before-punctuation', pattern: /\s[,.;!?](\s|$)/, why: 'a space before punctuation', skip: ['fr'] },
  { id: 'straight-apostrophe', pattern: /\w'\w/, why: "a straight apostrophe where ’ belongs", skip: ['uz'] },
  { id: 'trailing-space', pattern: /[ \t]$/, why: 'trailing whitespace' },
];

/** Above this multiple of the English length, a short label is suspect. */
const LENGTH_FACTOR = 3.2;
/** Below this many characters, English is a label rather than a sentence. */
const SHORT = 28;
/**
 * And below this, the multiple means nothing.
 *
 * "App" is three characters and "Приложение" is ten, which is three and a third
 * times as long and is simply what the word is in Russian. The finding worth
 * having is a label that became a *sentence*, so the translation has to be long
 * in absolute terms as well as relative ones.
 */
const LONG_ENOUGH_TO_MATTER = 36;

function flatten(value, path, out) {
  if (typeof value === 'string') out.set(path.join('.'), value);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) flatten(child, [...path, key], out);
  }
  return out;
}

function bundlesFor(locale) {
  const dir = join(LOCALES, locale);
  const out = new Map();
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    const namespace = file.slice(0, -'.json'.length);
    const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const [key, value] of flatten(parsed, [], new Map())) {
      out.set(`${namespace}:${key}`, value);
    }
  }
  return out;
}

const locales = readdirSync(LOCALES).filter((name) => name !== SOURCE).sort();
const english = bundlesFor(SOURCE);

/** English strings that appear under more than one key. See finding 2. */
const PLURAL = /_(zero|one|two|few|many|other)$/;

const sameEnglish = new Map();
for (const [key, value] of english) {
  /*
   * Plural forms of one key are excluded, and they were most of this finding.
   *
   * English has two forms and often writes the same words in both — "{{count}}
   * done" reads the same whether it is one or five — while Swedish writes
   * "klar" and "klara" and Tamil "முடிந்தது" and "முடிந்தன". That is the plural
   * system doing exactly its job, and reporting it as one sentence translated
   * two ways is reporting a language for having grammar.
   */
  if (PLURAL.test(key)) continue;
  const normalised = value.trim();
  // Only whole sentences and labels — a one-word value like "Korean" is
  // legitimately the same everywhere and says nothing when it is.
  if (normalised.length < 12) continue;
  const list = sameEnglish.get(normalised) ?? [];
  list.push(key);
  sameEnglish.set(normalised, list);
}
const duplicated = [...sameEnglish.values()].filter((keys) => keys.length > 1);

const errors = [];
const warnings = [];
let strings = 0;

for (const locale of locales) {
  const bundle = bundlesFor(locale);
  strings += bundle.size;

  // 1. Register.
  const rule = REGISTER[locale];
  if (rule) {
    const polite = [];
    const familiar = [];
    const politePattern = whole(rule.polite);
    const familiarPattern = whole(rule.familiar);
    for (const [key, value] of bundle) {
      if (rule.except?.includes(key)) continue;
      const read = rule.sentenceCase ? lowerSentenceStarts(value) : value;
      if (politePattern.test(read)) polite.push(key);
      if (familiarPattern.test(read)) familiar.push(key);
    }
    if (polite.length > 0 && familiar.length > 0) {
      const minority = polite.length <= familiar.length ? polite : familiar;
      const which = polite.length <= familiar.length ? 'polite' : 'familiar';
      errors.push({
        locale,
        id: 'mixed-register',
        detail:
          `${polite.length} string(s) address the reader politely and ${familiar.length} familiarly. ` +
          `The ${which} ones are the minority: ${minority.slice(0, 6).join(', ')}` +
          (minority.length > 6 ? ` (+${minority.length - 6} more)` : ''),
        sample: bundle.get(minority[0]),
      });
    }
  }

  // 1b. Korean register, and the Korean glossary.
  if (locale === 'ko') {
    const formal = [];
    const friendly = [];
    for (const [key, value] of bundle) {
      for (const sentence of value.split(/(?<=[.!?])\s+/)) {
        if (KOREAN_REGISTER.formal.test(sentence.trim())) formal.push(key);
        else if (KOREAN_REGISTER.friendly.test(sentence.trim())) friendly.push(key);
      }
    }
    if (formal.length > 0 && friendly.length > 0) {
      errors.push({
        locale,
        id: 'mixed-register',
        detail:
          `${friendly.length} sentence(s) are 해요체 and ${formal.length} are 합쇼체. ` +
          `The 합쇼체 ones are: ${[...new Set(formal)].slice(0, 6).join(', ')}`,
        sample: bundle.get(formal[0]),
      });
    }
    const strayLetter = [...bundle]
      .filter(([key, value]) => value.includes(KOREAN_LETTER.avoid) && !value.includes(KOREAN_LETTER.prefer))
      .filter(([key]) => KOREAN_LETTER.english.test(english.get(key) ?? ''))
      .map(([key]) => key);
    if (strayLetter.length > 0) {
      errors.push({
        locale,
        id: 'two-names-for-one-thing',
        detail:
          `${strayLetter.length} string(s) say 글자 where the English says "letter" and the app ` +
          `teaches 낱자: ${strayLetter.slice(0, 6).join(', ')}`,
        sample: bundle.get(strayLetter[0]),
      });
    }
    for (const term of KOREAN_GLOSSARY) {
      const stray = [...bundle]
        .filter(([key, value]) => value.includes(term.avoid))
        .filter(([key]) => !term.allowedIn.includes(key.split(':')[0]))
        .map(([key]) => key);
      if (stray.length > 0) {
        errors.push({
          locale,
          id: 'two-names-for-one-thing',
          detail:
            `${stray.length} string(s) say ${term.avoid} where the product says ${term.prefer} — ` +
            `${term.why}: ${stray.slice(0, 6).join(', ')}`,
          sample: bundle.get(stray[0]),
        });
      }
    }
  }

  // 2. One English sentence, two translations.
  for (const keys of duplicated) {
    const values = new Map();
    for (const key of keys) {
      const value = bundle.get(key);
      if (value === undefined) continue;
      const list = values.get(value) ?? [];
      list.push(key);
      values.set(value, list);
    }
    if (values.size > 1) {
      warnings.push({
        locale,
        id: 'split-translation',
        detail: `${keys.join(' and ')} are one sentence in English and ${values.size} here`,
        sample: [...values.keys()].join('  //  '),
      });
    }
  }

  // 3 and 4.
  for (const [key, value] of bundle) {
    for (const check of TYPOGRAPHY) {
      if (check.skip?.includes(locale)) continue;
      // Only flag what English does not do itself: the source is the editorial
      // standard, and a pattern the source string also matches is house style
      // rather than a slip.
      const source = english.get(key);
      if (source !== undefined && check.pattern.test(source)) continue;
      if (check.pattern.test(value)) {
        warnings.push({ locale, id: check.id, detail: `${key} — ${check.why}`, sample: value });
      }
    }
    const source = english.get(key);
    if (
      source &&
      source.length <= SHORT &&
      value.length > LONG_ENOUGH_TO_MATTER &&
      value.length > source.length * LENGTH_FACTOR
    ) {
      warnings.push({
        locale,
        id: 'label-became-a-paragraph',
        detail: `${key} — ${value.length} characters against ${source.length} in English`,
        sample: value,
      });
    }
  }
}

console.log(
  `Locale editorial pass — ${strings.toLocaleString('en')} strings across ${locales.length} languages\n`,
);
console.log('  This is not a native-speaker review and does not stand in for one.\n');

for (const finding of errors) {
  console.log(`  error  [${finding.locale}] ${finding.id}`);
  console.log(`         ${finding.detail}`);
  if (finding.sample) console.log(`         "${finding.sample}"`);
}
for (const finding of warnings) {
  console.log(`  warn   [${finding.locale}] ${finding.id}`);
  console.log(`         ${finding.detail}`);
  if (finding.sample) console.log(`         "${finding.sample.slice(0, 160)}"`);
}

console.log(`\n${errors.length} error(s), ${warnings.length} warning(s) for a person to read.`);
if (CHECK && errors.length > 0) process.exit(1);
