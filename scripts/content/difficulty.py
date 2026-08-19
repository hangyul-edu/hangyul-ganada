"""How hard a word is — as a word, not as a spelling exercise.

## The mistake this replaces

The first version of the dataset had one number called `curriculum_level`, and
it was derived from *which letters the word contains*. That is a real and useful
fact, but it is not difficulty: 맛있다 needs ㅆ, which the alphabet curriculum
teaches late, so 맛있다 — a word every learner meets in week one — was filed at
level 10 alongside 몰아넣다. A learner reading that screen would conclude that
"delicious" is advanced Korean.

Difficulty and letter readiness are now two separate things and are computed by
two separate pieces of code. This module answers *how hard is this word for a
Korean learner*. `readiness.py` answers *can I write it yet*, and neither is
allowed to contaminate the other.

## The features

| Feature | Why it belongs |
| --- | --- |
| Frequency | The single strongest predictor. A word you meet daily is easier. |
| Learner usefulness | Editorial. Corpora undercount 사과 and overcount 것. |
| Concreteness | 사과 can be drawn and checked in a glance; 상황 cannot. |
| Part of speech | A concrete noun is a first card; a determiner is not. |
| Syllable count | More syllables is more to hold, spell and recall. |
| Morphology | 요리하다 is 요리 + 하다; a compound is easier once you know its parts. |
| Polysemy | A word with four senses is four words to a beginner. |
| Spelling complexity | 받침, double consonants and compound vowels, weighted lightly. |
| Irregular conjugation | 듣다 → 들어요 is a rule the learner has to know. |

Spelling is *in* the model but weighted at a tenth of frequency, because it is a
genuine part of how hard a word is to learn and a small part of it. That is the
distinction the old `curriculum_level` collapsed.

## Reproducible

No randomness, no fitting to a held-out set, no hidden constants. The weights
are declared below, the features are pure functions of the word and its record,
and `--explain` prints the contribution of every term for any word, so a
surprising level can always be traced to the feature that caused it.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from conjugate import H_IRREGULAR, decompose  # noqa: E402
from hangul import syllables  # noqa: E402

#: Jamo that take longer to write well. Present as a *small* term, so a common
#: word never becomes advanced because of how it is spelled.
DOUBLE_CONSONANTS = set("ㄲㄸㅃㅆㅉ")
COMPOUND_VOWELS = set("ㅘㅙㅚㅝㅞㅟㅢㅐㅔㅒㅖ")
COMPLEX_FINALS = set("ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ")

#: Parts of speech, scored by how well they suit an early card. 0 is ideal.
POS_COST = {
    "noun": 0.00,
    "verb": 0.10,
    "adjective": 0.10,
    "numeral": 0.05,
    "pronoun": 0.15,
    "interjection": 0.20,
    "adverb": 0.30,
    "determiner": 0.45,
}

#: Concreteness tags that name a physical thing. A word that names an object a
#: learner could point at is concrete; one that names a relation or a change is
#: not, and abstractness is a real cost to a beginner meeting a word for the
#: first time. The tag on each pack entry was written by the editor who had to
#: answer exactly that question about the word.
CONCRETE_PARTS = {
    "apple", "bag", "ball", "bank", "bed", "bicycle", "bird", "boat", "bone", "book",
    "bottle", "bowl", "box", "bread", "bridge", "building", "bus", "butterfly", "cake",
    "camera", "candy", "car", "cat", "chair", "chicken", "chopsticks", "clock",
    "clothes", "cloud", "coffee", "computer", "cow", "cup", "dog", "door", "egg",
    "eye", "ear", "farm", "feather", "fire", "fish", "flag", "flower", "foot",
    "forest", "fridge", "fruit", "garden", "gift", "glasses", "grass", "hair",
    "hammer", "hand", "hat", "head", "horse", "hospital", "house", "ice", "insect",
    "island", "key", "kimchi", "knife", "lamp", "leaf", "leg", "letter", "map",
    "market", "meat", "milk", "mirror", "money", "moon", "mountain", "mouse",
    "mouth", "music", "news", "noodle", "nose", "paper", "park", "pencil", "phone",
    "picture", "pig", "plane", "plate", "pot", "rabbit", "rain", "rice", "river",
    "road", "room", "rope", "salt", "school", "scissors", "sea", "seed", "shoe",
    "shop", "sky", "snake", "snow", "soap", "soil", "soup", "spoon", "stairs",
    "star", "station", "stone", "sun", "table", "ticket", "tooth", "towel", "toy",
    "train", "tree", "tv", "umbrella", "vegetable", "village", "wall", "water",
    "wheel", "window", "world",
}

#: What each term contributes at its maximum. They sum to 1.0.
WEIGHTS = {
    "frequency": 0.34,
    "usefulness": 0.24,
    "concreteness": 0.10,
    "part_of_speech": 0.08,
    "length": 0.08,
    "polysemy": 0.06,
    "spelling": 0.06,
    "irregular": 0.04,
}


@dataclass(frozen=True)
class Features:
    frequency: float
    usefulness: float
    concreteness: float
    part_of_speech: float
    length: float
    polysemy: float
    spelling: float
    irregular: float

    def as_dict(self) -> dict[str, float]:
        return {
            "frequency": self.frequency,
            "usefulness": self.usefulness,
            "concreteness": self.concreteness,
            "part_of_speech": self.part_of_speech,
            "length": self.length,
            "polysemy": self.polysemy,
            "spelling": self.spelling,
            "irregular": self.irregular,
        }


def spelling_cost(word: str) -> float:
    """0–1 from the jamo, before weighting. Counts per syllable, not in total.

    A four-syllable word is already penalised by `length`; counting its jamo in
    total would penalise it twice for the same fact.
    """
    parts = syllables(word)
    if not parts:
        return 0.0
    finals = 0
    doubles = 0
    compounds = 0
    complex_finals = 0
    for syllable in parts:
        decomposed = decompose(syllable)
        if decomposed is None:
            continue
        initial, medial, final = decomposed
        from conjugate import FINALS, INITIALS, VOWELS  # local: avoids a cycle at import

        if final:
            finals += 1
            if FINALS[final] in COMPLEX_FINALS:
                complex_finals += 1
        if INITIALS[initial] in DOUBLE_CONSONANTS:
            doubles += 1
        if VOWELS[medial] in COMPOUND_VOWELS:
            compounds += 1
    count = len(parts)
    return min(
        1.0,
        0.35 * (finals / count)
        + 0.25 * (doubles / count)
        + 0.20 * (compounds / count)
        + 0.20 * (complex_finals / count),
    )


def is_irregular(word: str, part_of_speech: str) -> bool:
    """Whether the learner needs a conjugation rule beyond the regular one."""
    if part_of_speech not in ("verb", "adjective") or not word.endswith("다"):
        return False
    stem = word[:-1]
    if stem in H_IRREGULAR:
        return True
    decomposed = decompose(stem[-1]) if stem else None
    if decomposed is None:
        return False
    from conjugate import FINALS

    final = FINALS[decomposed[2]]
    # ㄷ, ㅂ, ㅅ and 르 stems all change shape before a vowel. ㄹ stems drop it
    # before ㄴ/ㅂ/ㅅ. All four are rules a beginner has to be taught.
    return final in ("ㄷ", "ㅂ", "ㅅ", "ㄹ") or stem.endswith("르")


def _concreteness(semantics: str) -> float:
    """0 when the word names a thing, 1 when it names a relation or a change."""
    template, _, rest = semantics.partition(":")
    names = rest.split("|")
    if template in ("neg", "cmp", "seq"):
        # These tags exist precisely because the word is a negation, a
        # comparison or a sequence rather than a thing.
        return 0.85
    concrete = sum(1 for name in names if name in CONCRETE_PARTS)
    return 1.0 - concrete / max(1, len(names))


def features(
    *,
    word: str,
    part_of_speech: str,
    frequency_score: float,
    usefulness: int,
    semantics: str,
    sense_count: int,
) -> Features:
    return Features(
        # Every feature is a *cost*: 0 easy, 1 hard.
        frequency=1.0 - min(1.0, max(0.0, frequency_score)),
        usefulness=(usefulness - 1) / 4,
        concreteness=_concreteness(semantics),
        part_of_speech=POS_COST.get(part_of_speech, 0.30) / 0.45,
        length=min(1.0, (len(syllables(word)) - 1) / 3),
        polysemy=min(1.0, (sense_count - 1) / 3),
        spelling=spelling_cost(word),
        irregular=1.0 if is_irregular(word, part_of_speech) else 0.0,
    )


def score(feature_set: Features) -> float:
    values = feature_set.as_dict()
    return round(sum(WEIGHTS[name] * values[name] for name in WEIGHTS), 4)


#: The feature names the app can turn into a sentence for a learner. Keeping
#: this list closed means a new feature cannot silently reach the UI without a
#: translation for it.
REASONS = tuple(WEIGHTS)


def baseline(feature_sets: list[Features]) -> dict[str, float]:
    """The average weighted contribution of each feature across the dataset."""
    if not feature_sets:
        return {name: 0.0 for name in WEIGHTS}
    totals = {name: 0.0 for name in WEIGHTS}
    for feature_set in feature_sets:
        values = feature_set.as_dict()
        for name in WEIGHTS:
            totals[name] += WEIGHTS[name] * values[name]
    return {name: totals[name] / len(feature_sets) for name in WEIGHTS}


def dominant(feature_set: Features, mean: dict[str, float]) -> str:
    """What makes *this* word harder than an average word in the set.

    Not simply the largest term. Frequency carries the most weight, so the
    largest term is "frequency" for almost every word, and a card that always
    says the same thing tells a learner nothing. Measuring each feature against
    its dataset average instead surfaces what is actually unusual about this
    word — that it is four syllables, or that it conjugates irregularly, or
    that it has five senses.
    """
    values = feature_set.as_dict()
    return max(WEIGHTS, key=lambda name: WEIGHTS[name] * values[name] - mean[name])


def explain(word: str, feature_set: Features) -> str:
    values = feature_set.as_dict()
    rows = sorted(values.items(), key=lambda kv: -WEIGHTS[kv[0]] * kv[1])
    body = "\n".join(
        f"    {name:<15} {value:>5.2f} x {WEIGHTS[name]:.2f} = {WEIGHTS[name] * value:.3f}"
        for name, value in rows
    )
    return f"  {word} -> {score(feature_set):.4f}\n{body}"


def tiers(scores: dict[str, float], count: int) -> dict[str, int]:
    """Bin scores into `count` tiers of roughly equal size, 1 = easiest.

    Equal-sized rather than equal-width, because the score distribution is
    bell-shaped and equal-width bins would put four fifths of the vocabulary in
    the middle two levels. A learner opening level 5 should find it about as
    long as level 4.
    """
    ordered = sorted(scores, key=lambda word: (scores[word], word))
    per_tier = len(ordered) / count
    return {word: min(count, int(index // per_tier) + 1) for index, word in enumerate(ordered)}
