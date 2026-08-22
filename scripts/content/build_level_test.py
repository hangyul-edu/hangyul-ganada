#!/usr/bin/env python3
"""Builds the Vocabulary Level Test's item bank.

    python3 scripts/content/build_level_test.py
    python3 scripts/content/build_level_test.py --check

## Why the bank is not the learning corpus

They are built from the same words and they are not the same thing. A learning
card teaches: it carries a picture, a recording, a hand-written meaning and one
sense, and it comes back on a schedule until it sticks. An assessment item asks,
once, and must not teach — no hint ladder, no answer revealed, no second
attempt. Sharing the objects would mean every change to how a word is taught
silently changed what the test measures.

So this writes a separate file, fetched at runtime like the dictionary, and
nothing in it feeds the scheduler.

## The Hangyul Vocabulary Level, 1–30

A level is a statement about **how much of the language a reader has**, and the
scale is a cumulative vocabulary size: level 1 is roughly the first 147 words by
frequency, level 5 the first 735, level 15 the first 3,490, level 30 beyond
10,635. The bands widen as they climb, because the difference between knowing
147 words and 294 is enormous and the difference between 10,119 and 10,635 is
not.

So a word's level is found by its **rank in Korean**, not its rank among the
words this product happens to teach. Cutting the 2,581-word teaching corpus into
thirty equal bands was the first attempt and it was wrong: it makes level 30 mean
"the 2,500th word we curated", which is a fact about our backlog rather than
about the language, and it would move every time the corpus grew.

The ranking is built by `frequency.measure` over the whole candidate set, which
is the same folding the learning corpus is ranked by — 학교에서 counts towards
학교, and a verb is matched on its conjugations because 먹다 never appears in a
subtitle.

## Where the words come from

**The curated corpus is the calibrated part.** Its 2,581 words have hand-written
meanings, a checked part of speech and one taught sense, so an item built from
one asks about a known quantity. They are anchors, not the scale.

**Quality-gated dictionary entries carry the upper levels**, because the corpus
runs out long before level 30 does. The gate is deliberately narrow — see
`usable_anchor` — and everything it rejects is rejected for a reason that would
otherwise show up as an unanswerable question.

## What the result may and may not say

It is a **Hangyul Vocabulary Level**. It is not TOPIK, it is not CEFR, and it is
not a claim that the learner knows exactly 3,490 words. The scale is a
frequency-ordered ladder and the estimate is a position on it with a confidence
band, which is what the result screen says.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import frequency  # noqa: E402
from hangul import is_syllable  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.json"
ENGLISH = ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.en.json"
DICTIONARY = ROOT / "apps" / "web" / "public" / "dictionary"
OUT = ROOT / "apps" / "web" / "public" / "level-test"

LEVELS = 30

#: Cumulative vocabulary size at each level — the Hangyul Vocabulary Level scale.
#:
#: A word whose frequency rank is at or below `CUMULATIVE[n]` and above
#: `CUMULATIVE[n - 1]` sits at level `n`. The steps widen deliberately: 147 a
#: level at the bottom, 220 through the teens, 516 at the top.
CUMULATIVE = [
    147, 294, 441, 588, 735,
    955, 1175, 1395, 1615, 1835,
    2166, 2497, 2828, 3159, 3490,
    3930, 4370, 4810, 5250, 5690,
    6163, 6636, 7109, 7582, 8055,
    8571, 9087, 9603, 10119, 10635,
]
#: Options per item. Four is the product's own multiple-choice shape, and it
#: sets the guessing floor the scoring model has to account for: 0.25.
OPTIONS = 4
#: How far away a distractor may be drawn from, in levels. Close enough that it
#: is not eliminated by obviously belonging to a different stratum, far enough
#: that a band's own 86 words can always supply three.
DISTRACTOR_SPREAD = 2
#: How many items to keep per level.
#:
#: A sitting asks 18 to 36 and never repeats within one; this leaves room for
#: several retakes at every level without re-asking. Level 30 is "10,635 and
#: beyond" and would otherwise hold 14,301 items on its own — six megabytes of
#: bank for a test that will ask thirty questions.
#:
#: The keepers are spread across the level's own rank range rather than taken
#: from the top of it, so a level is not represented only by its most frequent
#: words.
PER_LEVEL = 150


def level_of(rank: int) -> int:
    """The Hangyul Vocabulary Level a frequency rank falls in."""
    for level, ceiling in enumerate(CUMULATIVE, start=1):
        if rank <= ceiling:
            return level
    return LEVELS


def shares_a_word(a: str, b: str) -> bool:
    """Whether two glosses share a substantive word, so one hints at the other."""
    stop = {"to", "a", "an", "the", "of", "be", "in", "on", "at", "for", "or", "and", "it"}
    words = lambda s: {w for w in re.findall(r"[a-z]+", s.lower()) if w not in stop and len(w) > 2}
    return bool(words(a) & words(b))


#: Glosses that describe a *form* rather than a meaning.
#:
#: Wiktionary carries a page for 해요 whose definition is "informal polite
#: present indicative form of 하다". Asking a learner to choose that from four
#: options tests nothing about vocabulary, so these pages are not anchors.
_FORM_PAGE = re.compile(
    r"\b(form|forms|spelling|romanization|hanja|alternative|obsolete|archaic|"
    r"honorific form|contraction) of\b",
    re.IGNORECASE,
)

#: Parts of speech an item can sensibly ask about.
_ASKABLE = {"noun", "verb", "adjective", "adverb"}


def usable_anchor(headword: str, gloss: str, pos: str) -> bool:
    """Whether a dictionary entry can carry a question.

    Narrow on purpose. Every rejection here is a question that would otherwise
    be unanswerable, ambiguous, or about something other than knowing a word:

    * **Not Hangul, or very long.** A five-syllable compound is a phrase to a
      learner, and the scale is about words.
    * **A form page.** "informal polite present indicative form of 하다" is a
      grammar note wearing a definition's clothes.
    * **A part of speech that cannot be asked about.** Particles, numerals,
      proper nouns and interjections either have no meaning to choose or the
      same meaning as their translation.
    * **A gloss too short or too long.** One word is often ambiguous between
      four options; a sentence is a definition to read rather than an answer to
      pick.
    * **A gloss carrying its own Korean.** Some entries gloss 밥 as "bap,
      cooked rice", which hands over the answer in a produce item.
    """
    if not headword or not all(is_syllable(c) for c in headword):
        return False
    if not 1 <= len(headword) <= 4:
        return False
    if pos not in _ASKABLE:
        return False
    if not gloss or not 3 <= len(gloss) <= 60:
        return False
    if _FORM_PAGE.search(gloss):
        return False
    if any(is_syllable(c) for c in gloss):
        return False
    return True


def dictionary_anchors(taught: set[str]) -> list[dict]:
    """Entries from the dictionary layer that can carry a question."""
    manifest_path = DICTIONARY / "manifest.json"
    if not manifest_path.exists():
        return []
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    index = json.loads((DICTIONARY / manifest["index"]).read_text(encoding="utf-8"))
    out: list[dict] = []
    seen: set[str] = set()
    for headword, _romanization, pos, gloss, _senses, _chunk, _freq in index["rows"]:
        if headword in taught or headword in seen:
            continue
        if not usable_anchor(headword, gloss, pos):
            continue
        seen.add(headword)
        out.append(
            {
                "id": f"dict_{headword}",
                "word": headword,
                "gloss": gloss.strip(),
                "pos": pos,
                "example": "",
                "surface": headword,
                "source": "dictionary",
            }
        )
    return out


def build() -> dict:
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    english = json.loads(ENGLISH.read_text(encoding="utf-8"))["words"]
    words = corpus["words"]

    rows = []
    for index, word in enumerate(words):
        gloss = (english[index][0] or "").strip()
        if not gloss:
            continue
        rows.append(
            {
                "id": word["id"],
                "word": word["word"],
                "gloss": gloss,
                "pos": word["part_of_speech"],
                "example": word.get("example") or "",
                "surface": word.get("as") or word["word"],
                "source": "corpus",
            }
        )
    taught = {row["word"] for row in rows}
    rows.extend(dictionary_anchors(taught))

    """Rank every candidate against Korean, not against each other's curation.

    One `measure` over the whole candidate set, with the same folding the
    learning corpus is ranked by. Words the corpora never saw have no rank and
    therefore no level, and they are dropped: a question whose level is a guess
    measures nothing.
    """
    inflecting = frozenset(row["word"] for row in rows if row["pos"] in {"verb", "adjective"})
    readings = frequency.measure([row["word"] for row in rows], inflecting)

    observed = [row for row in rows if readings[row["word"]].rate]
    observed.sort(key=lambda row: -(readings[row["word"]].rate or 0))
    rows = []
    for rank, row in enumerate(observed, start=1):
        row["rank"] = rank
        row["level"] = level_of(rank)
        rows.append(row)

    by_level: dict[int, list[dict]] = {}
    for row in rows:
        by_level.setdefault(row["level"], []).append(row)

    # Deterministic: the same corpus must produce the same bank, or a rebuild
    # would silently re-ask a learner questions the previous one had retired.
    rng = random.Random(20260822)

    def distractors(row: dict, key: str, count: int) -> list[str]:
        pool: list[dict] = []
        for level in range(row["level"] - DISTRACTOR_SPREAD, row["level"] + DISTRACTOR_SPREAD + 1):
            pool.extend(by_level.get(level, []))
        same_pos = [o for o in pool if o["pos"] == row["pos"] and o["id"] != row["id"]]
        # Part of speech first, because a noun among three verbs is answerable
        # without knowing the word — the same defect the hint ladder was fixed for.
        candidates = same_pos or [o for o in pool if o["id"] != row["id"]]
        rng.shuffle(candidates)
        out: list[str] = []
        for other in candidates:
            value = other[key]
            if value in out or value == row[key]:
                continue
            if key == "gloss" and shares_a_word(value, row["gloss"]):
                continue
            out.append(value)
            if len(out) == count:
                break
        return out

    # Thin each level before building items, spreading the keepers across the
    # level's rank range.
    kept: list[dict] = []
    for level in range(1, LEVELS + 1):
        band = [row for row in rows if row["level"] == level]
        if len(band) <= PER_LEVEL:
            kept.extend(band)
            continue
        step = len(band) / PER_LEVEL
        kept.extend(band[int(i * step)] for i in range(PER_LEVEL))
    rows = kept

    items: list[dict] = []
    for row in rows:
        # Korean shown, meaning chosen.
        glosses = distractors(row, "gloss", OPTIONS - 1)
        if len(glosses) == OPTIONS - 1:
            items.append(
                {
                    "id": f"{row['id']}:meaning",
                    "kind": "meaning",
                    "level": row["level"],
                    "prompt": row["word"],
                    "answer": row["gloss"],
                    "options": sorted([row["gloss"], *glosses]),
                }
            )
        # Meaning shown, Korean chosen. The harder direction, same level.
        koreans = distractors(row, "word", OPTIONS - 1)
        if len(koreans) == OPTIONS - 1:
            items.append(
                {
                    "id": f"{row['id']}:produce",
                    "kind": "produce",
                    "level": row["level"],
                    "prompt": row["gloss"],
                    "answer": row["word"],
                    "options": sorted([row["word"], *koreans]),
                }
            )
        # The word in a sentence, blanked.
        if row["example"] and row["surface"] in row["example"] and len(koreans) == OPTIONS - 1:
            items.append(
                {
                    "id": f"{row['id']}:context",
                    "kind": "context",
                    "level": row["level"],
                    "prompt": row["example"].replace(row["surface"], "____", 1),
                    "answer": row["word"],
                    "options": sorted([row["word"], *koreans]),
                }
            )

    counts: dict[str, int] = {}
    for item in items:
        counts[str(item["level"])] = counts.get(str(item["level"]), 0) + 1

    return {
        "_comment": (
            "GENERATED by scripts/content/build_level_test.py. The Vocabulary Level Test's "
            "item bank — separate from the learning corpus, fetched at runtime, never "
            "scheduled and never counted as progress. Levels are the corpus ordered by "
            "frequency rank and cut into thirty equal bands; see the module docstring."
        ),
        "levels": LEVELS,
        "options": OPTIONS,
        "items": items,
        "perLevel": counts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    bank = build()
    rendered = json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + "\n"
    digest = hashlib.sha256(rendered.encode("utf-8")).hexdigest()[:8]
    name = f"bank-{digest}.json"

    manifest = {
        "_comment": (
            "GENERATED by scripts/content/build_level_test.py. `bank` names a "
            "content-hashed file, so the offline worker can cache it for good."
        ),
        "levels": bank["levels"],
        "options": bank["options"],
        "items": len(bank["items"]),
        "bank": name,
        "perLevel": bank["perLevel"],
    }
    files = {name: rendered, "manifest.json": json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n"}

    stale = []
    for filename, text in files.items():
        target = OUT / filename
        if not target.exists() or target.read_text(encoding="utf-8") != text:
            stale.append(filename)
            if not args.check:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(text, encoding="utf-8")
    for orphan in sorted(OUT.glob("*.json")) if OUT.exists() else []:
        if orphan.name not in files:
            stale.append(f"{orphan.name} (removed)")
            if not args.check:
                orphan.unlink()

    thin = [level for level in range(1, LEVELS + 1) if bank["perLevel"].get(str(level), 0) < 12]
    print(f"Level test bank — {len(bank['items']):,} items across {LEVELS} levels")
    print(f"  per level: min {min(bank['perLevel'].values())}, max {max(bank['perLevel'].values())}")
    print(f"  kinds: " + ", ".join(
        f"{kind} {sum(1 for i in bank['items'] if i['kind'] == kind):,}"
        for kind in ("meaning", "produce", "context")
    ))
    if thin:
        print(f"  levels with fewer than 12 items: {thin}")
    if args.check and stale:
        print(f"\nstale: {stale} — run `npm run content:leveltest`")
        return 1
    if stale and not args.check:
        print(f"  wrote {len(stale)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
