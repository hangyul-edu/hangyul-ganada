#!/usr/bin/env python3
"""Builds the searchable dictionary layer, separately from the learning corpus.

    python3 scripts/content/build_dictionary.py
    python3 scripts/content/build_dictionary.py --check

## Why there are two corpora and not one

The product had one vocabulary corpus doing two incompatible jobs.

A **learning corpus** has to be small, ranked and ruthlessly curated. Every
entry in it is something the scheduler may put in front of a beginner tomorrow
morning, so a word earns its place by being useful early, and a word that is
merely *real* does not belong. 2,581 entries is a curriculum.

A **dictionary** has to be broad. Its job is that a learner who meets a word —
in a song, on a menu, in a message from a friend — can look it up and get a
truthful answer. Breadth is the whole point, and curation is beside it.

Merging the two forces a bad trade in both directions: either the dictionary is
tiny, or the scheduler starts teaching a beginner words nobody needs in their
first year. So they are separate. **Nothing here is scheduled.** The learning
corpus decides what is taught; this decides what can be looked up.

## Delivery, and why this writes to `public/`

Everything under `apps/web/src/data/generated/` is swept into the
`curriculum-data` chunk by a catch-all in `vite.config.ts`, and that chunk is
loaded before the home screen paints. A dictionary meant to grow to tens of
thousands of entries cannot live there — it would put the whole lexicon on the
critical path of an app whose first screen is a single letter.

So the dictionary is not imported at all. It is written to `public/dictionary/`
as static JSON and fetched at runtime by the code that needs it:

    dictionary/manifest.json    what exists, how it is chunked, what it cost
    dictionary/index.json       one light row per headword — enough to search
    dictionary/entries/<b>.json full entries, one file per initial-consonant

The index carries a headword, its romanisation, a part of speech, a short gloss
and a rank — enough to search and rank results, and nothing else. Full senses,
examples and provenance are only fetched when a learner opens a word, and the
service worker caches what has been opened, so a dictionary a learner actually
uses becomes available offline while one they never open costs nothing.

## Senses are the unit, not words

Every sense gets a stable `senseId` of the form `dict_<romanised>#<slug>`,
derived from the sense's own gloss rather than from its position in the list.
Position is not identity: re-running this after Wiktionary gains a sense would
renumber everything below it and silently repoint every reference. A slug
derived from the gloss moves only when the gloss itself does.

That id is what the learning corpus points at, and it is what makes "one card,
one taught sense" enforceable rather than aspirational.

## Provenance

Every entry records where it came from, under what licence, and when it was
retrieved. The data here is CC BY-SA 4.0 from English Wiktionary and stays
attributable; a record that cannot say where it came from is not shipped.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from hangul import decompose, is_hangul_word, is_syllable  # noqa: E402
from pronunciation import spoken_form  # noqa: E402
from hangul import revised_romanization  # noqa: E402
from wiktionary import BLOCKED_LABELS, Entry, parse_entries  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content-cache"
OUT = ROOT / "apps" / "web" / "public" / "dictionary"

#: The nineteen possible initial consonants, which is how entries are bucketed.
#:
#: A Hangul-initial bucket is the one split that is stable under growth: adding
#: a word never moves an existing one to a different file, so a cached chunk
#: stays valid. A hash split would have the same property and none of the
#: legibility — `entries/m.json` is inspectable and `entries/7f.json` is not.
INITIALS = list("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ")

#: The ASCII name each bucket is written to disk under.
#:
#: The bucket *is* an initial consonant and was once named with one — until the
#: signed APK was unpacked and every chunk came out as `entries/πä▒-1-....json`.
#: The bytes in the archive were correct UTF-8; the ZIP entries simply did not
#: set the general-purpose UTF-8 flag, so a reader following the specification
#: decodes them as CP437. Gradle writes the archive, the app asks its WebView
#: for the name the manifest gives, and whether those two agree depends on a
#: flag neither of them owns.
#:
#: A dev server reads the filesystem and never notices, which is what makes this
#: worth removing rather than testing: the failure mode is a dictionary that
#: works everywhere except inside the shipped app.
#:
#: Revised Romanization of the consonant, so `entries/g-1.json` is still
#: inspectable and still says which bucket it is. Doubled letters take the
#: doubled spelling — `kk`, `tt` — which keeps ㄱ and ㄲ apart.
ROMAN_INITIAL = {
    "ㄱ": "g", "ㄲ": "kk", "ㄴ": "n", "ㄷ": "d", "ㄸ": "tt", "ㄹ": "r",
    "ㅁ": "m", "ㅂ": "b", "ㅃ": "pp", "ㅅ": "s", "ㅆ": "ss", "ㅇ": "ng",
    "ㅈ": "j", "ㅉ": "jj", "ㅊ": "ch", "ㅋ": "k", "ㅌ": "t", "ㅍ": "p",
    "ㅎ": "h",
}

#: A bucket bigger than this is split again, `ㅅ-1`, `ㅅ-2`, and so on.
#:
#: Not a byte budget: the point is the size of a *fetch* a learner waits for
#: when they open one word. A few hundred entries is tens of kilobytes, which
#: is one round trip on a slow connection.
MAX_BUCKET_ENTRIES = 400

#: Senses whose gloss is this short are almost always a cross-reference stub —
#: "see 먹다" — rather than a definition somebody can learn anything from.
MIN_GLOSS_LENGTH = 2

SOURCE = {
    "id": "en-wiktionary",
    "name": "English Wiktionary",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "homepage": "https://en.wiktionary.org/",
    "attribution": "Dictionary senses and examples from English Wiktionary, CC BY-SA 4.0",
}


def slug(gloss: str) -> str:
    """A short, stable, ASCII key for a sense, from its own gloss.

    The first substantive word of the definition, which is what distinguishes
    `차#vehicle` from `차#tea` and is the part least likely to be reworded. Not
    the whole gloss: "to eat, drink, have, consume" would make an id that
    changes when somebody adds a fourth synonym.
    """
    text = unicodedata.normalize("NFKD", gloss.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    words = re.findall(r"[a-z]+", text)
    skip = {"to", "a", "an", "the", "of", "be", "being", "used", "for", "in", "on", "at"}
    for word in words:
        if word not in skip and len(word) > 1:
            return word
    return words[0] if words else "sense"


#: The longest a search row's gloss may be.
#:
#: Set from the shape of the list rather than from a round number: a result row
#: on a 360 px phone fits roughly this much before it wraps to a third line, and
#: a third line turns a scannable list into a page of prose.
SHORT_GLOSS_MAX = 60


def short_gloss(gloss: str) -> str:
    """The first clause of a definition, for a search result row.

    A search list shows one line per word and has no room for "to eat, drink,
    have, consume (food or liquid)". The first clause is what a learner scans.

    Splitting on punctuation is not enough on its own, and for a while that was
    all this did. A definition written without a comma or a semicolon came
    through whole: the longest "short" gloss in the corpus was 213 characters,
    which is a paragraph in a row built for a phrase. So there is also a length,
    cut at a word boundary — mid-word truncation reads as a rendering fault
    rather than as a deliberate abbreviation.
    """
    first = re.split(r"[;,]", gloss)[0].strip() or gloss.strip()
    if len(first) <= SHORT_GLOSS_MAX:
        return first
    cut = first[:SHORT_GLOSS_MAX].rstrip()
    space = cut.rfind(" ")
    if space > SHORT_GLOSS_MAX // 2:
        cut = cut[:space]
    return cut.rstrip(" ,;:-") + "…"


def initial_of(word: str) -> str:
    """The bucket a headword belongs to."""
    for char in word:
        if is_syllable(char):
            return decompose(char)[0]
    return "ㅇ"


def frequency_table() -> dict[str, float]:
    """Corpus token counts, for ranking search results.

    A dictionary that ranks 사람 below 사람됨 because they sort that way is a
    dictionary nobody can search. This is the same list the learning corpus
    ranks by, read here only to order results.
    """
    path = CACHE / "ko_50k.txt"
    if not path.exists():
        return {}
    counts: dict[str, float] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) == 2:
            try:
                counts[parts[0]] = float(parts[1])
            except ValueError:
                continue
    return counts


def usable(entry: Entry):
    """The senses of an entry worth showing.

    Blocked labels are dropped here rather than at read time so that a sense a
    beginner must not meet never acquires an id, never gets referenced, and
    cannot be reached by any route.
    """
    for sense in entry.senses:
        labels = [label.lower() for label in sense.labels]
        if set(labels) & BLOCKED_LABELS:
            continue
        if len(sense.gloss.strip()) < MIN_GLOSS_LENGTH:
            continue
        yield sense


def build() -> dict[str, object]:
    """Every generated file, as a relative path -> parsed JSON."""
    store = CACHE / "wikitext.jsonl"
    if not store.exists():
        raise SystemExit(
            f"{store} is missing — run `python3 scripts/content/fetch_dictionary.py` first"
        )

    frequency = frequency_table()
    retrieved = datetime.fromtimestamp(store.stat().st_mtime, tz=timezone.utc)
    retrieved_at = retrieved.strftime("%Y-%m-%d")

    by_word: dict[str, list[Entry]] = defaultdict(list)
    for line in store.open(encoding="utf-8"):
        try:
            page = json.loads(line)
        except json.JSONDecodeError:
            continue
        title = page.get("title", "")
        if not is_hangul_word(title):
            continue
        for entry in parse_entries(title, page.get("wikitext", "")):
            by_word[title].append(entry)

    records: list[dict] = []
    # Bases already spoken for, across the whole dictionary.
    #
    # Romanisation is not injective and Korean has plenty of pairs it flattens:
    # 붇다 and 붓다 are both *butda*, 가엽다 and 가엾다 are both *gayeopda*. Held
    # per-headword, the collision counter inside the sense loop could not see
    # them, so both members of each pair claimed `dict_butda` — one entry id for
    # two different words, and `dict_butda#swell` naming two different senses.
    # The app looks entries up by headword so nothing was visibly broken, which
    # is exactly why it needed a check rather than a bug report.
    #
    # Suffixed in headword order, so the assignment is stable between builds and
    # a rebuild does not silently repoint an id somebody wrote down.
    bases: set[str] = set()
    for word, entries in sorted(by_word.items()):
        romanization = revised_romanization(word, spoken_form(word))
        base = f"dict_{re.sub(r'[^a-z0-9]', '', romanization) or 'x'}"
        if base in bases:
            bump = 2
            while f"{base}_{bump}" in bases:
                bump += 1
            base = f"{base}_{bump}"
        bases.add(base)
        senses: list[dict] = []
        seen: set[str] = set()
        for entry in entries:
            for sense in usable(entry):
                gloss, labels = sense.gloss.strip(), sense.labels
                key = slug(gloss)
                # A headword can carry the same gloss under two parts of speech,
                # and two senses can slug to the same word. Both are the same id
                # collision and both are resolved the same way, by suffixing —
                # never by dropping, which would lose a real sense.
                candidate = key
                bump = 2
                while f"{base}#{candidate}" in seen:
                    candidate = f"{key}{bump}"
                    bump += 1
                sense_id = f"{base}#{candidate}"
                seen.add(sense_id)
                senses.append(
                    {
                        "senseId": sense_id,
                        "rank": len(senses) + 1,
                        "partOfSpeech": entry.part_of_speech,
                        "gloss": gloss,
                        "shortGloss": short_gloss(gloss),
                        **({"labels": labels} if labels else {}),
                        # This sense's own examples, never the entry's. See the
                        # note on `Sense.examples` in `wiktionary.py`: hanging
                        # every example off the first sense files an example
                        # about growing older under "to eat", which is a false
                        # statement about Korean rather than a layout problem.
                        "examples": [
                            {"korean": example.korean, "translation": example.translation}
                            for example in sense.examples
                        ][:4],
                    }
                )
        if not senses:
            continue
        records.append(
            {
                "id": base,
                "headword": word,
                "romanization": romanization,
                "senses": senses,
                "frequency": frequency.get(word, 0.0),
                "source": {
                    "id": SOURCE["id"],
                    "entryId": word,
                    "license": SOURCE["license"],
                    "retrievedAt": retrieved_at,
                    "url": f"https://en.wiktionary.org/wiki/{word}#Korean",
                },
            }
        )

    # --- bucket, then split oversized buckets deterministically --------------
    buckets: dict[str, list[dict]] = defaultdict(list)
    for record in records:
        buckets[initial_of(record["headword"])].append(record)

    chunks: dict[str, list[dict]] = {}
    for initial in INITIALS:
        rows = sorted(buckets.get(initial, []), key=lambda r: r["headword"])
        if not rows:
            continue
        name = ROMAN_INITIAL[initial]
        if len(rows) <= MAX_BUCKET_ENTRIES:
            chunks[name] = rows
            continue
        parts = -(-len(rows) // MAX_BUCKET_ENTRIES)
        size = -(-len(rows) // parts)
        for index in range(parts):
            chunks[f"{name}-{index + 1}"] = rows[index * size : (index + 1) * size]
    # Anything whose initial is not a modern consonant — there should be none,
    # but a record silently vanishing is worse than an ugly bucket name.
    placed = {row["headword"] for rows in chunks.values() for row in rows}
    stray = [r for r in records if r["headword"] not in placed]
    if stray:
        chunks["other"] = sorted(stray, key=lambda r: r["headword"])

    where = {row["headword"]: name for name, rows in chunks.items() for row in rows}

    # --- the search index ----------------------------------------------------
    # Positional arrays rather than objects: the index is the one file every
    # search downloads, and `{"headword":…,"romanization":…}` spends a third of
    # its bytes on the same six keys repeated once per row.
    index = [
        [
            record["headword"],
            record["romanization"],
            record["senses"][0]["partOfSpeech"],
            record["senses"][0]["shortGloss"],
            len(record["senses"]),
            where[record["headword"]],
            round(record["frequency"]),
        ]
        for record in sorted(records, key=lambda r: (-r["frequency"], r["headword"]))
    ]

    files: dict[str, object] = {
        "index.json": {
            "_comment": (
                "GENERATED by scripts/content/build_dictionary.py. One row per headword: "
                "[headword, romanization, partOfSpeech, shortGloss, senseCount, chunk, frequency]. "
                "Enough to search and rank; full entries live in entries/."
            ),
            "fields": [
                "headword",
                "romanization",
                "partOfSpeech",
                "shortGloss",
                "senseCount",
                "chunk",
                "frequency",
            ],
            "rows": index,
        }
    }
    for name, rows in sorted(chunks.items()):
        files[f"entries/{name}.json"] = {
            "_comment": "GENERATED by scripts/content/build_dictionary.py.",
            "entries": rows,
        }

    # Every payload but the manifest is named by a hash of its own bytes.
    #
    # The offline worker's content cache is keyed on a version constant that
    # does not move between builds, so a file at a fixed path — /dictionary/
    # index.json — would be cached once and then served to that learner for
    # good, however many times the dictionary was rebuilt underneath them. The
    # audio manifest solves this by never being cached while a network is up;
    # the dictionary is far too big for that to be the answer for every chunk.
    #
    # Naming files after their contents makes both halves right at once: the
    # manifest alone is fetched fresh, and everything it points at can be cached
    # for good precisely because a changed file has a changed name. It is the
    # same trick Vite already plays on /assets/, and it means a learner who
    # opened ㄱ last week still has it offline, while a rebuild that alters ㄱ
    # gets a new name and is fetched once.
    hashed: dict[str, object] = {}
    names: dict[str, str] = {}
    for name, payload in files.items():
        rendered = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
        digest = hashlib.sha256(rendered.encode("utf-8")).hexdigest()[:8]
        stem, _, suffix = name.rpartition(".")
        names[name] = f"{stem}-{digest}.{suffix}"
        hashed[names[name]] = payload

    hashed["manifest.json"] = {
        "_comment": (
            "GENERATED by scripts/content/build_dictionary.py. Fetched at runtime from "
            "public/dictionary; never imported, so none of it is in the JS bundle. "
            "`index` and `chunks` name content-hashed files: fetch this, then them."
        ),
        "generatedAt": retrieved_at,
        "headwords": len(records),
        "senses": sum(len(r["senses"]) for r in records),
        "examples": sum(
            len(sense["examples"]) for r in records for sense in r["senses"]
        ),
        "index": names["index.json"],
        "chunks": {
            name: {"file": names[f"entries/{name}.json"], "entries": len(rows)}
            for name, rows in sorted(chunks.items())
        },
        "source": SOURCE,
    }
    return hashed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if anything is stale")
    args = parser.parse_args()

    files = build()
    stale: list[str] = []
    for name, payload in files.items():
        target = OUT / name
        rendered = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
        if not target.exists() or target.read_text(encoding="utf-8") != rendered:
            stale.append(name)
            if not args.check:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(rendered, encoding="utf-8")

    # A chunk that is no longer generated has to go, or a stale file keeps being
    # served to anybody whose index still points at it.
    expected = {OUT / name for name in files}
    orphans = [p for p in OUT.rglob("*.json") if p not in expected]
    for orphan in orphans:
        stale.append(f"{orphan.relative_to(OUT)} (removed)")
        if not args.check:
            orphan.unlink()

    manifest = files["manifest.json"]
    total = sum((OUT / name).stat().st_size for name in files if (OUT / name).exists())
    index_path = OUT / str(manifest["index"])
    index_bytes = index_path.stat().st_size if index_path.exists() else 0

    print(f"Dictionary — {manifest['headwords']:,} headwords, {manifest['senses']:,} senses")
    print(f"  {manifest['examples']:,} examples")
    largest = max(chunk["entries"] for chunk in manifest["chunks"].values())
    print(f"  {len(manifest['chunks'])} chunks, largest {largest:,} entries")
    print(f"  index {index_bytes / 1024:.0f} kB · everything {total / 1024:.0f} kB")
    print(f"  source {SOURCE['name']} ({SOURCE['license']}), retrieved {manifest['generatedAt']}")
    print("  none of it is imported: fetched at runtime from public/dictionary")

    if args.check and stale:
        print(f"\n{len(stale)} file(s) out of date: {', '.join(stale[:6])}")
        print("Run `npm run dictionary:build`.")
        return 1
    if stale and not args.check:
        print(f"\nwrote {len(stale)} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
