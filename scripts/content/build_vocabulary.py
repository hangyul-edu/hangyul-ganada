#!/usr/bin/env python3
"""Builds the vocabulary dataset the app ships.

    python3 scripts/content/fetch_dictionary.py     # once, or when refreshing
    python3 scripts/content/build_vocabulary.py     # as often as you like

Three inputs, each answering a different question:

| Input | Answers |
| --- | --- |
| `content-cache/wikitext.jsonl` | which Korean words exist, and their part of speech |
| `content/vocabulary/entries/*.jsonl` | what ships, what it means in eight languages, how it is used, how it is drawn |
| `content-cache/ko_full*.txt` | how often Korean actually says it |

The editorial pack is the gate. A word the dictionary contains but the pack has
not reviewed does not ship, and a word the pack marks `k: 0` does not ship and
carries the reason it was cut. That inversion is the point of this cycle: the
dataset is now a reviewed corpus rather than an import with a filter on it.

## The numbers, and why they are separate

| Field | Question | Where it comes from |
| --- | --- | --- |
| `frequency` | How often does Korean say this? | two OpenSubtitles corpora, measured |
| `difficulty` | How hard is this word to learn? | `difficulty.py`, nine features |
| `readiness` | Can I write it with the letters I know? | `readiness.py`, the alphabet order |
| `usefulness` | How much does a beginner need it? | the editorial pack |

The previous version had one number doing all four jobs, which is how 맛있다
ended up at level 10. Difficulty and readiness are now computed by two modules
that do not import each other, and the app shows them in two different places.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import curation  # noqa: E402
import difficulty  # noqa: E402
import frequency
import categories
import gloss  # noqa: E402
import pack  # noqa: E402
import pronunciation  # noqa: E402
import readiness  # noqa: E402
import sources  # noqa: E402
from hangul import (  # noqa: E402
    CURRICULUM_ORDER,
    is_hangul_word,
    revised_romanization,
    romanize,
    syllables,
)
from conjugate import appears_in  # noqa: E402
from wiktionary import Entry, parse_entries  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content-cache"
OUT = ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.json"

#: Hand-written copy for locales that arrived after the corpus. See the note
#: where these are emitted, below.
SUPPLEMENTARY = ROOT / "content" / "vocabulary" / "copy"

#: How many difficulty levels the product has.
#:
#: Eight, not the ten the first implementation happened to pick. Ten was never
#: chosen; it was inherited. Six puts four hundred and fifty words in a level,
#: which is too many to feel like progress. Ten puts two hundred and seventy in
#: each and the middle levels stop being distinguishable. Eight is ~340 words a
#: level and the score bands stay visibly apart, which is the test that matters:
#: a learner should be able to feel that level 6 is harder than level 3.
LEVELS = 8

MAX_SYLLABLES = 4
WORDS_PER_LESSON = 5

_POS_PREFERENCE = ["noun", "verb", "adjective", "numeral", "pronoun", "interjection", "adverb", "determiner"]


def load_wikitext() -> dict[str, str]:
    path = CACHE / "wikitext.jsonl"
    if not path.exists():
        raise SystemExit(f"{path} is missing — run fetch_dictionary.py first")
    pages: dict[str, str] = {}
    for line in path.open(encoding="utf-8"):
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("wikitext"):
            pages[row["title"]] = row["wikitext"]
    return pages


def usable_senses(entry: Entry) -> list[str]:
    """Dictionary glosses worth keeping, cleaned."""
    from wiktionary import BLOCKED_LABELS

    out: list[str] = []
    for sense in entry.senses:
        if any(label.lower() in BLOCKED_LABELS for label in sense.labels):
            continue
        gloss = sense.gloss.strip()
        if sum(1 for ch in gloss if ch.isalpha()) < 2 or len(gloss) > 90:
            continue
        if any(pattern in gloss.lower() for pattern in curation.BLOCKED_GLOSS_PATTERNS):
            continue
        if any("가" <= ch <= "힣" for ch in gloss):
            continue
        if gloss not in out:
            out.append(gloss)
    return out


def choose_entry(entries: list[Entry]) -> Entry | None:
    scored = [(e, usable_senses(e)) for e in entries]
    scored = [(e, g) for e, g in scored if g]
    if not scored:
        return None
    scored.sort(
        key=lambda pair: (
            _POS_PREFERENCE.index(pair[0].part_of_speech)
            if pair[0].part_of_speech in _POS_PREFERENCE
            else len(_POS_PREFERENCE),
            -len(pair[1]),
        )
    )
    return scored[0][0]


def word_id(word: str, taken: set[str]) -> str:
    """`word_sagwa`. ASCII, stable, and readable in a directory listing."""
    base = f"word_{romanize(word)}"
    if base not in taken:
        taken.add(base)
        return base
    index = 2
    while f"{base}_{index}" in taken:
        index += 1
    taken.add(f"{base}_{index}")
    return f"{base}_{index}"


#: Interned field lists, so provenance is written once rather than per word.
_FIELD_SETS: list[list[str]] = []


def _field_set(fields: list[str]) -> int:
    if fields not in _FIELD_SETS:
        _FIELD_SETS.append(fields)
    return _FIELD_SETS.index(fields)


_SOURCE_ORDER = [s.id for s in sources.ALL_SOURCES]


def sense_id(identifier: str, gloss: str) -> str:
    """A stable name for the single sense a learning card teaches.

    `word_cha#car`, not `word_cha#1`. A number is a position and positions move:
    re-scoring difficulty re-orders the corpus, and an id built from an index
    would silently repoint every reference that had been written against it. The
    first substantive word of the English gloss moves only when the gloss does.

    Deliberately the same shape as the dictionary's `dict_cha#car`, so that a
    taught sense and the dictionary sense it corresponds to can be compared by
    eye as well as by code.
    """
    text = unicodedata.normalize("NFKD", (gloss or "").lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    skip = {"to", "a", "an", "the", "of", "be", "being", "used", "for", "in", "on", "at"}
    for token in re.findall(r"[a-z]+", text):
        if token not in skip and len(token) > 1:
            return f"{identifier}#{token}"
    return f"{identifier}#sense"


def build_provenance(*, observed: bool, gloss_from_dictionary: bool) -> list[list[int]]:
    entries: list[list[int]] = []
    if gloss_from_dictionary:
        entries.append(
            [_SOURCE_ORDER.index(sources.WIKTIONARY.id), _field_set(["part_of_speech", "meaning:en"])]
        )
    else:
        entries.append([_SOURCE_ORDER.index(sources.WIKTIONARY.id), _field_set(["part_of_speech"])])
    if observed:
        entries.append(
            [
                _SOURCE_ORDER.index(sources.OPENSUBTITLES_FREQUENCY.id),
                _field_set(["frequency_band", "frequency_rank", "frequency_rate"]),
            ]
        )
    entries.append(
        [
            _SOURCE_ORDER.index(sources.HANGYUL_GANADA.id),
            _field_set(
                [
                    "difficulty",
                    "example",
                    "example_translations",
                    "meanings",
                    "romanization",
                    "readiness",
                    "required_jamo",
                    "syllables",
                    "usefulness",
                ]
            ),
        ]
    )
    return entries


def surface_in(word: str, sentence: str) -> str | None:
    """The whole eojeol the example writes this word as, when it differs.

    The *eojeol*, not the matched stem. `appears_in` answers "is it there" and
    returns the longest form it recognised, which for 있다 in 재미있어요 is the
    bare 있 — and telling a learner that 있다 appears as 있 is telling them
    something that is technically true and no use at all. What they can act on
    is the word they can see on the card: 있어요.

    Only asked of verbs and adjectives, and that restriction is section 20's
    point rather than an optimisation. A noun in a sentence carries a particle —
    차 appears as 차를 — and saying so would put a note on almost every card to
    teach something the particle itself is already teaching. What a learner
    genuinely stumbles over is that the word they just met as 먹다 is written
    먹어요 four lines further down and looks like a different word.

    Returns None when the example writes the dictionary form unchanged.
    """
    found = appears_in(word, sentence)
    if found is None:
        return None
    for chunk in sentence.split():
        chunk = chunk.strip("…·.,!?;:\"'“”‘’()~")
        if found in chunk:
            return None if chunk == word else chunk
    return None if found == word else found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the output would change")
    args = parser.parse_args()

    entries = pack.load()
    kept = {word: entry for word, entry in entries.items() if entry.keep}
    if not kept:
        raise SystemExit("the editorial pack is empty — nothing to build")

    pages = load_wikitext()
    by_word: dict[str, list[Entry]] = defaultdict(list)
    for title, wikitext in pages.items():
        for entry in parse_entries(title, wikitext):
            by_word[title].append(entry)

    missing_from_dictionary: list[str] = []
    unusable_english: list[tuple[str, str, list[str]]] = []
    records: list[dict] = []
    pos_by_word: dict[str, str] = {}
    english: dict[str, tuple[str, str | None]] = {}
    topics_by_word: dict[str, list[str]] = {}

    for word, entry in kept.items():
        if not is_hangul_word(word) or not 1 <= len(word) <= MAX_SYLLABLES:
            raise SystemExit(f"{word}: not a writable Korean word of 1–{MAX_SYLLABLES} syllables")
        dictionary = choose_entry(by_word.get(word, []))
        if dictionary is None and entry.english is None:
            missing_from_dictionary.append(word)
            continue
        glosses = usable_senses(dictionary) if dictionary else []
        meaning = entry.english or (glosses[0] if glosses else None)
        if meaning is None:
            missing_from_dictionary.append(word)
            continue
        pos_by_word[word] = entry.part_of_speech or (
            dictionary.part_of_speech if dictionary else "noun"
        )
        topics_by_word[word] = list(dictionary.categories) if dictionary else []
        # The English meaning has to clear the same bar as the seven written
        # ones. A Wiktionary gloss often does — "apple" is "apple" — and where
        # it does not, the pack's `en` override is how it gets written. There is
        # no third option: a gloss that reads like a dictionary entry does not
        # reach a learner.
        faults = gloss.problems(word, pos_by_word[word], meaning)
        if faults:
            unusable_english.append((word, meaning, faults))

        # The dictionary's *other* senses, kept as a polysemy signal for
        # difficulty and deliberately not shown to a learner — see where the
        # copy rows are written, below.
        extra = [g for g in glosses[1:3] if g != meaning]
        english[word] = (meaning, "; ".join(extra) if extra else None)

    if unusable_english:
        for word, meaning, faults in unusable_english[:10]:
            print(f"  {word}: {meaning!r} — {'; '.join(faults)}")
        raise SystemExit(
            f"{len(unusable_english)} English meaning(s) are dictionary glosses "
            "rather than beginner meanings — add an `en` override to the pack"
        )

    if missing_from_dictionary:
        for word in missing_from_dictionary[:10]:
            print(f"  no usable dictionary entry and no `en` override: {word}")
        raise SystemExit(f"{len(missing_from_dictionary)} pack word(s) cannot be built")

    words = sorted(pos_by_word)
    inflecting = frozenset(w for w in words if pos_by_word[w] in ("verb", "adjective"))
    readings = frequency.measure(words, inflecting)
    total_observed = max(1, sum(1 for r in readings.values() if r.observed))

    scores: dict[str, float] = {}
    feature_sets: dict[str, difficulty.Features] = {}
    for word in words:
        meaning, definition = english[word]
        senses = 1 + (definition or "").count(";") + meaning.count(",")
        feature_set = difficulty.features(
            word=word,
            part_of_speech=pos_by_word[word],
            frequency_score=frequency.score(readings[word], total_observed),
            usefulness=kept[word].usefulness,
            semantics=kept[word].semantics,
            sense_count=senses,
        )
        feature_sets[word] = feature_set
        scores[word] = difficulty.score(feature_set)
    levels = difficulty.tiers(scores, LEVELS)
    mean = difficulty.baseline(list(feature_sets.values()))

    taken: set[str] = set()
    locale_ids = ["en", *[pack.LOCALE_IDS[loc] for loc in pack.MEANING_LOCALES]]
    copy_by_locale: dict[str, list] = {loc: [] for loc in locale_ids}
    for word in sorted(words, key=lambda w: (levels[w], scores[w], w)):
        entry = kept[word]
        meaning, definition = english[word]
        primary_category, secondary_categories = categories.classify(
            word, pos_by_word[word], meaning, topics_by_word.get(word, [])
        )
        reading = readings[word]
        ready = readiness.measure(word)
        if ready.unknown:
            raise SystemExit(f"{word} needs letters outside the curriculum: {ready.unknown}")

        # The learner's language is one of eight, and a learner reads one of
        # them. Meanings and example translations therefore live in a file per
        # locale rather than in eight columns on every word: a German learner
        # downloads German, not 696 KB of every language at once.
        #
        # Korean carries no translation of the example — the sentence is already
        # Korean, and glossing it back into Korean is noise on the card.
        for loc in ("en", *pack.MEANING_LOCALES):
            copy_by_locale[pack.LOCALE_IDS.get(loc, loc)].append(
                [
                    meaning if loc == "en" else entry.meanings[loc],
                    None if loc == "ko" else entry.translations[loc],
                    # The third slot is the long definition, and it carries
                    # writing or it carries nothing.
                    #
                    # It used to carry `definition` — the dictionary's second
                    # and third senses, joined with a semicolon — under a
                    # heading that reads "More about it". Reading the 784 words
                    # that had one is what settled it: 개 "someone who does the
                    # bidding of another", 문 "phylum", 산 "graveyard", 전기
                    # "prophase", 얼굴 "visage". Two filters were written and
                    # both were abandoned; the strict one still leaves 새 as
                    # "straw thatch used for roofing" and 좋다 as its own
                    # meaning repeated. The text is a dictionary talking about
                    # a word, which is the exact thing `gloss.py` exists to keep
                    # away from a beginner, and no rule turns it into writing.
                    #
                    # `entry.definitions` is the replacement: authored per
                    # locale in the pack, all eight languages or none, and
                    # present only on the words where a one-line gloss actually
                    # misleads. It is on 25 words today, not 784, which is the
                    # section working rather than the section being everywhere.
                    entry.definitions.get(loc) or None,
                ]
            )

        # The authoritative standard pronunciation, where this word has one that
        # differs from its spelling. Read once, because two things need it: the
        # note a learner sees under the word, and the romanisation, which the
        # standard bases on pronunciation rather than on spelling.
        sound_note = pronunciation.note_for(word)
        spoken_form = pronunciation.spoken_form(word)

        identifier = word_id(word, taken)
        records.append(
            {
                "id": identifier,
                "word": word,
                # The one sense this card teaches, named.
                #
                # Every locale's meaning, every example, every distractor and
                # every relation on this entry is *about this sense* and about
                # no other. Before it existed that was a convention held by
                # eleven exact-string pins, and 103 glosses quietly broke it —
                # 차 read "a car, or the tea you drink" on a beginner's card, so
                # a learner asked what 차 means had two right answers and one
                # button.
                #
                # Derived from the English gloss because English is the one
                # locale that was already single-sense throughout, which makes
                # it the arbiter rather than merely the default: when the Korean
                # and Japanese glosses for 차 name two things and the English
                # names one, it is the English that is right about what this
                # card teaches. `vocabulary:sense:qa` checks the others against
                # it. See `sense_id`.
                "senseId": sense_id(identifier, meaning),
                # Official Revised Romanisation (국어의 로마자 표기법), derived
                # from the standard pronunciation and not from the letters. See
                # `revised_romanization` for the two words that proved the
                # difference matters.
                "romanization": revised_romanization(word, spoken_form),
                "part_of_speech": pos_by_word[word],
                "example": entry.example,
                # `[band index, rank, rate]`, and `observed` is `rank !== null`.
                # The four field names repeated 2,504 times were 100 KB.
                "f": [
                    frequency.ALL_BANDS.index(reading.band),
                    reading.rank,
                    reading.rate,
                ],
                "difficulty_score": scores[word],
                "difficulty_level": levels[word],
                # An index into `difficulty_reasons`, not the string.
                "r": list(difficulty.REASONS).index(
                    difficulty.dominant(feature_sets[word], mean)
                ),
                "usefulness": entry.usefulness,
                # The category a learner browses by, as an index into
                # `categories`. Every word has exactly one; `secondary` holds the
                # others it touches, which search and recommendations use and
                # the browsing structure deliberately does not.
                "c": categories.CATEGORY_IDS.index(primary_category),
                "ct": [categories.CATEGORY_IDS.index(t) for t in secondary_categories],
                "letters_ready_after": ready.ready_after,
                # The letters this word needs, as a bitmask over `letter_order`
                # rather than an array of them. The list form was 71 KB; this is
                # 20 KB and, more importantly, keeps the compound-jamo table
                # (ㅘ = ㅗ + ㅏ) in one language instead of copying it into
                # TypeScript where the two could drift.
                #
                # `syllables` is not stored at all: it is `[...word]`, and the
                # app has that.
                "j": sum(
                    1 << CURRICULUM_ORDER.index(letter)
                    for letter in ready.letters
                ),
                "prov": build_provenance(
                    observed=reading.observed, gloss_from_dictionary=entry.english is None
                ),
                # How it is actually said, and which pattern makes it differ —
                # but only where a learner would get it wrong by reading the
                # spelling. Absent on the great majority of words, which is the
                # point: a note on every card is a note nobody reads. See
                # `pronunciation.py`.
                **({"say": sound_note[0], "sayWhy": sound_note[1]} if sound_note else {}),
                # Where the example writes the word in a different form —
                # 먹다 appearing as 먹어요. Stored rather than derived in the
                # app, because deriving it needs the conjugator and there must
                # be exactly one of those. Absent when the two are the same.
                **(
                    {"as": surface}
                    if pos_by_word[word] in ("verb", "adjective")
                    and (surface := surface_in(word, entry.example))
                    else {}
                ),
            }
        )

    # Read before the payload is assembled, because the payload has to name
    # them: see the note on "locales" below.
    supplementary_ids = [
        json.loads(path.read_text(encoding="utf-8"))["locale"]
        for path in sorted(SUPPLEMENTARY.glob("*.json"))
    ]

    payload = {
        "_comment": (
            "GENERATED by scripts/content/build_vocabulary.py from the editorial pack in "
            "content/vocabulary/entries/. Do not edit by hand — edit the pack and rebuild."
        ),
        "generator": "hangyul-ganada-vocabulary-v2",
        "letter_order": CURRICULUM_ORDER,
        # Every language a pack ships for, not only the eight the entries carry.
        #
        # This list is what `WORD_COPY_LOCALES` becomes in the app, and the
        # language picker now uses it to tell a learner, before they choose,
        # whether word meanings will be in their language or in English. Leaving
        # the two hand-written packs out of it made the app say Vietnamese and
        # Thai had no meanings while shipping 2,581 of each — a false warning,
        # which is worse than no warning.
        "locales": [*locale_ids, *supplementary_ids],
        "levels": LEVELS,
        "difficulty_reasons": list(difficulty.REASONS),
        # The browsing taxonomy, in picker order. Ids only — the names are
        # translated in the app, because "Food & Drink" is interface copy.
        "categories": list(categories.CATEGORY_IDS),
        "frequency_bands": list(frequency.ALL_BANDS),
        # The sound-change patterns a word may be tagged with. Closed, so a new
        # pattern cannot reach a learner without a translation for it.
        "sound_patterns": [name for name, _ in pronunciation.PATTERNS],
        "words_per_lesson": WORDS_PER_LESSON,
        "sources": [
            {
                "id": s.id,
                "name": s.name,
                "license": s.license,
                "license_url": s.license_url,
                "homepage": s.homepage,
                "provides": s.provides,
                "attribution": s.attribution,
                "reference_template": s.reference_template,
                "derived": s.derived,
            }
            for s in sources.ALL_SOURCES
        ],
        "field_sets": _FIELD_SETS,
        "words": records,
    }

    def dump(value: object) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"

    #: One file per locale, each aligned index-for-index with `words`.
    #: `[meaning, example translation | null, long definition | null]`.
    outputs = {OUT: dump(payload)}
    for locale, rows in copy_by_locale.items():
        outputs[OUT.with_name(f"vocabulary.{locale}.json")] = dump(
            {"locale": locale, "words": rows}
        )

    # Languages whose copy is written by hand rather than carried on the
    # entries, and which are allowed to be incomplete.
    #
    # The eight locales above are a property of every entry: `pack.py` refuses
    # an entry that is missing any of them, so their packs are always full and
    # always the same length. Vietnamese and Thai arrived after the corpus did,
    # and holding the whole corpus hostage to them would mean either shipping
    # nothing in those languages or filling two and a half thousand rows with
    # something nobody wrote.
    #
    # So they are keyed by word id in `content/vocabulary/copy/`, and a word
    # with no entry there gets a `null` row. `wordCopy` in the app already
    # resolves a null row down the fallback chain and reports the language it
    # actually used, so the learner sees their own language where it exists and
    # marked English where it does not — the behaviour that module was written
    # for and, until now, the only locale that needed it was none of them.
    #
    # Keyed by id and not by position, deliberately: this file is re-ordered
    # every time difficulty is re-scored, and an index would attach every
    # meaning to the wrong word without changing a single line of code.
    for path in sorted(SUPPLEMENTARY.glob("*.json")):
        source = json.loads(path.read_text(encoding="utf-8"))
        locale = source["locale"]
        by_id = source["words"]
        # A hand-written row is [meaning, example] or [meaning, example,
        # long definition]; padded to three so every pack has the same shape
        # whatever a translator chose to write.
        rows = [
            ((by_id[record["id"]] + [None, None, None])[:3] if record["id"] in by_id else None)
            for record in records
        ]
        covered = sum(1 for row in rows if row is not None)
        print(f"  {locale}: {covered:,} of {len(rows):,} words written by hand")
        outputs[OUT.with_name(f"vocabulary.{locale}.json")] = dump(
            {"locale": locale, "words": rows}
        )

    if args.check:
        stale = [
            path.name
            for path, text in outputs.items()
            if (path.read_text(encoding="utf-8") if path.exists() else "") != text
        ]
        if stale:
            print(f"{', '.join(stale)} out of date — run the vocabulary build")
            return 1
        print("vocabulary.json is up to date")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    for path, text in outputs.items():
        path.write_text(text, encoding="utf-8")
    # A locale dropped from the pack must not leave its copy behind for the
    # bundler to keep shipping.
    for path in sorted(OUT.parent.glob("vocabulary.*.json")):
        if path not in outputs:
            path.unlink()

    removed = len(entries) - len(kept)
    print(f"wrote {OUT}")
    print(f"  copy for {len(copy_by_locale)} locales alongside it")
    print(f"  {len(records):,} words ship; {removed} reviewed and removed")
    for level in range(1, LEVELS + 1):
        in_level = [w for w in records if w["difficulty_level"] == level]
        span = (
            f"{min(w['difficulty_score'] for w in in_level):.2f}–"
            f"{max(w['difficulty_score'] for w in in_level):.2f}"
        )
        print(f"    level {level}: {len(in_level):>4} words, difficulty {span}")
    bands: dict[str, int] = defaultdict(int)
    for record in records:
        bands[frequency.ALL_BANDS[record["f"][0]]] += 1
    print("  frequency: " + ", ".join(f"{k} {v}" for k, v in sorted(bands.items())))
    by_pos: dict[str, int] = defaultdict(int)
    for record in records:
        by_pos[record["part_of_speech"]] += 1
    print("  by part of speech: " + ", ".join(f"{k} {v}" for k, v in sorted(by_pos.items())))

    by_category = Counter(categories.CATEGORY_IDS[r["c"]] for r in records)
    print("  by category:")
    for cid in categories.CATEGORY_IDS:
        share = by_category[cid] / max(1, len(records)) * 100
        print(f"    {cid:16} {by_category[cid]:5}  {share:4.1f}%")
    return 0


def git_tracked(path: Path) -> bool:  # pragma: no cover - diagnostics only
    result = subprocess.run(
        ["git", "ls-files", "--error-unmatch", str(path)], capture_output=True, cwd=ROOT
    )
    return result.returncode == 0


if __name__ == "__main__":
    raise SystemExit(main())
