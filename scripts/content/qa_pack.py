#!/usr/bin/env python3
"""Quality checks over the editorial content pack.

    python3 scripts/content/qa_pack.py            # report
    python3 scripts/content/qa_pack.py --check    # non-zero exit on any error

Coverage is counted by `report_coverage.py`; this is the other half — whether
what is there is *worth* counting. A field that is present and wrong is worse
than a field that is missing, because the coverage number says the work is
done.

Every check below exists because the failure it looks for is one a person
writing 2,800 entries actually makes, or one a machine translator actually
produces:

* an English string left in a Japanese field
* a "translation" that is the English copied unchanged
* the Korean example pasted into the translation slot
* two locales that received the same string because a row was duplicated
* a sentence that does not contain the word it is supposed to demonstrate
* a template sentence — "이것은 X입니다" for four hundred words — which is
  present, translated, and teaches nothing
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pack  # noqa: E402
from conjugate import appears_in  # noqa: E402

#: Locales written in a script that is not Latin. A Latin-only string in one of
#: them is an untranslated value, not a translation.
NON_LATIN = {"ko": "Hangul", "ja": "Japanese", "zh": "Han"}

_LATIN = re.compile(r"[A-Za-z]")
_HANGUL = re.compile(r"[가-힣]")
_KANA = re.compile(r"[぀-ヿ]")
_HAN = re.compile(r"[一-鿿]")

#: A field that still contains one of these is a placeholder, whatever the
#: coverage report says.
PLACEHOLDERS = (
    "TODO",
    "FIXME",
    "XXX",
    "lorem",
    "placeholder",
    "[word]",
    "{word}",
    "N/A",
    "n/a",
    "???",
)

#: Sentence templates that would let a batch reach 100% without teaching
#: anything. Checked as a *frequency*, not as a ban: 이것은 사과예요 is a fine
#: sentence for 사과 and a lazy one if it is also the sentence for four hundred
#: other nouns.
MAX_TEMPLATE_SHARE = 0.04

#: A learner sentence past this is not a learner sentence.
MAX_EXAMPLE_CHARS = 30

#: How much longer a translation may be than the English before it is flagged.
#: German and Portuguese legitimately run long; five times is not legitimate,
#: it is a definition that escaped into a translation slot.
MAX_EXPANSION = 3.2


class Finding:
    __slots__ = ("word", "kind", "detail", "fatal")

    def __init__(self, word: str, kind: str, detail: str, fatal: bool = True) -> None:
        self.word, self.kind, self.detail, self.fatal = word, kind, detail, fatal

    def __str__(self) -> str:
        mark = "error" if self.fatal else "warn "
        return f"  {mark}  {self.word:<10} {self.kind:<22} {self.detail}"


def _norm(text: str) -> str:
    return unicodedata.normalize("NFKC", text).strip().lower().rstrip(".!?。！？")


def check() -> list[Finding]:
    entries = pack.load()
    kept = {w: e for w, e in entries.items() if e.keep}
    findings: list[Finding] = []
    add = findings.append

    example_counts = Counter()
    shape_counts = Counter()
    meaning_by_locale: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))

    for word, entry in kept.items():
        # --- meanings ---------------------------------------------------
        for locale, meaning in entry.meanings.items():
            if any(p in meaning for p in PLACEHOLDERS):
                add(Finding(word, f"placeholder:{locale}", meaning))
            if locale in NON_LATIN and not (
                _HANGUL.search(meaning) or _KANA.search(meaning) or _HAN.search(meaning)
            ):
                add(Finding(word, f"untranslated:{locale}", meaning))
            if locale in ("ja", "zh") and _HANGUL.search(meaning):
                add(Finding(word, f"hangul-in-{locale}", meaning))
            if locale not in NON_LATIN and (_HANGUL.search(meaning) or _KANA.search(meaning)):
                add(Finding(word, f"cjk-in-{locale}", meaning))
            meaning_by_locale[locale][_norm(meaning)].append(word)

        # A single Romance locale sharing a spelling with English is a fact
        # about the two languages, not a missed translation — French really
        # does say "air". All four at once is a row that was pasted.
        english = entry.english
        if english:
            same = [loc for loc in ("es", "fr", "de", "pt")
                    if _norm(entry.meanings[loc]) == _norm(english)]
            if len(same) >= 3:
                add(Finding(word, "copied-english", f"{','.join(same)}: {english}", fatal=False))

        # --- the Korean example -----------------------------------------
        example = entry.example
        if not _HANGUL.search(example):
            add(Finding(word, "example-not-korean", example))
        if _LATIN.search(example):
            add(Finding(word, "latin-in-example", example))
        if len(example) > MAX_EXAMPLE_CHARS:
            add(Finding(word, "example-too-long", f"{len(example)} chars: {example}"))
        found = appears_in(word, example)
        if found is None:
            add(Finding(word, "example-lacks-word", example))
        example_counts[_norm(example)] += 1
        # The sentence with the target word blanked out. Two hundred sentences
        # that differ only in the word dropped into the hole are a template,
        # and a template is coverage without teaching.
        shape_counts[example.replace(found, "@") if found else example] += 1

        # --- the example's translations ---------------------------------
        for locale, text in entry.translations.items():
            if any(p in text for p in PLACEHOLDERS):
                add(Finding(word, f"placeholder-t:{locale}", text))
            if _HANGUL.search(text):
                add(Finding(word, f"korean-in-translation:{locale}", text))
            if locale in NON_LATIN and not (_KANA.search(text) or _HAN.search(text)):
                add(Finding(word, f"untranslated-t:{locale}", text))
            if locale != "en" and _norm(text) == _norm(entry.translations["en"]):
                add(Finding(word, f"english-copied-t:{locale}", text))
        english_len = max(1, len(entry.translations["en"]))
        for locale in ("es", "fr", "de", "pt"):
            if len(entry.translations[locale]) > english_len * MAX_EXPANSION:
                add(Finding(word, f"expansion:{locale}", entry.translations[locale], fatal=False))

    # --- cross-entry checks ---------------------------------------------
    total = max(1, len(kept))
    for sentence, count in example_counts.items():
        if count > 1:
            add(Finding("—", "duplicate-example", f"{count}x {sentence}"))
    for shape, count in shape_counts.most_common(6):
        share = count / total
        if share > MAX_TEMPLATE_SHARE:
            add(
                Finding(
                    "—",
                    "template-overused",
                    f"{count} entries ({share:.1%}) share the shape {shape}",
                )
            )
    for locale, by_text in meaning_by_locale.items():
        for text, words in by_text.items():
            # Korean genuinely has synonym clusters, so a shared meaning is not
            # automatically wrong — but five words with the identical gloss
            # means the gloss is too coarse to tell them apart on a card.
            if len(words) >= 5:
                add(
                    Finding(
                        "—",
                        f"meaning-collision:{locale}",
                        f"{len(words)} words share {text!r}: {', '.join(words[:6])}",
                        fatal=False,
                    )
                )
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="exit non-zero on any error")
    args = parser.parse_args()

    findings = check()
    errors = [f for f in findings if f.fatal]
    warnings = [f for f in findings if not f.fatal]

    entries = pack.load()
    kept = sum(1 for e in entries.values() if e.keep)
    print(f"pack QA — {kept:,} entries kept, {len(entries) - kept} removed")

    if errors:
        print(f"\n{len(errors)} error(s):")
        for finding in errors[:60]:
            print(finding)
        if len(errors) > 60:
            print(f"  … and {len(errors) - 60} more")
    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for finding in warnings[:30]:
            print(finding)
        if len(warnings) > 30:
            print(f"  … and {len(warnings) - 30} more")
    if not findings:
        print("no findings")

    return 1 if (args.check and errors) else 0


if __name__ == "__main__":
    raise SystemExit(main())
