#!/usr/bin/env python3
"""Renders real Hangul glyph masks as test fixtures.

The evaluator is graded against actual font outlines, not against hand-drawn
stick figures — proportions of a real typeface are what it will meet in
production, and they are what the thresholds have to be calibrated for.

Every practice face the app ships is rendered, not just one. That is what lets
the tolerance tests ask the question that matters once there is more than one
face on offer: *would an honest attempt written in plain gothic shapes still
pass when the learner has selected the calligraphic face?* A single-font fixture
set cannot express that question, and grading a brush-derived 바탕 face to a
gothic's tolerance is exactly the false failure this fixture set exists to
catch.

Layout here must match `glyphLayout()` in src/glyph.ts: em size 0.78 of the box,
centred. Run from packages/handwriting-core:

    python3 scripts/render-fixtures.py

Needs `fonttools[woff]` and `pillow`. The fonts are read straight out of
`node_modules`, so the fixtures are rendered from the exact files the app
bundles rather than from whatever happens to be installed on the machine.
"""
import io
import json
import pathlib

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

RESOLUTION = 128
GLYPH_SCALE = 0.78

ROOT = pathlib.Path(__file__).resolve().parents[3]
MODULES = ROOT / "node_modules"

#: The practice faces, keyed by the id in `apps/web/src/data/fonts.ts`.
#:
#: Weights match the `weight` field there: the mask has to be built from the
#: same rendering the learner traces, and a 400 fixture for a face the app draws
#: at 500 would be measuring a thinner glyph than the one on screen.
FONTS = {
    "pretendard": (MODULES / "pretendard/dist/web/static/woff2/Pretendard-Medium.woff2", 500),
    "nanum-gothic": (
        MODULES / "@fontsource/nanum-gothic/files/nanum-gothic-korean-400-normal.woff2",
        400,
    ),
    "nanum-myeongjo": (
        MODULES / "@fontsource/nanum-myeongjo/files/nanum-myeongjo-korean-400-normal.woff2",
        400,
    ),
    "gowun-batang": (
        MODULES / "@fontsource/gowun-batang/files/gowun-batang-korean-400-normal.woff2",
        400,
    ),
    "gaegu": (MODULES / "@fontsource/gaegu/files/gaegu-korean-400-normal.woff2", 400),
    "gowun-dodum": (
        MODULES / "@fontsource/gowun-dodum/files/gowun-dodum-korean-400-normal.woff2",
        400,
    ),
}

#: Five syllables that between them exercise every way a Hangul block is put
#: together — one simple, one with a final consonant, one with a horizontal
#: vowel, one bare vowel — and then **every letter the curriculum teaches**.
#:
#: The full alphabet is here for the robustness harness, which needs to ask how
#: often the evaluator accepts ㅓ written in the box for ㅏ. That question cannot
#: be asked from a five-character sample: the letters that get confused are
#: precisely the ones that differ by a single stroke, and picking a
#: representative few would be picking which confusions to measure.
LETTERS = [
    "ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ",
    "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅎ",
    "ㅑ", "ㅕ", "ㅛ", "ㅠ",
    "ㅊ", "ㅋ", "ㅌ", "ㅍ",
    "ㅐ", "ㅔ", "ㅒ", "ㅖ",
    "ㄲ", "ㄸ", "ㅃ", "ㅆ", "ㅉ",
    "ㅘ", "ㅝ", "ㅚ", "ㅟ", "ㅙ", "ㅞ", "ㅢ",
]
SYLLABLES = ["가", "사", "한", "물", "이"]
CHARACTERS = [*LETTERS, *SYLLABLES]

OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "__tests__" / "glyph-fixtures.json"


def load(path: pathlib.Path) -> bytes:
    """A woff2 as a plain TrueType/OpenType stream Pillow can read."""
    font = TTFont(str(path))
    buffer = io.BytesIO()
    font.flavor = None
    font.save(buffer)
    return buffer.getvalue()


def render(font_bytes: bytes, char: str) -> list[int]:
    image = Image.new("L", (RESOLUTION, RESOLUTION), 0)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(io.BytesIO(font_bytes), int(RESOLUTION * GLYPH_SCALE))
    # Pillow's "mm" anchor centres on the glyph's own middle, which is the same
    # placement canvas textBaseline="middle" + textAlign="center" produces.
    draw.text((RESOLUTION / 2, RESOLUTION / 2), char, font=font, fill=255, anchor="mm")
    # `tobytes()` rather than `getdata()`: same pixels, no deprecation warning,
    # and an "L" image is one byte per pixel in row order — the mask's layout.
    return [1 if px >= 128 else 0 for px in image.tobytes()]


def main() -> None:
    fonts: dict[str, dict] = {}
    for font_id, (path, weight) in FONTS.items():
        if not path.exists():
            raise SystemExit(f"{path} is missing — run `npm install` first")
        font_bytes = load(path)
        glyphs = {}
        for char in CHARACTERS:
            data = render(font_bytes, char)
            ink = sum(data)
            if ink == 0:
                raise SystemExit(f"{font_id} rendered {char!r} empty — missing glyph?")
            glyphs[char] = {"ink": ink, "rle": encode_rle(data)}
        fonts[font_id] = {"weight": weight, "glyphs": glyphs}
        inks = ", ".join(f"{c}={glyphs[c]['ink']}" for c in CHARACTERS)
        print(f"{font_id:18} {inks}")

    OUT.write_text(
        json.dumps(
            {
                "_comment": (
                    "GENERATED by scripts/render-fixtures.py. Real glyph masks from the "
                    f"practice faces the app bundles, at {RESOLUTION}px, glyph scale "
                    f"{GLYPH_SCALE}, run-length encoded as alternating counts starting "
                    "with zeros. Every face is SIL OFL 1.1."
                ),
                "resolution": RESOLUTION,
                "glyphScale": GLYPH_SCALE,
                #: The face the evaluator's own thresholds were calibrated against,
                #: and the default the app ships with.
                "baseline": "pretendard",
                "fonts": fonts,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT}")


def encode_rle(data: list[int]) -> list[int]:
    """Alternating run lengths, starting with a run of zeros (possibly empty)."""
    runs: list[int] = []
    expected = 0
    count = 0
    for value in data:
        if value == expected:
            count += 1
        else:
            runs.append(count)
            expected = 1 - expected
            count = 1
    runs.append(count)
    return runs


if __name__ == "__main__":
    main()
