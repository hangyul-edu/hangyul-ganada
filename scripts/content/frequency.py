"""Evidence-based frequency for every word that ships.

## The problem this replaces

The first version of the dataset ranked words against a 50,000-token subtitle
list. Half the vocabulary was not in it, and those words were given a mid-range
default — a number that looked like evidence and was not. Worse, the list only
contains *surface forms*: Korean subtitles say 먹어, 먹었어, 먹고 and never 먹다,
so every verb and adjective in the dictionary scored zero and had to be rescued
by an approximation.

## What this does instead

Two corpora, both open, are read in full:

* `ko_full.txt` — the 2018 OpenSubtitles Korean list, 688,129 tokens
* `ko_full_2016.txt` — the 2016 list, 299,195 tokens, an independent sample

For each word, every surface form the conjugator can produce is looked up, and
tokens are counted when they *are* that form or are that form followed by a
particle or ending. The counts become a rate per million, averaged over the two
corpora so a quirk of one year's subtitles does not decide a word's band.

## The honest part

A word the corpora never saw is recorded as `observed: false` with the band
`unobserved`. It is not given a rank, a rate, or a plausible-looking midpoint.
The difficulty model reads that state as information — an unobserved word is
usually a rarer word — rather than pretending the evidence exists.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from conjugate import derived_forms, stem_of, surface_forms, written_forms  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content-cache"

CORPORA = (
    ("opensubtitles-ko-2018", "ko_full.txt"),
    ("opensubtitles-ko-2016", "ko_full_2016.txt"),
)

#: What a token may carry after the word itself, split by what the word is.
#:
#: Korean glues grammar onto the end of a word, so 학교 appears in a corpus as
#: 학교, 학교에, 학교에서, 학교를. Matching a bare prefix would be wrong — 가
#: (the stem of 가다) is the first syllable of 가방, 가족 and 가게 — so a match
#: has to be the form itself or the form plus something from these lists.
#:
#: The split matters. 우리다 ('to steep') has the stem 우리, which is spelled
#: exactly like the pronoun 우리 ('we'). Counting 우리는 and 우리가 towards the
#: verb would make a rare cooking word the second most frequent in Korean.
#: Case particles attach to nouns; verb endings attach to stems; neither list
#: is allowed to claim the other's tokens.
NOUN_SUFFIXES = (
    "", "은", "는", "이", "가", "을", "를", "의", "에", "에서", "에게", "한테", "께",
    "와", "과", "랑", "이랑", "로", "으로", "도", "만", "부터", "까지", "보다",
    "처럼", "마다", "밖에", "이나", "나", "이라", "라", "이며", "며", "야", "이야",
    "요", "예요", "이에요", "입니다", "이다", "들", "님",
)

#: Only endings that cannot follow a bare noun.
#:
#: 는, 도, 만, 요 and 야 are all real verb endings, and all of them are also
#: case particles. Keeping them would credit 우리는 and 우리가 — the pronoun
#: 'we' — to 우리다, the rare verb 'to steep'. The cost of leaving them out is
#: a small undercount on every verb, which is the same undercount for all of
#: them and therefore does not move the ranking.
VERB_SUFFIXES = (
    "", "다", "고", "지", "게", "서", "면", "죠", "지만", "는데", "은데",
    "니까", "으니까", "아서", "어서", "아요", "어요", "았어", "었어", "았다", "었다",
    "습니다", "ㅂ니다", "자", "려고", "러", "던", "세요", "십니다", "십시오",
    "겠다", "겠어", "네요", "잖아", "더라",
)

_MAX_SUFFIX = max(len(s) for s in NOUN_SUFFIXES + VERB_SUFFIXES)


@dataclass(frozen=True)
class Reading:
    """What the corpora saw of one word."""

    observed: bool
    #: Occurrences per million tokens, averaged across corpora. None if unobserved.
    rate: float | None
    #: Rank among the words in this dataset, 1 = most frequent. None if unobserved.
    rank: int | None
    band: str
    #: Which corpora contributed, for the provenance sheet.
    corpora: tuple[str, ...]


#: Bands, by occurrences per million. The cuts are round numbers on a log scale
#: rather than quantiles of this dataset, so a word's band does not change
#: because a different word was added or removed.
BANDS: tuple[tuple[float, str], ...] = (
    (500.0, "very-common"),
    (100.0, "common"),
    (20.0, "moderate"),
    (4.0, "uncommon"),
    (0.0, "rare"),
)

UNOBSERVED = "unobserved"

#: Every band the app may see, in order, so the UI can map them to labels.
ALL_BANDS = tuple(name for _, name in BANDS) + (UNOBSERVED,)


def _load(path: Path) -> tuple[dict[str, int], int]:
    counts: dict[str, int] = {}
    total = 0
    if not path.exists():
        raise SystemExit(f"{path} is missing — run fetch_dictionary.py first")
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) != 2 or not parts[1].isdigit():
            continue
        count = int(parts[1])
        counts[parts[0]] = count
        total += count
    return counts, total


def _fold(
    counts: dict[str, int], suffixes: tuple[str, ...], claimed: frozenset[str], bare: bool
) -> dict[str, int]:
    """Corpus counts folded back onto the forms that could have produced them.

    Rather than asking, for each of 2,800 words and each of its surface forms,
    which of 688,129 tokens match — which is tens of millions of prefix tests —
    this walks the corpus once and, for every token, strips each ending it could
    be carrying. 학교에서 contributes its count to 학교; 먹었어 contributes to 먹.
    Looking a form up afterwards is a dictionary hit.

    `claimed` holds every headword. A token that is itself a headword is credited
    only to that headword: 그리고 is the conjunction, not 그리다 wearing an ending.
    `bare` decides whether a token with no ending at all counts — it does for
    nouns, where the bare form is the word, and it does not for verb stems,
    where a bare 우리 is the pronoun rather than the stem of 우리다.
    """
    folded: dict[str, int] = {}
    for token, count in counts.items():
        for suffix in suffixes:
            if suffix:
                if not token.endswith(suffix):
                    continue
                form = token[: -len(suffix)]
                if not form or token in claimed:
                    continue
            else:
                if not bare:
                    continue
                form = token
            folded[form] = folded.get(form, 0) + count
    return folded


def _reachable_by_fold(token: str, forms: "dict[str, None] | set[str]") -> bool:
    """Would the suffix fold already have credited this token to this word?

    Only if stripping one of the verb endings off it leaves a form the word
    actually has. 먹어요 minus 어요 is 먹, so the fold has it and adding it here
    would count it twice; 감사합니다 minus 다 is 감사합니, which is not a form of
    anything, so the fold silently dropped it and it belongs here.
    """
    for suffix in VERB_SUFFIXES:
        if suffix and token.endswith(suffix):
            base = token[: -len(suffix)]
            if base and base in forms:
                return True
    return False


def measure(words: list[str], inflecting: frozenset[str] = frozenset()) -> dict[str, Reading]:
    """Read every word against every corpus.

    `inflecting` names the words that are verbs or adjectives, so their stems
    are matched against verb endings rather than against case particles.
    """
    claimed = frozenset(words)
    rates: dict[str, list[float]] = {word: [] for word in words}
    seen_in: dict[str, list[str]] = {word: [] for word in words}

    for name, filename in CORPORA:
        counts, total = _load(CACHE / filename)
        by_noun = _fold(counts, NOUN_SUFFIXES, claimed, bare=True)
        by_verb = _fold(counts, VERB_SUFFIXES, claimed, bare=False)
        per_million = 1_000_000 / max(1, total)
        for word in words:
            if word in inflecting:
                # The dictionary form 먹다 never appears in a subtitle; the
                # conjugated forms are the only evidence there is.
                forms = dict.fromkeys(f for f in surface_forms(word) if f != word)
                table = by_verb
            else:
                forms = dict.fromkeys([word])
                table = by_noun
            hits = sum(table.get(form, 0) for form in forms)
            if word in inflecting:
                # Tokens the fold structurally cannot produce: 감사합니다,
                # where the ㅂ is inside 합, and 감사해요, where nothing
                # strippable sits on the end. `_reachable_by_fold` drops any
                # form the fold already credited, so nothing is counted twice.
                hits += sum(
                    counts.get(form, 0)
                    for form in written_forms(word)
                    if form not in claimed and not _reachable_by_fold(form, forms)
                )
            if word in inflecting and stem_of(word) not in claimed:
                # Whole-token forms, matched exactly. See conjugate.derived_forms
                # for why these cannot go through the suffix fold.
                #
                # Skipped when the stem is itself a headword noun: 말다 has the
                # stem 말, and 말 is the noun 'words', so 말을 and 말은 are the
                # noun carrying an object or topic marker far more often than
                # they are the verb. Giving those to 말다 would rank a marginal
                # auxiliary alongside 하다.
                hits += sum(
                    counts.get(form, 0)
                    for form in derived_forms(word)
                    if form not in claimed
                )
            if hits:
                rates[word].append(hits * per_million)
                seen_in[word].append(name)
            else:
                rates[word].append(0.0)

    averaged = {word: sum(values) / max(1, len(values)) for word, values in rates.items()}
    ordered = sorted((w for w in words if averaged[w] > 0), key=lambda w: -averaged[w])
    ranks = {word: index for index, word in enumerate(ordered, start=1)}

    readings: dict[str, Reading] = {}
    for word in words:
        rate = averaged[word]
        if rate <= 0:
            readings[word] = Reading(False, None, None, UNOBSERVED, ())
            continue
        band = next(name for cut, name in BANDS if rate >= cut)
        readings[word] = Reading(True, round(rate, 3), ranks[word], band, tuple(seen_in[word]))
    return readings


def score(reading: Reading, total_observed: int) -> float:
    """0–1, where 1 is the most frequent word in the dataset.

    Log of the rank rather than of the rate: the difference between the first
    and the hundredth word matters far more to a learner than the difference
    between the four-thousandth and the four-thousand-and-hundredth, and a
    linear scale says the opposite.
    """
    if not reading.observed or reading.rank is None:
        return 0.0
    return max(0.0, 1.0 - math.log(reading.rank) / math.log(total_observed + 1))
