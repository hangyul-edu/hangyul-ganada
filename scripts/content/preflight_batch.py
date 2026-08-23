#!/usr/bin/env python3
"""Read a candidate batch before it reaches the pack.

    python3 scripts/content/preflight_batch.py <file.jsonl> [more.jsonl ...]

## Why this exists

The first authored batch of fifty went through the whole pipeline — build,
example QA, sense QA — to be told two things a two-second comparison could have
said: 담배 had been given a sentence 피우다 already had, and 건강 one that
belonged to 중요하다. Each round trip through `content:vocabulary` and
`examples:qa` is minutes, and finding a duplicate that way is finding it at the
most expensive possible moment.

So this is the cheap half of the batch loop, run *before* the file is copied
into `content/vocabulary/entries/`. Everything here is decidable without
building anything: shape, required fields, duplicates against the pack and
against the batch itself, and the handful of authoring mistakes that the
expensive gates would otherwise catch one round trip later.

It does not replace `examples:qa` — that reads Korean grammar, supporting
vocabulary and translation semantics, and it is the gate that decides. This
only refuses to waste a build on a batch that cannot pass.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pack  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

MEANINGS = set(pack.MEANING_LOCALES)
SENTENCES = set(pack.SENTENCE_LOCALES)
HANGUL = re.compile(r"^[가-힣]+$")

#: A person the Korean does not have. The same rule `examples:qa` gates, run
#: early because it is the authoring mistake that recurs most.
INVENTED = {
    "en": re.compile(r"\b(He|he|his|His|him|Him|She|she|her|Her)\b"),
    "zh": re.compile(r"(?<![吉其])[他她](?!们)"),
    "es": re.compile(r"\b(Él|él|Ella|ella)\b"),
    "pt": re.compile(r"\b(Ele|ele|Ela|ela|dele|dela)\b"),
}
KOREAN_PERSON = re.compile(
    "그는|그가|그를|그의|그녀|아버지|아빠|형|오빠|남편|아들|삼촌|할아버지|어머니|엄마"
    "|언니|누나|아내|딸|할머니|소년|소녀|남자|여자|아저씨|아줌마|아주머니|아가씨"
    "|신사|숙녀|왕|여왕|장군"
)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    existing = pack.load()
    existing_examples = {entry.example: word for word, entry in existing.items() if entry.example}

    problems: list[str] = []
    seen_words: dict[str, str] = {}
    seen_examples: dict[str, str] = {}
    shapes: Counter[str] = Counter()
    rows = 0

    for name in sys.argv[1:]:
        path = Path(name)
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            where = f"{path.name}:{number}"
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                problems.append(f"{where}: not JSON — {error}")
                continue
            rows += 1
            word = str(row.get("w", ""))

            if not HANGUL.match(word):
                problems.append(f"{where}: {word!r} is not a Hangul word")
            if not 1 <= len(word) <= 5:
                problems.append(f"{where}: {word!r} is {len(word)} syllables")
            for field in ("k", "u", "sem", "m", "ex", "t"):
                if field not in row:
                    problems.append(f"{where}: {word} has no {field!r}")
            if row.get("k") != 1:
                problems.append(f"{where}: {word} is not marked to keep")
            if not isinstance(row.get("u"), int) or not 1 <= row.get("u", 0) <= 5:
                problems.append(f"{where}: {word} usefulness is {row.get('u')!r}, want 1–5")

            meanings = row.get("m") or {}
            missing = MEANINGS - set(meanings)
            if missing:
                problems.append(f"{where}: {word} has no meaning in {', '.join(sorted(missing))}")
            if any(not str(v).strip() for v in meanings.values()):
                problems.append(f"{where}: {word} has an empty meaning")

            translations = row.get("t") or {}
            missing = SENTENCES - set(translations)
            if missing:
                problems.append(f"{where}: {word} has no translation in {', '.join(sorted(missing))}")

            example = str(row.get("ex", ""))
            if word and word not in example and not _inflected(word, example):
                problems.append(f"{where}: {word} does not appear in its own example {example!r}")
            eojeol = len([piece for piece in example.split() if piece])
            if not 2 <= eojeol <= 8:
                problems.append(f"{where}: {word} example is {eojeol} eojeol, want 2–8")

            if word in existing:
                problems.append(f"{where}: {word} is already in the pack")
            if word in seen_words:
                problems.append(f"{where}: {word} appears twice in this batch ({seen_words[word]})")
            seen_words[word] = where

            if example in existing_examples:
                problems.append(
                    f"{where}: {word} reuses {existing_examples[example]}'s sentence {example!r}"
                )
            if example in seen_examples:
                problems.append(f"{where}: {word} reuses {seen_examples[example]}'s sentence")
            seen_examples[example] = word

            if not KOREAN_PERSON.search(example):
                for locale, pattern in INVENTED.items():
                    text = str(translations.get(locale, ""))
                    if pattern.search(text):
                        problems.append(
                            f"{where}: {word} — {example!r} names nobody and the {locale} does: {text!r}"
                        )

            shapes[_shape(example, word)] += 1

    # Shape concentration is *reported*, not failed.
    #
    # The first version of this rule failed a batch because eight of its fifty
    # sentences were shaped "… @… …." — which is not a template, it is Korean:
    # object, adverb, verb is the shape most short sentences have. A count
    # inside one batch cannot tell a natural shape from an over-used one,
    # because it cannot see the 2,600 sentences already written. `examples:qa`
    # can, and its rule is 1% of the whole corpus. So this prints the
    # distribution for the author to look at and leaves the verdict there.

    print(f"Batch preflight — {rows} candidate entr{'y' if rows == 1 else 'ies'}\n")
    print("  most repeated sentence shapes, for the author to read:")
    for shape, count in shapes.most_common(3):
        print(f"    {count:4}  {shape}")
    print()
    if problems:
        for problem in problems[:60]:
            print(f"  {problem}")
        if len(problems) > 60:
            print(f"  … and {len(problems) - 60} more")
        print(f"\n{len(problems)} problem(s). Nothing was copied into the pack.")
        return 1
    print("  every candidate is well formed, new, and unlike the others.")
    return 0


def _inflected(word: str, example: str) -> bool:
    """A verb or adjective appears conjugated, so compare on the stem."""
    return len(word) > 1 and word[:-1] in example


def _shape(example: str, word: str) -> str:
    return re.sub(r"[가-힣]+", "…", example.replace(word, "@"))


if __name__ == "__main__":
    raise SystemExit(main())
