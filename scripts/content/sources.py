"""Every external dataset the content pipeline touches, declared in one place.

Provenance is not a comment. Each record here becomes `SourceMetadata` on the
words it contributed to, and the app renders it on the Content sources screen —
so a claim made here is a claim made to the customer, and a field with no entry
here cannot be attributed to anyone.

`derived` marks Hangyul ganada's own calculations. They are attributed to us,
explicitly, so nobody can mistake our curriculum level for a dictionary's.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Source:
    id: str
    name: str
    license: str
    license_url: str | None
    homepage: str
    #: What the pipeline actually takes. Kept short — it is shown in the app.
    provides: str
    #: True when the values are computed here rather than published by anyone.
    derived: bool = False
    #: Attribution string the licence requires us to display, if any.
    attribution: str | None = None
    #: How to rebuild a per-word reference from the word itself.
    #:
    #: Every Wiktionary reference is the same URL with the word substituted in,
    #: and every frequency reference is the same sentence with the rank
    #: substituted in. Storing 2,832 copies of each is 170 KB of the shipped
    #: bundle spent on strings a template regenerates exactly.
    reference_template: str | None = None


WIKTIONARY = Source(
    id="en-wiktionary",
    name="English Wiktionary",
    license="CC BY-SA 4.0",
    license_url="https://creativecommons.org/licenses/by-sa/4.0/",
    homepage="https://en.wiktionary.org/",
    provides="Part of speech and topic categories",
    attribution="Part-of-speech data from English Wiktionary, CC BY-SA 4.0",
    reference_template="https://en.wiktionary.org/wiki/{word}#Korean",
)

OPENSUBTITLES_FREQUENCY = Source(
    id="opensubtitles-2018-ko",
    name="OpenSubtitles 2018 Korean frequency list (hermitdave/FrequencyWords)",
    license="MIT (list) / CC BY-SA (underlying OPUS corpus)",
    license_url="https://github.com/hermitdave/FrequencyWords/blob/master/LICENSE",
    homepage="https://github.com/hermitdave/FrequencyWords",
    provides="Corpus token frequency, used to rank how often a word occurs",
    attribution="Frequency data derived from the OpenSubtitles corpus via hermitdave/FrequencyWords",
    reference_template="rank {frequency_rank} of 50,000 tokens (ko_50k, 2018)",
)

EDGE_TTS = Source(
    id="microsoft-edge-tts",
    name="Microsoft Azure Neural TTS (ko-KR-SunHiNeural, ko-KR-InJoonNeural)",
    license="Microsoft Azure Cognitive Services terms",
    license_url="https://azure.microsoft.com/en-us/support/legal/",
    homepage="https://speech.microsoft.com/",
    provides="Pre-generated Korean pronunciation audio, female and male",
)

HANGYUL_GANADA = Source(
    id="hangyul-ganada",
    name="Hangyul ganada",
    license="Proprietary",
    license_url=None,
    homepage="https://hangyul.com",
    provides=(
        "Teaching order, difficulty rating, romanisation, pronunciation notes, "
        "syllable and letter analysis, and every meaning, example sentence and "
        "translation in the app"
    ),
    derived=True,
)

ALL_SOURCES = [
    WIKTIONARY,
    OPENSUBTITLES_FREQUENCY,
    EDGE_TTS,
    HANGYUL_GANADA,
]


def as_metadata(source: Source, fields: list[str], reference: str | None = None) -> dict:
    """The `SourceMetadata` record the app consumes."""
    return {
        "fields": fields,
        "source_id": source.id,
        "source_name": source.name,
        "license": source.license,
        "license_url": source.license_url,
        "reference": reference,
        "derived": source.derived,
    }
