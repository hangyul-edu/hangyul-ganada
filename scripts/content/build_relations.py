#!/usr/bin/env python3
"""Builds the shipping synonym/antonym set from the fetched dictionary pages.

    python3 scripts/content/build_relations.py
    python3 scripts/content/build_relations.py --check    # fails if stale

Reads ``content-cache/relations-wikitext.jsonl`` (see ``fetch_relations.py``)
and writes ``content/vocabulary/relations.json``, which is committed and is
what the app's generated data is derived from.

## The one rule

A relation ships only when the dictionary states it, as that relation, for the
sense this app teaches. Nothing here derives a relation from a category, a
frequency band, an embedding, a shared example sentence, or the fact that two
words are often used together. A word with no stated 유의어 gets no synonyms,
and its Word Detail page shows no synonym section at all.

That is a deliberate trade. The set this produces is small — most of the corpus
has no stated relation — and a smaller correct dictionary is worth more than a
fuller one a learner cannot trust.

## How a sense is pinned down

A Korean headword can hold several unrelated words. 고기 is meat and, under a
different entry, an old record; 밤 is night and a chestnut. The wiki writes
those as separate blocks, so the parser:

1. reads only the ``== 한국어 ==`` section, never Middle Korean or Jeju;
2. takes the first part-of-speech block matching the part of speech this app
   teaches the word as;
3. inside it, takes only the **first** numbered sub-block — ``==== 명사 1 ====``
   — which is the primary sense, the one the app's gloss and audio are for.

Anything stated under a later sense is dropped rather than guessed at.

## Both directions have to agree

A relation also has to be stated from both ends: 남자 lists 여자 as its 반의어
*and* 여자 lists 남자. One-sided entries are where the sense drift actually
lives — a page lists a synonym that belongs to its third sense, and nothing on
the target's page ever claims the relationship back. Requiring both ends is the
cheapest sense check available that does not involve guessing, and it is what
keeps pairs like 고기/살 (the wiki's "flesh", this app's "years of age") out.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content-cache" / "relations-wikitext.jsonl"
VOCABULARY = ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.json"
GLOSSES = ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.ko.json"
TARGET = ROOT / "content" / "vocabulary" / "relations.json"
#: What the app bundles: the same relations without the provenance prose, which
#: is 12 KB the learner would download and never see.
APP_TARGET = ROOT / "apps" / "web" / "src" / "data" / "generated" / "relations.json"

SOURCE_ID = "ko-wiktionary"
SOURCE_NAME = "Korean Wiktionary (한국어 위키낱말사전)"
LICENSE = "CC BY-SA 4.0"
LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"

#: The two customer-facing relations, and the wiki headings that state them.
#:
#: Nothing else is read. 관련 어휘 ("related vocabulary"), 합성어 (compounds),
#: 파생어 (derived forms), 상위어/하위어 (broader/narrower) are all real lexical
#: information and none of them is a synonym — mixing them into one list is the
#: defect this file exists to remove.
RELATIONS = {"유의어": "synonym", "반의어": "antonym"}

#: App part of speech → the wiki's level-3 headings for it.
POS_HEADINGS = {
    "noun": ("명사",),
    "verb": ("동사",),
    "adjective": ("형용사",),
    "adverb": ("부사",),
    "pronoun": ("대명사",),
    "numeral": ("수사",),
    "determiner": ("관형사",),
    "interjection": ("감탄사",),
    "particle": ("조사",),
}

KOREAN_SECTION = re.compile(r"^==\s*한국어\s*==\s*$", re.M)
ANY_L2 = re.compile(r"^==[^=].*==\s*$", re.M)
L3 = re.compile(r"^===\s*([^=]+?)\s*===\s*$", re.M)
#: A numbered sense sub-block, e.g. `==== 명사 1 ====`.
SENSE = re.compile(r"^====+\s*(?:명사|동사|형용사|부사|대명사|수사|관형사|감탄사|조사)\s*\d+\s*=+=\s*$", re.M)
DEFINITION = re.compile(r"^#(?!#)\s*(.+)$", re.M)
MARKUP = re.compile(r"\[\[([^\]|]*\|)?|\]\]|\{\{[^}]*\}\}|'{2,}")
RELATION_LINE = re.compile(r"^\*\s*(유의어|반의어)\s*[:：]?\s*(.*)$", re.M)
RELATION_HEADING = re.compile(r"^(====+)\s*(유의어|반의어)\s*=+\s*$", re.M)
LINK = re.compile(r"\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]|\{\{l\|ko\|([^}|]+)")
HANGUL_ONLY = re.compile(r"^[가-힣]+$")


def korean_section(text: str) -> str:
    """Only the Korean part of the page. Other languages are a different word."""
    start = KOREAN_SECTION.search(text)
    if not start:
        return ""
    rest = text[start.end() :]
    end = ANY_L2.search(rest)
    return rest[: end.start()] if end else rest


def pos_block(section: str, pos: str) -> str:
    """The first part-of-speech block matching how this app teaches the word."""
    headings = POS_HEADINGS.get(pos)
    if not headings:
        return ""
    marks = list(L3.finditer(section))
    for index, mark in enumerate(marks):
        if mark.group(1).strip() not in headings:
            continue
        stop = marks[index + 1].start() if index + 1 < len(marks) else len(section)
        return section[mark.end() : stop]
    return ""


def sense_blocks(block: str) -> list[str]:
    """A part-of-speech block split into its numbered sub-blocks.

    `==== 명사 1 ====` and `==== 명사 2 ====` are not two shades of one word;
    they are two different words that happen to be spelled the same — 밤 the
    night and 밤 the chestnut. Everything downstream works on one of them.
    """
    marks = list(SENSE.finditer(block))
    if not marks:
        return [block] if block.strip() else []
    bounds = [m.end() for m in marks] + [len(block)]
    starts = [m.start() for m in marks]
    return [block[bounds[i] : starts[i + 1] if i + 1 < len(marks) else len(block)]
            for i in range(len(marks))]


def primary_sense(block: str) -> str:
    """The first numbered sense, or the whole block when it is not divided."""
    blocks = sense_blocks(block)
    return blocks[0] if blocks else ""


def definitions(scope: str) -> list[str]:
    """The `# …` definition lines in a block, as plain text."""
    return [MARKUP.sub("", m.group(1)).strip() for m in DEFINITION.finditer(scope)]


def overlap(left: str, right: str) -> float:
    """How much two short Korean definitions have in common, 0–1.

    Character bigrams rather than words: Korean glosses inflect and agglutinate,
    so "먹는 짐승의 살" and "식용하는 동물의 살" share no whole word and plenty
    of bigrams. Used only to *compare* candidate senses against each other —
    never as an absolute threshold, because the number is far too rough to
    decide on its own whether two definitions mean the same thing.
    """
    def grams(text: str) -> set[str]:
        letters = re.sub(r"[^가-힣]", "", text)
        return {letters[i : i + 2] for i in range(len(letters) - 1)}

    a, b = grams(left), grams(right)
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def teaches_first_sense(block: str, gloss: str) -> bool:
    """Whether the app's own meaning is the wiki's *first* homograph.

    Only asked when the wiki splits the headword into numbered sub-blocks, and
    answered by comparing the app's gloss against each of them and seeing which
    one wins. A relative comparison, not a threshold: the question is not "are
    these definitions similar enough", which no character metric can answer, but
    "of these two spellings-alike, which one is this app teaching" — and there
    the roughest signal is enough, because the alternatives are unrelated words.

    Ties go to the first block, which is what the parser would have taken
    anyway.
    """
    blocks = sense_blocks(block)
    if len(blocks) < 2:
        return True
    scores = [max((overlap(d, gloss) for d in definitions(b)), default=0.0) for b in blocks]
    return scores[0] >= max(scores)


def links(text: str) -> list[str]:
    """Headwords named in a fragment of wikitext, in order, without duplicates."""
    out: list[str] = []
    for match in LINK.finditer(text):
        target = (match.group(1) or match.group(2) or "").strip()
        # Hanja glosses `(肉)`, romanisations and phrases are not app headwords.
        if not HANGUL_ONLY.match(target):
            continue
        if target not in out:
            out.append(target)
    return out


def stated_relations(scope: str) -> dict[str, list[str]]:
    """Every 유의어/반의어 the wiki states inside `scope`, by relation type.

    Two notations, both in live use: an inline `*유의어: [[가]], [[나]]` line and
    a `==== 유의어 ====` heading over a bullet list.
    """
    found: dict[str, list[str]] = {"synonym": [], "antonym": []}

    for match in RELATION_LINE.finditer(scope):
        kind = RELATIONS[match.group(1)]
        for target in links(match.group(2)):
            if target not in found[kind]:
                found[kind].append(target)

    headings = list(RELATION_HEADING.finditer(scope))
    for index, heading in enumerate(headings):
        kind = RELATIONS[heading.group(2)]
        # The list runs until the next heading of the same or a shallower level.
        level = len(heading.group(1))
        rest = scope[heading.end() :]
        stop = re.search(rf"^={{2,{level}}}[^=]", rest, re.M)
        body = rest[: stop.start()] if stop else rest
        for target in links(body):
            if target not in found[kind]:
                found[kind].append(target)
        del index

    return found


#: See `content/vocabulary/relation-headings.json` for what this is and is not.
READ_INSTEAD = {
    word: value["heading"]
    for word, value in json.loads(
        (ROOT / "content/vocabulary/relation-headings.json").read_text(encoding="utf-8")
    )["readInstead"].items()
}


def heading_for(word: str, taught_pos: str) -> str:
    """Which part-of-speech block to read for this word.

    The taught part of speech, except for the handful of words where the wiki
    files the app's own sense under a different heading. Scoping by part of
    speech is what stops a homograph's relations leaking in, and it costs four
    true pairs to do it — those four are named in the file rather than recovered
    by a rule, because no rule distinguishes "the wiki filed this wrongly" from
    "these are two different words".
    """
    return READ_INSTEAD.get(word, taught_pos)


def corpus() -> tuple[dict[str, dict], dict[str, str]]:
    """Headword → the shipping entry, and headword → the meaning the app teaches.

    The Korean gloss rather than a translation, because it is being compared
    against Korean dictionary definitions.
    """
    data = json.loads(VOCABULARY.read_text(encoding="utf-8"))
    glosses = json.loads(GLOSSES.read_text(encoding="utf-8"))["words"]
    by_word: dict[str, dict] = {}
    taught: dict[str, str] = {}
    for index, word in enumerate(data["words"]):
        # A headword shipped twice would make "which entry does this open"
        # ambiguous; first wins, and `--check` in vocabulary-qa guards the rest.
        if word["word"] in by_word:
            continue
        by_word[word["word"]] = word
        taught[word["word"]] = glosses[index][0]
    return by_word, taught


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the file is stale")
    args = parser.parse_args()

    if not CACHE.exists():
        print(f"missing {CACHE} — run scripts/content/fetch_relations.py", file=sys.stderr)
        return 1

    words, taught = corpus()

    # Pass one: what each page states, scoped to the taught sense.
    stated: dict[str, dict[str, list[str]]] = {}
    pages: dict[str, str] = {}
    for line in CACHE.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        word = row["w"]
        entry = words.get(word)
        if entry is None:
            continue
        section = korean_section(row["wikitext"])
        block = pos_block(section, heading_for(word, entry["part_of_speech"]))
        if not block:
            continue
        # A headword the wiki splits into homographs contributes nothing unless
        # the one this app teaches is the first of them — the only one whose
        # relations the parser reads. See `teaches_first_sense`.
        if not teaches_first_sense(block, taught[word]):
            continue
        scope = primary_sense(block)
        if not scope:
            continue
        pages[word] = row["url"]
        stated[word] = stated_relations(scope)

    # Pass two: keep only what both ends state, and only between words this app
    # actually ships — a relation the learner cannot open is not one worth
    # printing, and mutual statement is the sense check (see the module docs).
    built: dict[str, dict[str, list[str]]] = defaultdict(lambda: {"synonyms": [], "antonyms": []})
    field = {"synonym": "synonyms", "antonym": "antonyms"}
    for word, kinds in stated.items():
        for kind, targets in kinds.items():
            for target in targets:
                if target == word or target not in words:
                    continue
                back = stated.get(target)
                if not back or word not in back[kind]:
                    continue
                bucket = built[words[word]["id"]][field[kind]]
                target_id = words[target]["id"]
                if target_id not in bucket:
                    bucket.append(target_id)

    entries = {
        word_id: value
        for word_id, value in sorted(built.items())
        if value["synonyms"] or value["antonyms"]
    }

    payload = {
        "_comment": (
            "Verified lexical relations for the shipping vocabulary. Built by "
            "scripts/content/build_relations.py from the Korean Wiktionary; a "
            "relation is here only because both headwords state it, as that "
            "relation, for the sense this app teaches. Nothing is inferred from "
            "category, frequency or similarity. Do not hand-edit."
        ),
        "generator": "scripts/content/build_relations.py",
        # Shaped as a `ContentSourceRecord` so the Legal screen can credit it
        # beside the other sources without a second type. CC BY-SA 4.0 requires
        # the attribution, and the relation data is the only thing this source
        # contributes.
        "source": {
            "id": SOURCE_ID,
            "name": SOURCE_NAME,
            "license": LICENSE,
            "license_url": LICENSE_URL,
            "homepage": "https://ko.wiktionary.org/",
            "provides": "Synonym and antonym relations between vocabulary words",
            "attribution": "Synonym and antonym relations from the Korean Wiktionary, CC BY-SA 4.0",
            "reference_template": "https://ko.wiktionary.org/wiki/{word}",
            "derived": False,
        },
        "relation_types": ["synonym", "antonym"],
        "counts": {
            "words_with_relations": len(entries),
            "synonym_pairs": sum(len(v["synonyms"]) for v in entries.values()) // 2,
            "antonym_pairs": sum(len(v["antonyms"]) for v in entries.values()) // 2,
            "corpus_words": len(words),
        },
        "pages": {words[w]["id"]: url for w, url in sorted(pages.items()) if w in words},
        "entries": entries,
    }
    rendered = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    bundled = (
        json.dumps(
            {
                "_comment": payload["_comment"],
                "source": payload["source"],
                "entries": entries,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n"
    )

    if args.check:
        for path, expected in ((TARGET, rendered), (APP_TARGET, bundled)):
            current = path.read_text(encoding="utf-8") if path.exists() else ""
            if current != expected:
                print(f"{path} is stale — run npm run vocabulary:relations", file=sys.stderr)
                return 1
        print(f"relations up to date ({len(entries):,} words)")
        return 0

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(rendered, encoding="utf-8")
    APP_TARGET.write_text(bundled, encoding="utf-8")
    print(
        f"  → {TARGET}: {len(entries):,} words carry a relation "
        f"({payload['counts']['synonym_pairs']:,} synonym pairs, "
        f"{payload['counts']['antonym_pairs']:,} antonym pairs) "
        f"out of {len(words):,}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
