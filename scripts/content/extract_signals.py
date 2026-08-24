#!/usr/bin/env python3
"""Per-word linguistic signals, extracted once and written down.

    npm run vocabulary:signals
    npm run vocabulary:signals:check

## Why this is a file rather than a step inside the build

The difficulty model needs facts about a word that are not in the pack and not
derivable from its spelling: whether it is Sino-Korean, how many senses it
really has, whether the dictionary marks it literary or formal or historical,
whether another word is spelled the same way. All of those are in the 14 MB
Wiktionary cache, and parsing that on every content build would put half a
minute on a command people run twenty times a day.

More importantly, they are **judgements a person should be able to read**.
`content/vocabulary/word-signals.json` is 2,916 rows a reviewer can open, and
when a word lands at a level that looks wrong the first question is always
"what did the model think it knew", which is this file.

## What is here, and what is deliberately not

Everything here is a *fact about the language* taken from a cited source. There
is no scoring, no weighting and no level: `level.py` does that, reads this, and
can be re-tuned without re-parsing anything.

The one judgement made here is scoping. Wiktionary's Korean section for 저
carries three etymologies — the pronoun, the Sino-Korean 箸 for chopsticks, and
a musical instrument — and only the first is what this app teaches. Signals are
therefore read from the *entry whose part of speech matches the one the pack
teaches*, and a word whose taught part of speech has no entry gets nothing
rather than the wrong entry's facts.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pack  # noqa: E402
import wiktionary  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content-cache" / "wikitext.jsonl"
OUT = ROOT / "content" / "vocabulary" / "word-signals.json"

#: Labels that mark a word as belonging to a register a beginner does not need.
#: Each is a real Wiktionary label; the grouping is ours.
REGISTER_LABELS = {
    "literary": "literary",
    "poetic": "literary",
    "formal": "formal",
    "honorific": "honorific",
    "humble": "honorific",
    "historical": "historical",
    "archaic": "historical",
    "obsolete": "historical",
    "dated": "historical",
    "rare": "rare",
    "uncommon": "rare",
    "slang": "slang",
    "colloquial": "colloquial",
    "vulgar": "slang",
    "derogatory": "slang",
    "figurative": "figurative",
    "figuratively": "figurative",
    "North Korea": "regional",
    "Gyeongsang": "regional",
    "Jeolla": "regional",
    "Jeju": "regional",
    "dialectal": "regional",
}

#: Derivational endings a learner has to unpack. Each is productive, so the
#: word is easier *once the pattern is known* and harder before that.
DERIVATIONAL = (
    ("스럽다", "seureopda"),
    ("롭다", "ropda"),
    ("답다", "dapda"),
    ("거리다", "georida"),
    ("대다", "daeda"),
    ("당하다", "danghada"),
    ("시키다", "sikida"),
    ("되다", "doeda"),
    ("하다", "hada"),
)

#: Stems built on the honorific -시-, plus the suppletive honorific verbs.
#: Knowing the word is not enough; the learner has to know when it is required.
HONORIFIC_WORDS = {
    "드시다", "잡수시다", "계시다", "주무시다", "모시다", "뵈다", "뵙다", "여쭈다",
    "말씀하다", "말씀", "돌아가시다", "드리다", "주시다", "성함", "연세", "댁", "진지",
}


def korean_entries(word: str, wikitext: str) -> list[wiktionary.Entry]:
    try:
        return wiktionary.parse_entries(word, wikitext)
    except Exception:  # a malformed page is a missing signal, not a crash
        return []


def main() -> int:
    check = "--check" in sys.argv
    entries = pack.load()
    taught = {word: entry for word, entry in entries.items() if entry.keep}

    if not CACHE.exists():
        raise SystemExit(f"{CACHE} is missing — run npm run content:fetch first")

    # Part of speech as the pack teaches it, so the right entry is read.
    built = json.loads((ROOT / "apps/web/src/data/generated/vocabulary.json").read_text("utf-8"))
    pos_by_word = {row["word"]: row["part_of_speech"] for row in built["words"]}
    spellings: dict[str, int] = {}
    for row in built["words"]:
        spellings[row["word"]] = spellings.get(row["word"], 0) + 1

    signals: dict[str, dict] = {}
    seen_pages = 0
    for line in CACHE.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        page = json.loads(line)
        word = page["title"]
        if word not in taught:
            continue
        seen_pages += 1
        parsed = korean_entries(word, page["wikitext"])
        if not parsed:
            continue
        want = pos_by_word.get(word)
        mine = [e for e in parsed if e.part_of_speech == want] or parsed
        entry = mine[0]

        # The register of the sense this app teaches, which is the first one.
        #
        # Reading every sense's labels was the first attempt and it marked 저 as
        # literary, 앞 as historical and 소리 as historical — each because one
        # obscure sense out of five carries that label somewhere down the entry.
        # A word with an archaic fifth sense is not an archaic word, and the
        # level model was pushing five foundation words upward on the strength
        # of it. `build_relations.py` scopes to the primary sense for the same
        # reason and this now matches it.
        labels: set[str] = set()
        primary = entry.senses[0] if entry.senses else None
        for raw in (primary.labels if primary else []):
            group = REGISTER_LABELS.get(raw.strip())
            if group:
                labels.add(group)
        # Kept separately: a word whose *later* senses are marked is worth
        # knowing about when reading a gallery, and is not evidence about the
        # word being taught.
        elsewhere: set[str] = set()
        for sense in entry.senses[1:]:
            for raw in sense.labels:
                group = REGISTER_LABELS.get(raw.strip())
                if group and group not in labels:
                    elsewhere.add(group)

        signals[word] = {
            "sino": bool(entry.sino_korean),
            # Senses the dictionary states for the part of speech we teach.
            # Polysemy is a real cost: four senses is four words to a beginner.
            "senses": len(entry.senses),
            # How many parts of speech this spelling has at all. 배 is a noun
            # three times over; 차 is a noun and a verb. Homography is what
            # makes a word ambiguous in a sentence the learner is reading.
            "posEntries": len({e.part_of_speech for e in parsed}),
            "registers": sorted(labels),
            "registersElsewhere": sorted(elsewhere),
        }

    # Signals that need no page: spelling, structure, and the pack's own fields.
    for word in taught:
        row = signals.setdefault(
            word,
            {"sino": False, "senses": 1, "posEntries": 1, "registers": [], "registersElsewhere": []},
        )
        row["honorific"] = word in HONORIFIC_WORDS
        row["derivation"] = next((name for suffix, name in DERIVATIONAL if word.endswith(suffix) and len(word) > len(suffix)), None)
        # Declared on the pack row, not guessed. 일석이조 is four Sino-Korean
        # syllables and so is 국제공항; the difference is that one has to be
        # learned whole, and no spelling pattern knows which is which.
        row["idiom"] = taught[word].idiom

    # Compounds: a taught word that contains another taught word. Easier once
    # the parts are known, so this lowers difficulty rather than raising it —
    # 손가락 is 손 + 가락 and a learner who has 손 is most of the way there.
    lemmas = {w for w in taught if len(w) >= 2}
    for word in taught:
        stem = word[:-1] if word.endswith("다") and len(word) > 2 else word
        parts = [other for other in lemmas
                 if other != word and len(other) >= 2 and other in stem]
        signals[word]["contains"] = sorted(parts, key=len, reverse=True)[:2]

    payload = {
        "_comment": [
            "Linguistic signals per taught word, for the difficulty model.",
            "GENERATED by scripts/content/extract_signals.py from the Wiktionary cache.",
            "Facts only — no scores and no levels. See scripts/content/level.py.",
        ],
        "source": "en.wiktionary.org, CC BY-SA 4.0",
        "words": {word: signals[word] for word in sorted(signals)},
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n"

    if check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT} is stale — run npm run vocabulary:signals")
            return 1
        print(f"word signals up to date — {len(signals):,} words")
        return 0

    OUT.write_text(text, encoding="utf-8")
    sino = sum(1 for s in signals.values() if s["sino"])
    idioms = sum(1 for s in signals.values() if s["idiom"])
    honorific = sum(1 for s in signals.values() if s["honorific"])
    marked = sum(1 for s in signals.values() if s["registers"])
    poly = sum(1 for s in signals.values() if s["senses"] >= 3)
    homo = sum(1 for s in signals.values() if s["posEntries"] >= 2)
    compound = sum(1 for s in signals.values() if s["contains"])
    print(f"wrote {OUT.relative_to(ROOT)} — {len(signals):,} words from {seen_pages:,} pages\n")
    print(f"  Sino-Korean          {sino:>5,}")
    print(f"  four-character idiom {idioms:>5,}")
    print(f"  honorific            {honorific:>5,}")
    print(f"  register-marked      {marked:>5,}")
    print(f"  three or more senses {poly:>5,}")
    print(f"  more than one PoS    {homo:>5,}")
    print(f"  contains a taught word {compound:>3,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
