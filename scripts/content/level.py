"""The 1–30 Vocabulary Level, and the four things it is made of.

## What was wrong with the level this replaces

A word's level was its **frequency rank**, bucketed against a scale that runs to
10,635 words. The taught corpus is 2,916, so ranks stopped at about 3,500 and
the top half of the scale was empty: levels 15 to 29 held **no words at all**,
and level 30 held the eight the frequency corpora had never seen. Simulated at
1,000 recommendations each, a learner placed at 15 and a learner placed at 20
received an identical list, and a learner placed at 30 cycled through 82 words
— the same word roughly twelve times.

The level was a number beside `Lv.` and it did not change what anybody was
taught. That is the defect this module exists to fix, and it is worth stating in
the strongest terms available: **a level system that does not change the words
is decorative.**

## Frequency is not difficulty

The replacement could not be "a better frequency ranking", because frequency and
difficulty are different things and the corpus proves it in both directions.
것, 수, 데 and 바 are in the top hundred words of any Korean corpus and are
bound nouns whose meaning a beginner cannot state. 코끼리 is rare in subtitles
and is an elephant.

So there are four scores, computed separately, and the level is what they make
together:

| Component | What it asks | Weight |
| --- | --- | --- |
| `frequency` | How often will the learner meet this word? | 0.34 |
| `utility` | Does a learner *need* it, and can they picture it? | 0.26 |
| `linguistic` | How much machinery is in the form? | 0.22 |
| `semantic` | How much has to be understood before the meaning lands? | 0.18 |

Every component is a **cost**: 0 is easy, 1 is hard. None of them reaches the
learner as a number; what reaches the learner is a level between 1 and 30 and,
on the word card, one sentence naming the largest term.

## Why absolute thresholds and not thirty equal buckets

Thirty equal buckets over a sorted list is the frequency-rank mistake wearing a
different sort key: the boundaries would move every time a word was added, and
"level 12" would mean "somewhere in the middle of whatever we happen to teach".

`BOUNDARIES` is a fixed ladder of score thresholds instead. A word's level is a
fact about the word, unchanged by what else is in the corpus, and a batch of 500
beginner words cannot push the scale down. The cost is that the levels are not
equally sized, which is correct — real vocabulary is not uniformly distributed
over difficulty — and `vocabulary:level:qa` is what refuses a ladder that leaves
a level too thin to teach from.

## Overrides exist and are listed

`content/vocabulary/level-overrides.json` holds the words a person moved by
hand, each with a reason. The model is good and it is not right about
everything; a file of exceptions that a reviewer can read is a better answer
than a weight nudged until one word moves.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SIGNALS = ROOT / "content" / "vocabulary" / "word-signals.json"
OVERRIDES = ROOT / "content" / "vocabulary" / "level-overrides.json"

LEVELS = 30

#: How the four components combine. Frequency leads because it is the strongest
#: single predictor of whether a learner has already met a word; it leads by a
#: third rather than by a mile because on its own it produced 것 at level 1.
WEIGHTS = {"frequency": 0.34, "utility": 0.26, "linguistic": 0.22, "semantic": 0.18}

#: Parts of speech, scored by how much work the word is beyond its meaning.
#:
#: The spread here is deliberately narrow, and the first draft's was not. At
#: 0.15 for a verb against 0.00 for a noun the term was worth about thirteen
#: levels once the weights were applied, and it put 놀다 at 20 and 덥다 at 21 —
#: words every Korean course teaches in its first month, filed as harder than
#: 지하실. A verb *is* more work than a noun: it has to be conjugated before it
#: can be said. It is not more work than that.
#:
#: A determiner keeps the largest cost because it is the one class that cannot
#: be learned from a picture or a translation — 무슨, 어느 and 온갖 differ by
#: how they are used and by nothing else.
POS_COST = {
    "noun": 0.00,
    "verb": 0.06,
    "adjective": 0.06,
    "numeral": 0.04,
    "pronoun": 0.10,
    "interjection": 0.12,
    "adverb": 0.25,
    "determiner": 0.40,
}

#: Registers, and what each costs a learner. `colloquial` costs nothing: a
#: colloquial word is one they will hear, which is the opposite of a problem.
REGISTER_COST = {
    "literary": 0.85,
    "historical": 0.80,
    "rare": 0.70,
    "formal": 0.45,
    "honorific": 0.45,
    "figurative": 0.40,
    "regional": 0.60,
    "slang": 0.35,
    "colloquial": 0.00,
}

#: Derivational patterns, and how much unpacking each needs. A 하다 verb built
#: on a noun the learner has is nearly free; -스럽다 changes the part of speech
#: and the meaning together.
DERIVATION_COST = {
    "hada": 0.10,
    "doeda": 0.35,
    "danghada": 0.55,
    "sikida": 0.55,
    "georida": 0.60,
    "daeda": 0.60,
    "dapda": 0.55,
    "ropda": 0.60,
    "seureopda": 0.65,
}


@dataclass(frozen=True)
class Components:
    frequency: float
    utility: float
    linguistic: float
    semantic: float

    def as_dict(self) -> dict[str, float]:
        return {
            "frequency": self.frequency,
            "utility": self.utility,
            "linguistic": self.linguistic,
            "semantic": self.semantic,
        }

    @property
    def score(self) -> float:
        values = self.as_dict()
        return round(sum(WEIGHTS[k] * values[k] for k in WEIGHTS), 4)


def frequency_cost(rank: int | None, per_million: float | None, observed_total: int) -> float:
    """0 for a word met every day, 1 for one the corpora never saw.

    Log rank rather than the rate, because the rate is dominated by a handful of
    grammatical words and puts everything else in the same thousandth. Log rank
    spreads the middle of the corpus, which is where nearly every taught word is.

    An unobserved word is 0.9 rather than 1.0. It is evidence of rarity and it
    is also evidence of a matcher that cannot see 담백한 — see
    `content/vocabulary/unobserved.json` — so it is not allowed to be the single
    hardest thing a word can be.
    """
    if rank is None:
        return 0.90
    top = math.log(max(2, observed_total))
    return min(1.0, math.log(max(1, rank)) / top)


def utility_cost(
    usefulness: int, semantics: str, category: str, part_of_speech: str = "", word: str = ""
) -> float:
    """How much a learner needs this word, and how easily they can picture it.

    `usefulness` is the editor's judgement, 1 to 5, and it is the part of this
    model that knows 사과 matters more than 것. Concreteness is the other half:
    a word for something that can be seen or done is learnable from a picture,
    and one for a relation is not.

    `category` is accepted and no longer used. It was a third term — a bonus for
    the six categories a beginner needs first — and it was double-counting:
    "how soon does a learner need this word" is precisely the question
    `usefulness` answers, and a word in the wrong shelf was being punished for
    an editorial decision about browsing.
    """
    del category
    editorial = (usefulness - 1) / 4
    return min(1.0, 0.65 * editorial + 0.35 * _concreteness(semantics, part_of_speech, word))


#: Templates that name something abstract, and what each costs.
#:
#: The template is the strong signal and the parts only refine it, which is the
#: opposite of how this was first written. Reading the parts first meant 놀다,
#: tagged `act:party|group`, scored 1.0 for abstractness because neither *party*
#: nor *group* is in a list of picturable nouns — and 놀다 is one of the most
#: picturable verbs in the language. Every maximally-useful verb in the corpus
#: was mis-scored the same way, which is what put 놀다 at level 19 and 덥다 at 20.
ABSTRACT_TEMPLATES = {
    "abs": 0.85, "neg": 0.85, "cmp": 0.80, "seq": 0.75,
    "mind": 0.65, "emo": 0.60, "feel": 0.60, "state": 0.55,
    "num": 0.45, "per": 0.40, "focus": 0.40,
}


#: Poles you can draw, taken from the tags the corpus actually uses.
#:
#: `CONCRETE_PARTS` next door is a list of picturable *nouns* — apple, door,
#: river. It cannot answer a `cmp:` or `seq:` tag, because those name the two
#: ends of a contrast rather than a thing: `cmp:short|long`, `seq:sit|stand`,
#: `seq:close|open`. Every one of those is as picturable as a noun — you can
#: draw a long line beside a short one — and none of them was in any list, so
#: the template's weight stood unchallenged and 길다 came out abstract.
#:
#: Grounded in the data rather than invented: every entry here appears in a
#: `cmp:` or `seq:` tag in `content/vocabulary/entries/`. What is deliberately
#: *not* here is the marginal half of that set — `time`, `scale-up`, `same`,
#: `good`, `bad`, `rule`, `balance`, `more`, `win`, `hard`, `sad`, `heart`,
#: `world`. Those really are abstractions, and a list that swept them in would
#: trade one silent mis-scoring for another in the opposite direction.
PICTURABLE_POLES = {
    "adult", "child", "clean", "close", "cold", "cross", "dark", "deep", "dirty",
    "elder", "empty", "far", "fast", "fill", "heavy", "high", "hot", "hurt",
    "light", "long", "low", "narrow", "near", "one", "open", "round", "short",
    "sick", "sit", "sleep", "slow", "smile", "stand", "sweet", "thin", "two",
    "wide",
}


#: The word classes a two-ended contrast is allowed to make concrete.
#:
#: An adjective names a quality and a plain verb names something a body does;
#: both can be drawn, and both are what the eighteen hand-moved words are. A
#: noun or a `-하다`/`-되다`/`-지다` derivation names a *relation or a process*,
#: and the picturable pair in its tag is an illustration of that relation
#: rather than its meaning — 회복 is tagged `seq:hurt|smile` and is not a
#: picture of a smile; 변화하다 is `seq:box|ball` and is not a picture of a
#: ball; 비교하다 is `cmp:one|two` and is not a picture of two of anything.
DRAWABLE_CLASSES = {"adjective", "verb"}

#: Suffixes that turn an abstract noun into a **verb**. The verb is no more
#: picturable than the noun it came from: 비교하다 is 비교 with a verb on the
#: end, and comparison is not a picture.
#:
#: Applied to verbs only. Korean adjectives are overwhelmingly 하다 forms —
#: 깨끗하다, 따뜻하다, 뚱뚱하다 — and excluding them takes the fix away from
#: exactly the words it was written for. An adjective names a quality whatever
#: its ending.
DERIVED_VERB_ENDINGS = ("하다", "되다", "지다")


def _concreteness(semantics: str, part_of_speech: str = "", word: str = "") -> float:
    """0 when the word names something you can see or do, 1 when it does not.

    ## Why an abstract template can be argued with, and only in one case

    This used to return the template's weight and stop, so anything tagged
    `cmp:` scored 0.80 and anything tagged `seq:` 0.75 *whatever the parts
    said* — a word was called unpicturable for having an opposite. 길다, 짧다,
    멀다, 가깝다, 열다 and 닫다 are among the most picturable words in the
    language and sat at levels 12 to 14 because of it; eighteen were moved by
    hand and the rule that put them there was left alone, so the next antonym
    pair would have landed in the same place. That is I-126.

    The exception is narrow on purpose, and it took two wrong drafts to get
    there:

    - Letting **every** abstract template be argued with by its parts moved 414
      words, all downward, taking 대출, 전세, 계약서 and 수수료 out of the high
      twenties into the teens. 예산 is `abs:money` and is an abstraction *about*
      money; 반응 is `abs:news` and is not a picture of a newspaper.
    - Letting a picturable pole count in the **non**-abstract branch moved 사망
      (`solo:cross`), 좀비 (`solo:dark`) and 스트레스 (`solo:heavy`). Those tags
      use a pole as an icon hint for the word's feel, not as its meaning.
    - Letting any word class take the discount moved 회복 (`seq:hurt|smile`),
      비교하다 (`cmp:one|two`) and 변화하다 (`seq:box|ball`). Those tags
      *illustrate* a relation with a picturable pair; the word is the relation,
      not the pair. Only an adjective or a plain verb takes the discount now —
      see `DRAWABLE_CLASSES`.

    So: a `cmp:` or `seq:` tag, with **two** parts, **both** picturable. That is
    a contrast whose ends are the whole of it — short against long, sit against
    stand, close against open — and it is exactly the shape the eighteen
    hand-moved words share. A one-part `cmp:` (모양 is `cmp:cloud`, 차이 is
    `cmp:picture`) is an icon hint again and keeps the template's weight.

    The template stays the strong signal everywhere else, because reading the
    parts first is the *older* failure — the one that put 놀다 at level 19.
    """
    from difficulty import CONCRETE_PARTS  # the same list, one definition

    template, _, rest = semantics.partition(":")
    names = [n for n in rest.split("|") if n]

    if template in ABSTRACT_TEMPLATES:
        drawable = (
            len(names) == 2
            and all(name in PICTURABLE_POLES or name in CONCRETE_PARTS for name in names)
            and part_of_speech in DRAWABLE_CLASSES
            and not (part_of_speech == "verb" and word.endswith(DERIVED_VERB_ENDINGS))
        )
        if template in ("cmp", "seq") and drawable:
            # A shade above the 0.10 a named physical object gets: a contrast
            # still asks the learner to hold two things at once.
            return 0.15
        return ABSTRACT_TEMPLATES[template]

    if not names:
        return 0.35
    # A physical thing named in the tag settles it; otherwise the template has
    # already said the word is about an action, a body, a place or an object,
    # and that is concrete enough to picture.
    return 0.10 if any(name in CONCRETE_PARTS for name in names) else 0.35


def linguistic_cost(
    *,
    word: str,
    part_of_speech: str,
    spelling: float,
    irregular: bool,
    signals: dict,
) -> float:
    """How much machinery the learner has to handle to use the form at all.

    Syllable count, part of speech, spelling, irregular conjugation, the
    honorific system, and derivational shape. A compound *subtracts*: 손가락 is
    손 plus 가락 and a learner who has 손 is most of the way there, which is a
    real and often-missed asymmetry — being longer is a cost, being analysable
    is a discount.
    """
    length = min(1.0, (len(word) - 1) / 3)
    pos = POS_COST.get(part_of_speech, 0.30) / 0.50
    derivation = DERIVATION_COST.get(signals.get("derivation") or "", 0.0)
    honorific = 0.8 if signals.get("honorific") else 0.0
    compound_relief = 0.25 if signals.get("contains") else 0.0
    raw = (
        0.26 * length
        + 0.22 * pos
        + 0.14 * spelling
        + 0.12 * (1.0 if irregular else 0.0)
        + 0.12 * derivation
        + 0.10 * honorific
    )
    return max(0.0, min(1.0, raw - compound_relief * raw))


def semantic_cost(*, signals: dict, semantics: str) -> float:
    """How much has to be understood before the meaning lands.

    Polysemy and homography are the two that a learner meets as confusion
    rather than as difficulty: 배 is a stomach, a boat and a pear, and knowing
    one of them is not knowing the word. An idiom is the extreme case — 일석이조
    cannot be read at all, only known — so it is scored close to the ceiling.
    """
    senses = signals.get("senses", 1)
    polysemy = min(1.0, (senses - 1) / 4)
    homography = min(1.0, (signals.get("posEntries", 1) - 1) / 2)
    register = max((REGISTER_COST.get(r, 0.3) for r in signals.get("registers", [])), default=0.0)
    abstraction = _concreteness(semantics)
    sino_abstract = 0.5 if signals.get("sino") and abstraction > 0.6 else 0.0
    if signals.get("idiom"):
        return 0.95
    raw = (
        0.30 * polysemy
        + 0.18 * homography
        + 0.24 * register
        + 0.16 * abstraction
        + 0.12 * sino_abstract
    )
    return min(1.0, raw)


def components(
    *,
    word: str,
    part_of_speech: str,
    rank: int | None,
    per_million: float | None,
    observed_total: int,
    usefulness: int,
    semantics: str,
    category: str,
    spelling: float,
    irregular: bool,
    signals: dict,
) -> Components:
    return Components(
        frequency=frequency_cost(rank, per_million, observed_total),
        utility=utility_cost(usefulness, semantics, category, part_of_speech, word),
        linguistic=linguistic_cost(
            word=word, part_of_speech=part_of_speech, spelling=spelling,
            irregular=irregular, signals=signals,
        ),
        semantic=semantic_cost(signals=signals, semantics=semantics),
    )


#: Score thresholds. `BOUNDARIES[i]` is the highest score still at level i+1.
#:
#: Fixed, so a word's level does not move because another word was added, and
#: shaped rather than linear: the score distribution is bell-shaped, so equal
#: score widths would leave the ends empty and the middle unusable. These were
#: chosen by reading the anchors in `docs/VOCABULARY_LEVEL_CALIBRATION.md` at
#: each candidate ladder and are checked against them by `vocabulary:level:qa`.
BOUNDARIES = (
    0.2671, 0.2953, 0.3142, 0.3321, 0.3488,
    0.3611, 0.3759, 0.3913, 0.4036, 0.4145,
    0.4294, 0.4432, 0.4556, 0.4662, 0.4774,
    0.4895, 0.5010, 0.5100, 0.5206, 0.5304,
    0.5392, 0.5482, 0.5577, 0.5659, 0.5752,
    0.5872, 0.6007, 0.6156, 0.6292,
)


def level_of(score: float) -> int:
    """The 1–30 level a difficulty score falls in."""
    for index, edge in enumerate(BOUNDARIES):
        if score <= edge:
            return index + 1
    return LEVELS


#: How far up the scale a word's editorial usefulness lets it be carried.
#:
#: ## Why this is a ceiling and not a fifth weight
#:
#: `usefulness` is the one term in this file that directly answers *how soon
#: does a learner need this word*. It was one of four weighted costs, at 0.26 of
#: `utility`, which is 0.26 of a term that is itself half concreteness — so an
#: editor's judgement that a word is needed in the first week could be
#: outweighed by an irregular stem and a polysemous gloss, and repeatedly was.
#:
#: Measured on the shipping corpus: 363 words carry usefulness 1, the highest,
#: and **107 of them were above level 5**. 월요일, 화요일, 수요일, 목요일 and
#: 일요일 were at 9, 요일 itself at 9, 한국 at 10, 덥다 at 12, 심심하다 and
#: 시원하다 at 13, 비싸다 at 15. A beginner course that does not teach the days
#: of the week until level 9 is not teaching them when they are needed. 61
#: usefulness-2 words were above 13 and 48 usefulness-3 words above 21.
#:
#: That is what `content/vocabulary/level-overrides.json` had been asserting one
#: word at a time, which is why the list kept growing. A ceiling states it once,
#: reads a judgement already in the corpus, and applies to the next batch as
#: well as to this one.
#:
#: ## The bands are the product's own
#:
#: 5, 13 and 21 are the tops of `starter`, `everyday` and `confident` in
#: `domain/vocabularyLevel.ts`. A word an editor marked *needed first* belongs
#: in the band the product calls *starter*; one marked 2 in *everyday*, and so
#: on. Usefulness 4 and 5 have no ceiling: the scale's top is where they belong.
#:
#: ## It only ever moves a word down
#:
#: A clamp, not a rescale. A word the model already places inside its band is
#: untouched, and nothing is promoted — a rarely-needed word is not made hard by
#: this, it simply keeps the level the model gave it. `vocabulary:level:qa`
#: asserts both halves.
USEFULNESS_CEILING = {1: 5, 2: 13, 3: 21}


def ceiling_for(usefulness: int) -> int:
    """The highest level an editor's usefulness mark allows."""
    return USEFULNESS_CEILING.get(usefulness, LEVELS)


def apply_ceiling(modelled: int, usefulness: int) -> int:
    """The level a word ships at, once its usefulness is treated as a bound."""
    return min(modelled, ceiling_for(usefulness))


def load_signals() -> dict[str, dict]:
    return json.loads(SIGNALS.read_text(encoding="utf-8"))["words"]


def load_overrides() -> dict[str, int]:
    """The words a person moved, and where to.

    A `keep: true` row is the other kind of decision the file holds — the
    model's level is right and the check that flagged it was reading the wrong
    evidence — so it names no level and there is nothing here to apply.
    """
    if not OVERRIDES.exists():
        return {}
    data = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    return {
        word: row["level"]
        for word, row in data.get("words", {}).items()
        if "level" in row
    }
