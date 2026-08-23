#!/usr/bin/env python3
"""The example-sentence quality gate.

    npm run examples:qa            # the report
    npm run examples:qa:check      # exit non-zero unless every example passes

## Why this is a release blocker

The word screen shows five things and one of them carries most of the teaching:
the sentence. A learner who reads 저는 사과를 먹어요 learns what 사과 is, where
it goes in a Korean sentence, which particle it takes and what a Korean
sentence sounds like. A learner who reads 사과는 장미과 사과나무의 열매입니다
learns that Korean is impossible.

Both sentences are present, translated, and recorded. Coverage cannot tell them
apart. So this does.

## What it can and cannot decide

Every rule below is either **decidable** — the target does not appear, the
sentence has four clauses, the Japanese translation is a question and the
Korean is not — or it is **a flag for a person**. Nothing here claims to judge
whether Korean is natural; that judgement was made when the sentence was
written and is re-made by a human when this reports a finding. What the gate
guarantees is that no sentence reaches a customer *without* that judgement
having been asked for.

The three outcomes are therefore:

| | Meaning |
| --- | --- |
| `PASS` | Every decidable rule holds and nothing is flagged. |
| `REVIEW` | Something needs a person to look at it. |
| `REWRITE` | A decidable rule is broken. The sentence is wrong. |

A shipping corpus is 100% `PASS`. `--check` enforces exactly that, and there is
no severity threshold to tune: a warning that is allowed to ship is a warning
nobody will ever act on.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import difficulty  # noqa: E402
import korean_text as kt  # noqa: E402
import pack  # noqa: E402
from conjugate import appears_in  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content-cache"
VOCABULARY = ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.json"
REPORT = ROOT / "content" / "vocabulary" / "examples-qa.json"

#: The corpora `frequency.py` measures against. Named here rather than imported
#: so this gate keeps working if the frequency module's own list changes for a
#: reason that has nothing to do with example sentences.
CORPORA = ("ko_full.txt", "ko_full_2016.txt")

#: Bumped when a rule is added or a threshold moves, so a stored verdict can be
#: told apart from one produced by a different set of rules.
QA_VERSION = "examples-qa-1"


# --- Thresholds ---------------------------------------------------------------
#
# Every number here is a threshold a person chose, so every one of them is
# named and commented. A magic number in a content gate is a rule nobody can
# argue with, and these are all rules that deserve arguing with.

#: Rule E. Eight eojeol is already a long sentence in speech; past it the
#: learner is reading a paragraph to meet one word.
MAX_EOJEOL = 8

#: Below this a sentence is a fixed expression (안녕하세요, 실례합니다) rather
#: than a demonstration of usage. Allowed — they are real, useful Korean — but
#: only where the whole utterance *is* the word.
MIN_EOJEOL = 2

#: Rule H. A beginner sentence may contain at most this many lexical words that
#: are neither taught by this product nor common in the corpora.
MAX_UNKNOWN_BEGINNER = 1

#: And for a word that is itself advanced, where some supporting vocabulary is
#: unavoidable.
MAX_UNKNOWN_ADVANCED = 2

#: Which words count as "beginner" for the two rules above. Both halves matter:
#: a word can be easy to *learn* and rare, or useful and hard to spell.
BEGINNER_LEVEL = 3
BEGINNER_USEFULNESS = 2

#: Rule G, as a count rather than a proportion.
#:
#: The rule reads "prefer >= 80% of supporting lexical content to be very
#: common or no harder than the target". Written as a share it is unusable on
#: the sentences it most applies to: a beginner sentence has two or three
#: supporting words, so its share can only be 0%, 33%, 50%, 67% or 100%, and
#: an 80% threshold is really a ban on any word harder than the target at all —
#: which rejects 저는 매운 음식을 싫어해요, one of the best sentences in the
#: corpus.
#:
#: So the operative test is the count: **at most one** supporting word may be
#: harder than the target and not common. That is the same shape as Rule H, it
#: means the same thing on a short sentence and on a long one, and on a
#: ten-word sentence it is strictly stricter than 80% would have been. The
#: share is still computed and still reported, because it is the figure the
#: rule is written in.
MAX_HARD_SUPPORT = 1
MIN_EASY_SUPPORT_SHARE = 0.80

#: Section 13. One connective is an ordinary sentence; two is a sentence doing
#: two jobs; three is prose.
MAX_CLAUSE_JOINS = 1

#: Rule K. How much of the corpus one sentence shape may account for before it
#: stops being a sentence and starts being a fill-in-the-blank form.
MAX_TEMPLATE_SHARE = 0.010

#: And the floor under that share, so a 40-word corpus does not fail because
#: two sentences rhyme.
MIN_TEMPLATE_COUNT = 8

#: Rule N. A translation this much longer than the English is a definition that
#: escaped into a translation slot.
MAX_EXPANSION = 3.2


# --- Markers ------------------------------------------------------------------

#: Rule J. Phrasing that only ever appears in a dictionary.
DEFINITION_MARKERS = (
    "에 속하는", "에 속한", "의 열매", "을/를 가리키는", "를 가리키는", "을 가리키는",
    "라고 부르는", "이라고 부르는", "을 이르는", "를 이르는", "을 일컫는", "를 일컫는",
    "을 뜻하는", "를 뜻하는", "것을 말한다", "것을 말합니다", "라는 뜻", "이라는 뜻",
    "라는 의미", "이라는 의미", "의 총칭", "을 통틀어", "를 통틀어",
)

#: Rule L. Sentences about the word rather than sentences using it.
META_MARKERS = (
    "라는 단어", "이라는 단어", "라는 말은", "이라는 말은", "한국어 단어",
    "라는 뜻입니다", "라는 뜻이에요", "단어를 배웁니다",
)

#: Rule O. Registers a first-month learner has no use for. These are checked as
#: substrings of the sentence, so each has to be unambiguous on its own.
REGISTER_MARKERS = (
    "에 따라", "에 의해", "으로 인해", "에 관한", "에 대하여", "함으로써",
    "하였습니다", "되었습니다", "이었습니다", "바랍니다만", "및 ", " 등의 ",
    "에 있어서", "로서의", "로써의",
)

#: Homographs whose sentence could plausibly teach the wrong sense, and the
#: words that settle which sense it is.
#:
#: This is the only place in the gate that encodes meaning, and it is
#: deliberately a short hand-written table rather than a model. Every entry is
#: a pair of senses this product actually teaches one of; the cue words are the
#: collocates the *taught* sense takes. A sentence for 눈 = eye that says 눈이
#:와요 is teaching snow, and no amount of counting can notice that.
SENSE_CUES: dict[str, tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...]] = {
    # word: ((meaning fragment that identifies the taught sense,
    #         cues that confirm it, cues that contradict it), …)
    "눈": (
        ("eye", ("보", "감", "뜨", "예쁘", "크", "아프", "마주"), ("오", "내리", "쌓", "녹", "겨울")),
        ("snow", ("오", "내리", "쌓", "녹", "겨울", "하얀"), ("보", "감", "뜨", "마주")),
    ),
    "배": (
        ("stomach", ("아프", "고프", "부르", "부"), ("타", "바다", "먹", "달")),
        ("belly", ("아프", "고프", "부르"), ("타", "바다")),
        ("boat", ("타", "바다", "항구", "떠"), ("아프", "고프")),
        ("ship", ("타", "바다", "항구"), ("아프", "고프")),
        ("pear", ("먹", "달", "과일", "깎"), ("아프", "타")),
    ),
    "말": (
        ("horse", ("타", "달리", "말굽"), ("하", "듣", "전하")),
        ("word", ("하", "듣", "전하", "안 통"), ("타", "달리")),
        ("speech", ("하", "듣", "전하"), ("타", "달리")),
        ("language", ("하", "듣", "배우"), ("타", "달리")),
    ),
    "밤": (
        ("night", ("늦", "깊", "자", "새"), ("먹", "굽", "까")),
        ("chestnut", ("먹", "굽", "까"), ("늦", "깊", "자")),
    ),
    "다리": (
        ("leg", ("아프", "길", "짧", "떨"), ("건너", "놓", "강")),
        ("bridge", ("건너", "놓", "강", "지나"), ("아프", "떨")),
    ),
    "차": (
        ("car", ("타", "운전", "주차", "막히"), ("마시", "끓", "따르")),
        ("tea", ("마시", "끓", "따르", "한 잔"), ("타", "운전", "주차")),
    ),
    "김": (
        ("seaweed", ("먹", "싸", "굽", "밥"), ("서리", "빠지")),
        ("laver", ("먹", "싸", "굽"), ("서리",)),
    ),
    "쓰다": (
        ("write", ("이름", "글", "편지", "펜", "연필"), ("모자", "우산", "맛", "약")),
        ("use", ("돈", "힘", "머리", "도구"), ("모자", "맛")),
        ("wear", ("모자", "우산", "안경"), ("이름", "글", "맛")),
        ("bitter", ("맛", "약", "커피"), ("이름", "글", "모자")),
    ),
    "타다": (
        ("ride", ("버스", "차", "기차", "자전거", "배", "비행기"), ("불", "타는 냄새")),
        ("burn", ("불", "냄새", "숯", "새까맣"), ("버스", "기차", "자전거")),
    ),
    "싸다": (
        ("cheap", ("값", "가격", "정말", "아주", "너무"), ("가방", "포장", "종이")),
        ("wrap", ("가방", "포장", "종이", "도시락"), ("값", "가격")),
    ),
    "세다": (
        ("count", ("숫자", "돈", "하나", "개수"), ("힘", "바람")),
        ("strong", ("힘", "바람", "고집"), ("숫자", "개수")),
    ),
    "걸다": (
        ("hang", ("옷", "벽", "그림", "액자"), ("전화", "말")),
        ("call", ("전화",), ("옷", "벽", "그림")),
    ),
    "들다": (
        ("lift", ("가방", "손", "무겁", "짐"), ("돈", "비용", "마음")),
        ("hold", ("가방", "손", "짐"), ("돈", "비용")),
        ("cost", ("돈", "비용", "많이"), ("가방", "손")),
    ),
    "묻다": (
        ("ask", ("길", "질문", "이름"), ("흙", "먼지", "얼룩")),
        ("bury", ("땅", "흙"), ("길", "질문")),
    ),
}

_HANGUL = re.compile(r"[가-힣]")
_LATIN_WORD = re.compile(r"[A-Za-z]+")

#: Words a translation may share with the meaning without proving anything.
_STOPWORDS = frozenset(
    """
    a an the to be is am are was were do does did have has had of in on at for
    with and or not it this that these those my your his her our their there
    here so very too
    """.split()
)

#: How each locale writes "no".
#:
#: Matched on word boundaries, which is not fussiness: French *ne* is a
#: substring of *une*, *bonne* and *jeune*, and Spanish *no* is a substring of
#: *camino*. Without the boundary this rule reported a third of the corpus.
NEGATION: dict[str, tuple[str, ...]] = {
    "en": ("not", "no", "never", "nothing", "nobody", "without", "cannot"),
    "es": ("no", "nunca", "nada", "nadie", "sin", "tampoco"),
    "fr": ("ne", "n'", "pas", "jamais", "rien", "personne", "sans"),
    "de": ("nicht", "kein", "keine", "keinen", "nie", "nichts", "niemand", "ohne"),
    "pt": ("não", "nunca", "nada", "ninguém", "sem"),
}

#: Contractions, which the word-boundary matcher above cannot see: the letter
#: before *n't* is a word character, so no lookbehind will ever fire on it.
NEGATION_SUBSTRINGS = ("n't",)

#: Japanese and Chinese are deliberately absent from the parity check.
#:
#: Both negate *lexically* far more often than the European languages do —
#: 我没事 is "I'm fine", 不一样 is "different", 嫌い is "dislike" — so a
#: morphological negation marker in one of them says nothing about whether the
#: sentence disagrees with its siblings. Including them flagged 136 correct
#: translations and no incorrect ones. The two locales are still checked for
#: question parity, where the marker *is* comparable.
UNCOMPARABLE_NEGATION = ("ja", "zh")

#: Locales that mark a question with a particle rather than with punctuation.
#: A Japanese question ends in 。 and a Chinese one in 。, so "does it end in a
#: question mark" is the wrong question to ask of either.
#: Matched at the *end* of the sentence, once the full stop is removed. か and
#: の and 几 all occur mid-sentence in perfectly flat statements, so anything
#: less strict than sentence-final flags most of the corpus.
QUESTION_MARKERS: dict[str, tuple[str, ...]] = {
    "ja": ("か", "かい", "の"),
    "zh": ("吗", "呢"),
}

#: Parts of speech whose English gloss is the thing itself, so its absence from
#: a translation is evidence the sentence is about something else. A verb gloss
#: ("to see") legitimately becomes "watch" in a natural translation; a noun
#: gloss ("apple") does not legitimately vanish.
#:
#: Restricted further to *concrete* nouns by `_is_concrete`. An abstract noun
#: is routinely translated as a verb or an adjective — 긴장 becomes "I was
#: nervous", 유지 becomes "keeping" — and demanding the gloss survive would be
#: demanding a worse English sentence.
CONCRETE_GLOSS_PARTS = ("noun",)

#: Below this on `difficulty._concreteness` the word names something a learner
#: could point at. The same function the difficulty model uses, so "concrete"
#: means one thing in the product.
CONCRETE_CUT = 0.5


# --- Findings -----------------------------------------------------------------


@dataclass
class Finding:
    rule: str
    detail: str
    #: True when the rule is decidable and broken. False when it needs a person.
    decisive: bool = True

    def __str__(self) -> str:
        return f"{'REWRITE' if self.decisive else 'REVIEW '}  {self.rule:<26} {self.detail}"


@dataclass
class Verdict:
    word: str
    example: str
    surface: str | None
    findings: list[Finding] = field(default_factory=list)
    #: The five scores of section 11. Diagnostic; the verdict is the findings.
    scores: dict[str, float] = field(default_factory=dict)

    @property
    def status(self) -> str:
        if any(f.decisive for f in self.findings):
            return "REWRITE"
        if self.findings:
            return "REVIEW"
        return "PASS"


# --- The rules ----------------------------------------------------------------


def _norm(text: str) -> str:
    return unicodedata.normalize("NFKC", text).strip().lower()


def _meaning_words(meaning: str) -> list[str]:
    """The content words of an English gloss, for translation alignment."""
    words = [w for w in _LATIN_WORD.findall(_norm(meaning)) if w not in _STOPWORDS]
    return [w for w in words if len(w) > 2]


def _is_concrete(entry: pack.Entry) -> bool:
    return difficulty._concreteness(entry.semantics) < CONCRETE_CUT


def _is_negative(locale: str, text: str) -> bool:
    """Whether a translation is negative, matched on word boundaries.

    Chinese and Japanese are matched as substrings because neither writes word
    boundaries; the others are matched as whole words, because French *ne* is
    inside *une* and Spanish *no* is inside *camino*.
    """
    body = _norm(text)
    if any(marker in body for marker in NEGATION_SUBSTRINGS):
        return True
    markers = NEGATION.get(locale, ())
    return any(re.search(rf"(?<![\w']){re.escape(marker)}(?![\w])", body) for marker in markers)


def _is_question(locale: str, text: str) -> bool:
    """Whether a translation is a question, as that locale writes questions."""
    body = text.strip()
    # Chinese and Japanese punctuation is full-width: a zh question ends in
    # U+FF1F, not U+003F, and comparing against the ASCII character alone
    # reported every Chinese question in the corpus as a statement.
    if body.endswith(("?", "？")):
        return True
    markers = QUESTION_MARKERS.get(locale)
    if not markers:
        return False
    # A Japanese or Chinese question ends in 。 and carries its marker instead.
    return body.rstrip("。．.！!").endswith(markers)


#: English ways of saying "do not do this" without the word *not*.
_PROHIBITIVE = ("stop ", "avoid", "refrain", "quit ", "hardly", "barely", "rarely", "seldom")


def _is_prohibitive(text: str) -> bool:
    return any(marker in _norm(text) for marker in _PROHIBITIVE)


def _shares_a_word(translation: str, meaning_words: list[str]) -> bool:
    """Whether the translation carries any of the meaning's content words.

    Prefix matching, at four characters, because English inflects: a gloss of
    "to walk" has to be satisfied by "walking" and "walked", and a gloss of
    "apple" by "apples". Four is short enough for "eat"/"eats" to be caught by
    the exact branch and long enough that "car" does not match "care".
    """
    text = _norm(translation)
    for word in meaning_words:
        if word in text:
            return True
        if len(word) >= 5 and word[:4] in text:
            return True
    return False


def check_entry(
    entry: pack.Entry,
    row: dict,
    gloss: str,
    lexicon: kt.Lexicon,
) -> Verdict:
    """Every per-entry rule. Cross-entry rules are applied by `check_all`."""
    example = entry.example
    surface = appears_in(entry.word, example)
    verdict = Verdict(entry.word, example, surface)
    add = verdict.findings.append

    grammar = kt.grammar(example)
    tokens = kt.analyse(example, lexicon)
    words = kt.eojeol(example)
    level = int(row.get("difficulty_level") or 5)
    part_of_speech = str(row.get("part_of_speech") or "")
    beginner = level <= BEGINNER_LEVEL or entry.usefulness <= BEGINNER_USEFULNESS

    # --- Rule B: the target has to actually be there ----------------------
    if surface is None:
        add(Finding("B/target-missing", f"{entry.word} does not appear in {example!r}"))

    # --- Rule A: and it has to be the sense we teach ----------------------
    for finding in _sense_findings(entry, example):
        add(finding)

    # --- Rule E: length ---------------------------------------------------
    if len(words) > MAX_EOJEOL:
        add(Finding("E/too-long", f"{len(words)} eojeol (max {MAX_EOJEOL})"))
    elif len(words) < MIN_EOJEOL and not _is_fixed_expression(entry.word, example):
        add(
            Finding(
                "E/one-word",
                f"a single eojeol that is not a fixed expression: {example!r}",
                decisive=False,
            )
        )

    # --- Rule F: the register the product teaches -------------------------
    #
    # 반말 is real Korean and a handful of headwords *are* 반말 — 고마워 cannot
    # be demonstrated politely, because politely it is 고맙습니다, which is a
    # different word. So an informal sentence is a finding for a person rather
    # than a defect, unless the entry itself is marked informal.
    if not grammar.polite and not _is_informal_headword(entry):
        add(
            Finding(
                "F/register",
                f"반말 for a word that is not itself informal: {example!r}",
                decisive=False,
            )
        )

    # --- Rules G and H: supporting vocabulary -----------------------------
    lexical = [
        token
        for token in tokens
        if _HANGUL.search(token.raw)
        and not token.grammatical
        # The target itself is not "supporting vocabulary". Compared by lemma
        # as well as by spelling, because `appears_in` returns the longest
        # matching form and the segmenter returns the longest *known* one, and
        # for an inflected verb those are not always the same string.
        and token.stem != surface
        and token.lemma != entry.word
    ]
    unknown = [
        token
        for token in lexical
        if not token.resolved and lexicon.commonness(token) < kt.UNCOMMON_RATE
    ]
    limit = MAX_UNKNOWN_BEGINNER if beginner else MAX_UNKNOWN_ADVANCED
    if len(unknown) > limit:
        names = ", ".join(sorted({token.stem for token in unknown}))
        add(
            Finding(
                "H/unknown-support",
                f"{len(unknown)} words neither taught nor common ({names}) — limit {limit}",
            )
        )

    # The share test needs something to take a share *of*. A two-eojeol
    # sentence has one supporting word, so its score is 0% or 100% and an 80%
    # threshold is really a ban on any supporting word that is not common —
    # which would reject 국이 짜요. Short sentences are governed by Rule H,
    # which counts words rather than proportions and is the right instrument
    # for them.
    if beginner and lexical:
        # "Very common, already likely familiar, or easier than the target."
        # The middle clause is the one that has to be generous: a word this
        # product teaches in its first three levels is familiar to a learner
        # meeting *any* word, not only to one meeting a harder word.
        familiar = max(level, BEGINNER_LEVEL)
        easy = [
            token
            for token in lexical
            if lexicon.commonness(token) >= kt.COMMON_RATE
            or 0 < lexicon.level_of(token.lemma) <= familiar
        ]
        hard = [token for token in lexical if token not in easy]
        share = len(easy) / len(lexical)
        if len(hard) > MAX_HARD_SUPPORT:
            names = ", ".join(sorted({token.stem for token in hard}))
            add(
                Finding(
                    "G/hard-support",
                    f"{len(hard)} supporting words are harder than {entry.word} "
                    f"and not common ({names}) — {share:.0%} easy",
                    decisive=False,
                )
            )

    # --- Section 13: grammar complexity -----------------------------------
    # A conjunction *is* a clause join, so demonstrating one costs a join that
    # the sentence would not otherwise have. It gets the allowance back.
    join_limit = MAX_CLAUSE_JOINS + (1 if part_of_speech in ("adverb", "determiner") else 0)
    if grammar.clause_joins > join_limit:
        add(Finding("13/clauses", f"{grammar.clause_joins} clause joins in {example!r}"))
    if grammar.advanced:
        names = ", ".join(grammar.advanced)
        decisive = beginner and any(a.startswith("formal") for a in grammar.advanced)
        add(Finding("O/advanced-grammar", f"{names} in {example!r}", decisive=decisive))

    # --- Rules J and L ----------------------------------------------------
    for marker in DEFINITION_MARKERS:
        if marker in example:
            add(Finding("J/dictionary-sentence", f"{marker!r} in {example!r}"))
            break
    for marker in META_MARKERS:
        if marker in example:
            add(Finding("L/meta-sentence", f"{marker!r} in {example!r}"))
            break
    for marker in REGISTER_MARKERS:
        if marker in example:
            add(Finding("O/register", f"{marker!r} in {example!r}", decisive=beginner))
            break

    # --- Section 15: the translations have to say the same thing ----------
    for finding in _translation_findings(
        entry, grammar, gloss, part_of_speech, _is_concrete(entry)
    ):
        add(finding)

    verdict.scores = _score(entry, example, lexicon, tokens, lexical, unknown, grammar, level)
    return verdict


def _is_fixed_expression(word: str, example: str) -> bool:
    """Whether the whole utterance *is* the word, politely conjugated.

    안녕하세요, 실례합니다, 수고하셨습니다. Padding these out to two eojeol would
    produce worse Korean than leaving them alone, which is what Rule E's
    "naturalness wins" means in practice.
    """
    stem = word[:-1] if word.endswith("다") else word
    body = example.rstrip("…·.,!?;:")
    return len(kt.eojeol(example)) == 1 and body.startswith(stem[: max(1, len(stem) - 1)])


def _sense_findings(entry: pack.Entry, example: str) -> list[Finding]:
    senses = SENSE_CUES.get(entry.word)
    if not senses:
        return []
    english = _norm(entry.english or entry.meanings.get("ko", ""))
    for fragment, confirming, contradicting in senses:
        if fragment not in english:
            continue
        if any(cue in example for cue in contradicting) and not any(
            cue in example for cue in confirming
        ):
            return [
                Finding(
                    "A/wrong-sense",
                    f"taught as {fragment!r} but {example!r} reads as another sense",
                )
            ]
        return []
    return []


#: Glosses that say the word belongs to casual speech. A sentence for one of
#: these has to be casual too; making 고마워 polite would make it 고맙습니다.
_INFORMAL_GLOSS = ("informal", "casual", "friend", "slang", "cheer")


#: Headwords that only exist in casual speech. Written out rather than
#: inferred, because the inference — "does the gloss contain the word informal"
#: — is a guess about our own English, and this is a short closed list that an
#: editor can check at a glance.
CASUAL_HEADWORDS = frozenset(
    "안녕 미안 고마워 고맙다 파이팅 화이팅 너 너희 얘 야 응 어 그래 왜 뭐".split()
)


def _is_informal_headword(entry: pack.Entry) -> bool:
    if entry.word in CASUAL_HEADWORDS:
        return True
    gloss = _norm(entry.english or "")
    return any(marker in gloss for marker in _INFORMAL_GLOSS)


def _translation_findings(
    entry: pack.Entry, grammar: kt.Grammar, gloss: str, part_of_speech: str, concrete: bool
) -> list[Finding]:
    out: list[Finding] = []
    english = entry.translations.get("en", "")

    # The target's meaning has to survive into the translation — but only where
    # its absence proves something. A gloss of "to see" legitimately becomes
    # "I watch a film"; a gloss of "apple" does not legitimately become a
    # sentence with no apple in it. So this is asked of concrete nouns with a
    # short gloss, which is exactly the population where it is decidable.
    if (
        gloss
        and part_of_speech in CONCRETE_GLOSS_PARTS
        and len(gloss.split()) <= 2
        and concrete
    ):
        if not _shares_a_word(english, _meaning_words(gloss)):
            out.append(
                Finding(
                    "15/meaning-absent",
                    f"{gloss!r} is not recognisable in {english!r}",
                    decisive=False,
                )
            )

    # Negation is checked in one direction only, and only for grammatical
    # negation.
    #
    # The obvious rule — every translation agrees on polarity — was written,
    # measured, and thrown away. It flagged 136 sentences and not one of them
    # was wrong: French negates restrictively where English does not ("Je ne
    # dirai qu'un mot" for "Let me say just one word"), German writes "Der Reis
    # ist nicht gar" for "The rice is underdone", Chinese writes 没事 for "I'm
    # fine". Polarity is simply not preserved across translation, and a rule
    # with a 100% false-positive rate is worse than no rule: it teaches whoever
    # runs the gate to skim past its output.
    #
    # What *is* decidable is the other direction. If the Korean says 안, 못,
    # 지 않 or 지 마 — grammatical negation, not a lexically negative verb like
    # 없다 — then the English has to carry a negative or a prohibition, because
    # there is no way to translate 하지 마세요 into an affirmative English
    # sentence that means the same thing.
    if grammar.negated and not (
        _is_negative("en", english) or _is_prohibitive(english)
    ):
        out.append(
            Finding(
                "15/negation",
                f"{entry.example!r} is grammatically negative and {english!r} is not",
            )
        )

    for locale, text in entry.translations.items():
        if _is_question(locale, text) != grammar.question:
            out.append(
                Finding(
                    f"15/question:{locale}",
                    f"Korean is {'a question' if grammar.question else 'a statement'} "
                    f"and {locale} is not: {text!r}",
                )
            )

    english_length = max(1, len(english))
    for locale in ("es", "fr", "de", "pt"):
        text = entry.translations.get(locale, "")
        if len(text) > english_length * MAX_EXPANSION:
            out.append(
                Finding(f"16/expansion:{locale}", f"{text!r} against {english!r}", decisive=False)
            )

    # A person the Korean does not have.
    #
    # Korean drops the subject, and 58 English translations filled the gap with
    # "he" and eight with "she" — 발을 밟았어요 became "I stepped on his foot",
    # 목소리가 다정해요 became "Her voice is affectionate". Two things are wrong
    # with that. It asserts something the sentence being taught does not say,
    # which is the one thing an example translation may not do; and the eight
    # were not a random eight — they were the elegant, the graceful, the
    # sweetly-spoken, the one who dressed up and the one who played the piano.
    #
    # Checked in the languages that have a neutral option and where the marker
    # is unambiguous: English has singular "they", Chinese can drop the subject,
    # Spanish and Portuguese are pro-drop, and German's possessive marks the
    # possessor's gender where French's and Spanish's mark the noun's. French
    # and German subject pronouns are *not* checked: neither language has a
    # third-person singular that is not gendered, and the masculine is their
    # unmarked form. That remainder is recorded rather than gated — see
    # docs/LOCALIZATION_NATIVE_REVIEW.md.
    if not _KOREAN_HAS_A_PERSON.search(entry.example):
        for locale, pattern in _INVENTED_PERSON.items():
            text = entry.translations.get(locale, "")
            if not text:
                continue
            match = pattern.search(text)
            # A German possessive whose owner is named earlier in the sentence
            # belongs to that noun, not to an invented person: der Vogel brütet
            # *seine* Eier, jeder erledigt *seine* eigene Arbeit.
            if match and locale == "de" and _GERMAN_ANTECEDENT.search(text[: match.start()]):
                continue
            if match:
                out.append(
                    Finding(
                        f"15/invented-person:{locale}",
                        f"{entry.example!r} names nobody and {text!r} does",
                    )
                )
    return out


#: Korean words that put a specific person in the sentence, so a translation may.
_KOREAN_HAS_A_PERSON = re.compile(
    "그는|그가|그를|그의|그녀|아버지|아빠|형|오빠|남편|아들|삼촌|할아버지|어머니|엄마"
    "|언니|누나|아내|딸|할머니|소년|소녀|남자|여자|아저씨|아줌마|아주머니|아가씨"
    "|신사|숙녀|왕|여왕|장군"
)

#: A noun already in the German sentence that a possessive can belong to.
_GERMAN_ANTECEDENT = re.compile(r"\b(Der|Die|Das|Den|Dem|Jeder|Jede|Jedes|Ein|Eine|Einer|das|dies\w*)\b")

#: The marker of a person invented by the translator, per language.
_INVENTED_PERSON = {
    "en": re.compile(r"\b(He|he|his|His|him|Him|She|she|her|Her)\b"),
    # 吉他 is a guitar and 其他 is "other"; neither is a third person.
    "zh": re.compile(r"(?<![吉其])[他她](?!们)"),
    "es": re.compile(r"\b(Él|él|Ella|ella)\b"),
    "pt": re.compile(r"\b(Ele|ele|Ela|ela|dele|dela)\b"),
    # German only: the possessive. `sein` bare is the infinitive "to be", and
    # `Sie`/`Ihre` are the formal second person this product speaks in.
    "de": re.compile(r"\b(seine[nmrs]?|Seine[nmrs]?|ihre[nmrs]?\s+(Stimme|Bewegungen|Ausdrucksweise))\b"),
}


def _score(
    entry: pack.Entry,
    example: str,
    lexicon: kt.Lexicon,
    tokens: list[kt.Token],
    lexical: list[kt.Token],
    unknown: list[kt.Token],
    grammar: kt.Grammar,
    level: int,
) -> dict[str, float]:
    """The complexity and quality model of section 11.

    Diagnostic, not decisive. The score is what makes a corpus of 2,504
    sentences reviewable — sort by it and the worst hundred are at the top —
    and the *findings* are what decides whether one ships. A numeric gate would
    fail good sentences that happen to be long and pass bad ones that happen to
    be short, which is exactly the failure the rules above exist to avoid.
    """
    eojeol_count = len(kt.eojeol(example))
    length_penalty = max(0.0, (eojeol_count - 4) / 4)
    unknown_penalty = len(unknown) * 0.5
    grammar_penalty = len(grammar.advanced) * 0.4
    clause_penalty = max(0, grammar.clause_joins - 1) * 0.5
    abstract_penalty = (level - 1) / 7 * 0.5

    complexity = round(
        length_penalty + unknown_penalty + grammar_penalty + clause_penalty + abstract_penalty, 3
    )

    target_clarity = 1.0 if appears_in(entry.word, example) else 0.0
    naturalness = 1.0 if grammar.polite else 0.4
    easy = sum(1 for token in lexical if lexicon.commonness(token) >= kt.COMMON_RATE)
    usefulness = round(easy / len(lexical), 3) if lexical else 1.0
    alignment = 1.0

    return {
        "complexity": complexity,
        "target_clarity": target_clarity,
        "naturalness": naturalness,
        "beginner_usefulness": usefulness,
        "translation_alignment": alignment,
        "quality": round(
            target_clarity + naturalness + usefulness + alignment - complexity, 3
        ),
    }


# --- Cross-entry rules --------------------------------------------------------


def _english_glosses(words: list[dict]) -> dict[str, str]:
    """Each word's shipping English meaning, from the locale pack the app loads.

    Not `Entry.english`, which is only the optional *override* the pack carries
    where the dictionary's gloss was wrong. What a customer reads is the built
    pack, so that is what the alignment rule is asked about.
    """
    path = VOCABULARY.with_name("vocabulary.en.json")
    if not path.exists():
        return {}
    rows = json.loads(path.read_text(encoding="utf-8")).get("words", [])
    if len(rows) != len(words):
        return {}
    return {word["word"]: (row[0] or "") for word, row in zip(words, rows)}


def check_all() -> tuple[list[Verdict], dict, list[str]]:
    entries = pack.kept()
    data = json.loads(VOCABULARY.read_text(encoding="utf-8"))
    rows = {row["word"]: row for row in data["words"]}
    corpus = kt.load_corpus(CACHE, CORPORA)
    lexicon = kt.build_lexicon(data["words"], corpus)

    glosses = _english_glosses(data["words"])
    verdicts = [
        check_entry(entry, rows[word], glosses.get(word, ""), lexicon)
        for word, entry in entries.items()
        if word in rows
    ]
    by_word = {verdict.word: verdict for verdict in verdicts}

    # --- Rule 14: duplicates and templates --------------------------------
    identical: dict[str, list[str]] = defaultdict(list)
    shapes: dict[str, list[str]] = defaultdict(list)
    for verdict in verdicts:
        identical[verdict.example.strip()].append(verdict.word)
        shapes[kt.template_shape(verdict.example, verdict.surface)].append(verdict.word)

    for sentence, words in identical.items():
        if len(words) < 2:
            continue
        for word in words:
            by_word[word].findings.append(
                Finding("14/duplicate", f"{len(words)} entries share {sentence!r}: {', '.join(words)}")
            )

    total = max(1, len(verdicts))
    for shape, words in shapes.items():
        if len(words) <= MIN_TEMPLATE_COUNT or len(words) / total <= MAX_TEMPLATE_SHARE:
            continue
        for word in words:
            by_word[word].findings.append(
                Finding(
                    "14/template",
                    f"{len(words)} entries ({len(words) / total:.1%}) share the shape {shape!r}",
                )
            )

    summary = {
        "version": QA_VERSION,
        "words": len(verdicts),
        "pass": sum(1 for v in verdicts if v.status == "PASS"),
        "review": sum(1 for v in verdicts if v.status == "REVIEW"),
        "rewrite": sum(1 for v in verdicts if v.status == "REWRITE"),
        "distinct_shapes": len(shapes),
        "largest_template": max((len(w) for w in shapes.values()), default=0),
        "surface_forms": sum(1 for v in verdicts if v.surface and v.surface != v.word),
    }
    return verdicts, summary, self_test(lexicon, rows, glosses)


# --- The gate's own test ------------------------------------------------------

#: The worked examples of section 10, as a fixture.
#:
#: A content gate that reports "everything passes" is indistinguishable from a
#: content gate that has stopped working, and the failure is silent in exactly
#: the direction that matters. So the rules are run against sentences that are
#: known to be bad, and the run fails if any of them is accepted.
#:
#: Each row is (word, sentence, the rule that must fire). The good sentence is
#: checked too — a rule that fires on 저는 사과를 먹어요 is worse than no rule.
WORKED_EXAMPLES: tuple[tuple[str, str, str | None], ...] = (
    # 사과 — apple
    ("사과", "저는 사과를 먹어요.", None),
    ("사과", "사과는 장미과에 속하는 낙엽성 교목의 열매입니다.", "J/dictionary-sentence"),
    # 학교 — school
    ("학교", "아침에 학교에 가요.", None),
    ("학교", "교육 행정 정책에 따라 학교 운영 방식이 변경되었습니다.", "O/register"),
    # 크다 — to be big
    ("크다", "이 가방은 커요.", None),
    ("크다", "해당 기업은 국제 시장에서 비약적으로 규모가 확대되었습니다.", "B/target-missing"),
    # 친구 — friend
    ("친구", "친구와 같이 공부해요.", None),
    # Four supporting words a beginner has never met — 개념, 사회적, 관계망,
    # 의미 — which is what makes this a definition rather than an example.
    ("친구", "친구라는 개념은 사회적 관계망에서 중요한 의미를 갖습니다.", "G/hard-support"),
    ("친구", "친구와 밥을 먹고 영화를 보고 집에 갔어요.", "13/clauses"),
    # 먹다 — to eat. The target is not in the sentence at all.
    ("먹다", "저는 김밥을 먹어요.", None),
    ("먹다", "영양소를 균형 있게 섭취하기 위해 식사를 하는 것이 좋습니다.", "B/target-missing"),
    # Rule L — a sentence about the word rather than a sentence using it.
    ("친구", "'친구'라는 단어를 배웁니다.", "L/meta-sentence"),
    # Rule E — a paragraph.
    ("사과", "저는 아침에 일어나서 부엌에 가서 냉장고를 열고 사과를 하나 꺼내서 깨끗이 씻어서 먹어요.", "E/too-long"),
)


def self_test(lexicon: kt.Lexicon, rows: dict[str, dict], glosses: dict[str, str]) -> list[str]:
    """Runs the rules against the worked examples. Returns what went wrong."""
    failures: list[str] = []
    for word, sentence, expected in WORKED_EXAMPLES:
        row = rows.get(word)
        if row is None:
            failures.append(f"{word} is not in the corpus — the fixture is stale")
            continue
        entry = pack.Entry(
            word=word, keep=True, usefulness=1, semantics="solo:apple",
            meanings={loc: "…" for loc in pack.MEANING_LOCALES},
            example=sentence,
            translations={loc: "A sentence." for loc in pack.SENTENCE_LOCALES},
            english=glosses.get(word), part_of_speech=None,
            # No long definition: the fixture is about the Korean sentence, and
            # nothing in `check_entry` reads this field.
            definitions={}, reason=None,
        )
        verdict = check_entry(entry, row, glosses.get(word, ""), lexicon)
        rules = {finding.rule for finding in verdict.findings}
        if expected is None:
            # Translation rules are excluded: the fixture's translations are
            # placeholders, and the point of the fixture is the Korean.
            korean = {rule for rule in rules if not rule.startswith(("15/", "16/"))}
            if korean:
                failures.append(f"{word}: {sentence!r} should pass, but {sorted(korean)} fired")
        elif expected not in rules:
            failures.append(f"{word}: {sentence!r} should trip {expected}, got {sorted(rules) or 'nothing'}")
    return failures


# --- Entry point --------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="exit non-zero unless all PASS")
    parser.add_argument("--limit", type=int, default=40, help="findings to print")
    parser.add_argument("--rule", help="only show findings for rules starting with this")
    parser.add_argument("--json", type=Path, default=REPORT, help="where to write the report")
    args = parser.parse_args()

    verdicts, summary, fixture = check_all()
    if fixture:
        print("the gate itself is broken:\n")
        for failure in fixture:
            print(f"  {failure}")
        return 1

    print(f"EXAMPLE SENTENCE QUALITY — {summary['words']:,} examples, {QA_VERSION}\n")
    print(f"  PASS      {summary['pass']:>6,}")
    print(f"  REVIEW    {summary['review']:>6,}")
    print(f"  REWRITE   {summary['rewrite']:>6,}")
    print()
    print(f"  distinct sentence shapes    {summary['distinct_shapes']:>6,}")
    print(f"  largest shared template     {summary['largest_template']:>6,}")
    print(f"  inflected target forms      {summary['surface_forms']:>6,}")

    flagged = [v for v in verdicts if v.findings]
    if args.rule:
        flagged = [
            v for v in flagged if any(f.rule.startswith(args.rule) for f in v.findings)
        ]
    by_rule = Counter(f.rule for v in flagged for f in v.findings)
    if by_rule:
        print("\nby rule")
        for rule, count in by_rule.most_common():
            print(f"  {count:>5}  {rule}")

    if flagged:
        print(f"\n{len(flagged)} example(s) need work:\n")
        for verdict in flagged[: args.limit]:
            print(f"  {verdict.word}  —  {verdict.example}")
            for finding in verdict.findings:
                if args.rule and not finding.rule.startswith(args.rule):
                    continue
                print(f"      {finding}")
        if len(flagged) > args.limit:
            print(f"  … and {len(flagged) - args.limit} more")
    else:
        print("\nevery example passes.")

    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(
        json.dumps(
            {
                **summary,
                "failing": {
                    v.word: [
                        {"rule": f.rule, "detail": f.detail, "decisive": f.decisive}
                        for f in v.findings
                    ]
                    for v in flagged
                },
                "passing": sorted(v.word for v in verdicts if v.status == "PASS"),
                "surface": {v.word: v.surface for v in verdicts if v.surface and v.surface != v.word},
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    return 1 if (args.check and summary["pass"] != summary["words"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
