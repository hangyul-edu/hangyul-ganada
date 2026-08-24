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
| `ctx` | 0 when the example must not be reused as a Level Test gap-fill |
| `idm` | 1 when the word is a fixed idiom whose meaning is not its parts |
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

#: Locales a long definition is written in, when a word has one.
#:
#: All of them or none. A *More about it* section that appears in English and
#: disappears in Portuguese is the defect this field was added to fix — the one
#: the derived dictionary senses used to have — so a partial `d` is refused at
#: the pack rather than shipped as a gap nobody sees. Vietnamese and Thai are
#: not here because they are not carried on entries at all; they come from
#: `content/vocabulary/copy/`, and a word may have a long definition in the
#: eight and not in those two, which is the same fallback every other field in
#: those two languages already has.
DEFINITION_LOCALES = ("en", *MEANING_LOCALES)

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
    #: The fuller explanation, per locale, or empty. See `DEFINITION_LOCALES`.
    definitions: dict[str, str]
    reason: str | None
    #: Whether this example may also be used as a Level Test gap-fill.
    #:
    #: A teaching example and a test context are different assets, and treating
    #: them as one asset is where 힘찬 목소리로 말했어요 came from. As the
    #: sentence on 힘차다's card it is exactly right: short, natural, and it shows
    #: what the word is for. As a four-choice gap-fill it is unanswerable,
    #: because 활기찬 목소리로 말했어요 and 공손한 목소리로 말했어요 are also
    #: things people say and the frame does not choose between them.
    #:
    #: `ctx: 0` on the pack row says "keep teaching this, stop testing with it".
    context_ok: bool = True
    #: A fixed expression whose meaning is not the sum of its syllables.
    #:
    #: Declared rather than detected. 일석이조 is four Sino-Korean syllables and
    #: so is 국제공항, and the difference between them — that one has to be
    #: learned whole and the other can be read — is exactly the judgement a
    #: heuristic gets wrong. The difficulty model treats an idiom as advanced;
    #: getting that from a spelling pattern would have made every four-syllable
    #: compound noun advanced too.
    idiom: bool = False

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
        return Entry(word, False, 0, "", {}, "", {}, None, None, {}, reason, True)

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

    definitions = row.get("d") or {}
    if definitions:
        missing = [loc for loc in DEFINITION_LOCALES if not (definitions.get(loc) or "").strip()]
        if missing:
            raise PackError(
                f"{where}: {word} has a long definition in some languages and not "
                f"in {', '.join(missing)} — write all of them or none"
            )
        extra = [loc for loc in definitions if loc not in DEFINITION_LOCALES]
        if extra:
            raise PackError(f"{where}: {word} long definition in unknown locale(s) {', '.join(extra)}")

    return Entry(
        word=word,
        keep=True,
        context_ok=bool(row.get("ctx", 1)),
        idiom=bool(row.get("idm", 0)),
        usefulness=usefulness,
        semantics=str(_require(row, "sem", where)).strip(),
        meanings={loc: meanings[loc].strip() for loc in MEANING_LOCALES},
        example=example,
        translations={loc: translations[loc].strip() for loc in SENTENCE_LOCALES},
        english=(row.get("en") or None),
        part_of_speech=(row.get("pos") or None),
        definitions={loc: definitions[loc].strip() for loc in DEFINITION_LOCALES} if definitions else {},
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
