#!/usr/bin/env python3
"""Counts what actually ships, and fails the build when it is not everything.

    npm run content:coverage           # print the matrix
    npm run content:coverage -- --check   # exit non-zero below the threshold

## Why this exists

"Coverage" is the number a content pipeline is most tempted to lie about. A
field is present, so it counts; a file exists, so it counts. This report counts
*semantically*: a meaning that is the English string copied into the Japanese
slot is not a Japanese meaning, an audio file of four hundred bytes is not a
recording, and an example sentence that fails the teaching-quality gate is not
an example.
`qa_pack.py` and `qa_audio.py` do the deeper checks; this one refuses to count
anything they would reject, and it reads the built artefacts rather than the
sources, so it measures what a customer would receive.

## The threshold

Every row must be 100%. Not "green above 95" — 100, because the product is paid
and a learner who lands on the one word in forty whose sentence is missing does
not experience 97.5% coverage, they experience a broken card.

Rows that are legitimately not applicable say so and are excluded from the
total with the reason written down. There is exactly one: an example sentence
is already Korean, so the Korean locale has no translation of it to carry.
"""

from __future__ import annotations

import argparse
import json
import sys
import wave
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pack  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps" / "web"
GENERATED = WEB / "src" / "data" / "generated"
PUBLIC = WEB / "public"

VOCABULARY = GENERATED / "vocabulary.json"
#: Written by `npm run examples:qa`. See `example_rows`.
EXAMPLES_QA = ROOT / "content" / "vocabulary" / "examples-qa.json"
#: The exported curriculum, which is where the character data actually lives.
#: It is written by `npm run curriculum:build` from the app's own source, so
#: this reads exactly what ships rather than a second copy of it.
CHARACTERS = ROOT / "content" / "curriculum.json"
LETTER_COPY = ROOT / "content" / "letters"
AUDIO_MANIFEST = PUBLIC / "audio" / "manifest.json"

#: Locales with a vocabulary pack, in the order the report prints. These are
#: the languages whose *word* rows can be at 100%; the other twenty-two ship a
#: translated interface and alphabet course and fall back to English on the
#: word cards, which is stated in docs/LOCALIZATION_NATIVE_REVIEW.md and on the
#: language picker rather than counted as a gap here.
LOCALES = ("en", "ko", "ja", "zh-CN", "es", "fr", "de", "pt-BR", "vi", "th")

#: Every language the alphabet course is written in — the letter rows below are
#: measured against this, not against LOCALES, because the two claims are
#: different sizes and reporting them as one number is how six locales once
#: shipped English lesson copy under a 100% coverage report.
LETTER_LOCALES = ("en", "ko") + tuple(
    sorted(p.stem for p in LETTER_COPY.glob("*.json"))
) if LETTER_COPY.exists() else ("en", "ko")

LOCALE_NAMES = {
    "en": "English",
    "ko": "한국어",
    "ja": "日本語",
    "zh-CN": "简体中文",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "pt-BR": "Português (BR)",
    "vi": "Tiếng Việt",
    "th": "ไทย",
    "ar": "العربية",
    "bn": "বাংলা",
    "cs": "Čeština",
    "el": "Ελληνικά",
    "fil": "Filipino",
    "hi": "हिन्दी",
    "hu": "Magyar",
    "id": "Bahasa Indonesia",
    "it": "Italiano",
    "kk": "Қазақ тілі",
    "ky": "Кыргызча",
    "mn": "Монгол хэл",
    "nl": "Nederlands",
    "pl": "Polski",
    "ro": "Română",
    "ru": "Русский",
    "sv": "Svenska",
    "ta": "தமிழ்",
    "te": "తెలుగు",
    "tr": "Türkçe",
    "uk": "Українська",
    "uz": "O‘zbekcha",
}

#: An audio file below this is silence or a truncated write, not a word.
#:
#: 600, not the 1,200 it was. The old number was calibrated against an engine
#: that spoke at 0.82×, which stretched every clip by about a fifth; at the
#: current 1.0× the shortest closed syllables came in at 1,101 and 1,197 bytes
#: and this check called three of them missing — 입 in both voices and 밥 in the
#: female one. A three-byte miss.
#:
#: They were measured before the number was moved. Their amplitude envelopes
#: decay to near-silence — a tail-to-peak ratio of 0.004 to 0.017, *lower* than
#: 옷 at 0.026 and 밥's male clip at 0.110, both of which pass — and a truncated
#: recording ends loud, mid-vowel. 입 and 밥 are closed syllables ending in a
#: stop, so they are short and they end quietly. Nothing is wrong with them.
#:
#: A recogniser was tried first and could not settle it: 컵 at 264 ms comes back
#: as 컵, and 옷 at the same length comes back empty. It cannot tell a short
#: syllable from a cut one, so it is not evidence here.
#:
#: What this floor is for is an *empty or failed* write, and 600 bytes still
#: catches that with room under every real clip. The question this number used
#: to be asked — is the clip long enough for what it says — belongs to
#: `qa_audio.py`, which decodes the audio and bounds its duration per syllable
#: against the rate the provider declares it was generated at.
MIN_AUDIO_BYTES = 600


@dataclass
class Row:
    label: str
    have: int
    total: int
    note: str | None = None

    @property
    def applicable(self) -> bool:
        return self.total > 0

    @property
    def percent(self) -> float:
        return 100.0 * self.have / self.total if self.total else 100.0

    @property
    def complete(self) -> bool:
        return self.have >= self.total

    def render(self, width: int) -> str:
        counts = f"{self.have:,} / {self.total:,}"
        mark = " " if self.complete else "!"
        note = f"   {self.note}" if self.note else ""
        return f"{mark} {self.label:<{width}} {counts:>15}   {self.percent:6.2f}%{note}"


def _load(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"{path} is missing — run the content build first")
    return json.loads(path.read_text(encoding="utf-8"))


def _audio_ok(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < MIN_AUDIO_BYTES:
        return False
    if path.suffix == ".wav":
        try:
            with wave.open(str(path)) as handle:
                return handle.getnframes() > 0
        except wave.Error:
            return False
    return True


def vocabulary_rows(words: list[dict]) -> list[Row]:
    total = len(words)
    rows = [Row("Vocabulary entries", total, total)]

    def count(label: str, predicate) -> None:
        rows.append(Row(label, sum(1 for w in words if predicate(w)), total))

    count("Part of speech", lambda w: bool(w.get("part_of_speech")))
    # Revised Romanization, derived from the standard pronunciation. The field
    # was called `pronunciation` and held IPA; the row is the same question.
    count("Romanization", lambda w: bool(w.get("romanization")))
    # Syllables are not a stored field — they are `[...word]`, and the app
    # splits them. The row still counts, because "can this word be broken into
    # writable blocks" is a content question; it is answered from the word.
    count("Syllable breakdown", lambda w: bool(w.get("word")))
    count("Difficulty classification", lambda w: isinstance(w.get("difficulty_level"), int))
    # `f` is `[band index, rank, rate]`; an unobserved word has a band and a
    # null rank, which is the distinction these two rows exist to keep apart.
    count("Frequency classification", lambda w: isinstance((w.get("f") or [None])[0], int))
    count("Frequency evidence (observed)", lambda w: (w.get("f") or [None, None])[1] is not None)
    count("Usefulness classification", lambda w: isinstance(w.get("usefulness"), int))
    count("Letter-readiness metadata", lambda w: isinstance(w.get("letters_ready_after"), int))
    count("Source/provenance metadata", lambda w: bool(w.get("prov")))
    count("Example sentence", lambda w: bool(w.get("example")))
    # The browsing category. A release blocker in its own right: a word with no
    # category cannot be found by anyone who does not already know it exists,
    # which for a vocabulary of 2,504 means it may as well not be there.
    count("Primary category", lambda w: isinstance(w.get("c"), int))
    return rows


def meaning_rows(words: list[dict], order: list[str]) -> list[Row]:
    """Counts the per-locale copy files.

    Each `vocabulary.<locale>.json` holds one row per word, in the same order as
    `vocabulary.json`, as `[meaning, example translation, long definition]`. The
    app loads one of them; this reads all eight, because the release blocker is
    that every language is complete, not that the current one is.
    """
    total = len(words)
    rows: list[Row] = []
    packs: dict[str, list] = {}
    for locale in order:
        path = VOCABULARY.with_name(f"vocabulary.{locale}.json")
        packs[locale] = _load(path).get("words", []) if path.exists() else []

    def column(locale: str, position: int) -> int:
        rows_for_locale = packs.get(locale) or []
        if len(rows_for_locale) != total:
            # A pack of the wrong length is not partial coverage, it is a stale
            # build — and reporting it as 40% complete would hide that.
            return 0
        # A `None` row is a word the hand-written packs have no line for — see
        # the note in `build_vocabulary.py`. It is a gap, not a crash.
        return sum(1 for row in rows_for_locale if row and (row[position] or "").strip())

    for locale in LOCALES:
        rows.append(Row(f"Meaning — {LOCALE_NAMES[locale]}", column(locale, 0), total))
    for locale in LOCALES:
        if locale == "ko":
            rows.append(
                Row(
                    f"Example translation — {LOCALE_NAMES[locale]}",
                    0,
                    0,
                    note="not applicable: the sentence is already Korean",
                )
            )
            continue
        rows.append(Row(f"Example translation — {LOCALE_NAMES[locale]}", column(locale, 1), total))
    return rows


def example_rows(words: list[dict]) -> list[Row]:
    """The example sentences, counted by whether they are *good*.

    Presence is the easy half and `vocabulary_rows` already has it. What this
    adds is the verdict from `examples_qa.py`: a sentence that is present,
    translated and recorded but teaches the wrong sense of the word is a
    complete row in a coverage matrix and a defect in the product.

    A stale report counts as zero rather than as a pass. The alternative — fall
    back to counting presence — would let a corpus change silently downgrade
    this row from "every sentence is good" to "every sentence exists" with no
    visible difference in the output.
    """
    total = len(words)
    if not EXAMPLES_QA.exists():
        return [Row("Example sentence quality", 0, total, note="run `npm run examples:qa`")]
    report = _load(EXAMPLES_QA)
    if report.get("words") != total:
        return [
            Row(
                "Example sentence quality",
                0,
                total,
                note=f"stale: the report covers {report.get('words', 0):,} words",
            )
        ]
    return [
        Row("High-quality Korean example", report.get("pass", 0), total),
        Row("Unresolved REWRITE", total - report.get("rewrite", 0), total),
        Row("Unresolved REVIEW", total - report.get("review", 0), total),
    ]


def audio_rows(words: list[dict]) -> list[Row]:
    total = len(words)
    manifest = _load(AUDIO_MANIFEST) if AUDIO_MANIFEST.exists() else {}
    # The manifest is keyed by a hash of the text; the report needs to look up
    # by the text itself, so it is re-indexed here rather than in the app.
    by_text: dict[tuple[str, str], dict] = {
        (entry.get("kind", ""), entry.get("text", "")): entry
        for entry in manifest.get("entries", [])
    }

    def present(kind: str, text: str, voice: str) -> bool:
        entry = by_text.get((kind, text))
        if not entry:
            return False
        clip = entry.get(voice)
        if not isinstance(clip, dict) or not clip.get("src"):
            return False
        return _audio_ok(PUBLIC / clip["src"])

    rows: list[Row] = []
    for voice, label in (("female", "female"), ("male", "male")):
        rows.append(
            Row(
                f"Word audio — {label}",
                sum(1 for w in words if present("word", w["word"], voice)),
                total,
            )
        )
    for voice, label in (("female", "female"), ("male", "male")):
        rows.append(
            Row(
                f"Sentence audio — {label}",
                sum(
                    1
                    for w in words
                    if w.get("example") and present("sentence", w["example"], voice)
                ),
                total,
            )
        )
    return rows


def _letter_rows() -> dict[str, dict[str, list]]:
    """Every language's letter copy, keyed by locale and then by the letter."""
    if not LETTER_COPY.exists():
        return {}
    return {p.stem: _load(p) for p in sorted(LETTER_COPY.glob("*.json"))}


LETTER_ROWS = _letter_rows()


def character_rows() -> list[Row]:
    if not CHARACTERS.exists():
        return []
    data = _load(CHARACTERS)
    characters = data.get("characters", [])
    total = len(characters)
    rows = [Row("Hangul learning units", total, total)]

    def count(label: str, predicate) -> None:
        rows.append(Row(label, sum(1 for c in characters if predicate(c)), total))

    # A syllable block is read, not named — 가 has no letter name and reporting
    # it as a gap would be reporting the language as incomplete.
    letters = [c for c in characters if c.get("group") != "syllable"]
    rows.append(
        Row("Letter name", sum(1 for c in letters if c.get("letter_name")), len(letters))
    )
    count("Representative sound", lambda c: bool(c.get("sound_example")))
    count("Stroke order", lambda c: bool(c.get("strokes")))
    count(
        "Stroke count agrees with the diagram",
        lambda c: len(c.get("strokes") or []) == c.get("stroke_count"),
    )
    count(
        "Stroke start and direction",
        # Both come from the points: the first is where the pen lands, the last
        # is where it lifts. A stroke with fewer than two has neither.
        lambda c: bool(c.get("strokes"))
        and all(len(s.get("points") or []) >= 2 for s in c["strokes"]),
    )
    count("Pronunciation audio", lambda c: bool((c.get("audio") or {}).get("sound")))

    # The letter explanations live in `content/letters/<locale>.json`, one file
    # per language, and only English and Korean are written inline with the
    # curriculum — see `apps/web/src/data/letterCopy.ts` for why. So the hint
    # and mnemonic rows read both places.
    def hint_of(character: dict, locale: str) -> str | None:
        row = LETTER_ROWS.get(locale, {}).get(character.get("character"))
        if row:
            return row[0]
        return ((character.get("translations") or {}).get(locale) or {}).get("pronunciation_hint")

    def mnemonic_of(character: dict, locale: str) -> str | None:
        row = LETTER_ROWS.get(locale, {}).get(character.get("character"))
        if row:
            return row[1]
        return ((character.get("translations") or {}).get(locale) or {}).get("mnemonic")

    for locale in LETTER_LOCALES:
        count(
            f"Pronunciation hint — {LOCALE_NAMES.get(locale, locale)}",
            lambda c, loc=locale: bool(hint_of(c, loc)),
        )
    # Mnemonics are written where a shape needs remembering and left out where
    # it does not, so the row that matters is not "how many have one" but
    # "wherever English has one, does every language". That is what a learner
    # would notice: a hook in one language and a blank in theirs.
    with_mnemonic = [
        c for c in characters if ((c.get("translations") or {}).get("en") or {}).get("mnemonic")
    ]
    for locale in LETTER_LOCALES:
        rows.append(
            Row(
                f"Mnemonic — {LOCALE_NAMES.get(locale, locale)}",
                sum(1 for c in with_mnemonic if mnemonic_of(c, locale)),
                len(with_mnemonic),
            )
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="exit non-zero below 100%%")
    parser.add_argument("--json", type=Path, help="also write the matrix as JSON")
    args = parser.parse_args()

    data = _load(VOCABULARY)
    words = data["words"]

    sections: list[tuple[str, list[Row]]] = [
        ("Vocabulary", vocabulary_rows(words)),
        ("Learning content by language", meaning_rows(words, data.get("locales", []))),
        ("Example sentences", example_rows(words)),
        ("Pronunciation audio", audio_rows(words)),
    ]
    characters = character_rows()
    if characters:
        sections.append(("Hangul characters", characters))

    width = max(len(row.label) for _, rows in sections for row in rows)
    incomplete: list[Row] = []
    print(f"FINAL CONTENT COMPLETENESS — {len(words):,} vocabulary entries\n")
    for title, rows in sections:
        print(f"{title}")
        for row in rows:
            print(row.render(width))
            if row.applicable and not row.complete:
                incomplete.append(row)
        print()

    entries = pack.load()
    removed = sum(1 for e in entries.values() if not e.keep)
    print(f"Corpus curation: {len(words):,} shipping, {removed} reviewed and removed with a reason\n")

    if args.json:
        args.json.write_text(
            json.dumps(
                {
                    "total": len(words),
                    "sections": [
                        {
                            "title": title,
                            "rows": [
                                {
                                    "label": r.label,
                                    "have": r.have,
                                    "total": r.total,
                                    "percent": round(r.percent, 2),
                                    "note": r.note,
                                }
                                for r in rows
                            ],
                        }
                        for title, rows in sections
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    if incomplete:
        print(f"{len(incomplete)} row(s) below 100%:")
        for row in incomplete:
            print(f"  {row.label}: {row.total - row.have:,} missing")
        if args.check:
            return 1
    else:
        print("every applicable row is at 100%.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
