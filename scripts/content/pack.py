"""The editorial content pack.

Everything the dictionary and the corpus cannot supply lives here: the Korean
example sentence a beginner can actually read, the meaning in each of the eight
shipping languages, the concreteness tag, and the editorial judgement of how
useful a word is to somebody in their first month.

    content/vocabulary/entries/*.jsonl     one JSON object per word
    content/vocabulary/removals.jsonl      words taken out, with the reason

## Why a pack rather than more of `curation.py`

`curation.py` is a Python module a person edits by hand, and that is right for
a few hundred judgement calls. This is a record for every one of the words that
ship, written once and then validated, diffed and measured by machine. Keeping
it as data means `content:coverage` can count it, `content:sample` can sample
it, and a missing field is a failing build rather than a `None` that reaches a
learner as an English fallback.

## The record

```json
{"w": "가다", "k": 1, "u": 1, "sem": "act:walk|road",
 "m": {"ko": "…", "ja": "…", "zh": "…", "es": "…", "fr": "…", "de": "…", "pt": "…"},
 "ex": "학교에 가요.",
 "t": {"en": "…", "ja": "…", "zh": "…", "es": "…", "fr": "…", "de": "…", "pt": "…"}}
```

| Key | Meaning |
| --- | --- |
| `w` | the Korean word — the join key |
| `k` | keep: 1 ships, 0 is removed and needs `r` |
| `r` | why it was removed, when `k` is 0 |
| `u` | learner usefulness, 1 (a beginner needs it in week one) to 5 (advanced) |
| `sem` | concreteness tag: `template:part|part`, what kind of thing the word names |
| `m` | meaning per locale; `en` comes from the dictionary unless overridden |
| `en` | optional replacement for the dictionary's English meaning |
| `pos` | optional correction to the dictionary's part of speech |
| `ex` | the Korean example sentence |
| `t` | the example sentence in every other shipping locale |

`t` has no `ko` key on purpose. The sentence is already Korean; printing a
Korean "translation" of it under itself is noise, and the app renders the ko
locale without a translation line at all.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACK_DIR = ROOT / "content" / "vocabulary"
ENTRIES_DIR = PACK_DIR / "entries"
REMOVALS = PACK_DIR / "removals.jsonl"

#: Locales the learning content ships in. `ko` is the learner's own language
#: when they are a Korean speaker studying the writing system, so it carries a
#: plain-Korean definition rather than a translation.
MEANING_LOCALES = ("ko", "ja", "zh", "es", "fr", "de", "pt")

#: Locales an example sentence is translated into. Korean is absent by design.
SENTENCE_LOCALES = ("en", "ja", "zh", "es", "fr", "de", "pt")

#: How the short keys in the pack map onto the locale identifiers the app uses.
LOCALE_IDS = {
    "ko": "ko",
    "ja": "ja",
    "zh": "zh-CN",
    "es": "es",
    "fr": "fr",
    "de": "de",
    "pt": "pt-BR",
    "en": "en",
}

USEFULNESS_MAX = 5


class PackError(ValueError):
    pass


@dataclass(frozen=True)
class Entry:
    word: str
    keep: bool
    usefulness: int
    semantics: str
    meanings: dict[str, str]
    example: str
    translations: dict[str, str]
    english: str | None
    part_of_speech: str | None
    reason: str | None

    @property
    def removed(self) -> bool:
        return not self.keep


def _require(row: dict, key: str, where: str):
    if key not in row:
        raise PackError(f"{where}: missing {key!r}")
    return row[key]


def parse_row(row: dict, where: str) -> Entry:
    word = _require(row, "w", where)
    keep = bool(row.get("k", 1))
    reason = row.get("r")
    if not keep:
        if not reason:
            raise PackError(f"{where}: {word} is removed without a reason")
        return Entry(word, False, 0, "", {}, "", {}, None, None, reason)

    usefulness = int(_require(row, "u", where))
    if not 1 <= usefulness <= USEFULNESS_MAX:
        raise PackError(f"{where}: {word} usefulness {usefulness} outside 1–{USEFULNESS_MAX}")

    meanings = _require(row, "m", where)
    missing = [loc for loc in MEANING_LOCALES if not (meanings.get(loc) or "").strip()]
    if missing:
        raise PackError(f"{where}: {word} has no meaning for {', '.join(missing)}")

    example = str(_require(row, "ex", where)).strip()
    if not example:
        raise PackError(f"{where}: {word} has an empty example")

    translations = _require(row, "t", where)
    missing = [loc for loc in SENTENCE_LOCALES if not (translations.get(loc) or "").strip()]
    if missing:
        raise PackError(f"{where}: {word} example is not translated into {', '.join(missing)}")

    return Entry(
        word=word,
        keep=True,
        usefulness=usefulness,
        semantics=str(_require(row, "sem", where)).strip(),
        meanings={loc: meanings[loc].strip() for loc in MEANING_LOCALES},
        example=example,
        translations={loc: translations[loc].strip() for loc in SENTENCE_LOCALES},
        english=(row.get("en") or None),
        part_of_speech=(row.get("pos") or None),
        reason=None,
    )


def load() -> dict[str, Entry]:
    """Every entry in the pack, keyed by the Korean word.

    Files are read in name order and a word may appear only once across all of
    them, so two batches cannot quietly disagree about what 사과 means.
    """
    entries: dict[str, Entry] = {}
    if not ENTRIES_DIR.exists():
        return entries
    for path in sorted(ENTRIES_DIR.glob("*.jsonl")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            line = line.strip()
            if not line or line.startswith("//"):
                continue
            where = f"{path.name}:{number}"
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise PackError(f"{where}: {error}") from error
            entry = parse_row(row, where)
            if entry.word in entries:
                raise PackError(f"{where}: {entry.word} is already in the pack")
            entries[entry.word] = entry
    return entries


def kept(entries: dict[str, Entry] | None = None) -> dict[str, Entry]:
    return {w: e for w, e in (entries or load()).items() if e.keep}
