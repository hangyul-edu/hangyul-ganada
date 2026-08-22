"""Text-to-speech providers for the pronunciation build.

## Why audio is generated at build time and not in the app

Hangyul ganada is bought once. A runtime TTS call is a cost that recurs every
time any learner taps any speaker button, forever, against revenue that was
collected once — and it makes the core of the product fail when the network
does. The curriculum is finite, so the audio is finite, so it is generated
ahead of time, normalised, and shipped.

## Providers

The provider is an interface with three implementations, chosen by
``HANGYUL_TTS_PROVIDER``:

* ``edge`` — Microsoft's neural voices through the ``edge-tts`` package. No
  credential, and the voices are the same ko-KR neural models Azure sells.
  This is what the committed assets were generated with.
* ``azure`` — the same voices through a paid Azure Speech subscription. This is
  the provider to run for a commercial release, because it is the one that
  comes with a licence for redistributing the output in a product. Set
  ``AZURE_SPEECH_KEY`` and ``AZURE_SPEECH_REGION``.
* ``google`` — Google Cloud Text-to-Speech, as a second source. Set
  ``GOOGLE_TTS_API_KEY``.

Nothing here reads a secret from the repository, and no key is ever written to
the manifest. The manifest records *which voice* spoke, which is a fact the QA
step needs and a customer might reasonably be told.

## Speaking rate

Every clip is synthesised at :data:`SPEECH_RATE` — slower than conversational
Korean, because the listener is a beginner trying to separate ㅅ from ㅆ, not a
native speaker skimming. The slowdown is asked of the *speech engine* rather
than applied to the waveform afterwards: a neural voice given ``rate="-15%"``
re-times the utterance the way a person speaking carefully does — longer
vowels, longer gaps between syllables, unchanged pitch and formants — where an
``atempo`` filter would stretch everything uniformly and sound like a slowed
tape. It is one number, applied identically to both voices and to every kind of
clip, so a letter, a syllable, a word and an example sentence are all spoken at
the same pace.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import subprocess
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


#: Speaking rate, as a multiple of the voice's normal pace.
#:
#: The target is 0.80–0.85× for a beginner: 1.0 runs the two halves of 의사
#: together, and below about 0.75 the syllables of 안녕하세요 pull far enough
#: apart that it stops sounding like one greeting.
#:
#: 0.82 rather than the 0.85 at the top of that range, for two reasons. The
#: complaint this setting answers was that the clips were *too fast*, so the
#: middle of the band is the safer side of it to land on; and the measured
#: result runs a shade quicker than the number asks for — silence is trimmed
#: off both ends after synthesis and that trimmed padding never scaled, so
#: 0.85 measures out at about 0.86×, just outside the band. 0.82 measures at
#: ~0.83×. Verified by comparing clip durations against the previous full-speed
#: build; see `docs/AUDIO.md`.
#:
#: Change it here and nowhere else — every provider below derives its own
#: parameter from this one value, so the two voices can never drift apart.
SPEECH_RATE = 0.82


def rate_percent(rate: float = SPEECH_RATE) -> str:
    """``0.85`` → ``"-15%"``. The form SSML and edge-tts both take."""
    delta = round((rate - 1.0) * 100)
    return f"{delta:+d}%"


@dataclass(frozen=True)
class VoicePair:
    female: str
    male: str


class TtsProvider(ABC):
    """Turns Korean text into a speech file on disk."""

    id: str
    voices: VoicePair
    #: A second voice of each gender, for the words the first one says wrongly.
    #:
    #: A neural voice is a model, and a model has a lexicon with mistakes in it.
    #: This one had 마디: the male voice read it [마지], correctly for a
    #: *palatalising* boundary and wrongly for this word, at every speaking rate
    #: and with every respelling that keeps the word intact. Nothing in the text
    #: can fix that, so the repair is to ask a different voice of the same
    #: gender — see `speech_repairs.py`, which names each one and records what
    #: was heard before and after.
    alternates: VoicePair
    #: Free-form note recorded in the manifest, e.g. licensing caveats.
    notes: str = ""
    #: The pace the clips actually come back at, as a multiple of normal speech.
    #:
    #: `SPEECH_RATE` for the engines that take a rate parameter, and 1.0 for the
    #: ones that do not. QA divides its duration bounds by this, so a provider
    #: that cannot be slowed down must say so rather than be measured against a
    #: slowness it was never asked for — which is how five perfectly good clips
    #: came back as "too short" by ten milliseconds.
    spoken_rate: float = SPEECH_RATE

    @abstractmethod
    def synthesize(self, text: str, voice: str, destination: Path) -> None:
        """Writes one clip. Raises on failure; never writes a partial file."""

    def voice_for(self, gender: str, *, alternate: bool = False) -> str:
        pair = self.alternates if alternate else self.voices
        return pair.female if gender == "female" else pair.male


# --- edge-tts ---------------------------------------------------------------


class EdgeTtsProvider(TtsProvider):
    id = "microsoft-edge-tts"
    voices = VoicePair(female="ko-KR-SunHiNeural", male="ko-KR-InJoonNeural")
    # ko-KR offers three neural voices through this client. Hyunsu is the third,
    # and it is the male one the repairs fall back to.
    alternates = VoicePair(female="ko-KR-SunHiNeural", male="ko-KR-HyunsuMultilingualNeural")
    notes = (
        "Generated with Microsoft neural ko-KR voices via the edge-tts client, "
        f"spoken at {SPEECH_RATE:g}× ({rate_percent()}) for beginners. "
        "For a commercial release, regenerate with HANGYUL_TTS_PROVIDER=azure "
        "using a paid Azure Speech subscription, which is the licence that "
        "covers redistributing synthesised audio inside a product."
    )

    def __init__(self) -> None:
        try:
            import edge_tts  # noqa: F401
        except ImportError as error:  # pragma: no cover - environment guard
            raise RuntimeError(
                "edge-tts is not installed. `pip install edge-tts`, or choose "
                "another provider with HANGYUL_TTS_PROVIDER."
            ) from error

    def synthesize(self, text: str, voice: str, destination: Path) -> None:
        import edge_tts

        async def run() -> None:
            communicate = edge_tts.Communicate(text, voice, rate=rate_percent())
            await communicate.save(str(destination))

        asyncio.run(run())


# --- Azure Speech -----------------------------------------------------------


class AzureSpeechProvider(TtsProvider):
    id = "azure-speech"
    voices = VoicePair(female="ko-KR-SunHiNeural", male="ko-KR-InJoonNeural")
    alternates = VoicePair(female="ko-KR-JiMinNeural", male="ko-KR-HyunsuMultilingualNeural")
    notes = (
        "Generated with Azure Cognitive Services Speech under a paid subscription, "
        f"spoken at {SPEECH_RATE:g}× ({rate_percent()}) for beginners."
    )

    def __init__(self) -> None:
        self.key = require_env("AZURE_SPEECH_KEY")
        self.region = require_env("AZURE_SPEECH_REGION")

    def synthesize(self, text: str, voice: str, destination: Path) -> None:
        ssml = (
            '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ko-KR">'
            f'<voice name="{voice}">'
            # `prosody rate` is the engine's own re-timing, so pitch and timbre
            # are untouched — the voice speaks slowly rather than sounding slowed.
            f'<prosody rate="{rate_percent()}">{escape_xml(text)}</prosody>'
            "</voice></speak>"
        )
        request = urllib.request.Request(
            f"https://{self.region}.tts.speech.microsoft.com/cognitiveservices/v1",
            data=ssml.encode("utf-8"),
            headers={
                "Ocp-Apim-Subscription-Key": self.key,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                "User-Agent": "Hangyul ganada-audio-build/1.0",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            write_atomic(destination, response.read())


# --- Google Cloud -----------------------------------------------------------


class GoogleTtsProvider(TtsProvider):
    id = "google-cloud-tts"
    voices = VoicePair(female="ko-KR-Neural2-A", male="ko-KR-Neural2-C")
    alternates = VoicePair(female="ko-KR-Neural2-B", male="ko-KR-Wavenet-D")
    notes = (
        "Generated with Google Cloud Text-to-Speech Neural2 Korean voices, "
        f"spoken at {SPEECH_RATE:g}× for beginners."
    )

    def __init__(self) -> None:
        self.key = require_env("GOOGLE_TTS_API_KEY")

    def synthesize(self, text: str, voice: str, destination: Path) -> None:
        payload = json.dumps(
            {
                "input": {"text": text},
                "voice": {"languageCode": "ko-KR", "name": voice},
                "audioConfig": {
                    "audioEncoding": "MP3",
                    "sampleRateHertz": 24000,
                    # Google takes the rate as a multiplier directly; same
                    # engine-side re-timing as the SSML above.
                    "speakingRate": SPEECH_RATE,
                },
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            f"https://texttospeech.googleapis.com/v1/text:synthesize?key={self.key}",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.load(response)
        write_atomic(destination, base64.b64decode(body["audioContent"]))


PROVIDERS: dict[str, type[TtsProvider]] = {
    "edge": EdgeTtsProvider,
    "azure": AzureSpeechProvider,
    "google": GoogleTtsProvider,
}


def get_provider(name: str | None = None) -> TtsProvider:
    key = (name or os.environ.get("HANGYUL_TTS_PROVIDER") or "edge").lower()
    if key not in PROVIDERS:
        raise SystemExit(f"unknown TTS provider {key!r}; choose one of {sorted(PROVIDERS)}")
    return PROVIDERS[key]()


# --- Post-processing --------------------------------------------------------

#: 24 kHz mono at 32 kbit/s.
#:
#: Speech, not music: above about 32 kbit/s at this sample rate a listener
#: cannot tell the difference, and the difference is the whole download. Two
#: voices across a thousand-word curriculum is where an app's size goes.
TARGET_SAMPLE_RATE = 24_000
TARGET_BITRATE = "32k"

#: EBU R128 target. Every clip lands at the same perceived loudness, so a
#: learner is not reaching for the volume control between a letter and a word.
LOUDNESS_TARGET_LUFS = -16.0
LOUDNESS_TRUE_PEAK = -1.5
LOUDNESS_RANGE = 11.0


def normalise(source: Path, destination: Path) -> None:
    """Loudness-normalises and re-encodes one clip.

    Also trims silence from both ends. Synthesised speech arrives with a
    quarter-second of nothing at the front, and on a speaker button that reads
    as lag — the learner taps, hears silence, and taps again.
    """
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source),
        "-af",
        (
            "silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB:"
            "detection=peak,areverse,"
            "silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB:"
            "detection=peak,areverse,"
            f"loudnorm=I={LOUDNESS_TARGET_LUFS}:TP={LOUDNESS_TRUE_PEAK}:LRA={LOUDNESS_RANGE}"
        ),
        "-ac", "1",
        "-ar", str(TARGET_SAMPLE_RATE),
        "-b:a", TARGET_BITRATE,
        "-map_metadata", "-1",
        str(destination),
    ]
    subprocess.run(command, check=True, capture_output=True)


def probe_duration_ms(path: Path) -> int:
    """Decoded duration. Raises if the file cannot be decoded at all."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return int(round(float(result.stdout.strip()) * 1000))


# --- Helpers ----------------------------------------------------------------


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(
            f"{name} is not set. This provider needs a credential; set it in the "
            f"environment (never in the repository) or choose another provider."
        )
    return value


def escape_xml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def write_atomic(path: Path, data: bytes) -> None:
    """Never leaves a half-written clip behind for QA to bless."""
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_bytes(data)
    temporary.replace(path)
