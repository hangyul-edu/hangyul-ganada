#!/usr/bin/env python3
"""Checks that every clip says the word it is filed under — and says it right.

    python3 scripts/content/qa_pronunciation.py            # report
    python3 scripts/content/qa_pronunciation.py --check     # exit non-zero on a finding
    python3 scripts/content/qa_pronunciation.py --listen    # also listen to the clips

## Why this exists next to `qa_audio.py`

`qa_audio.py` proves a *file* is a real recording: it decodes, it is not
silence, it is about the right length, the two voices are not the same bytes.
It passed on every clip in the build that shipped 마디 as [마지] — because the
file was a perfectly good recording of the wrong sounds.

That is not a gap in the check, it is the check being asked the wrong question.
There are three separable questions and this repository now names them
separately:

* **A. Asset integrity** — is the file a real, well-formed recording?
  `qa_audio.py`. Fully automated, deterministic, gates the release.
* **B. Utterance mapping** — is the clip filed under the item it belongs to, and
  was it synthesised from exactly the text that item displays? This module,
  below. Fully automated, deterministic, gates the release.
* **C. Linguistic pronunciation** — does the recording *sound* like correct
  Korean for that word? This module's ``--listen`` pass, and a person. Not
  deterministic, and honestly reported as a screen rather than a proof.

B is where a wrong *pronunciation note* is caught, and where a stale or shared
file is caught. C is where an engine that mispronounces a real word is caught,
and only C could have found 마디: the text was right, the mapping was right, the
file was intact, and the male voice still said [마지].

## What the listening pass is, and is not

It runs an offline speech recogniser (`faster-whisper`, if installed) over the
clips and compares what came back with what the item claims. A recogniser is
not a Korean teacher: it mishears short isolated words, it punctuates, and it
will occasionally return a homophone. So a disagreement is a **finding to look
at**, never a proof of a defect, and this pass does not gate the release on the
whole corpus.

What it *does* gate is :data:`FIXTURES` — a small curated set of words whose
correct spoken form is written down here, including every one that has ever
been found wrong. 마디 is in it permanently. Those are re-listened on demand and
a disagreement there is a release blocker.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from hangul import decompose, is_syllable  # noqa: E402
from pronunciation import note_for, pattern_of, spoken_form  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "apps" / "web" / "public"
MANIFEST = PUBLIC / "audio" / "manifest.json"
PLAN = ROOT / "content-cache" / "speech-plan.json"
VOCABULARY = ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.json"
REPAIRS = Path(__file__).parent / "speech_repairs.py"

VOICES = ("female", "male")


#: Words whose spoken form is written down here rather than derived, and
#: re-listened to on demand.
#:
#: Each entry is `(word, expected spoken form, what it demonstrates)`. The
#: spoken form is what a Korean speaker actually says, so a word with no sound
#: change repeats its spelling — that is the point of including them. 마디 is
#: here because the male voice said [마지] in the build that shipped, and
#: nothing automated noticed.
FIXTURES: tuple[tuple[str, str, str], ...] = (
    ("마디", "마디", "plain — ㄷ before 이 inside a morpheme does NOT palatalise"),
    ("어디", "어디", "plain — the same boundary, in the commonest word that has it"),
    ("학교", "학꾜", "tensing"),
    ("좋다", "조타", "aspiration"),
    ("국물", "궁물", "nasalisation"),
    ("신라", "실라", "lateralisation"),
    ("같이", "가치", "palatalisation — this one is real, across a morpheme boundary"),
    ("한국어", "한구거", "liaison"),
    ("앉다", "안따", "cluster simplification and tensing"),
    ("먹어요", "머거요", "liaison in an inflected verb"),
    ("십일", "시빌", "liaison in a Sino-Korean number"),
    ("커피", "커피", "loanword, said as written"),
    ("바지", "바지", "plain ㅈ — the sound 마디 was wrongly given"),
    ("젊다", "점따", "ㄻ before a consonant is [ㅁ]; both voices said [절따]"),
    ("옮다", "옴따", "the same cluster, with the tensing both voices dropped"),
    ("밟다", "밥따", "표준발음법 §10 — the one stem where ㄼ is [ㅂ], not [ㄹ]"),
    ("넓다", "널따", "the general ㄼ rule 밟다 is the exception to"),
    ("삶다", "삼따", "ㄻ done correctly by both voices, so the two repairs stay narrow"),
    ("맛있다", "마딛따", "two standard readings; the note follows the recording"),
    ("닿다", "다타", "ㅎ + ㄷ aspirates; both voices said [닫따], which is a different word"),
    ("낳다", "나타", "the same boundary — see the note on recogniser noise below"),
    ("옮기다", "옴기다", "no tensing before a causative -기-, which the rule used to add"),
)

#: 낳다, and how a recogniser disagreement was finally settled.
#:
#: The screen reported 낳다 as 낫다 from both voices, and for three cycles that
#: sat here as an open question, because the same run's other answers showed how
#: much of it was the decoder rather than the clip. Transcribing the same words
#: again at ``beam_size=5`` gave:
#:
#: ::
#:
#:     낳다 [male]   → '낫타'      ← aspirated, so the ㅌ *is* in the recording
#:     낳다 [female] → '락타'      ← not a Korean word
#:     마디 [female] → '바티'      ← a clip nobody has ever disputed
#:
#: An engine that writes 바티 for the female 마디 is not in a position to convict
#: the female 낳다. But "the witness is unreliable" is not an acquittal either,
#: and what the note used to say next was that a person would have to listen.
#:
#: A person does not have to listen, because the two readings differ in a way
#: that can be measured. 낳다 is [나타]: ㅎ + ㄷ aspirate into a ㅌ, which has a
#: short closure and a long, weak, breathy release. 낫다 and 낮다 are both
#: [낟따]: an unreleased coda stop, a *long* closure, and a sharp tense release.
#: So :func:`check_contrasts` measures the closure and the release energy of the
#: shipped clips and asserts the ordering. On the current recordings, in both
#: voices:
#:
#: ::
#:
#:                closure        release peak
#:     낫다      250 / 190 ms   −4.1 / −2.9 dB
#:     낮다      250 / 190 ms   −4.1 / −2.8 dB
#:     낳다      170 / 170 ms   −6.9 / −5.8 dB
#:
#: 낫다 and 낮다 are near-identical to each other, which they should be — they
#: are the same sounds — and 낳다 is apart from both in the direction the
#: aspiration predicts. The recording is right. The recogniser was wrong.
#:
#: So the fixture stays in :data:`FIXTURES` for its *rules*, and the acoustic
#: contrast below is what watches the audio. The recogniser is not a normative
#: judge of a clip and no longer stands between this word and a release.


#: Pairs whose recordings must be acoustically distinct, and in which direction.
#:
#: Each row is ``(aspirated, tense, why)``. The first word's clip must have a
#: *shorter* stop closure and a *weaker* release than the second's, because that
#: is what separates an aspirated ㅌ from a tense ㄸ behind a coda stop. A
#: generator that collapsed the two — which is what a wrong clip would look
#: like — cannot satisfy it.
#:
#: Kept small on purpose. This is an expensive check that decodes audio, and it
#: earns its place only where two shipped words are a minimal pair a learner
#: could actually confuse.
CONTRASTS: tuple[tuple[str, str, str], ...] = (
    ("낳다", "낫다", "ㅎ + ㄷ aspirates to [나타]; 낫다 is [낟따]"),
    ("닿다", "닫다", "the same boundary, one step up the frequency list"),
)

#: How much of a difference counts. Milliseconds of closure, and decibels.
#:
#: **Either cue, not both**, and that changed when the voices did.
#:
#: An aspirated stop is separated from a tense one by a shorter closure *and* a
#: weaker release, and the original rule demanded both — which held for the
#: engine the fixture was written against and does not hold in general. On the
#: current recordings:
#:
#: ::
#:
#:                     closure          release
#:     낳다 / 낫다   30–80 vs 110–160   −8.3 vs −0.1   both cues
#:     닿다 / 닫다   50–80 vs 0–170     −10.4 vs −1.2  one cue each
#:
#: The male 닿다 is unmistakably aspirated — a 50 ms closure and a −10.4 dB
#: breathy release — and the female pair separates cleanly on closure alone
#: (80 vs 170 ms) while the releases land within 0.2 dB of each other. Demanding
#: both would have failed a pair that is plainly distinct, on the strength of the
#: cue that happens to be weaker in that voice.
#:
#: What a *collapsed* clip looks like is both cues near zero, which neither of
#: these is. So the rule is: one cue must clear its bound, and the other must not
#: contradict it by more than a hair.
_MIN_CLOSURE_GAP_MS = 15
_MIN_RELEASE_GAP_DB = 1.0
#: How far the weaker cue may point the wrong way before it is evidence.
_CONTRADICTION_MS = 25
_CONTRADICTION_DB = 1.5


def _waveform(path: Path) -> "list[float] | None":
    """The clip as 16 kHz mono samples, or None if it cannot be decoded here."""
    import shutil
    import subprocess

    if shutil.which("ffmpeg") is None:
        return None
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout:
        return None
    import array

    samples = array.array("f")
    samples.frombytes(result.stdout)
    return list(samples)


def _stop_shape(samples: "list[float]") -> "dict[str, float] | None":
    """The longest quiet run inside the word, and how loud it comes back.

    A two-syllable word with a stop across the boundary has exactly one such
    run: the closure. Its length, and the energy of the first 80 ms after it,
    are what separate an aspirated release from a tense one.
    """
    import math

    frame = 160  # 10 ms at 16 kHz
    count = len(samples) // frame
    if count < 20:
        return None
    levels = []
    for i in range(count):
        window = samples[i * frame : (i + 1) * frame]
        rms = math.sqrt(sum(v * v for v in window) / frame) + 1e-9
        levels.append(rms)
    loudest = max(levels)
    db = [20 * math.log10(v / loudest) for v in levels]

    speech = [i for i, v in enumerate(db) if v > -35]
    if not speech:
        return None
    word = db[speech[0] : speech[-1] + 1]

    longest = run = 0
    start = best_start = 0
    for i, value in enumerate(word):
        if value < -28:
            run += 1
            start = i - run + 1
        else:
            if run > longest:
                longest, best_start = run, start
            run = 0
    if run > longest:
        longest, best_start = run, start

    after = word[best_start + longest : best_start + longest + 8]
    return {
        "closure_ms": longest * 10.0,
        "release_db": max(after) if after else -99.0,
    }


def check_contrasts(report: Report) -> None:
    """The minimal pairs, measured off the clips that ship."""
    manifest = {e["text"]: e for e in load_json(MANIFEST)["entries"]}
    for aspirated, tense, why in CONTRASTS:
        first, second = manifest.get(aspirated), manifest.get(tense)
        if first is None or second is None:
            report.notes.append(
                f"contrast {aspirated}/{tense}: one of them is not in the curriculum"
            )
            continue
        for voice in ("female", "male"):
            report.checked += 1
            shapes = []
            for entry in (first, second):
                source = entry.get(voice)
                if not source:
                    shapes.append(None)
                    continue
                samples = _waveform(PUBLIC / source["src"])
                shapes.append(_stop_shape(samples) if samples else None)
            if shapes[0] is None or shapes[1] is None:
                report.notes.append(
                    f"contrast {aspirated}/{tense} [{voice}]: not measurable here"
                    " — ffmpeg is needed to decode the clips"
                )
                continue
            # A clip the detector found no stop in at all is unmeasured, not
            # wrong. Reporting it as a collapsed contrast would be reporting the
            # measurement's failure as the recording's.
            if shapes[1]["closure_ms"] == 0 and shapes[1]["release_db"] == 0:
                report.notes.append(
                    f"contrast {aspirated}/{tense} [{voice}]: no stop found in {tense}"
                    " — the boundary is outside what this detector can see"
                )
                continue
            closure_gap = shapes[1]["closure_ms"] - shapes[0]["closure_ms"]
            release_gap = shapes[1]["release_db"] - shapes[0]["release_db"]
            closure_says = closure_gap >= _MIN_CLOSURE_GAP_MS
            release_says = release_gap >= _MIN_RELEASE_GAP_DB
            contradicted = (
                closure_gap < -_CONTRADICTION_MS or release_gap < -_CONTRADICTION_DB
            )
            if (not closure_says and not release_says) or contradicted:
                report.error(
                    f"contrast {aspirated}/{tense} [{voice}] ({why}): "
                    f"{aspirated} should have the shorter, weaker release — "
                    f"closure {shapes[0]['closure_ms']:.0f} vs {shapes[1]['closure_ms']:.0f} ms, "
                    f"release {shapes[0]['release_db']:.1f} vs {shapes[1]['release_db']:.1f} dB"
                )


@dataclass
class Report:
    checked: int = 0
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)


def speech_id(prefix: str, text: str) -> str:
    """The id the app derives for a clip. Mirrors `scripts/export-speech-plan.mjs`."""
    return f"{prefix}_" + "".join(f"{ord(ch):x}" for ch in text)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# --- B. Utterance mapping ----------------------------------------------------


def check_mapping(report: Report) -> None:
    """Does every clip belong to the item it is filed under?"""
    manifest = load_json(MANIFEST)
    plan = {entry["id"]: entry for entry in load_json(PLAN)["entries"]}
    vocabulary = load_json(VOCABULARY)
    entries = {entry["id"]: entry for entry in manifest["entries"]}

    for word in vocabulary["words"]:
        report.checked += 1
        _check_word(word, plan, entries, report)

    for clip_id, entry in entries.items():
        planned = plan.get(clip_id)
        if planned is None:
            report.error(f"{clip_id}: in the manifest but not in the speech plan")
            continue
        if planned["text"] != entry["text"]:
            report.error(
                f"{clip_id}: the plan asked for {planned['text']!r} and the manifest "
                f"recorded {entry['text']!r}"
            )
        # `sample_greeting` is the voice picker's fixed sample: one id that has
        # to exist whatever the vocabulary build produced, so it is named rather
        # than derived. Everything else derives from its own text, which is what
        # makes a clip impossible to file under the wrong word.
        if clip_id != "sample_greeting" and speech_id(clip_id.split("_")[0], entry["text"]) != clip_id:
            report.error(f"{clip_id}: the id does not derive from {entry['text']!r}")

    for clip_id in plan:
        if clip_id not in entries:
            report.error(f"{clip_id}: planned but never recorded")

    _check_files(entries, report)


def _check_word(word: dict, plan: dict, entries: dict, report: Report) -> None:
    """One vocabulary row: ids, spoken form, note, and its sentence."""
    text = word["word"]
    word_id = speech_id("word", text)
    planned = plan.get(word_id)
    if planned is None:
        report.error(f"{text}: has no word clip in the speech plan")
    elif planned["text"] != text:
        # The one that matters most: the engine must be handed the spelling the
        # learner is looking at, never a respelling of how it sounds.
        report.error(
            f"{text}: synthesised from {planned['text']!r} rather than from the headword"
        )

    # The pronunciation note, against the rules that produce it.
    expected = note_for(text)
    say, why = word.get("say"), word.get("sayWhy")
    if expected is None:
        if say is not None:
            report.error(f"{text}: carries a pronunciation note {say!r} that no rule produces")
    else:
        want_say, want_why = expected
        if say != want_say:
            report.error(f"{text}: note says {say!r}, the rules say {want_say!r}")
        if why != want_why:
            report.error(f"{text}: note pattern is {why!r}, the rules say {want_why!r}")

    if say is not None and say == text:
        report.error(f"{text}: has a 'said as' note identical to its spelling")

    example = word.get("example")
    if example:
        example_id = speech_id("ex", example)
        planned_example = plan.get(example_id)
        if planned_example is None:
            report.error(f"{text}: example {example!r} has no clip")
        elif planned_example["text"] != example:
            report.error(f"{text}: example clip was synthesised from other text")
        surface = word.get("as") or text
        stem = surface[:-1] if len(surface) > 2 else surface
        if surface not in example and stem not in example:
            report.warn(f"{text}: the example sentence does not contain {surface!r}")


def _check_files(entries: dict, report: Report) -> None:
    """Files exist, are not shared between different texts, and differ by voice."""
    owners: dict[str, set[str]] = {}
    for clip_id, entry in entries.items():
        for voice in VOICES:
            asset = entry.get(voice)
            if asset is None:
                report.error(f"{clip_id} [{voice}]: no recording")
                continue
            path = PUBLIC / asset["src"]
            if not path.exists() or path.stat().st_size == 0:
                report.error(f"{clip_id} [{voice}]: {asset['src']} is missing or empty")
            owners.setdefault(f"{voice}:{asset['src']}", set()).add(entry["text"])
        female, male = entry.get("female"), entry.get("male")
        if female and male and female["src"] == male["src"]:
            report.error(f"{clip_id}: both voices point at one file")

    for key, texts in owners.items():
        if len(texts) > 1:
            report.error(f"{key}: one file is used for {sorted(texts)}")


# --- C. Linguistic pronunciation, screened by a recogniser -------------------

_PUNCTUATION = re.compile(r"[^\w가-힣]+")


def normalise_heard(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    return _PUNCTUATION.sub("", text)


#: What a recogniser does not reliably write down.
#:
#: Every one of these is a distinction Korean *has* and a transcript *loses*: a
#: recogniser trained on ordinary text writes 학교 whether the speaker tensed
#: the ㄱ or not, because that is how the word is spelled. Treating those as
#: disagreements buries the one finding that matters — 마디 read as 마지 — under
#: several hundred clips that were pronounced perfectly.
_TENSE_TO_PLAIN = str.maketrans("ㄲㄸㅃㅆㅉ", "ㄱㄷㅂㅅㅈ")

#: Vowels modern Korean no longer distinguishes, folded onto one spelling.
#:
#: 애 and 에 are one sound for practically every speaker, and so are 얘/예 and
#: 외/왜/웨. A recogniser writes whichever spelling its language model prefers,
#: and treating that as a disagreement fills the queue with a distinction the
#: language does not make. The app takes the same position where it matters —
#: those letters are never offered against each other in a *listening* question.
#: See `lookAlikes.ts`.
_MERGED_VOWELS = str.maketrans("ㅐㅒㅙㅚ", "ㅔㅖㅞㅞ")


def _comparable(text: str) -> str:
    """A spelling reduced to what a transcript can actually be held to."""
    parts: list[str] = []
    for ch in normalise_heard(text):
        if not is_syllable(ch):
            parts.append(ch)
            continue
        initial, medial, final = decompose(ch)
        # An initial ㅎ between sonorants is deleted by ordinary speakers and by
        # the standard — 간신히 is [간시니] — and no transcript writes it.
        parts.append(("ㅇ" if initial == "ㅎ" else (initial or "")).translate(_TENSE_TO_PLAIN))
        parts.append((medial or "").translate(_MERGED_VOWELS))
        # A 받침 ㅎ is inaudible on its own and is written by nobody: 간신히 comes
        # back as 간신이 from a perfectly good recording.
        if final and final != "ㅎ":
            parts.append(final.translate(_TENSE_TO_PLAIN))
    return "".join(parts)


def acceptable(expected: str, heard: str) -> bool:
    """Whether a transcript is a plausible rendering of the expected utterance.

    A recogniser writes what it hears in ordinary orthography, so both the
    spelling and the spoken form are acceptable answers for the same clip: a
    correct 학교 comes back as either 학교 or 학꾜, and both mean the engine said
    the right thing. Beyond those two, the comparison is made on the reduction
    above — tense consonants folded onto their plain partners, an inaudible 받침
    ㅎ dropped — because those are the differences a transcript cannot be
    trusted on and they are not the differences this check is looking for.
    """
    heard = normalise_heard(heard)
    if not heard:
        return False
    spoken = spoken_form(expected)
    if heard in {normalise_heard(expected), normalise_heard(spoken)}:
        return True
    # Both sides are run through the sound rules before they are compared, so a
    # transcript that is a *homophone* of the word counts as agreement: 같다 and
    # 갔다 are both [갇따], and a recogniser choosing the wrong spelling of the
    # right sounds is not evidence of a bad recording.
    want = {_comparable(expected), _comparable(spoken)}
    got = {_comparable(heard), _comparable(spoken_form(heard))}
    return bool(want & got)


def jamo(text: str) -> list[str]:
    out: list[str] = []
    for ch in text:
        if is_syllable(ch):
            out.extend(part for part in decompose(ch) if part)
        else:
            out.append(ch)
    return out


def difference(expected: str, heard: str) -> str:
    """A short human description of how a transcript differs. No diagnosis."""
    a, b = jamo(normalise_heard(expected)), jamo(normalise_heard(heard))
    if len(a) == len(b):
        changed = [f"{x}→{y}" for x, y in zip(a, b) if x != y]
        if changed:
            return ", ".join(changed)
    return f"{len(a)} vs {len(b)} jamo"


def listen(
    kinds: tuple[str, ...],
    voices: tuple[str, ...],
    model_size: str,
    shard: tuple[int, int],
    out: Path | None,
    fixtures_only: bool,
    report: Report,
) -> None:
    """Transcribes clips and reports the ones that disagree with their text."""
    try:
        import listening  # noqa: F401
    except ImportError:  # pragma: no cover - the module sits beside this one
        pass
    from listening import transcribe_batch  # noqa: E402

    manifest = load_json(MANIFEST)
    wanted = [e for e in manifest["entries"] if e["kind"] in kinds]
    if fixtures_only:
        texts = {word for word, _, _ in FIXTURES}
        wanted = [e for e in wanted if e["text"] in texts]
    index, total = shard
    wanted = [e for i, e in enumerate(wanted) if i % total == index]

    findings: list[dict] = []
    done = 0
    total = sum(1 for entry in wanted for voice in voices if entry.get(voice))

    def flush() -> None:
        """Write what has been heard so far.

        Incrementally, and not only at the end: a full pass over the corpus is
        hours of compute, and the first run of this check was killed by the
        kernel four minutes from finishing and left nothing behind. A screen
        that has to be restarted from zero is a screen that gets skipped.
        """
        if not out:
            return
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps(
                {
                    "model": model_size,
                    "kinds": list(kinds),
                    "voices": list(voices),
                    "listened": done,
                    "total": total,
                    "findings": findings,
                },
                ensure_ascii=False,
                indent=1,
            )
            + "\n",
            encoding="utf-8",
        )

    for voice in voices:
        batch: list[dict] = []
        for entry in wanted:
            asset = entry.get(voice)
            if asset is None:
                continue
            batch.append(entry)
            if _batch_seconds(batch, voice) >= 22:
                findings += _listen_batch(batch, voice, model_size, transcribe_batch)
                done += len(batch)
                batch = []
                flush()
                print(f"  {done:,}/{total:,} heard, {len(findings)} to look at", flush=True)
        if batch:
            findings += _listen_batch(batch, voice, model_size, transcribe_batch)
            done += len(batch)
            flush()

    report.notes.append(f"listened to {done} clip(s); {len(findings)} disagreed")
    flush()
    if fixtures_only:
        for finding in findings:
            report.error(
                f"{finding['text']} [{finding['voice']}]: heard {finding['heard']!r} "
                f"({finding['difference']})"
            )
    else:
        for finding in findings[:40]:
            report.warn(
                f"{finding['text']} [{finding['voice']}]: heard {finding['heard']!r} "
                f"({finding['difference']})"
            )


def _batch_seconds(batch: list[dict], voice: str) -> float:
    return sum(e[voice]["duration_ms"] / 1000 + 0.8 for e in batch)


def _listen_batch(batch: list[dict], voice: str, model_size: str, transcribe) -> list[dict]:
    paths = [PUBLIC / e[voice]["src"] for e in batch]
    heard = transcribe(paths, size=model_size)
    findings = []
    for entry, said in zip(batch, heard):
        if acceptable(entry["text"], said):
            continue
        findings.append(
            {
                "id": entry["id"],
                "text": entry["text"],
                "kind": entry["kind"],
                "voice": voice,
                "heard": said,
                "expected_spoken": spoken_form(entry["text"]),
                "difference": difference(entry["text"], said),
            }
        )
    return findings


# --- Fixtures ----------------------------------------------------------------


def check_fixtures(report: Report) -> None:
    """The curated set, against the rules and against the shipped data."""
    vocabulary = {w["word"]: w for w in load_json(VOCABULARY)["words"]}
    manifest = {e["text"]: e for e in load_json(MANIFEST)["entries"]}
    for word, expected, why in FIXTURES:
        report.checked += 1
        got = spoken_form(word)
        if got != expected:
            report.error(f"fixture {word} ({why}): rules say {got!r}, expected {expected!r}")
        entry = manifest.get(word)
        if entry is None:
            # A fixture is allowed to be a word this curriculum does not teach:
            # 국물 and 신라 are here to hold the *rules* still, and the rules
            # apply to every Korean word rather than to the 2,581 that ship.
            # Only the ones that do ship can be listened to.
            report.notes.append(f"fixture {word}: rules only — the curriculum has no such word")
            continue
        row = vocabulary.get(word)
        if row is None:
            continue
        note = note_for(word)
        if note and row.get("say") != note[0]:
            report.error(f"fixture {word}: shipped note {row.get('say')!r} ≠ {note[0]!r}")


#: Codas that are not one of the seven, i.e. the ones whose value changes if the
#: syllable after them turns out to begin a new morpheme rather than an ending.
_UNSTABLE_CODA = frozenset("ㅅㅆㅈㅊㅌㅍㄲㅋㅎㄳㄺㄿㅄㄾㄼㄻ")
#: The vowels a compound inserts an ㄴ in front of.
_ADDS_N = frozenset("ㅣㅑㅕㅛㅠㅒㅖ")


def check_delivery(report: Report) -> None:
    """A corrected recording has to be able to reach an installed app.

    The clips are named after the words they say, so a fixed 마디 arrives under
    the name the broken one already occupies. The service worker serves audio
    cache-first, which is right — and which means the cache key has to carry the
    audio build's version, or the fix never reaches anybody who has already
    played the word. The web build stamps it; this checks that it did.
    """
    built = ROOT / "apps" / "web" / "dist" / "sw.js"
    source = ROOT / "apps" / "web" / "public" / "sw.js"
    if source.exists():
        report.checked += 1
        text = source.read_text(encoding="utf-8")
        if "__HANGYUL_AUDIO_VERSION__" not in text:
            report.error(
                "public/sw.js no longer carries the audio-version placeholder: a new "
                "recording would be answered from the previous build's cache"
            )
    if not built.exists():
        return
    report.checked += 1
    version = load_json(MANIFEST)["version"]
    text = built.read_text(encoding="utf-8")
    if f"AUDIO_VERSION = '{version}'" not in text:
        report.error(
            f"dist/sw.js does not name audio build {version}; rebuild the web app so "
            "the corrected clips are not served from the old cache"
        )


def check_compounds(report: Report) -> None:
    """Every word whose spoken form depends on where its morphemes divide.

    The transcription rules work on syllables. Two of Korean's rules work on
    morphemes — a 받침 neutralises before a following *word* but not before a
    following *ending*, and a compound inserts an ㄴ before 이/야/여/요/유 — and
    a string of syllables does not say which it has. `pronunciation._IRREGULAR`
    lists the words in this vocabulary where that distinction changes the
    answer; this walks every word that could possibly need to be in it, so that
    adding a word to the curriculum cannot silently introduce a sixth case.

    The two rules get different treatment, because they carry different risk.

    A 받침 that is not one of the seven — ㅅ, ㅈ, ㅊ, ㅌ, ㅍ and the clusters —
    *changes value* depending on the answer, and those words are exactly the
    ones that tend to carry a tensing note, so the wrong answer is printed on a
    word card. There are 36 of them in this vocabulary, every one has been read
    against 표준발음법 §15, and an unreviewed one is an error.

    The inserted ㄴ of §29 is a warning instead. Its candidate set is dominated
    by ordinary Sino-Korean liaison — 범인, 승인, 살인, and a hundred more — and
    a word that gets it wrong is wrong only in the expected spoken form this
    module compares against, never on a screen: those words show no note at all.
    Failing the build on a hundred correct words to catch the sixth 큰일 would
    make the gate something people switch off.
    """
    from pronunciation import _IRREGULAR  # noqa: PLC0415 — deliberate, see above

    #: Checked by hand against 표준발음법 §15 and §29, and correct as derived.
    reviewed = {
        "같이", "좋아하다", "맛있다", "없이", "웃음", "찾아오다", "앞으로", "멋있다",
        "높이", "깊이", "찾아보다", "없어지다", "쫓아내다", "없애다", "쌓이다",
        "좋아지다", "똑같이", "높아지다", "찾아가다", "찾아내다", "붙이다", "젊은이",
        "깨끗이", "무엇이든", "틀림없이", "높이다", "흩어지다", "쫓아가다", "덧붙이다",
        "끊임없이", "짊어지다", "갉아먹다", "샅샅이", "굳이", "가만있다", "속삭이다",
        "만약", "만일", "큰일", "별일", "나뭇잎",
    }
    known = set(_IRREGULAR) | reviewed
    candidates: list[str] = []
    for word in load_json(VOCABULARY)["words"]:
        text = word["word"]
        for i in range(len(text) - 1):
            here, then = text[i], text[i + 1]
            if not (is_syllable(here) and is_syllable(then)):
                continue
            coda = decompose(here)[2]
            initial, medial, _ = decompose(then)
            if not coda or initial != "ㅇ":
                continue
            if text in known:
                break
            if coda in _UNSTABLE_CODA:
                report.error(
                    f"{text}: a 받침 that is not one of the seven meets a vowel here, and "
                    "nobody has decided whether that vowel begins an ending or a new "
                    "word — the two give different sounds (표준발음법 §15). Read it, then "
                    "name it in qa_pronunciation.check_compounds, or in "
                    "pronunciation._IRREGULAR if the rules get it wrong."
                )
            elif medial in _ADDS_N:
                candidates.append(text)
            break

    if candidates:
        report.notes.append(
            f"{len(candidates)} word(s) where a compound would insert an ㄴ before "
            "이/야/여/요/유 if the second half were a word of its own (표준발음법 §29). "
            "Read as ordinary liaison, which is right for the Sino-Korean ones: "
            + ", ".join(candidates[:8])
            + ("…" if len(candidates) > 8 else "")
        )


def check_repairs(report: Report) -> None:
    """Every repair in the pipeline names a reason and the evidence for it."""
    if not REPAIRS.exists():
        return
    sys.path.insert(0, str(REPAIRS.parent))
    from speech_repairs import REPAIRS as table  # noqa: E402

    fixture_words = {word for word, _, _ in FIXTURES}
    for (text, voice), repair in table.items():
        report.checked += 1
        if voice not in VOICES:
            report.error(f"repair {text!r}: unknown voice {voice!r}")
        if not repair.reason:
            report.error(f"repair {text!r} [{voice}]: no reason recorded")
        if not repair.heard_before or not repair.heard_after:
            report.error(f"repair {text!r} [{voice}]: no listening evidence recorded")
        if text not in fixture_words:
            report.error(
                f"repair {text!r} [{voice}]: every repaired word must also be a fixture, "
                "so a later build cannot lose the fix silently"
            )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Exit non-zero on a finding")
    parser.add_argument("--listen", action="store_true", help="Run the recogniser screen")
    parser.add_argument("--fixtures", action="store_true", help="Listen to the fixtures only")
    parser.add_argument("--kind", default="word", help="word | sentence | letter_name | ... | all")
    parser.add_argument("--voice", default="both", help="female | male | both")
    parser.add_argument("--model", default="medium", help="faster-whisper model size")
    parser.add_argument("--shard", default="0/1", help="i/n, to split a long listening run")
    parser.add_argument("--json", type=Path, default=None, help="Write the findings here")
    args = parser.parse_args()

    report = Report()
    check_mapping(report)
    check_fixtures(report)
    check_contrasts(report)
    check_delivery(report)
    check_compounds(report)
    check_repairs(report)

    if args.listen or args.fixtures:
        kinds = (
            ("word", "sentence", "letter_name", "letter_sound", "syllable")
            if args.kind == "all"
            else tuple(args.kind.split(","))
        )
        voices = VOICES if args.voice == "both" else (args.voice,)
        index, total = (int(part) for part in args.shard.split("/"))
        listen(kinds, voices, args.model, (index, total), args.json, args.fixtures, report)

    print(f"checked {report.checked:,} item(s)")
    for note in report.notes:
        print(f"  {note}")
    for warning in report.warnings:
        print(f"  warn: {warning}")
    for error in report.errors:
        print(f"  ERROR: {error}")
    print(f"{len(report.errors)} error(s), {len(report.warnings)} warning(s)")
    return 1 if (args.check and report.errors) else 0


if __name__ == "__main__":
    raise SystemExit(main())
