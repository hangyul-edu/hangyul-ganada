#!/usr/bin/env node
/**
 * The customer-facing copy audit.
 *
 *   node scripts/audit-copy.mjs           print the findings
 *   node scripts/audit-copy.mjs --check   fail the build on an error
 *
 * ## What this is for
 *
 * Every string a learner reads is a promise the product has to keep. Most of
 * them are fine and stay fine; the ones that go wrong go wrong in ways a person
 * reading a diff will not notice, because the sentence reads perfectly well and
 * is simply not true. This checks the claims that would be *expensive* to get
 * wrong, in every language at once:
 *
 * | Rule | Why |
 * | --- | --- |
 * | no "official", "certified", "accredited" near a level | the difficulty score is this product's own model. Calling it official would be a claim about an examining body that does not exist. |
 * | no TOPIK | the app does not teach to TOPIK, does not grade against it, and must not imply either |
 * | no guarantees of fluency, speed or results | "fluent in 3 months" is not something a writing app can promise |
 * | no "free" or subscription language | this is bought once. Copy implying otherwise is a pricing claim |
 * | no placeholder text | `TODO`, `TBD`, `Lorem ipsum`, `XXX` in shipped copy |
 * | no unresolved interpolation left in a translation | `{{count}}` rendered literally is a bug the learner sees |
 * | no scolding | failure copy names the problem; it does not tell the learner they are wrong or lazy |
 *
 * The tone rules cannot be fully mechanised and are not pretended to be. What
 * *is* mechanised is the vocabulary of scolding — "wrong", "failed", "bad",
 * "should have", and their equivalents in each shipping language — flagged as a
 * warning for a human to read in context rather than as an error, because
 * "Have another think" is right and "You were wrong" is not, and only one of
 * them contains the word.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCALES = join(here, '..', 'apps', 'web', 'src', 'locales');
const CHECK = process.argv.includes('--check');

/** Claims that must not appear anywhere, in any language. */
const FORBIDDEN = [
  {
    id: 'bookish-korean-terms',
    /*
     * The two words a beginner would have to look up.
     *
     * 낱자 and 낱말 are both correct Korean and both are what a linguistics
     * textbook says. The learner reading this interface is meeting Hangul for
     * the first time, and the words they already know are 글자 and 단어 — which
     * are also the words the rest of the app uses, in the tab bar and in the
     * search box. Two vocabularies for one thing is one too many.
     *
     * 낱자 was the harder of the two to remove, because 글자 already meant the
     * composed block here — 낱자는 네모난 블록으로 묶이고, 블록 하나가 한
     * 글자예요. Substituting would have made that sentence say a letter is
     * grouped into a letter. The block is called 음절 now, so 글자 means one
     * letter and only that, and the lessons that talked about both were
     * rewritten rather than substituted.
     */
    pattern: /낱자|낱말/,
    why: 'the learner-facing terms are 글자 and 단어; 음절 is the composed block',
  },
  {
    id: 'official-level',
    pattern: /\b(official|officially|certified|accredited|공인|정식\s*인증|公認|официальн)\b/i,
    why: 'the difficulty model is this product\'s own; nothing here is an official grading',
    /*
     * The one string whose job is to say the rule's own sentence out loud.
     *
     * Every other match of this pattern would be the product *claiming* to be
     * official. This is the Vocabulary Level's disclaimer, which claims the
     * opposite — "it is not an official proficiency grade" — and it exists
     * because that screen is the only place in the app that shows a learner a
     * number and calls it their level. A rule that forbade the denial as well
     * as the claim would force the one screen that needs the disclaimer to go
     * without it.
     */
    except: ['levelTest:disclaimer'],
  },
  {
    id: 'topik',
    /*
     * Case-sensitive, and that is the rule rather than a loophole.
     *
     * TOPIK is an acronym and is written in capitals in every language that
     * names it, including Korean copy that spells the rest of the sentence in
     * Hangul. Matching case-insensitively also matched *topik*, which is the
     * ordinary Indonesian and Malay word for "topic" — so "Telusuri per topik",
     * the Indonesian for "Browse by topic", was reported as a claim about a
     * Korean proficiency exam. A rule that cries wolf on a category heading is
     * a rule somebody eventually switches off.
     */
    pattern: /\bTOPIK\b/,
    why: 'the app neither teaches to nor grades against TOPIK',
    /*
     * The hand-off, and only the hand-off.
     *
     * The rule exists so that *this* product never implies it prepares anyone
     * for the exam, because it does not: there is no TOPIK vocabulary, no TOPIK
     * grading and no TOPIK practice anywhere in it. A previous exception — a
     * Legal-screen line saying the difficulty levels were *not* TOPIK grades —
     * was removed because a disclaimer raises the subject to people who had not
     * thought about it, and that reasoning still stands.
     *
     * These four keys are the opposite case. They are the card a learner sees
     * after finishing the alphabet, and what they say is that speaking and
     * TOPIK continue **in the main Hangyul product** — a true statement about a
     * different product, and the only honest way to describe where the next
     * step actually is. Naming it is the point: "further study" would be a
     * vaguer sentence that tells the learner less. See §32 and `NextStepCard`.
     */
    except: [
      'learning:nextStep.body',
      'learning:nextStep.rowBody',
      'learning:nextStep.title',
      'learning:nextStep.cta',
    ],
  },
  {
    id: 'stale-difficulty',
    pattern:
      /\b(difficulty (score|level|rating)|level \d|ranking|frequency rank|dictionary grade)\b|난이도|등급|레벨|順序について|难度|排名/i,
    why: 'the product shows no levels, scores or rankings; copy about them describes a model the learner cannot see',
    /*
     * The Vocabulary Level is the exception this rule now has to name.
     *
     * The rule is about the *curriculum's* difficulty model: a word carries a
     * difficulty score and a band, the learner is never shown either, and copy
     * that mentions them describes machinery they cannot see. That is still
     * true of every word screen in the app.
     *
     * The Vocabulary Level Test is the opposite case and is the only one. Its
     * whole subject is a level: the learner asks for it, it is measured, it is
     * reported with a confidence band, and the screen carries a disclaimer
     * saying what kind of number it is. Excluding the namespace rather than
     * listing keys is deliberate — every string on that screen legitimately
     * talks about levels, and a per-key list would be a list of every key.
     */
    exceptNamespace: 'levelTest',
    /*
     * And the one place outside that namespace where the level is the subject.
     *
     * Today's words are now chosen from the learner's Vocabulary Level, and the
     * Words screen says so — which is the point of §23: personalisation the
     * learner cannot see is indistinguishable from none. The level named here
     * is one they asked for, sat a test for, and can read on Home and on My
     * page, so it is not the hidden difficulty model this rule is about.
     *
     * Listed as a key rather than excepting the namespace, because every *other*
     * string about a word's difficulty in `vocabulary` is exactly what the rule
     * is for.
     */
    except: ['vocabulary:today.tunedTo'],
  },
  {
    id: 'implementation',
    pattern:
      /\b(IndexedDB|SQLite|localStorage|service worker|JSON|edge-tts|Azure|TTS engine|neural voice|scheduler|SM-2|FSRS|half-life|corpus|OpenSubtitles|Wiktionary)\b/i,
    why: 'the learner is using a Korean course, not reading its architecture',
    // Two names a *licence* obliges the app to print. They are credited on the
    // Legal screen from the content pipeline's own records, never written into
    // a sentence, so these are the entries that keep the rule honest rather
    // than the ones that weaken it.
    except: ['settings:legal.intro'],
  },
  {
    /*
     * One Korean noun for "a word". 낱말 is retired.
     *
     * The app had three — 낱말 in the quiz prompts, 단어 on Home, 어휘 on the
     * saved list — for the same thing, on screens a learner moves between in
     * one session. Korean readers notice; it is the difference between a
     * product that was written and one that was assembled.
     *
     * This rule used to carve out 저장한 어휘 and 틀린 어휘, on the reasoning
     * that 어휘 means "vocabulary, the collection", which is what those screens
     * hold. Rendered, they do not: each is a *counted list* — 저장한 어휘 0,
     * 틀린 어휘 0 — of rows you can remove one at a time, saved by a button
     * reading 단어 저장, under a tab reading 단어, and the empty state read
     * 어휘의 북마크를 누르면, which is not a thing anyone says. English calls
     * both screens "words". They are 단어.
     *
     * Where 어휘 may still appear is a question about namespaces rather than
     * about strings, so it is `locale:editorial` that owns it now — 어휘 is the
     * lexicon a person has, which is what the level test measures and the only
     * place it is left.
     */
    id: 'korean-word-noun',
    locales: ['ko'],
    pattern: /낱말/,
    why: 'Korean uses 단어 for a word; 낱말 is retired',
  },
  {
    /*
     * And the grammar that a find-and-replace breaks.
     *
     * 낱말 ends in a consonant and 단어 does not, so every particle attached to
     * it changes: 는 not 은, 가 not 이, 를 not 을, 와 not 과, 로 not 으로.
     * Renaming the noun across four files produced ten ungrammatical strings —
     * 이 단어은 무슨 뜻일까요? — every one of which was a sentence shown to a
     * learner. This is the check that would have caught them.
     */
    id: 'korean-particle',
    locales: ['ko'],
    pattern: /단어은|단어이\s|단어을|단어과|단어으로/,
    why: '단어 ends in a vowel: it takes 는, 가, 를, 와, 로',
  },
  {
    id: 'retired-name',
    pattern: /Hangyul\s*GaNaDa|Hangyul\s+Ganada|HANGYUL\s+GANADA|Hangyul\s+Start/,
    why: 'the customer-facing name is "Hangyul ganada"',
  },
  {
    id: 'guarantee',
    pattern:
      /\b(guarantee[sd]?|guaranteed|fluent in \d|master korean in|보장합니다|保証します|garantiza|garantit|garantiert)\b/i,
    why: 'a writing app cannot promise an outcome',
  },
  {
    id: 'subscription',
    pattern: /\b(subscription|subscribe now|free trial|무료 체험|구독|定期購読|suscripción|abonnement)\b/i,
    why: 'the app is bought once; there is no subscription',
  },
  {
    id: 'placeholder',
    // Case-sensitive for the acronyms, which are always written in capitals in
    // source. Lower-case "todo" is Spanish for "everything" and appears in five
    // perfectly finished sentences.
    pattern: /\b(TODO|TBD|FIXME|XXX)\b|\b(lorem ipsum|placeholder)\b/,
    why: 'unfinished copy',
  },
  {
    id: 'implementation-word',
    /*
     * A word from the inside of the program, on the outside of it.
     *
     * This rule exists because of **"Headline"**. A `t()` call named a key that
     * did not exist, `parseMissingKeyHandler` humanised the missing path into
     * its last segment — leaf, de-camelised, capitalised — and every learner
     * who answered a letter correctly was congratulated by the word *Headline*.
     * A raw `handwriting.feedback.correct.headline` on screen would have been
     * reported in a day; a capitalised English noun looked like copy.
     *
     * `i18n:check` now refuses a call with no key behind it, which stops that
     * at source. This is the second net, on the strings themselves, and it
     * catches the other way in: somebody typing an implementation word into a
     * bundle on purpose. The list is words that are *only* ever internal —
     * "mode" and "item" and "sense" are ordinary English and are not here.
     *
     * Bounded by Unicode letters, not by `\b`. JavaScript's word boundary is
     * ASCII-only, so `\bnull\b` matches inside *nullázása* — Hungarian for
     * "resetting" — because `á` is not an ASCII word character and therefore
     * counts as a boundary. The rule's first run reported "Haladás nullázása"
     * as an implementation leak, which is the sort of finding that teaches
     * people to skim past this list.
     */
    pattern:
      /(?<![\p{L}\p{N}_])(Headline|headline|undefined|null|NaN|payload|scoreId|itemKey|senseId|localeCode|i18nKey|titlePlaceholder|feedbackHeadline)(?![\p{L}\p{N}_])/u,
    why: 'a word from inside the program reached a learner-facing string',
    /*
     * German writes the number zero as *null* — "unter null", "null Punkte" —
     * and the Numbers course says it in seven strings. That is the language,
     * not a leak, so for German the lower-case word is removed before the
     * pattern runs. The capitalised programmer's `Null`, and every other word
     * on the list, are still caught.
     */
    allow: { de: /(?<![\p{L}\p{N}_])null(?![\p{L}\p{N}_])/gu },
  },
  {
    id: 'answer-restated',
    /*
     * A verdict that reads the learner's own answer back to them.
     *
     * "맞아요, 고예요." sat under a recognition question, telling somebody who
     * had just tapped the tile marked 고 that the answer is 고. The information
     * content is zero and the screen is narrating itself; §17 forbids the
     * pattern rather than that one sentence.
     *
     * Matched as *correctness word plus an interpolation of the answer* — the
     * shape, in any language — rather than as a phrase list, because the phrase
     * list would be thirty-two entries long and would miss the thirty-third.
     */
    pattern:
      /(맞아요|맞았|정답|correct|right|richtig|correcto|correct[oe]|正解|正确)[^.!?]{0,12}\{\{\s*(answer|character|word|letter|option|choice)\b/i,
    why: 'the verdict repeats the answer the learner can already see',
  },

];

/**
 * Strings that contain a scolding word and were read, in context, and kept.
 *
 * Each is describing a *thing* rather than the person: "what you got wrong" is
 * the set of items in the review queue, and "something went wrong" is a
 * technical failure the learner did not cause. Listing them here is what keeps
 * the warning list short enough that a new entry gets read.
 */
/**
 * Strings that state the answer, and are meant to.
 *
 * `answer-restated` forbids a verdict that reads the learner's tap back to
 * them. A *hint* is the opposite situation: the last rung of the ladder exists
 * to reveal, the learner asked for it twice to get there, and the answer is by
 * definition not on screen — see `hints.test.ts`, which asserts the first rung
 * never reveals and the last one always does.
 *
 * One entry, named, rather than a carve-out in the pattern.
 */
const REVEALS_ON_PURPOSE = new Set(['learning:review.hint.reveal']);

const REVIEWED_TONE = new Set([
  'errors:generic',
  'learning:review.intro',
  'learning:review.empty.body',
  // The content-report sheet. "What is wrong?" is asking about the *word* — a
  // mistranslated gloss, a bad recording — on a screen the learner opened in
  // order to tell us we made a mistake. It is the one place in the app where
  // something being wrong is not about them.
  'common:report.title',
  'common:report.blurb',
  /*
    The name of a list, and the list holds words. "Wrong words" is the label on
    the Review hub chip beside "Saved words", and the pair is what makes it
    read as a category of *word* rather than a verdict on the learner — which
    is also why the two have to share a noun. See `one-name-per-concept`.
  */
  'learning:mistakes.wrongVocabulary',
]);

/** Words that are usually a tone problem, always worth a human reading. */
const TONE = [
  {
    id: 'scolding',
    pattern: /\b(wrong|failed|failure|bad|stupid|should have|must not forget|틀렸|실패|间违|错误)\b/i,
    why: 'failure copy should name the problem, not judge the learner',
  },
];

const findings = { errors: [], warnings: [] };

/**
 * Korean and English sentences written straight into a component.
 *
 * Not a translation problem — a *review* problem. A string that never reaches
 * a bundle is a string no translator, no reviewer and no rule in this file has
 * ever seen, and it renders in English (or in Korean) whatever language the
 * learner chose. Korean that is *content* — the glyph being taught, a word, an
 * example sentence — is exempt by definition, so this looks for prose: three or
 * more Hangul syllables with a space in them, or a sentence of English with a
 * space and end punctuation, inside a JSX text node or a `label`/`title` prop.
 */
function scanComponents() {
  const roots = [join(here, '..', 'apps', 'web', 'src')];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'locales' || entry.name === 'generated') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) files.push(full);
    }
  };
  roots.forEach(walk);

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // Comments are where this codebase explains itself, at length and in
    // English. They are not copy.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const match of code.matchAll(/>\s*([가-힣][가-힣\s,.!?]{6,})\s*</g)) {
      findings.errors.push({
        locale: 'source',
        key: file.split('/src/')[1],
        rule: { id: 'hard-coded-copy', why: 'Korean prose in a component never reaches a translator' },
        value: match[1].trim(),
      });
    }
  }
}

function walk(value, path, locale, namespace) {
  if (typeof value === 'string') {
    const key = `${namespace}:${path}`;
    for (const rule of FORBIDDEN) {
      if (rule.id === 'answer-restated' && REVEALS_ON_PURPOSE.has(key)) continue;
      if (rule.except?.includes(key)) continue;
      if (rule.exceptNamespace === namespace) continue;
      // Some rules are about one language's grammar or terminology and would be
      // nonsense applied to the other thirty-one.
      if (rule.locales && !rule.locales.includes(locale)) continue;
      // A word that is internal in English and ordinary in one language — see
      // `allow` on the implementation-word rule — is removed before the test.
      const tested = rule.allow?.[locale] ? value.replace(rule.allow[locale], '') : value;
      if (rule.pattern.test(tested)) {
        findings.errors.push({ locale, key, rule, value });
      }
    }
    // A brace left over once every well-formed `{{ ... }}` has been removed.
    // Written this way round because a regex that tries to spot a *bad* brace
    // in one pass ends up matching the second brace of a good one.
    if (/[{}]/.test(value.replace(/\{\{[^{}]*\}\}/g, ''))) {
      findings.errors.push({
        locale,
        key,
        rule: { id: 'stray-brace', why: 'a brace outside an interpolation renders literally' },
        value,
      });
    }
    for (const rule of TONE) {
      if (REVIEWED_TONE.has(key)) continue;
      if (rule.pattern.test(value)) {
        findings.warnings.push({ locale, key, rule, value });
      }
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      walk(child, path ? `${path}.${key}` : key, locale, namespace);
    }
  }
}

scanComponents();

let strings = 0;
const locales = readdirSync(LOCALES).filter((name) => !name.startsWith('.'));
for (const locale of locales) {
  for (const file of readdirSync(join(LOCALES, locale))) {
    if (!file.endsWith('.json')) continue;
    const bundle = JSON.parse(readFileSync(join(LOCALES, locale, file), 'utf8'));
    const count = JSON.stringify(bundle).match(/"[^"]*":\s*"/g)?.length ?? 0;
    strings += count;
    walk(bundle, '', locale, file.replace('.json', ''));
  }
}

/*
  One concept, one word for it.

  The Review hub puts two chips side by side: the words a learner bookmarked
  and the words they got wrong. §20 fixes the Korean pair as 저장한 어휘 and
  틀린 어휘, and §21 asks the same of every other language — not the same
  *translation*, the same *noun*, so the two chips read as a pair rather than
  as two features that arrived separately.

  Thirty-one languages did that already: Uložená slova / Chybná slova, 保存した
  単語 / 間違えた単語, Mots enregistrés / Mots ratés. English said "Saved words"
  and "Wrong vocabulary" — two nouns for one idea, ten pixels apart on a screen
  anyone can open. Compared by last word, which is the head noun in every
  language here that inflects it the same way in both labels; Korean is the
  case the rule was written for and passes on 어휘.
*/
for (const locale of locales) {
  const read = (file) => JSON.parse(readFileSync(join(LOCALES, locale, file), 'utf8'));
  const saved = read('vocabulary.json').saved?.title ?? '';
  const wrong = read('learning.json').mistakes?.wrongVocabulary ?? '';
  /*
    A shared *word*, where there are words; a shared run of characters where
    there are not.

    Not the last word: the head noun is last in German, first in Vietnamese and
    inflected in Ukrainian. Not a bare shared run either — that was the first
    attempt, and "Gemerkte Wörter" against "Verpasste Vokabeln" passed it on the
    "te " in the middle of two unrelated adjectives. A whole token has to
    survive: words / words, слова / слова, salita / salita, 어휘 / 어휘.

    Chinese, Japanese and Thai write without spaces, so there is no token to
    compare and the run is all there is — two characters, which in those scripts
    is already the whole noun: 的词, た単語, คำที่.
  */
  const tokens = (label) =>
    new Set(
      label
        .toLowerCase()
        .split(/[\s·,、。.:;()[\]"'“”„«»]+/u)
        .filter((word) => word.length >= 2),
    );
  const shared = (a, b) => {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    let best = 0;
    for (let i = 0; i < x.length; i += 1) {
      for (let j = 0; j < y.length; j += 1) {
        let run = 0;
        while (i + run < x.length && j + run < y.length && x[i + run] === y[j + run]) run += 1;
        if (run > best) best = run;
      }
    }
    return best;
  };
  const spaced = /\s/.test(saved) && /\s/.test(wrong);
  const agrees = spaced
    ? [...tokens(saved)].some((word) => tokens(wrong).has(word))
    : shared(saved, wrong) >= 2;
  if (saved && wrong && !agrees) {
    findings.errors.push({
      locale,
      key: 'vocabulary:saved.title / learning:mistakes.wrongVocabulary',
      rule: {
        id: 'one-name-per-concept',
        why: 'the saved list and the wrong list are the same kind of thing and sit side by side; they must be named with the same noun',
      },
      value: `${saved} / ${wrong}`,
    });
  }
}

console.log(`Copy audit — ${strings.toLocaleString()} strings across ${locales.length} languages\n`);

for (const finding of findings.errors) {
  console.log(`  error  [${finding.locale}] ${finding.key}`);
  console.log(`         ${finding.rule.id}: ${finding.rule.why}`);
  console.log(`         "${finding.value}"`);
}
for (const finding of findings.warnings) {
  console.log(`  warn   [${finding.locale}] ${finding.key} — ${finding.rule.id}`);
  console.log(`         "${finding.value}"`);
}

console.log(
  `\n${findings.errors.length} error(s), ${findings.warnings.length} warning(s) for a human to read.`,
);
if (findings.errors.length > 0 && CHECK) process.exit(1);
