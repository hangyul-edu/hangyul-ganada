"""Enough Korean sentence analysis to judge an example sentence.

`conjugate.py` answers one question — does this sentence contain this word? —
and answers it well. This module answers the other four the example-quality
gate needs:

1. **What else is in the sentence?** Which lexical words a learner would have
   to already know to read it (`content_words`).
2. **How complicated is the grammar?** Which constructions it uses, from a
   closed list of things that are either beginner-friendly or that are not
   (`grammar`).
3. **What shape is it?** The sentence with its lexical words removed, so two
   sentences built from the same template can be recognised as the same
   sentence (`template_shape`).
4. **What does it commit to?** Negation, tense, question, politeness — the
   things a translation has to agree with (`grammar`).

## What this is not

It is not a morphological analyser. A real one (MeCab, Kkma, Khaiii) needs a
trained model and a native extension, which is a dependency this project would
be shipping in order to check its own content — and none of them is available
offline in this build environment. What is here is a **longest-match segmenter
over a closed lexicon**: it knows the 2,504 words the product teaches plus the
function words Korean is glued together with, and anything it cannot account
for is reported as unknown rather than guessed at.

That failure mode is the right way round. A sentence full of words the product
does not teach is *exactly* what the beginner-complexity rule is looking for,
so an unrecognised token is a finding rather than a gap in the tool.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from conjugate import derived_forms, surface_forms
from hangul import decompose, is_syllable

_HANGUL = re.compile(r"[가-힣]")
_PUNCT = "…·.,!?;:\"'“”‘’()~"


# --- The closed classes -------------------------------------------------------
#
# Everything below is grammar rather than vocabulary. A learner does not have to
# have *met* 를 to read 사과를 — the whole point of the letter curriculum is that
# they can already sound it out, and the particle is taught by the sentence it
# appears in. So these are stripped before anything is called an unknown word.

#: Case and auxiliary particles, longest first so 에서 is tried before 에.
PARTICLES: tuple[str, ...] = (
    "에서부터", "으로부터", "에게서", "한테서", "이라고", "라고는", "이라는", "께서는",
    "에서는", "에서도", "으로는", "으로도", "에게는", "한테는", "이라도", "이나마",
    "밖에는", "부터는", "까지는", "처럼은", "보다는", "만큼은",
    "께서", "에서", "에게", "한테", "이랑", "으로", "라는", "라고", "이라", "이나",
    "부터", "까지", "보다", "처럼", "만큼", "마다", "밖에", "조차", "마저", "든지",
    "이든", "커녕", "따라", "대로",
    "은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "랑", "로", "도",
    "만", "나", "야", "여", "께", "든", "쯤",
)

#: Sentence-final and connective endings, longest first. This is a *closed* list
#: on purpose: an ending that is not here is either rare enough to be worth
#: flagging or is a word, and both outcomes are useful.
ENDINGS: tuple[str, ...] = (
    # 해요체 and its neighbours — the register the product teaches.
    "하시겠어요", "하시겠어", "으시겠어요", "시겠어요", "으셨어요", "으세요", "으십시오",
    "셨습니다", "셨어요", "십니다", "십시오", "세요", "시죠", "시고", "시지",
    "겠습니다", "겠어요", "겠어", "겠지", "겠네요",
    "았습니다", "었습니다", "였습니다", "ㅆ습니다",
    "았어요", "었어요", "였어요", "았어", "었어", "였어", "았다", "었다", "였다",
    "습니다", "ㅂ니다", "입니다", "이에요", "예요", "이야", "이다",
    "아요", "어요", "여요", "해요", "네요", "군요", "잖아요", "잖아", "죠", "지요",
    "을까요", "ㄹ까요", "을게요", "ㄹ게요", "을래요", "ㄹ래요", "읍시다", "ㅂ시다",
    "고 싶어요", "고 있어요", "고 싶다", "고 있다",
    "으려고", "려고", "으러", "러", "으면", "면", "아서", "어서", "여서", "니까",
    "으니까", "는데", "은데", "ㄴ데", "지만", "거나", "든지", "면서", "으면서",
    "다가", "고서", "도록", "든가",
    "아야", "어야", "여야", "아도", "어도", "여도",
    "지 마세요", "지 마요", "지 말아요", "지 않아요", "지 못해요",
    "다", "고", "지", "게", "서", "며", "든", "요", "네", "군", "자", "래", "래요",
    "는", "은", "을", "ㄹ", "ㄴ", "던", "음", "기", "함",
)

#: Words that are grammar wearing a noun's clothes, plus the pronouns and
#: determiners a beginner sentence is built out of. None of them is "an extra
#: word the learner has to know" in the sense the complexity rule means.
FUNCTION_WORDS: frozenset[str] = frozenset(
    """
    저 제 나 내 너 니 우리 저희 당신 그 이 요 저것 이것 그것 여기 거기 저기 어디
    누구 무엇 뭐 뭘 왜 어떻게 언제 얼마 몇 어느 어떤 무슨
    것 거 게 수 줄 적 척 채 만큼 뿐 대로 때문 덕분 탓
    안 못 잘 좀 더 덜 다 또 참 꼭 막 곧 늘 늘상 아주 너무 정말 진짜 매우 조금
    같이 함께 서로 혼자 모두 각각 다시 아직 벌써 이미 방금 지금 오늘 내일 어제
    그리고 그런데 그래서 하지만 그러나 그러면 그럼 그래도 또는 및
    네 예 아니요 아니 응 어 음 아 어머 와 우와
    """.split()
)

#: Verbs and adjectives so basic that a sentence using one is not asking the
#: learner to know an extra word. Every one of them is in the product's own
#: first hundred; they are listed rather than derived so the rule cannot drift
#: when the corpus is re-measured.
BASIC_PREDICATES: frozenset[str] = frozenset(
    """
    이다 아니다 있다 없다 하다 되다 가다 오다 보다 주다 받다 알다 모르다
    먹다 마시다 자다 살다 좋다 싫다 크다 작다 많다 적다 예쁘다 좋아하다
    사다 팔다 읽다 쓰다 듣다 말하다 만나다 놀다 일하다 공부하다 다니다
    앉다 서다 걷다 뛰다 열다 닫다 타다 내리다 넣다 빼다 만들다 시작하다 끝나다
    """.split()
)


# --- Segmentation -------------------------------------------------------------


@dataclass(frozen=True)
class Token:
    """One eojeol, and what could be pulled off the end of it."""

    raw: str
    #: The lexical head, once particles and endings are stripped. May be `raw`.
    stem: str
    #: The lemma this resolved to in the lexicon, or None if nothing matched.
    lemma: str | None
    #: What was stripped, outermost last.
    affixes: tuple[str, ...] = ()
    #: Occurrences per million in the reference corpora, for the best form of
    #: this token that the corpora saw. Zero when they never saw any of them.
    rate: float = 0.0

    @property
    def resolved(self) -> bool:
        return self.lemma is not None

    @property
    def grammatical(self) -> bool:
        """True when this is grammar rather than a word to be known."""
        return self.lemma is not None and self.lemma in FUNCTION_WORDS


def eojeol(sentence: str) -> list[str]:
    """The sentence split into eojeol, with punctuation removed."""
    out: list[str] = []
    for chunk in sentence.split():
        chunk = chunk.strip(_PUNCT)
        if chunk:
            out.append(chunk)
    return out


def _strip_one(token: str, candidates: tuple[str, ...], floor: int) -> tuple[str, str] | None:
    """Pulls the longest candidate suffix off `token`, keeping `floor` syllables."""
    for suffix in candidates:
        if not token.endswith(suffix):
            continue
        head = token[: -len(suffix)]
        if len(head) < floor:
            continue
        return head, suffix
    return None


def analyse(sentence: str, lexicon: "Lexicon") -> list[Token]:
    """Every eojeol, resolved against the lexicon as far as it can be.

    Longest surface form first. The lexicon holds every conjugated form of
    every word the product teaches — 보다 is indexed under 봐, 봤, 보, 본 and
    the rest — so 봐요 resolves by finding 봐 and checking that 요 is a legal
    thing to have left over. Peeling endings off first and looking the residue
    up afterwards cannot work in Korean, because the ending is fused into the
    stem's vowel: there is no boundary in 봐 to peel at.
    """
    return [_analyse_one(raw, lexicon) for raw in eojeol(sentence)]


def _analyse_one(raw: str, lexicon: "Lexicon") -> Token:
    if not _HANGUL.search(raw):
        return Token(raw, raw, None)

    # Every split of the eojeol into a known surface form plus legal grammar,
    # then the *easiest* of them.
    #
    # Longest-first alone is wrong, and wrong in a way that matters: 우리는 is
    # a legal derived form of 우리다, a rare verb meaning "to steep", as well as
    # the pronoun 우리 carrying a topic marker. Taking the longest match filed
    # "we" under a cooking word and then reported the sentence as using
    # advanced vocabulary. Ranking by the lemma's own difficulty picks the
    # reading a learner would actually have.
    candidates: list[tuple[int, int, str, str, str]] = []
    for size in range(len(raw), 0, -1):
        head, rest = raw[:size], raw[size:]
        lemma = lexicon.form_to_lemma.get(head)
        if lemma is None:
            continue
        if rest and not _is_legal_remainder(rest):
            continue
        candidates.append((lexicon.level_of(lemma), -size, head, rest, lemma))
    if candidates:
        _, _, head, rest, lemma = min(candidates)
        return Token(raw, head, lemma, (rest,) if rest else (), lexicon.rate_of(raw, head))

    # Nothing taught matches. Strip what grammar we can recognise so the report
    # names the word rather than the word-plus-particle, then measure it.
    head = raw
    affixes: list[str] = []
    for _ in range(3):
        peeled = _strip_one(head, ENDINGS, floor=1) or _strip_one(head, PARTICLES, floor=1)
        if peeled is None:
            break
        head, affix = peeled
        affixes.append(affix)
    return Token(raw, head, None, tuple(affixes), lexicon.rate_of(raw, head))


def _is_legal_remainder(rest: str) -> bool:
    """Whether what is left after a surface form is grammar rather than a word.

    Checked as a *chain*, because Korean stacks: 학교에서는 leaves 에서는, which
    is 에서 followed by 는. One pass of longest-match over both closed lists,
    repeated until nothing is left.
    """
    for _ in range(4):
        if not rest:
            return True
        for suffix in _REMAINDERS:
            if rest.startswith(suffix):
                rest = rest[len(suffix) :]
                break
        else:
            return False
    return not rest


#: Particles and endings, longest first, for matching from the *front* of what
#: is left over rather than from the back of the eojeol.
_REMAINDERS: tuple[str, ...] = tuple(
    sorted(set(PARTICLES) | set(ENDINGS), key=len, reverse=True)
)


# --- The lexicon --------------------------------------------------------------


@dataclass
class Lexicon:
    """What counts as a word a learner could reasonably already know.

    Three tiers, and the difference between them is the whole point of the
    supporting-vocabulary rule:

    * **taught** — a word the product itself teaches, with its own measured
      difficulty. A sentence for 사과 that also uses 먹다 is using something the
      learner meets in their first week.
    * **grammar** — particles, endings, pronouns, 것. Costs nothing.
    * **everything else** — measured against the corpora rather than guessed
      at. 돈 is not in the taught set and is the 300-per-million word for
      "money"; calling it obscure because this product has not got round to it
      would be the tool reporting its own gap as a content defect.

    The last tier is why `rate` exists. Rule G asks whether the supporting
    words are *common Korean*, which is a question about Korean, not about our
    curriculum — so it is answered from 987k tokens of subtitles.
    """

    #: Every surface form of every taught word → the dictionary form.
    form_to_lemma: dict[str, str] = field(default_factory=dict)
    #: Taught word → difficulty level, 1 (easiest) upward. 0 for grammar.
    level: dict[str, int] = field(default_factory=dict)
    #: Corpus token → occurrences per million, averaged across the corpora.
    corpus: dict[str, float] = field(default_factory=dict, repr=False)
    #: Taught word → its *measured* rate, folded over every conjugated form by
    #: `frequency.measure`. This is the number to ask about a word; the raw
    #: token rate above only knows about the exact spelling it was handed, and
    #: 밝아 is rare in a way that 밝다 is not.
    lemma_rate: dict[str, float] = field(default_factory=dict)

    def add(self, word: str, level: int, rate: float | None = None) -> None:
        self.level[word] = level
        if rate:
            self.lemma_rate[word] = rate
        for form in surface_forms(word):
            # First writer wins, and words are added easiest-first, so when 크다
            # and 커다랗다 both produce 커 the easier word keeps it.
            self.form_to_lemma.setdefault(form, word)
        for form in derived_forms(word):
            self.form_to_lemma.setdefault(form, word)

    def finish(self) -> None:
        """Adds the closed classes. Called once, after every taught word."""
        for word in sorted(FUNCTION_WORDS):
            self.level[word] = 0
            self.form_to_lemma[word] = word
        for word in sorted(BASIC_PREDICATES):
            if word not in self.level:
                self.add(word, 1)

    def rate_of(self, *forms: str) -> float:
        """The best corpus rate among these spellings of one token."""
        return max((self.corpus.get(form, 0.0) for form in forms), default=0.0)

    #: What a bare noun may be wearing when the corpus saw it. A subtitle
    #: corpus almost never contains 한국 on its own — it contains 한국에,
    #: 한국을, 한국은 — so asking for the bare spelling's rate systematically
    #: reports common nouns as rare.
    _NOUN_TAIL = (
        "", "은", "는", "이", "가", "을", "를", "의", "에", "에서", "에게", "도",
        "만", "와", "과", "로", "으로", "부터", "까지", "이나", "나", "이에요",
        "예요", "입니다", "이다", "들",
    )

    def folded_rate(self, stem: str) -> float:
        """A noun's corpus rate, summed over the particles it is written with."""
        return sum(self.corpus.get(stem + tail, 0.0) for tail in self._NOUN_TAIL)

    def commonness(self, token: "Token") -> float:
        """How common this token's *word* is, in occurrences per million.

        The lemma's measured rate where the token resolved to a taught word,
        because that is the number the whole product already uses; the raw
        spelling's rate otherwise, because that is all there is to go on.
        """
        if token.lemma is not None and token.lemma in self.lemma_rate:
            return self.lemma_rate[token.lemma]
        return max(token.rate, self.folded_rate(token.stem))

    def level_of(self, word: str | None) -> int:
        """0 for grammar, 1–8 for a taught word, 9 for anything unrecognised."""
        if word is None:
            return 9
        return self.level.get(word, 9)


#: Occurrences per million above which a word is *common Korean*, whether or
#: not this product teaches it. The cut matches `frequency.BANDS`' "common"
#: band, so one number means the same thing on a word card and in this gate.
COMMON_RATE = 20.0

#: And the cut below which a supporting word is genuinely obscure for a
#: beginner. Between the two is ordinary vocabulary: allowed, but counted.
UNCOMMON_RATE = 4.0


def build_lexicon(words: list[dict], corpus: dict[str, float] | None = None) -> Lexicon:
    """A lexicon from the built vocabulary file's `words` array."""
    lexicon = Lexicon(corpus=corpus or {})
    for row in sorted(words, key=lambda r: r.get("difficulty_score") or 0):
        frequency = row.get("f") or [None, None, None]
        lexicon.add(row["word"], int(row.get("difficulty_level") or 5), frequency[2])
    lexicon.finish()
    return lexicon


def load_corpus(cache: Path, corpora: tuple[str, ...]) -> dict[str, float]:
    """Token → occurrences per million, averaged over the corpus files.

    The same files `frequency.py` measures word frequency from, read the same
    way, so "common" means one thing across the whole pipeline. Averaged rather
    than pooled so a larger corpus does not simply outvote a smaller one.
    """
    totals: dict[str, float] = {}
    read = 0
    for filename in corpora:
        path = cache / filename
        if not path.exists():
            continue
        counts: dict[str, int] = {}
        total = 0
        for line in path.read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if len(parts) != 2 or not parts[1].isdigit():
                continue
            counts[parts[0]] = int(parts[1])
            total += int(parts[1])
        if total == 0:
            continue
        read += 1
        per_million = 1_000_000 / total
        for token, count in counts.items():
            totals[token] = totals.get(token, 0.0) + count * per_million
    if read > 1:
        for token in totals:
            totals[token] /= read
    return totals


# --- Grammar ------------------------------------------------------------------


@dataclass(frozen=True)
class Grammar:
    """What a sentence commits to, in the terms a translation has to match."""

    negated: bool
    past: bool
    future: bool
    question: bool
    exclamation: bool
    imperative: bool
    #: Connective endings joining clauses. More than one is more than a beginner
    #: sentence needs.
    clause_joins: int
    #: Constructions from the advanced list below, by name.
    advanced: tuple[str, ...]
    #: The polite 해요체 or 합쇼체 ending the product teaches in.
    polite: bool


#: Constructions that are correct Korean and wrong for a first-month card.
#: Named rather than counted, so a report can say *what* is heavy about a
#: sentence instead of printing a number the editor cannot act on.
ADVANCED: tuple[tuple[str, str], ...] = (
    ("passive-지다", "어지", ),
    ("causative-시키", "시키"),
    ("nominalised-음", "음으로"),
    ("quoted-clause", "라고 하"),
    ("quoted-clause", "다고 하"),
    ("formal-connective", "에 따라"),
    ("formal-connective", "에 의해"),
    ("formal-connective", "으로 인해"),
    ("formal-connective", "에 관한"),
    ("formal-connective", "에 대한"),
    ("formal-connective", "및 "),
    ("formal-connective", "등의"),
    ("formal-connective", "함으로써"),
    ("literary-ending", "었노라"),
    ("literary-ending", "하노라"),
    ("literary-ending", "이니라"),
)

#: Endings that join one clause to another. Counted, because one is ordinary
#: ("저는 밥을 먹고 학교에 가요") and three is a paragraph.
_JOINS = ("고 ", "서 ", "면 ", "지만 ", "는데 ", "은데 ", "니까 ", "면서 ", "거나 ", "다가 ")

_PAST = ("았어", "었어", "였어", "았다", "었다", "였다", "았습니", "었습니", "였습니", "했어", "했다", "했습니")
_FUTURE = ("ㄹ 거", "을 거", "ㄹ게", "을게", "겠어", "겠습니", "ㄹ까", "을까")
#: Explicit grammatical negation. 안 and 못 are matched with a boundary in
#: front of them: without it 오랫동안 and 그동안 both read as negative, because
#: they end in the syllable 안 followed by a space.
#: Grammatical negation only. 없다 is deliberately absent: it is a lexical
#: verb meaning "to not exist", and every language translates it with an
#: ordinary affirmative predicate — 배터리가 없어요 is "the battery is dead" —
#: so counting it as negation makes the polarity rule fire on correct
#: translations.
#: `지 마` needs an ending after it, for the same reason 안 needs a boundary
#: before it. Written bare it matches inside 새옹지마 — a four-syllable idiom
#: about the unpredictability of fortune, reported as a grammatically negative
#: sentence whose English translation had failed to be negative. The prohibitive
#: is a verb ending, so it is followed by a sentence ending or by nothing.
_NEGATION_RE = re.compile(
    r"(?:^|[\s,])(?:안|못)\s|지\s?않|지\s?못|아니에|아닙니|아니야"
    r"|지\s?마(?:세요|요|라|십시오)?(?=[\s.,!?]|$)|말고"
)
_IMPERATIVE = ("세요", "십시오", "아라", "어라", "지 마", "ㅂ시다", "읍시다")
#: What a 해요체 or 합쇼체 sentence ends in. `니다` rather than `습니다`,
#: because the 합쇼체 ending fuses onto a vowel-final stem: 하 + ㅂ니다 → 합니다,
#: which does not contain the string 습니다 at all.
_POLITE = ("요", "니다", "시오", "죠", "오", "까")


def grammar(sentence: str) -> Grammar:
    body = sentence.strip()
    stripped = body.rstrip(_PUNCT)
    return Grammar(
        negated=bool(_NEGATION_RE.search(body)),
        past=any(marker in body for marker in _PAST),
        future=any(marker in body for marker in _FUTURE),
        question=body.endswith("?"),
        exclamation=body.endswith("!"),
        imperative=any(stripped.endswith(marker) for marker in _IMPERATIVE),
        clause_joins=sum(body.count(join) for join in _JOINS),
        advanced=tuple(dict.fromkeys(name for name, marker in ADVANCED if marker in body)),
        polite=any(stripped.endswith(marker) for marker in _POLITE),
    )


# --- Shape --------------------------------------------------------------------


def template_shape(sentence: str, target_form: str | None) -> str:
    """The sentence with its target blanked, for duplicate-template detection.

    Only the *target* is blanked, not every content word: two sentences that
    differ only in the word being taught are the same sentence, and two that
    differ in a second noun as well are two sentences. Blanking everything would
    collapse the whole corpus into a dozen shapes and report a problem that is
    not there.
    """
    if target_form and target_form in sentence:
        return sentence.replace(target_form, "@", 1)
    return sentence


def syllable_count(sentence: str) -> int:
    return sum(1 for ch in sentence if is_syllable(ch))


def has_final(char: str) -> bool:
    if not is_syllable(char):
        return False
    return decompose(char)[2] is not None
