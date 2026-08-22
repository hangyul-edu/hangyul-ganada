#!/usr/bin/env python3
"""Splits the learning corpus into fetchable bands.

    python3 scripts/content/split_corpus.py
    python3 scripts/content/split_corpus.py --check

## Why the corpus is not simply imported any more

`build_vocabulary.py` writes one `vocabulary.json` and one pack per language,
and the app used to `import` them. That is the simplest thing that works and it
stops working at scale: a static import is in the eager module graph, so every
word ever added to the curriculum is downloaded, parsed and held in memory
before the home screen can paint. At the 2,581 words the corpus has today that
is 181 kB gzipped; at the ten thousand it is being built towards it is 754 kB
against a 460 kB first-load budget for the *whole application*.

So the generated files stay exactly as they are — they are the pipeline's
output and half a dozen scripts read them — and this script derives a second,
*delivery* shape from them, in `apps/web/public/corpus/`. Nothing here decides
any content; it only decides what arrives when.

## The shape

    manifest.json           what exists, and the true totals
    tables-<hash>.json      categories, sources, sound patterns — the parts that
                            do not grow with the corpus
    band-<n>-<hash>.json    words, in the order a learner meets them
    <locale>-<n>-<hash>.json   that band's meanings, in one language

## Why bands are cut on priority and not on `difficulty_level`

`difficulty_level` is a bin, and the bins are lopsided: level 1 has a handful
of words and level 4 has hundreds. Bands have to be roughly equal, because
their whole purpose is to be a predictable unit of download.

What the app actually wants first is the *priority* order — the blend of
frequency, usefulness, concreteness and spelling that `difficulty_score`
already encodes and that `vocabularyByPriority` already sorts by. Band 1 is
therefore the words a beginner meets first, which is the same set the daily
plan draws from, and a learner who never opens the browse screen never needs
band 6. The tie-break is the headword, so the cut is total and stable: the same
corpus splits the same way twice.

## Why every file name carries a content hash

The same reason the dictionary layer does, and it is the load-bearing one: the
service worker's cache key (`hangyul-ganada-v1`) does not change between
releases, so a file that changes content under a fixed name would be served
from cache for ever. A hash in the name makes cache-first correct rather than
merely fast. `manifest.json` is the one unhashed file, and it is the one the
worker fetches network-first.

## Why the locale packs are split the same way

They are index-aligned with the words — row *i* of the pack is the meaning of
word *i* — so a band of words without the matching band of meanings is a screen
full of blanks. Splitting them together keeps the alignment a local property of
one band instead of a global property of two files that must never disagree.

Only the ten languages the curriculum has editorial copy for are written; the
other twenty-two interface languages fall back through `wordCopy`, exactly as
they did before.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / "apps" / "web" / "src" / "data" / "generated"
OUT = ROOT / "apps" / "web" / "public" / "corpus"

# The words a first launch needs before it can show anything: the daily plan,
# the home screen's suggestion, and the first few browse screens. Sized so the
# band stays comfortably under 50 kB gzipped whatever the corpus grows to —
# this is the one number that first paint waits for.
CORE_WORDS = 600

# Every band after the core. Larger, because by the time one of these is needed
# the app is already on screen and the fetch is in the background.
BAND_WORDS = 800

# Fields that live in the shared tables rather than in a band.
TABLE_KEYS = (
    "generator",
    "letter_order",
    "locales",
    "levels",
    "difficulty_reasons",
    "categories",
    "frequency_bands",
    "sound_patterns",
    "words_per_lesson",
    "sources",
    "field_sets",
)


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()[:12]


def dump(obj: object) -> bytes:
    """Compact, sorted, newline-terminated — so the hash depends on content only."""
    return (json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode(
        "utf-8"
    )


def band_bounds(total: int) -> list[tuple[int, int]]:
    """`[start, end)` per band. Band 1 is the core."""
    if total == 0:
        return []
    bounds = [(0, min(CORE_WORDS, total))]
    start = bounds[0][1]
    while start < total:
        end = min(start + BAND_WORDS, total)
        bounds.append((start, end))
        start = end
    return bounds


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    corpus = json.loads((GENERATED / "vocabulary.json").read_text("utf-8"))
    words = corpus["words"]

    # The priority order the app reads the corpus in. Identical to `BY_PRIORITY`
    # in `data/vocabulary.ts`; the comment there is the reasoning and this is the
    # same rule applied ahead of time so the app does not have to hold every word
    # in order to sort them.
    order = sorted(range(len(words)), key=lambda i: (words[i]["difficulty_score"], words[i]["word"]))

    packs: dict[str, list] = {}
    for path in sorted(GENERATED.glob("vocabulary.*.json")):
        locale = path.name[len("vocabulary.") : -len(".json")]
        pack = json.loads(path.read_text("utf-8"))
        if pack.get("locale") != locale or len(pack["words"]) != len(words):
            print(f"  ! {path.name}: not aligned with vocabulary.json")
            return 1
        packs[locale] = pack["words"]

    files: dict[str, bytes] = {}

    tables = {key: corpus[key] for key in TABLE_KEYS}
    tables_name = f"tables-{digest(dump(tables))}.json"
    files[tables_name] = dump(tables)

    bands = []
    for index, (start, end) in enumerate(band_bounds(len(words)), start=1):
        rows = [words[i] for i in order[start:end]]
        payload = dump({"band": index, "words": rows})
        name = f"band-{index}-{digest(payload)}.json"
        files[name] = payload

        locale_files = {}
        for locale, pack in packs.items():
            copy = dump({"locale": locale, "band": index, "words": [pack[i] for i in order[start:end]]})
            locale_name = f"{locale}-{index}-{digest(copy)}.json"
            files[locale_name] = copy
            locale_files[locale] = locale_name

        bands.append(
            {
                "band": index,
                "count": end - start,
                "words": name,
                "bytes": len(payload),
                "locales": locale_files,
            }
        )

    manifest = {
        "generator": corpus["generator"],
        # The true size of the corpus, whatever a client has fetched of it. Every
        # "x of y words" in the product reads this, so a partly-loaded corpus
        # still reports an honest denominator.
        "headwords": len(words),
        "tables": tables_name,
        "bands": bands,
    }
    files["manifest.json"] = dump(manifest)

    existing = {path.name: path.read_bytes() for path in OUT.glob("*.json")} if OUT.exists() else {}
    stale = existing != files

    total = sum(len(payload) for payload in files.values())
    print(f"Learning corpus — {len(words):,} words in {len(bands)} bands, {len(packs)} locales")
    print(f"  core band       {bands[0]['count']:,} words, {bands[0]['bytes'] / 1024:,.0f} kB raw")
    print(f"  files           {len(files)}, {total / 1024:,.0f} kB raw")

    if args.check:
        if stale:
            print("\npublic/corpus is out of date — run the corpus split")
            return 1
        print("\ncorpus bands up to date")
        return 0

    if stale:
        if OUT.exists():
            shutil.rmtree(OUT)
        OUT.mkdir(parents=True)
        for name, payload in files.items():
            (OUT / name).write_bytes(payload)
        print("\nwrote public/corpus")
    else:
        print("\ncorpus bands up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
