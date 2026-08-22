"""English Wiktionary as the dictionary source.

## Why this source

It is the only large Korean–English lexicon that is both openly licensed for
commercial redistribution (CC BY-SA 4.0) and reachable without a negotiated
data agreement. The National Institute of Korean Language's 한국어기초사전 is
the better *learner* dictionary and is CC-licensed, but its bulk data needs an
issued API key, so `build_vocabulary.py` keeps the source layer pluggable and
this is the provider that ships.

## What is taken, and what is not

Taken: the part of speech, the English glosses, example sentences with their
translations, and the topic categories. Every one of those is attributed per
field in `SourceMetadata`, with the page URL as the reference.

Not taken: etymology prose, IPA, pitch accent, inflection tables, and anything
under a language heading other than `Korean` — Wiktionary files Jeju and Middle
Korean on the same page, and a beginner learning `사과` should not be shown a
Jeju entry because it happened to sort first.

## Licence

CC BY-SA 4.0. That is share-alike: the derived dataset is redistributed under
the same licence, and the app credits Wiktionary in its content-sources screen.
See `docs/VOCABULARY_DATA.md`.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

API = "https://en.wiktionary.org/w/api.php"
PAGE_BASE = "https://en.wiktionary.org/wiki/"
USER_AGENT = "Hangyul ganada-content-pipeline/1.0 (build tooling; contact: hangyul.com)"

SOURCE_ID = "en-wiktionary"
SOURCE_NAME = "English Wiktionary"
LICENSE = "CC BY-SA 4.0"
LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"

#: Wiktionary POS headings mapped onto the app's `PartOfSpeech`.
#:
#: Headings absent from this map are dropped rather than guessed at. "Syllable",
#: "Hanja" and "Romanization" pages are not vocabulary; "Suffix" and "Affix" are
#: not words a learner writes on their own.
#: Wiktionary's Korean part-of-speech headings, and what this product calls them.
#:
#: The first ten were here from the start and the rest were found by counting:
#: 3,700 pages with a Korean section, a definition and a heading this map did
#: not know, so the whole page was dropped. 것 — one of the commonest words in
#: the language — is filed under **Dependent noun**, and 거 under that and
#: **Pronoun** nested inside an Etymology section. A dictionary missing 것 is
#: not a dictionary.
#:
#: What is deliberately *not* here is as important:
#:
#: * **Syllable** and **Hanja** are readings of a character, not words.
#: * **Root**, **Prefix**, **Suffix** and **Affix** are bound morphemes. They
#:   are real dictionary headwords and they are not words a learner looks up;
#:   they are also written with a hyphen, which `is_hangul_word` rejects anyway.
#: * **Verb form**, **Noun form** and the like are inflections. §33: a surface
#:   form resolves to its lemma and must never become a headword of its own.
POS_MAP = {
    "Noun": "noun",
    "Verb": "verb",
    "Adjective": "adjective",
    "Adverb": "adverb",
    "Pronoun": "pronoun",
    "Numeral": "numeral",
    "Determiner": "determiner",
    "Interjection": "interjection",
    "Particle": "particle",
    "Conjunction": "adverb",
    # A noun that cannot stand alone: 것, 수, 줄, 바. Grammatically distinct and
    # lexically a noun, which is what a learner needs to be told.
    "Dependent noun": "noun",
    "Proper noun": "proper noun",
    "Proper Noun": "proper noun",
    # 반짝반짝, 두근두근. A part of speech Korean genuinely has and English does
    # not, and one of the most characteristic parts of the vocabulary.
    "Ideophone": "ideophone",
    "Counter": "counter",
    "Postposition": "particle",
    "Contraction": "contraction",
    "Phrase": "phrase",
    "Idiom": "phrase",
    "Proverb": "phrase",
    "Number": "numeral",
}

#: Senses carrying any of these labels are dropped before the word is even
#: considered. A beginner handwriting app has no business teaching slurs, and
#: an obsolete sense is a wrong answer with a citation.
BLOCKED_LABELS = {
    "vulgar", "slang", "offensive", "derogatory", "ethnic slur", "obsolete",
    "archaic", "dialectal", "rare", "nonstandard", "proscribed", "internet slang",
    "North Korea", "historical", "dated", "poetic", "childish", "euphemistic",
}


@dataclass
class Sense:
    gloss: str
    labels: list[str] = field(default_factory=list)
    #: The examples that belong to *this* sense, not to the entry.
    #:
    #: Wikitext puts a sense's examples on the `#:` lines directly beneath it,
    #: so they are attributable — and they have to be attributed, because a
    #: reader shown an example of "to grow older" underneath the definition
    #: "to eat" has been told something false about the language. See `_senses`.
    examples: list["Example"] = field(default_factory=list)


@dataclass
class Example:
    korean: str
    translation: str


@dataclass
class Entry:
    """One Korean headword, as Wiktionary has it."""

    word: str
    part_of_speech: str
    senses: list[Sense]
    examples: list[Example]
    categories: list[str]
    #: True when the word is Sino-Korean, from `{{ko-etym-Sino}}`.
    sino_korean: bool
    page_url: str


# --- Fetching ---------------------------------------------------------------


def fetch_wikitext(titles: list[str], *, batch_size: int = 50, pause: float = 1.0) -> dict[str, str]:
    """Raw wikitext for each title. Missing pages are simply absent.

    Batched, paced and backed off deliberately: this is somebody else's donated
    infrastructure. A build script that hammers it gets a 429 and deserves one.
    """
    out: dict[str, str] = {}
    for start in range(0, len(titles), batch_size):
        chunk = titles[start : start + batch_size]
        query = urllib.parse.urlencode(
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "prop": "revisions",
                "rvslots": "main",
                "rvprop": "content",
                "titles": "|".join(chunk),
            }
        )
        payload = _get_json(f"{API}?{query}")
        for page in payload.get("query", {}).get("pages", []):
            revisions = page.get("revisions")
            if not revisions:
                continue
            out[page["title"]] = revisions[0]["slots"]["main"]["content"]
        time.sleep(pause)
    return out


def _get_json(url: str, *, attempts: int = 6) -> dict:
    """One request, with exponential backoff on throttling and transient errors."""
    delay = 2.0
    last: Exception | None = None
    for _ in range(attempts):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:  # noqa: PERF203 — retry needs the handler
            last = error
            if error.code not in (429, 500, 502, 503, 504):
                raise
            retry_after = error.headers.get("Retry-After") if error.headers else None
            time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else delay)
            delay = min(delay * 2, 60)
        except (urllib.error.URLError, TimeoutError) as error:
            last = error
            time.sleep(delay)
            delay = min(delay * 2, 60)
    raise RuntimeError(f"giving up on {url}") from last


# --- Parsing ----------------------------------------------------------------

_LANGUAGE_HEADING = re.compile(r"^==\s*([^=].*?)\s*==$", re.MULTILINE)
_SUB_HEADING = re.compile(r"^(={2,6})\s*(.+?)\s*\1$", re.MULTILINE)
_POS_SUFFIX = re.compile(r"\s*\d*$")


def korean_section(wikitext: str) -> str | None:
    """The `==Korean==` section, and nothing else on the page."""
    matches = list(_LANGUAGE_HEADING.finditer(wikitext))
    for i, match in enumerate(matches):
        if match.group(1).strip() != "Korean":
            continue
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(wikitext)
        return wikitext[start:end]
    return None


def parse_entries(word: str, wikitext: str) -> list[Entry]:
    section = korean_section(wikitext)
    if section is None:
        return []

    sino = "ko-etym-Sino" in section
    categories = _categories(section)
    page_url = PAGE_BASE + urllib.parse.quote(word) + "#Korean"

    entries: list[Entry] = []
    headings = list(_SUB_HEADING.finditer(section))
    for i, heading in enumerate(headings):
        name = _POS_SUFFIX.sub("", heading.group(2)).strip()
        pos = POS_MAP.get(name)
        if pos is None:
            continue
        start = heading.end()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(section)
        body = section[start:end]

        senses = _senses(body)
        if not senses:
            continue
        entries.append(
            Entry(
                word=word,
                part_of_speech=pos,
                senses=senses,
                examples=_examples(body),
                categories=categories,
                sino_korean=sino,
                page_url=page_url,
            )
        )
    return entries


_DEF_LINE = re.compile(r"^#(?!#|:|\*)\s*(.+)$", re.MULTILINE)


def _senses(body: str) -> list[Sense]:
    """Every numbered definition, each carrying its own examples.

    A definition owns the `#:` lines between it and the next `#` line. That is
    not a convention this code invented — it is how the wikitext is written, and
    it is the only thing that makes an example attributable to a meaning.

    It matters more than it looks. 먹다 has six senses and eight examples spread
    across three of them; collecting them at the *entry* level and hanging them
    all off the first sense files an example about growing older under the
    definition "to eat", which is not a formatting problem but a false
    statement about Korean.
    """
    senses: list[Sense] = []
    matches = list(_DEF_LINE.finditer(body))
    for index, match in enumerate(matches):
        raw = match.group(1)
        labels = _labels(raw)
        gloss = clean_markup(raw)
        if not gloss:
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        senses.append(
            Sense(gloss=gloss, labels=labels, examples=_examples(body[match.end() : end]))
        )
    return senses


_LABEL_TEMPLATE = re.compile(r"\{\{(?:lb|lbl|label)\|ko\|([^}]*)\}\}")


def _labels(raw: str) -> list[str]:
    labels: list[str] = []
    for match in _LABEL_TEMPLATE.finditer(raw):
        for part in match.group(1).split("|"):
            part = part.strip()
            if part and "=" not in part and part not in ("_", "and", "or"):
                labels.append(part)
    return labels


_EXAMPLE_TEMPLATE = re.compile(r"\{\{(ux|uxa|coa|co|usex)\|ko\|(.+?)\}\}\s*$", re.MULTILINE)


def _examples(body: str) -> list[Example]:
    """Example sentences with a translation, and only those.

    An example with no gloss is no use to a learner who cannot read it yet, so
    it is dropped rather than shown untranslated.
    """
    out: list[Example] = []
    for match in _EXAMPLE_TEMPLATE.finditer(body):
        args = _split_template_args(match.group(2))
        positional = [a for a in args if "=" not in a.split("=")[0][:12] or not _is_named(a)]
        named = {k: v for k, v in (_named_pair(a) for a in args) if k}
        korean = clean_markup(positional[0]) if positional else ""
        translation = named.get("t") or named.get("translation") or ""
        if not translation and len(positional) > 1:
            translation = positional[1]
        korean = korean.strip()
        translation = clean_markup(translation).strip()
        if korean and translation:
            out.append(Example(korean=korean, translation=translation))
    return out


def _is_named(arg: str) -> bool:
    key = arg.split("=", 1)[0]
    return bool(re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", key))


def _named_pair(arg: str) -> tuple[str, str]:
    if "=" not in arg or not _is_named(arg):
        return ("", "")
    key, value = arg.split("=", 1)
    return (key.strip(), value)


def _split_template_args(text: str) -> list[str]:
    """Splits on `|` at brace depth zero, so nested templates survive."""
    args: list[str] = []
    depth = 0
    current: list[str] = []
    i = 0
    while i < len(text):
        if text.startswith("{{", i) or text.startswith("[[", i):
            depth += 1
            current.append(text[i : i + 2])
            i += 2
            continue
        if text.startswith("}}", i) or text.startswith("]]", i):
            depth -= 1
            current.append(text[i : i + 2])
            i += 2
            continue
        if text[i] == "|" and depth == 0:
            args.append("".join(current))
            current = []
            i += 1
            continue
        current.append(text[i])
        i += 1
    args.append("".join(current))
    return args


_CATEGORY_TEMPLATE = re.compile(r"\{\{(?:C|c|cat|topics|top)\|ko\|([^}]*)\}\}")
_CATEGORY_LINK = re.compile(r"\[\[Category:Korean ([^\]|]+)")


def _categories(section: str) -> list[str]:
    found: list[str] = []
    for match in _CATEGORY_TEMPLATE.finditer(section):
        for part in match.group(1).split("|"):
            part = part.strip()
            if part and "=" not in part:
                found.append(part)
    found.extend(m.group(1).strip() for m in _CATEGORY_LINK.finditer(section))
    seen: set[str] = set()
    return [c for c in found if not (c in seen or seen.add(c))]


# --- Markup cleaning --------------------------------------------------------

#: Templates whose content is a parenthetical aside, not part of the meaning.
#:
#: `{{gl|…}}` renders as "(…)" on Wiktionary — a clarification for a reader who
#: already has the definition. Inlining it produces glosses like "day twenty-four
#: hours, a thirtieth of the month", which is unreadable on a vocabulary card.
_DROP_TEMPLATES = re.compile(
    r"\{\{(?:lb|lbl|label|q|qual|qualifier|i|a|n-g|non-gloss definition|"
    r"defdate|C|c|cln|topics|rfdef|senseid|attn|rfex|syn|ant|synonym of|"
    r"gl|gloss)\|[^{}]*\}\}"
)
_KEEP_LAST_ARG = re.compile(r"\{\{(?:w|l|m|link|mention)\|([^{}]*)\}\}")
_ANY_TEMPLATE = re.compile(r"\{\{[^{}]*\}\}")
_PIPED_LINK = re.compile(r"\[\[[^\]|]*\|([^\]]*)\]\]")
_PLAIN_LINK = re.compile(r"\[\[([^\]]*)\]\]")
_BOLD_ITALIC = re.compile(r"'{2,5}")
_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_HTML_TAG = re.compile(r"</?[a-zA-Z][^>]*>")
_WHITESPACE = re.compile(r"\s+")



#: Definition templates whose meaning is *inside* the template.
#:
#: `{{alternative form of|ko|나|t=I, me}}` is a complete definition and the old
#: cleaner turned it into an empty string, so the sense was dropped and often
#: the whole word with it. Nine hundred definitions were lost this way, and they
#: are not obscure ones: 거 is nothing but a `contraction of`, and every place
#: name in the dictionary is a `place`.
#:
#: Each entry is `(template, prefix)`. The rendered gloss is the prefix, the
#: referenced word, and the translation the template carries in `t=`/`t1=`.
_CROSS_REFERENCE = {
    "alternative form of": "alternative form of",
    "alt form": "alternative form of",
    "altform": "alternative form of",
    "standard spelling of": "standard spelling of",
    "standard form of": "standard form of",
    "nonstandard form of": "nonstandard form of",
    "short for": "short for",
    "contraction of": "contraction of",
    "clipping of": "clipping of",
    "syn of": "synonym of",
    "abbreviation of": "abbreviation of",
    "initialism of": "initialism of",
}

#: Templates that *are* the gloss, with nothing to prefix.
#:
#: `{{n-g|a word used to …}}` is a definition written out longhand, and
#: `{{tcl|ko|Asia}}` is the English of a proper noun. Both were being deleted.
_GLOSS_TEMPLATES = {"n-g", "non-gloss definition", "non-gloss", "ng", "tcl", "place"}

_TEMPLATE = re.compile(r"\{\{([^{}|]+)\|([^{}]*)\}\}")


def _template_args(body: str) -> tuple[list[str], dict[str, str]]:
    positional: list[str] = []
    named: dict[str, str] = {}
    for part in body.split("|"):
        if "=" in part:
            key, _, value = part.partition("=")
            named[key.strip()] = value.strip()
        else:
            positional.append(part.strip())
    return positional, named


def render_definition_templates(raw: str) -> str:
    """Turns the templates that *carry* a definition into words.

    Runs before the general cleaner, which deletes any template it does not
    recognise — correct for a label and destructive for a definition. Anything
    not listed here is left exactly as it was and handled downstream.

    `inflection of` is deliberately absent: a conjugated form is not a headword
    and §33 says so. Those senses stay empty and their pages stay out.
    """

    def replace(match: re.Match[str]) -> str:
        name = match.group(1).strip().lower()
        positional, named = _template_args(match.group(2))
        translation = named.get("t") or named.get("t1") or named.get("gloss") or ""

        if name in _CROSS_REFERENCE:
            # `{{alternative form of|ko|나|t=I, me}}` — drop the language code.
            target = next((arg for arg in positional[1:] if arg), "")
            # A Hanja gloss in brackets is noise in a learner's dictionary:
            # 한국(韓國) reads as 한국. The caret marks a proper noun.
            target = re.sub(r"\([^)]*\)", "", target).lstrip("^").strip()
            head = f"{_CROSS_REFERENCE[name]} {target}".strip()
            return f"{head} — {translation}" if translation else head

        if name in _GLOSS_TEMPLATES:
            if translation:
                return translation
            # `{{n-g|text}}` puts its text first; `{{place|ko|city|c/China}}`
            # describes a place whose name is in `t=` and has no text without it.
            if name in {"n-g", "non-gloss definition", "non-gloss", "ng"}:
                return positional[0] if positional else ""
            if name == "tcl":
                return next((arg for arg in positional[1:] if arg), "")
            return ""
        return match.group(0)

    return _TEMPLATE.sub(replace, raw)


def clean_markup(raw: str) -> str:
    """Wikitext down to the plain sentence a learner would read."""
    text = render_definition_templates(_HTML_COMMENT.sub("", raw))
    # Repeat, because templates nest: {{lb|ko|...}} inside {{gl|...}}.
    for _ in range(4):
        text = _DROP_TEMPLATES.sub("", text)
        text = _KEEP_LAST_ARG.sub(lambda m: _last_positional(m.group(1)), text)
        text = _ANY_TEMPLATE.sub("", text)
    for _ in range(3):
        text = _PIPED_LINK.sub(r"\1", text)
        text = _PLAIN_LINK.sub(r"\1", text)
    text = _BOLD_ITALIC.sub("", text)
    text = _HTML_TAG.sub("", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = _MORPHEME_JOIN.sub(r"\1\2", text)
    text = _WHITESPACE.sub(" ", text).strip()
    return text.strip(" ,;:")


#: A Hangul syllable, a hyphen, and another Hangul syllable.
#:
#: Wiktionary links Korean particles and endings as their own entries —
#: `[[밥]][[-을]]` — because `-을` is a real dictionary headword. The leading
#: hyphen is lexicographic notation meaning "this attaches to the left", and it
#: is correct in a dictionary and wrong in a sentence: unlinked, that example
#: renders as `밥-을 먹다`, which is not how anybody writes Korean.
#:
#: Only between two Hangul syllables, so a genuine hyphen in a romanisation or
#: an English gloss is left alone.
_MORPHEME_JOIN = re.compile(r"([\uac00-\ud7a3])-([\uac00-\ud7a3])")


def _last_positional(args: str) -> str:
    """The display text of a link/gloss template — its last positional argument."""
    parts = [p for p in args.split("|") if not _is_named(p)]
    if not parts:
        return ""
    # {{m|ko|word}} → word; {{m|ko|word|display}} → display.
    return parts[-1] if len(parts) > 1 else parts[0]
