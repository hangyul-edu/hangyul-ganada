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
ANCHORS = ROOT / "content-cache" / "level-test-anchors.json"

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


#: Words a placement test must not put in front of a learner.
#:
#: The dictionary layer is 26,675 Wiktionary headwords and nothing curated it
#: for a learning product: it contains the vocabulary of sexual violence, of
#: slurs and of graphic injury, all of it perfectly good lexicography and none
#: of it something a person should meet while finding out how much Korean they
#: know. A word was already reaching learners — a question about 손을 ____ was
#: offering 강간했어요 as one of its three wrong answers.
#:
#: Deliberately *not* a general profanity filter over the app. The dictionary
#: still contains these words and search still finds them, which is what a
#: dictionary is for. This list governs what the *test* may ask about or offer
#: as a distractor, which is a different question.
#:
#: Ordinary words that name difficult things stay: 죽다, 병, 싸우다, 사고,
#: 살인 and 강도 are all in the teaching corpus with neutral examples, and a
#: language course that could not say "an accident happened" would be a worse
#: one.
_UNSUITABLE = (
    # Sexual content and sexual violence.
    "강간", "성폭", "성추행", "추행", "겁탈", "윤간", "성희롱", "매춘", "매음", "창녀",
    "포르노", "음란", "외설", "성교", "정사", "자위", "애무", "정액", "음경", "음부",
    "성기", "항문", "변태", "색정", "호색", "기생충"[:0] or "매독", "임질",
    # Slurs and profanity.
    "씨발", "새끼", "병신", "지랄", "존나", "개년", "썅", "쌍놈", "잡놈", "화냥",
    "짱깨", "쪽발", "깜둥", "튀기", "불구자", "벙어리", "귀머거리", "장님", "절름발",
    # Graphic violence, execution and self-harm.
    "학살", "참수", "고문", "처형", "총살", "교수형", "사형", "자살", "자해", "시체",
    "사체", "시신", "도살", "학대", "구타", "폭행", "인신매매", "노예",
    # Drugs.
    "마약", "헤로인", "코카인", "필로폰", "대마초", "아편", "각성제", "환각",
    # Bodily waste.
    "대변", "소변", "배설", "오줌", "똥",
)


def unsuitable(headword: str, gloss: str) -> bool:
    """Whether a word is one the test must not show. See `_UNSUITABLE`."""
    if any(term in headword for term in _UNSUITABLE):
        return True
    lowered = gloss.lower()
    return any(
        term in lowered
        for term in (
            "rape", "sexual", "genital", "obscene", "prostitut", "porn", "masturbat",
            "slur", "vulgar", "profan", "derogatory", "offensive", "swear word",
            "excrement", "faeces", "feces", "urine", "narcotic", "heroin", "cocaine",
            "execute by", "behead", "massacre", "torture", "suicide", "corpse",
        )
    )

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
    if unsuitable(headword, gloss):
        return False
    return True


def dictionary_anchors(taught: set[str]) -> list[dict]:
    """Entries from the dictionary layer that can carry a question.

    The part of speech comes from the entry chunks rather than from the index.
    It used to be an index column and is not one any more: a search result row
    renders a headword and a gloss, the part of speech was parsed into thirty
    thousand objects and shown by nothing, and it cost 27.5 kB gzipped of a file
    a learner waits for on their first search. Reading 84 chunks here costs a
    build script a second and costs a phone nothing.
    """
    manifest_path = DICTIONARY / "manifest.json"
    if not manifest_path.exists():
        return []
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    index = json.loads((DICTIONARY / manifest["index"]).read_text(encoding="utf-8"))
    part_of_speech: dict[str, str] = {}
    for chunk in manifest["chunks"].values():
        for entry in json.loads(
            (DICTIONARY / chunk["file"]).read_text(encoding="utf-8")
        )["entries"]:
            senses = entry.get("senses") or []
            if senses:
                part_of_speech[entry["headword"]] = senses[0]["partOfSpeech"]
    out: list[dict] = []
    seen: set[str] = set()
    for headword, _romanization, gloss, _chunk, _freq in index["rows"]:
        pos = part_of_speech.get(headword, "")
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
                "senseId": f"dict_{headword}",
                "category": "",
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
        # The corpus is curated and the filter still applies to it, because a
        # rule that only guards the untrusted half is a rule somebody has to
        # remember to extend when the halves change.
        if unsuitable(word["word"], gloss):
            continue
        rows.append(
            {
                "id": word["id"],
                "word": word["word"],
                "gloss": gloss,
                "pos": word["part_of_speech"],
                "example": word.get("example") or "",
                "surface": word.get("as") or word["word"],
                "senseId": word.get("senseId") or word["id"],
                "category": corpus["categories"][word["c"]],
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

    return {
        "_comment": (
            "GENERATED by scripts/content/build_level_test.py. Ranked assessment anchors, "
            "not the bank: `scripts/content/build_level_test.mjs` turns these into items. "
            "The split exists because building a *context* item means conjugating a verb, "
            "and there is one conjugator in this repository — a TypeScript one, because the "
            "app needs it too. Two implementations of Korean morphology would be two answers "
            "to the same question."
        ),
        "levels": LEVELS,
        "options": OPTIONS,
        "distractorSpread": DISTRACTOR_SPREAD,
        "perLevel": PER_LEVEL,
        "cumulative": CUMULATIVE,
        "anchors": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    anchors = build()
    rendered = json.dumps(anchors, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"

    stale = not ANCHORS.exists() or ANCHORS.read_text(encoding="utf-8") != rendered
    if stale and not args.check:
        ANCHORS.parent.mkdir(parents=True, exist_ok=True)
        ANCHORS.write_text(rendered, encoding="utf-8")

    rows = anchors["anchors"]
    per_level: dict[int, int] = {}
    for row in rows:
        per_level[row["level"]] = per_level.get(row["level"], 0) + 1
    with_example = sum(1 for row in rows if row["example"])
    print(f"Level test anchors — {len(rows):,} ranked words across {LEVELS} levels")
    print(f"  per level: min {min(per_level.values())}, max {max(per_level.values())}")
    print(f"  from the teaching corpus: {sum(1 for r in rows if r['source'] == 'corpus'):,}")
    print(f"  from the dictionary:      {sum(1 for r in rows if r['source'] == 'dictionary'):,}")
    print(f"  carrying an example sentence: {with_example:,}")
    if args.check and stale:
        print("\nanchors are out of date — run `npm run content:leveltest:anchors`")
        return 1
    if stale:
        print(f"\nwrote {ANCHORS.relative_to(ROOT)}")
    else:
        print("\nanchors up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
