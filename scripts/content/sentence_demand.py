#!/usr/bin/env python3
"""What a gap-fill sentence asks of the learner, as distinct from what its answer does.

## The defect this exists for

Every contextual item in the Level Test took its difficulty from **the word
removed from the sentence**, and from nothing else. Measured on the shipped
bank: 629 of 629. So this was a level-1 question, because 돈 is a level-1 word::

    지갑에 ____이 있어요.        → 돈

`지갑` is a level-9 word. A learner meeting their first question is being asked
to read a frame built out of vocabulary they will not be taught for eight more
levels. And this was a level-7 question, because 죽다 is a level-7 word::

    물을 안 줘서 화분의 꽃이 ____.   → 죽었어요

`화분` is level 28. The sentence also carries a negation and a causal connective
and expects the learner to infer that not watering a plant kills it. A tester
met it as **question four**.

The answer's frequency rank is a fact about the answer. It says nothing about
the sentence the learner has to read to reach it, and a gap-fill is a reading
task before it is a vocabulary task.

## What this computes

A *demand level* for a sentence: the level at which a learner could reasonably
be expected to read the frame. Four independent floors, and the item's level
becomes the highest of them and the answer's own level::

    level = max(answer_level, noun_demand, grammar_demand, length_demand)

It only ever raises. A simple sentence around a hard word stays at the word's
level, which is correct: 나물 is hard whatever frame it sits in.

## The three floors, and why each number

**Noun demand.** The level of the hardest ordinary word the frame contains,
looked up in the same table the test levels its answers with. Exact matches
only, after stripping one particle — no prefix matching, because 기다려요 is not
evidence about 기다 and 유명한 is not evidence about 유명.

**Grammar demand.** A table of constructions, each with the level at or above
which a learner can be expected to have met it. The numbers are a judgement and
are written down rather than buried: they follow the order a beginners' syllabus
introduces them in, and `docs/LEVEL_TEST_DIFFICULTY_AUDIT.md` records the
reasoning for each.

**Length demand.** Eojeol in the frame, not counting the blank. A four-word
sentence is not a two-word sentence, whatever it is made of.

## What it deliberately does not do

Judge whether the sentence is *good*. That is `examples_qa` and a person. This
answers one question — how hard is this to read — and answers it the same way
every time.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from hangul import compose_syllable, decompose, is_syllable

#: Levels run 1–30, matching `build_level_test.LEVELS`.
LEVELS = 30

# --- Grammar ------------------------------------------------------------------

#: A construction, the pattern that finds it, and the level from which a learner
#: can be expected to have met it.
#:
#: Ordered roughly as a beginners' syllabus introduces them. The floors are
#: judgements, not measurements — there is no learner response data in this
#: repository to calibrate against, and §11 of the report says so. What they are
#: *not* is arbitrary: each is the level by which the vocabulary scale has
#: reached the point where a learner meeting this construction for the first
#: time is being taught rather than tested.
#:
#: Patterns run against the **frame** — the sentence with its blank removed —
#: because a construction inside the answer is what the question is asking about.
GRAMMAR: tuple[tuple[str, re.Pattern[str] | None, int], ...] = (
    # Past tense. Taught in the first weeks, but after the present.
    ("past", re.compile(r"(았|었|였|했)(어요|어|다|습니다)"), 3),
    # Explicit negation. 안/못 with a boundary, and the long forms.
    # 없다 is not negation — it is an ordinary verb meaning "to not exist".
    ("negation", re.compile(r"(?:^|[\s,])(?:안|못)\s|지\s?않|지\s?못"), 5),
    # One connective ending joining two clauses.
    #
    # `서` is matched only after 아/어/여/해 — the causal-sequential ending. A
    # bare `서 ` also matches 에서, 으로서 and 께서, which are particles and not
    # clause joins at all; a first draft of this file counted 에서 and reported
    # `____에서 채소를 사요` as a two-clause sentence.
    (
        "connective",
        re.compile(r"(?:[가-힣](?:아서|어서|여서|해서)|[가-힣]고|[가-힣]면|[가-힣]지만|[가-힣]는데|[가-힣]으니까|[가-힣]니까|[가-힣]면서|[가-힣]다가)\s"),
        8,
    ),
    # A verb modifying a noun. 넘어진 아이, 받은 선물, 사는 곳.
    #
    # Both of these need to know whether the syllable in front of the ending is
    # a *verb stem* or a *noun*, which a regular expression cannot tell: 저는 is
    # 저 with a topic particle and 넘어진 is 넘어지 with an adnominal ending, and
    # they are the same shape. So the pattern finds candidates and
    # `_is_verb_form` rejects the ones whose stem is a word in its own right —
    # see there. Written as `None` here because the work is not a match.
    ("adnominal", None, 10),
    # -기 as a noun: 먹기 전에, 가기 위해, 읽기가 어려워요.
    #
    # Same trap one syllable along: 모기를 is a mosquito, not a nominalised verb.
    ("nominaliser", None, 10),
    # 께, 드리다, 계시다, -시-. The joint between stem and ending is the load.
    ("honorific", re.compile(r"께서?\s|드려|드립|계세|계시|으세요|십니다|시어요"), 12),
    # Particles past the first handful.
    ("uncommon-particle", re.compile(r"[가-힣](?:밖에|조차|마저|커녕|뿐|만큼|처럼|보다|대로|따라)\s"), 12),
    # Two or more clause joins is a paragraph, not a sentence.
    ("two-clauses", re.compile(r"$^"), 14),  # counted, not matched — see `demand_of`
    # 합쇼체. Correct, formal, and not what this product teaches in.
    ("formal", re.compile(r"(?:ㅂ|습)니다[.?!]?\s*$|니까[.?!]?\s*$"), 16),
    # Reported speech.
    ("quoted", re.compile(r"(?:라고|다고|냐고|자고)\s?(?:하|해|했|말)"), 18),
    # Passive and causative morphology.
    ("passive-causative", re.compile(r"[가-힣]어지|[가-힣]아지|시키"), 18),
    # 에 따라, 에 의해, 으로 인해, 함으로써.
    (
        "formal-connective",
        re.compile(r"에\s?따라|에\s?의해|으로\s?인해|에\s?관한|에\s?대한|함으로써|및\s"),
        22,
    ),
)

#: What a frame of this many eojeol asks, before anything in it is read.
#:
#: The blank does not count: the learner is not reading it, they are choosing it.
LENGTH_FLOOR: tuple[tuple[int, int], ...] = ((3, 1), (4, 5), (5, 9), (6, 13), (7, 17))

#: One particle, stripped from the end of an eojeol before looking the word up.
#:
#: Longest first, so 에서 is not read as 에, and 으로 not as 로.
_PARTICLE = re.compile(
    r"(?:으로써|으로서|에게서|한테서|께서|에서|에게|한테|으로|이나|이랑|밖에|조차|마저|커녕|만큼|처럼|보다|대로|부터|까지|마다|와|과|랑|을|를|이|가|은|는|의|도|만|로|에)$"
)

#: Eojeol that are grammar rather than vocabulary, and carry no noun demand.
_FUNCTION_WORDS = frozenset(
    {
        "저는", "제가", "나는", "내가", "우리는", "우리가", "그", "이", "저", "그것", "이것", "저것",
        "안", "못", "잘", "다", "더", "좀", "또", "다시", "너무", "아주", "정말", "매우", "가장",
        "그리고", "그래서", "하지만", "그런데", "그러나", "그럼", "그러면",
    }
)


#: Adnominal endings written as their own syllable: 받은 선물, 사는 곳, 가던 길.
_ADNOMINAL = ("은", "는", "던")

#: And the two that fuse into the stem's last syllable as a final consonant.
#:
#: 넘어지 + ㄴ is 넘어진, not 넘어지ㄴ. The ending is invisible as a character, so
#: a pattern over syllables cannot see it at all — which is why a first draft
#: found no relative clause in 넘어진 아이를 ____. Removing the final consonant
#: reconstructs the stem, and the same "is it already a word" test applies.
_FUSED_ADNOMINAL = ("ㄴ", "ㄹ")


def _unfuse(token: str) -> str | None:
    """`넘어진` → `넘어지`, for a token whose last syllable ends in ㄴ or ㄹ."""
    if not token or not is_syllable(token[-1]):
        return None
    initial, medial, final = decompose(token[-1])
    if final not in _FUSED_ADNOMINAL:
        return None
    return token[:-1] + compose_syllable(initial, medial, None)


def _has_verb_form(words: list[str], kind: str, levels: dict[str, int]) -> bool:
    """Whether the frame contains a verb wearing an adnominal or -기 ending.

    The distinguishing test is not the shape — 저는 and 넘어진 are the same shape
    — but whether what is left after the ending is **already a word**. 저 is;
    넘어지 is not. 모기 is; 먹 is not. So a candidate is accepted only when its
    stem is *absent* from the word table, which is exactly the case where the
    syllable is a verb stem rather than a noun.

    A first draft matched on shape alone and reported `저는 공부를 ____.` as
    carrying a relative clause, which lifted a level-1 question to level 10.
    """
    for word in words:
        token = word.strip(".,!?")
        if token in _FUNCTION_WORDS or len(token) < 2:
            continue
        if kind == "nominaliser":
            bare = _PARTICLE.sub("", token)
            if not bare.endswith("기") or len(bare) < 2:
                continue
            # 모기를 → 모기 is a word, so this is a noun. 먹기 → 먹 is not.
            if bare in levels:
                continue
            return True
        else:
            if token in levels:
                continue
            # A particle first, or its own final consonant is read as an ending:
            # 문을 is 문 with the object particle, and 을 ends in ㄹ, so the
            # unfused test below turned every object in the corpus into a
            # relative clause. 넘어진 carries no particle and survives this.
            if _PARTICLE.sub("", token) in levels:
                continue
            for ending in _ADNOMINAL:
                if not token.endswith(ending) or len(token) <= len(ending):
                    continue
                stem = token[: -len(ending)]
                # 저는 → 저 is a word: a topic particle, not a relative clause.
                if stem in levels:
                    continue
                return True
            fused = _unfuse(token)
            # 넘어진 → 넘어지, which is not a word, so the ㄴ is an ending.
            # 눈 → 누, and 눈 *is* a word, so the ㄴ is part of it.
            if fused and fused not in levels and len(fused) >= 2:
                return True
    return False


@dataclass(frozen=True)
class Demand:
    """Everything that decides how hard a frame is to read."""

    eojeol: int
    #: The hardest ordinary word in the frame, and its level.
    hardest_word: str | None
    noun_demand: int
    #: Constructions found, by name, each with the floor it sets.
    grammar: tuple[tuple[str, int], ...]
    grammar_demand: int
    length_demand: int
    #: The highest of the three. Not yet combined with the answer's own level.
    demand: int
    clauses: int

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(name for name, _ in self.grammar)


def frame_of(prompt: str) -> str:
    """The sentence a learner reads: the prompt without its blank."""
    return prompt.replace("____", " ").strip()


def eojeol_of(frame: str) -> list[str]:
    return [word for word in frame.rstrip(".?!").split() if word]


def _length_demand(count: int) -> int:
    floor = 1
    for at_least, level in LENGTH_FLOOR:
        if count >= at_least:
            floor = level
    return floor


def demand_of(prompt: str, levels: dict[str, int], sentence: str | None = None) -> Demand:
    """How hard this item is to read, given a word→level table.

    `levels` is the same table the anchors are levelled from, so a noun's demand
    and an answer's difficulty are on one scale and can be compared.

    `sentence` is the item with its answer in place. When given, grammar is read
    from it and vocabulary from the frame — see `context_level`.
    """
    frame = frame_of(prompt)
    words = eojeol_of(frame)
    read = frame_of(sentence) if sentence else frame

    hardest: str | None = None
    noun = 0
    for word in words:
        token = word.strip(".,!?")
        if token in _FUNCTION_WORDS:
            continue
        bare = _PARTICLE.sub("", token)
        for candidate in (bare, token):
            # Exact matches only. 기다려요 is not evidence about 기다, and a
            # prefix search reported five words that are not in the sentence.
            if candidate and candidate in levels:
                if levels[candidate] > noun:
                    noun, hardest = levels[candidate], candidate
                break

    found: list[tuple[str, int]] = []
    clauses = 0
    for name, pattern, floor in GRAMMAR:
        if name == "two-clauses":
            continue
        if pattern is None:
            if _has_verb_form(eojeol_of(read), name, levels):
                found.append((name, floor))
            continue
        if pattern.search(read + " "):
            found.append((name, floor))
            if name == "connective":
                clauses = len(pattern.findall(read + " "))
    if clauses >= 2:
        found.append(("two-clauses", 14))

    grammar_demand = max((floor for _, floor in found), default=1)
    length_demand = _length_demand(len(words))
    return Demand(
        eojeol=len(words),
        hardest_word=hardest,
        noun_demand=noun,
        grammar=tuple(found),
        grammar_demand=grammar_demand,
        length_demand=length_demand,
        demand=max(noun, grammar_demand, length_demand),
        clauses=max(clauses, 1),
    )


def context_level(
    prompt: str, answer_level: int, levels: dict[str, int], sentence: str | None = None
) -> tuple[int, Demand]:
    """The level a contextual item should carry.

    Never below the answer's own level — a hard word in an easy frame is still a
    hard word — and never below what the sentence demands.

    Grammar is read from the **whole sentence** and vocabulary from the *frame*,
    and the split is deliberate. The learner sees all four options, so the
    construction the answer completes is one they have to read:
    `저는 커피를 마시지 ____` with 않아요 among its options is a negation
    question, and reading the frame alone finds no negation in it because the
    negation is the answer. Vocabulary is the other way round — the answer's own
    difficulty is already `answer_level`, and counting it twice would level every
    item by its answer, which is the defect this module exists to fix.
    """
    demand = demand_of(prompt, levels, sentence=sentence)
    return min(LEVELS, max(answer_level, demand.demand)), demand
