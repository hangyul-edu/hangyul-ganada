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

Layout here must match `drawGlyph()` in src/glyph.ts, and that is now a *fit*
rather than a fixed em size — probe at 0.78 of the box, measure the ink, then
scale the ink's long edge to GLYPH_INK_EXTENT (capped at MAX_FIT_SCALE) and
centre the ink rather than the em. The three constants below are the same three
in src/glyph.ts and have to move together.

This matters more than it looks. Before the fit existed these fixtures rendered
at a fixed em, and so did the app, and the two agreed by both being wrong in the
same way. They are now both right, but a fixture set that kept the old layout
would be measuring a geometry the product does not use — the corpus would report
the evaluator's behaviour on a glyph nobody sees. Run from
packages/handwriting-core:

    python3 scripts/render-fixtures.py

Needs `fonttools[woff]` and `pillow`. The fonts are read straight out of
`node_modules`, so the fixtures are rendered from the exact files the app
bundles rather than from whatever happens to be installed on the machine.
"""
import io
import json
import os
import pathlib

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

RESOLUTION = 128

#: Probe em size, as a fraction of the box. `DEFAULT_GLYPH_SCALE` in glyph.ts.
GLYPH_SCALE = 0.78

#: Target ink extent on the long edge. `GLYPH_INK_EXTENT` in glyph.ts.
#: Overridable from the environment only so the calibration sweep can move it;
#: the committed fixtures are always rendered at the value in glyph.ts.
GLYPH_INK_EXTENT = float(os.environ.get("HG_INK_EXTENT", "0.72"))

#: Cap on magnification. `MAX_FIT_SCALE` in glyph.ts.
MAX_FIT_SCALE = float(os.environ.get("HG_MAX_FIT", "1.3"))

#: Alpha at or above which a pixel is ink. `maskFromAlpha`'s own default, and
#: what `fitGlyph` measures its bounding box with.
ALPHA_THRESHOLD = 128

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


def _paint(font_bytes: bytes, char: str, size: float, x: float, y: float) -> Image.Image:
    """One draw, at a given em size and origin.

    Pillow's "mm" anchor centres on the glyph's own middle, which is the same
    placement canvas `textBaseline="middle"` + `textAlign="center"` produces.
    """
    image = Image.new("L", (RESOLUTION, RESOLUTION), 0)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(io.BytesIO(font_bytes), max(1, round(size)))
    draw.text((x, y), char, font=font, fill=255, anchor="mm")
    return image


def render(font_bytes: bytes, char: str) -> list[int]:
    """`char` fitted into the box exactly as `drawGlyph` fits it.

    Probe, measure, solve, redraw — see `fitGlyph` in src/glyph.ts for why the
    corrected origin is exact rather than iterative.
    """
    probe_size = RESOLUTION * GLYPH_SCALE
    centre = RESOLUTION / 2
    probe = _paint(font_bytes, char, probe_size, centre, centre)

    box = probe.point(lambda px: 255 if px >= ALPHA_THRESHOLD else 0).getbbox()
    if box is None:
        return [0] * (RESOLUTION * RESOLUTION)
    min_x, min_y, max_x, max_y = box  # getbbox is half-open on the far edge
    longest = max(max_x - min_x, max_y - min_y)
    scale = min((GLYPH_INK_EXTENT * RESOLUTION) / longest, MAX_FIT_SCALE)

    ink_x = (min_x + max_x) / 2
    ink_y = (min_y + max_y) / 2
    fitted = _paint(
        font_bytes,
        char,
        probe_size * scale,
        centre - scale * (ink_x - centre),
        centre - scale * (ink_y - centre),
    )
    # `tobytes()` rather than `getdata()`: same pixels, no deprecation warning,
    # and an "L" image is one byte per pixel in row order — the mask's layout.
    return [1 if px >= ALPHA_THRESHOLD else 0 for px in fitted.tobytes()]


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
                    f"practice faces the app bundles, at {RESOLUTION}px, probed at glyph "
                    f"scale {GLYPH_SCALE} and then ink-fitted to {GLYPH_INK_EXTENT} of the "
                    f"box (capped at {MAX_FIT_SCALE}x) and ink-centred, exactly as "
                    "drawGlyph does. Run-length encoded as alternating counts starting "
                    "with zeros. Every face is SIL OFL 1.1."
                ),
                "resolution": RESOLUTION,
                "glyphScale": GLYPH_SCALE,
                "inkExtent": GLYPH_INK_EXTENT,
                "maxFitScale": MAX_FIT_SCALE,
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
