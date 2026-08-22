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
     * One Korean noun for "a word", and one name per feature.
     *
     * The app had three — 낱말 in the quiz prompts, 단어 on Home, 어휘 on the
     * saved list — for the same thing, on screens a learner moves between in
     * one session. Korean readers notice; it is the difference between a
     * product that was written and one that was assembled.
     *
     * Settled: **단어** for the everyday noun, because that is what a Korean
     * speaker calls a word, and **어휘** only in the two feature names —
     * 저장한 어휘 and 틀린 어휘 — where it means "vocabulary, the collection",
     * which is what those screens hold. 낱말 is retired.
     */
    id: 'korean-word-noun',
    locales: ['ko'],
    pattern: /낱말|저장한 단어|저장 어휘|틀린 단어|틀린 낱말/,
    why: 'Korean uses 단어 for a word and 어휘 only in 저장한 어휘 / 틀린 어휘',
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

];

/**
 * Strings that contain a scolding word and were read, in context, and kept.
 *
 * Each is describing a *thing* rather than the person: "what you got wrong" is
 * the set of items in the review queue, and "something went wrong" is a
 * technical failure the learner did not cause. Listing them here is what keeps
 * the warning list short enough that a new entry gets read.
 */
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
      if (rule.except?.includes(key)) continue;
      if (rule.exceptNamespace === namespace) continue;
      // Some rules are about one language's grammar or terminology and would be
      // nonsense applied to the other thirty-one.
      if (rule.locales && !rule.locales.includes(locale)) continue;
      if (rule.pattern.test(value)) {
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
