import type { DictionaryExample } from './dictionary';

/**
 * Which upstream example sentences are fit to put in front of a learner.
 *
 * ## Why this exists
 *
 * A taught card can show more than its own curated example, and §11 asks it to
 * — two or three real sentences beat one. The obvious supply is the dictionary
 * entry the app already has. Measured over the first 500 taught words, that
 * supply gives 253 candidate sentences, and reading them is the whole argument
 * for this file:
 *
 * ```
 *   ^서울에 가요.                     a stray caret from the wikitext
 *   새들-이 나뭇가지 위에 …            a morpheme hyphen that is not Korean
 *   그러면 내가 어떤 사람이 되는 거겠--어?  a double hyphen mid-word
 *   여자친구                          a compound, not a sentence
 *   밥값도 못 하는 놈                  a fragment, and 놈 is abusive
 *   우리 몸 속에 있는 기생충의 알        parasite eggs, under "a body"
 *   술을 먹다 / to drink wine          filed under 먹다 meaning "to eat"
 * ```
 *
 * None of that is a bug upstream. Wiktionary is a dictionary for readers who
 * can already read Korean, and its citations are chosen to illustrate usage,
 * not to be shown to somebody on their fourth day. Passing them through
 * unfiltered is the "we have the data, so display it" failure that §9 is about.
 *
 * ## The rules, and why each one is here
 *
 * Every rule below was written against a sentence that actually shipped. None
 * of them is a guess about what might be wrong.
 */

/** Markup that survived the wikitext parse. A learner must never see one. */
export const MARKUP = /[\^~*[\]{}<>|]|--|\p{Script=Hangul}-|-\p{Script=Hangul}/u;

/**
 * A sentence ends. A fragment does not.
 *
 * `여자친구` and `밥값도 못 하는 놈` are both legitimate dictionary citations and
 * neither is a sentence a learner can read as an example of usage. Requiring
 * terminal punctuation is a crude test that happens to draw exactly that line.
 */
export const ENDS = /[.?!。？！]\s*$/;

/**
 * A translation that is explaining rather than translating.
 *
 * Dictionary citations often gloss an idiom and then unpack it — *"(saying) The
 * Sun rises from the west; i.e. something impossible."* — which is exactly right
 * in a dictionary and is a paragraph of commentary on a learner's word card.
 */
export const COMMENTARY =
  /\((saying|idiom|proverb|literally|figuratively|lit\.|colloquial|informal|formal|slang|archaic|dialect|honorific|humble)\)|\bi\.e\.|\be\.g\.|\bliterally\b/i;

/**
 * A citation glossed as a phrase, not translated as a sentence.
 *
 * Wiktionary cites the bare construction as often as it cites a sentence —
 * 우편을 외국으로 보내다, *To send mail to a foreign country* — and the two are
 * indistinguishable in Korean, because a plain `-다` ending is ordinary written
 * Korean and 인간은 죽기 마련이다 is a real sentence with the same shape.
 *
 * The English gives it away. A translator writing an infinitive is glossing a
 * verb phrase; a translator writing a sentence writes a sentence. Over the 248
 * sentences that reach a card this drops six and keeps every other one:
 * 한 귀로 듣고 다른 귀로 흘리다, 은행에 계좌를 가지고 있다, 차를 멈추다,
 * 사기꾼이 하는 말에 속다, 상대방의 기분을 달래다 and the 보내다 citation above.
 */
export const INFINITIVE_GLOSS = /^to\s+\p{L}/iu;

/** Words too common to carry meaning when comparing a gloss to a translation. */
const STOP = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'be', 'is', 'are', 'am', 'it',
  'this', 'that', 'and', 'or', 'for', 'with', 'was', 'were', 'have', 'has', 'had',
  'you', 'your', 'my', 'his', 'her', 'their', 'our', 'not', 'but', 'they', 'them',
  'one', 'some', 'something', 'someone', 'person', 'thing', 'used', 'will', 'would',
]);

/**
 * A crude stem, so *woman* matches *women* and *go* matches *going*.
 *
 * Deliberately not a stemmer. The comparison it feeds is a *veto* — an example
 * is dropped when nothing in its translation resembles the taught meaning — so
 * being slightly too generous keeps a good sentence and being too strict throws
 * one away. Erring generous is the right direction for a veto.
 */
function stem(word: string): string {
  return word
    .replace(/(ing|ed|es|s)$/, '')
    .replace(/men$/, 'man')
    .replace(/ie$/, 'y');
}

function content(text: string): string[] {
  /*
    Two letters is long enough.

    It was three, and that silently emptied the taught side of the comparison
    for every gloss whose only content word is short — "to go", "to do" — so no
    example could ever match one and the most common verbs in the language
    gained nothing. Short function words are excluded by name in `STOP`, which
    is the right tool for that job; length is not.
  */
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 2 && !STOP.has(word))
    .map(stem);
}

/**
 * Is this example about the meaning the card teaches?
 *
 * Compares the example's own translation with the taught gloss. 밥을 먹다 —
 * *to eat food* — shares a stem with *to eat* and stays; 술을 먹다 — *to drink
 * wine* — shares nothing and goes, which is right: the card says "to eat" and a
 * learner reading "to drink" under it learns that the card cannot be trusted.
 */
export function sameSense(translation: string, taughtGloss: string): boolean {
  const taught = new Set(content(taughtGloss));
  if (taught.size === 0) return false;
  return content(translation).some((word) => taught.has(word));
}

/**
 * The parts of speech that take a case particle, and so demonstrate case.
 *
 * Wiktionary files senses by part of speech, and its citations illustrate the
 * grammar of the sense they sit under. That is correct in a dictionary and it
 * is the whole problem here, because a taught card names one part of speech and
 * the app matches senses to it by *gloss*.
 *
 * 거의 is the sentence that found this. The card teaches the adverb — 거의 다
 * 왔어요, *almost there* — and Wiktionary also carries a rare nominal 거의
 * glossed "almost", whose citations are what a nominal sense's citations are:
 * 손님은 거의가 오셨습니다, 남은 시간의 거의를 공부를 하는 데 쓰더라. Both
 * decline the word. The gloss matched, so they were shown under an adverb card,
 * and a learner reading them takes away that 거의 takes 가 and 를 — which for
 * the word they were taught it does not.
 *
 * So the constraint runs one way only, and it is about grammar rather than
 * about labels. A nominal sense may only lend its sentences to a taught word
 * that is itself nominal. Nothing stops the reverse: 지금 and 오늘 are taught as
 * nouns and Wiktionary files an adverb sense for each, and 오늘 뭐 했어요 is the
 * ordinary way to use them. Measured over the whole corpus this drops two
 * sentences and keeps the other 248.
 */
const NOMINAL = new Set(['noun', 'proper noun', 'pronoun', 'numeral', 'counter', 'determiner']);

/**
 * May a sense of `sensePart` illustrate a word taught as `taughtPart`?
 *
 * Unknown on either side means yes: a missing part of speech is not evidence of
 * a mismatch, and this is a veto on a sentence that is otherwise good.
 */
export function compatiblePartOfSpeech(
  sensePart: string | undefined,
  taughtPart: string | undefined,
): boolean {
  if (!sensePart || !taughtPart) return true;
  if (sensePart === taughtPart) return true;
  return !NOMINAL.has(sensePart) || NOMINAL.has(taughtPart);
}

/**
 * The examples worth showing under a taught card, best first, at most `limit`.
 *
 * Returns an empty list far more often than not, and that is the intended
 * outcome. §11: one strong example beats three bad ones, and no extra example
 * beats one that quietly teaches a different word.
 */
export interface UsableExample {
  korean: string;
  /** Never null here: an example with no translation is dropped, not shown. */
  translation: string;
}

export function usableExamples(
  examples: readonly DictionaryExample[],
  options: { taughtGloss: string; skip: string | null; limit?: number },
): UsableExample[] {
  const out: UsableExample[] = [];
  // `skip` is the card's own example, so it is not repeated underneath itself.
  // Null for a word that has none, in which case nothing is excluded.
  const seen = new Set<string>(options.skip ? [options.skip] : []);
  for (const example of examples) {
    if (out.length >= (options.limit ?? 2)) break;
    const korean = example.korean?.trim() ?? '';
    const translation = example.translation?.trim() ?? '';
    if (!korean || !translation) continue;
    if (seen.has(korean)) continue;
    if (MARKUP.test(korean) || MARKUP.test(translation)) continue;
    if (!ENDS.test(korean)) continue;
    if (COMMENTARY.test(translation)) continue;
    if (INFINITIVE_GLOSS.test(translation)) continue;
    /*
      One sentence, not a small essay.

      A citation that runs to two sentences is usually a gloss plus its
      explanation, and the second half is written for a reader who already knows
      the word. Counting terminal punctuation is enough to tell them apart.
    */
    if ((translation.match(/[.?!]/g) ?? []).length > 1) continue;
    /*
      Long enough to show something, short enough to read on a phone — and
      short enough to be beginner Korean. 30 characters keeps
      「너는 이 가수를 왜 좋아해?」 and drops
      「신체 기능 유지와 건강을 위해 수면 전 적당량의 물을 마시는 게 좋아.」,
      which is a true sentence about hydration and not an example of 물.
    */
    if (korean.length < 5 || korean.length > 30) continue;
    if (!sameSense(translation, options.taughtGloss)) continue;
    seen.add(korean);
    out.push({ korean, translation });
  }
  return out;
}
