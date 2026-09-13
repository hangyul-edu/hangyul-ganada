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

import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from conjugate import FREQUENCY_CLASSES, SUFFIX_CLASS, frequency_forms  # noqa: E402

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

#: The verb endings the fold strips, by class, live in `conjugate.SUFFIX_CLASS`.
#: 는, 도, 만, 요 and 야 are not among them: all are real verb endings and all
#: are also case particles, and keeping them would credit 우리는 and 우리가 —
#: the pronoun 'we' — to 우리다, the rare verb 'to steep'. The cost of leaving
#: them out is a small undercount on every verb, which is the same undercount
#: for all of them and therefore does not move the ranking.
VERB_SUFFIXES = ("", *SUFFIX_CLASS)

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


def _korean_lemmas() -> frozenset[str]:
    """Every Korean lemma Wiktionary knows, as a set of titles.

    A whole-token form that is itself a dictionary word is not counted for an
    inflected headword: 한 is the adnominal of 하다 and also *one*; 간 is 가다's
    and also *liver*; 건 is 걸다's and also *thing*. The recogniser may accept
    them in a sentence; a counter cannot tell which word a corpus meant. The
    list is external to this repository's own choices, which is the point.
    """
    path = CACHE / "Category_Korean_lemmas.json"
    if not path.exists():
        return frozenset()
    data = json.loads(path.read_text(encoding="utf-8"))
    titles = data if isinstance(data, list) else data.get("titles", [])
    return frozenset(t for t in titles if isinstance(t, str))


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


def _fold_by_class(counts: dict[str, int], claimed: frozenset[str]) -> dict[str, dict[str, int]]:
    """The verb fold, once per ending class — see `conjugate.FREQUENCY_CLASSES`.

    A base is only credited with the endings its shape can take: 걸 before a
    vowel belongs to 걷다 and 걸다 both, 걸 before 고 to 걸다 alone, and one
    table for all endings could not say which was which.
    """
    tables: dict[str, dict[str, int]] = {cls: {} for cls in FREQUENCY_CLASSES}
    for token, count in counts.items():
        if token in claimed:
            continue
        for suffix, cls in SUFFIX_CLASS.items():
            if token.endswith(suffix):
                form = token[: -len(suffix)]
                if form:
                    table = tables[cls]
                    table[form] = table.get(form, 0) + count
    return tables


def measure(words: list[str], inflecting: frozenset[str] = frozenset()) -> dict[str, Reading]:
    """Read every word against every corpus.

    `inflecting` names the words that are verbs or adjectives, so their stems
    are matched against verb endings rather than against case particles.

    ## Forms two headwords can produce

    걷다 (walk) is ㄷ-irregular and conjugates to 걸어; 걸다 (hang, call) has
    the stem 걸 and conjugates to 걸어 as well. 듣다 gives 들어 and so does
    들다. 살다 drops its ㄹ before 세요 and 니까, so its ㄹ-less stem 사 is also
    the whole stem of 사다; 가다's future 갈 is the stem of 갈다 (grind); 잘 is
    the future of 자다 and the stem of 잘다. Every one of those strings used to
    be credited in full to *each* word that could produce it, which is how
    걸다 came to rank 21st in Korean, 갈다 28th, 들다 66th and 잘다 83rd —
    words a beginner does not need, ranked beside 하다. The recogniser's
    generosity was the cause: 잇다 was handed 있어요 because 이 + ㅆ is 있, and
    살다 was handed 사고 and 사요 because its ㄹ-less stem is spelled 사.

    So counting has its own form model, `conjugate.frequency_forms`: a stem is
    paired with the classes of ending its shape takes, the corpus is folded
    once per class, and a whole token that is itself a dictionary lemma (한,
    간, 건, 잔) is not counted for anybody. What is *still* shared — 걸 before a
    vowel, 사 before 세요 — is read in two passes: everything only one headword
    can produce is counted first, then each shared string's count is divided
    among its owners in proportion to that unambiguous evidence. Dropping
    shared strings outright was tried and ranked 있다 118th and 사다 2,454th,
    which is the same defect facing the other way. Nothing is invented and
    nothing is counted twice: a shared count is conserved across its owners.
    """
    claimed = frozenset(words)
    lemmas = _korean_lemmas()
    rates: dict[str, list[float]] = {word: [] for word in words}
    seen_in: dict[str, list[str]] = {word: [] for word in words}

    # Every (base, class) and every whole token an inflecting headword can put
    # in a corpus, and who owns each.
    bases_of: dict[str, dict[str, frozenset[str]]] = {}
    tokens_of: dict[str, list[str]] = {}
    base_owners: dict[tuple[str, str], set[str]] = {}
    token_owners: dict[str, set[str]] = {}
    for word in words:
        if word not in inflecting:
            continue
        bases, tokens = frequency_forms(word, lemmas=lemmas, claimed=claimed)
        bases_of[word] = bases
        tokens_of[word] = tokens
        for base, classes in bases.items():
            for cls in classes:
                base_owners.setdefault((base, cls), set()).add(word)
        for token in tokens:
            token_owners.setdefault(token, set()).add(word)

    def token_shared_with(token: str, word: str) -> set[str]:
        # 사니까 is a whole token of 살다 and, stripped of 니까, the stem of 사다
        # in a class 사다 takes — the fold has credited it there already.
        owners = set(token_owners.get(token, ())) - {word}
        for suffix, cls in SUFFIX_CLASS.items():
            if token.endswith(suffix):
                base = token[: -len(suffix)]
                if base:
                    owners |= base_owners.get((base, cls), set()) - {word}
        return owners

    for name, filename in CORPORA:
        counts, total = _load(CACHE / filename)
        by_noun = _fold(counts, NOUN_SUFFIXES, claimed, bare=True)
        by_class = _fold_by_class(counts, claimed)
        per_million = 1_000_000 / max(1, total)

        # Pass one: what each word alone can explain.
        alone: dict[str, int] = {}
        shared: dict[tuple[str, str], tuple[int, frozenset[str]]] = {}
        for word in words:
            if word not in inflecting:
                alone[word] = by_noun.get(word, 0)
                continue
            hits = 0
            for base, classes in bases_of[word].items():
                for cls in classes:
                    count = by_class[cls].get(base, 0)
                    if not count:
                        continue
                    owners = base_owners[(base, cls)]
                    if len(owners) == 1:
                        hits += count
                    else:
                        shared[(cls, base)] = (count, frozenset(owners))
            for token in tokens_of[word]:
                count = counts.get(token, 0)
                if not count:
                    continue
                others = token_shared_with(token, word)
                if not others:
                    hits += count
                else:
                    shared[("token", token)] = (count, frozenset(others | {word}))
            alone[word] = hits

        # Pass two: shared strings, divided by the evidence each owner has alone.
        share: dict[str, float] = {word: 0.0 for word in words}
        for (_kind, _form), (count, owners) in shared.items():
            weights = {owner: float(alone.get(owner, 0)) for owner in owners}
            total_weight = sum(weights.values())
            for owner in owners:
                fraction = weights[owner] / total_weight if total_weight > 0 else 1 / len(owners)
                share[owner] += count * fraction

        for word in words:
            hits = alone[word] + share[word]
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


# --- Self-test -----------------------------------------------------------------


def _counted_by(word: str, lemmas: frozenset[str], claimed: frozenset[str]) -> tuple[set[str], set[str]]:
    """Every token `word` would be credited with, and the subset it shares.

    Enumerates the fold classes symbolically: a base with class C is credited
    with base + every C suffix, and so on. Whole tokens are their own entry.
    """
    bases, tokens = frequency_forms(word, lemmas=lemmas, claimed=claimed)
    strings: set[str] = set(tokens)
    for base, classes in bases.items():
        for suffix, cls in SUFFIX_CLASS.items():
            if cls in classes:
                strings.add(base + suffix)
    return strings, set()


def self_test() -> int:
    """Hold `frequency_forms` to `content/vocabulary/frequency-fixtures.json`."""
    import pack  # noqa: E402  (sibling module)

    fixtures = json.loads(
        (ROOT / "content" / "vocabulary" / "frequency-fixtures.json").read_text(encoding="utf-8")
    )["cases"]
    entries = pack.load()
    claimed = frozenset(word for word, entry in entries.items() if entry.keep)
    inflecting = frozenset(
        word
        for word, entry in entries.items()
        if entry.keep and word.endswith("다") and (entry.part_of_speech or "") in ("verb", "adjective", "")
    )
    lemmas = _korean_lemmas()
    if not lemmas:
        print("frequency self-test: no lemma list in content-cache — run fetch_dictionary.py first")
        return 1

    counted: dict[str, set[str]] = {}
    for word in inflecting:
        counted[word], _ = _counted_by(word, lemmas, claimed)

    failures = 0
    total = 0
    for case in fixtures:
        word = case["word"]
        mine = counted.get(word, set())
        others = {w for w, strings in counted.items() if w != word}
        for token in case.get("must_count", []):
            total += 1
            if token not in mine:
                failures += 1
                print(f"  FAIL {word}: {token} is not counted")
        for token in case.get("must_not_count", []):
            total += 1
            if token in mine:
                failures += 1
                print(f"  FAIL {word}: {token} is counted")
        for token in case.get("shared", []):
            total += 1
            owners = [w for w in others if token in counted[w]]
            if token not in mine or not owners:
                failures += 1
                print(f"  FAIL {word}: {token} should be shared with another headword (owners: {owners})")
    print(f"frequency self-test: {total - failures}/{total} fixture assertions hold ({len(fixtures)} words)")
    return 1 if failures else 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    print("usage: frequency.py --self-test")
