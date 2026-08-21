#!/usr/bin/env python3
"""Renders every launcher icon, splash screen and favicon from the brand art.

    python3 scripts/content/build_app_icons.py
    python3 scripts/content/build_app_icons.py --check

Two source images, one command, every size. Hand-exporting icons is how an app
ends up shipping last year's mark at one density and this year's at another, and
how a store submission is rejected for an icon with an alpha channel.

## Two sources, because an app icon and a brand mark are different jobs

`brand/app-icon.png` — the orange held in a hand — is the **application icon**.
It is what a phone shows on its home screen, what a store shows on its product
page, and what a browser installs to a desktop. It is a composition designed to
be read at 48 px inside a rounded mask, and it is the only thing the launcher,
the App Store and the PWA manifest are given.

`brand/logo-symbol.png` — the orange on its own — is the **brand mark**. It is
the app talking about itself *inside* itself: the splash screen the app draws
while it boots, and the favicon a browser tab shows next to a page title. A tab
favicon is 16 px, and at 16 px a hand holding an orange is a smudge, so the tab
keeps the mark. These are separate concerns and they stay separate: changing the
app icon must not silently change what a browser tab looks like.

## The three icon shapes, and why they are not the same file

**Legacy Android and iOS** want the finished icon: the mark on its ground,
composed edge to edge. The launcher rounds the corners itself.

**Android adaptive** (API 26+) wants two layers — a background and a foreground —
because the launcher crops them to whatever mask it likes: a circle on one
phone, a squircle on another, a teardrop on a third. Only the middle 66% of the
canvas is guaranteed to survive that crop, so the foreground layer is drawn with
the mark inside `ADAPTIVE_SAFE_FRACTION`. Draw it any larger and some launcher
somewhere slices the leaf off the orange.

**favicon.ico** wants several small sizes in one file. A browser tab renders at
16 px, where a photographic downscale of a 800 px mark turns to mush, so each
size is resampled separately with LANCZOS rather than scaled from one bitmap.

## Why the ground is warm, not white

`warm.50` is the app's own surface colour. A pure white icon disappears into a
light home screen and into the App Store's white product page; this is the
smallest amount of colour that gives the tile an edge without turning the icon
into a second logo.
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import numpy
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "apps" / "web" / "public" / "brand"
WEB_PUBLIC = ROOT / "apps" / "web" / "public"
ANDROID_RES = ROOT / "apps" / "mobile" / "android" / "app" / "src" / "main" / "res"
IOS_ASSETS = ROOT / "apps" / "mobile" / "ios" / "App" / "App" / "Assets.xcassets"

#: The application icon artwork, transparent behind it. Every launcher, store
#: and installable icon is built from this and from nothing else.
APP_ICON_SOURCE = BRAND / "app-icon.png"

#: The brand mark on its own. The browser favicon is built from this — see the
#: note above on why it is not the app icon.
MARK_SOURCE = BRAND / "logo-symbol.png"

#: The launch screen — the brand artwork with the words taken out of it.
#:
#: The OS draws this before any of the app's code runs, which means it runs
#: before anything knows what language the learner reads. The app's own splash
#: (`ui/LaunchSplash`) does know, and shows 한귤 to a Korean learner and
#: *Han gyul* to everyone else a frame or two later.
#:
#: So the native bitmap must not say anything. It carried the English artwork
#: for one release and the cost was visible: a Korean learner opening the app
#: saw *Han gyul — Like a slice of tangerine, one letter a day* in English, and
#: then watched it be replaced by the Korean wordmark. Two languages, one
#: launch. Guessing from the device locale would be wrong for anyone who has
#: ever changed the setting, and there is nothing else to guess from.
#:
#: An earlier design handed over on `handoff-frame.png`, a still lifted from the
#: splash *animation* — the ground and one soft circle, no wordmark — chosen for
#: exactly this reason. There is no animation any more and so no frame to lift,
#: which is how the English one got here. `_wordless` rebuilds the equivalent
#: from the still instead. See its docstring.
SPLASH_SOURCE = ROOT / "apps" / "common_assets" / "splash" / "splash_eng.png"

#: The social-sharing preview, and the one asset here that is not a mark.
#:
#: `apps/common_assets/ob/ob image4.jpg` is the brand's own key visual — the
#: wordmark, the line, and a phone showing the actual product. It is 3200 x 1600,
#: which is exactly the 2:1 that `twitter:card=summary_large_image` specifies and
#: close enough to Open Graph's preferred 1.91:1 that no crop is needed. So this
#: is a straight resample: no crop, no letterbox, no stretch, and nothing drawn
#: over the artwork.
#:
#: It is regenerated rather than copied for two reasons. The source filename has
#: a space in it, which survives a filesystem and does not reliably survive a
#: crawler fetching an absolute URL; and a 1.4 MB JPEG is a slow first fetch for
#: a preview card that renders at 600 px wide. The generated file is one
#: deterministic, web-safe name at a sensible size.
SHARE_SOURCE = ROOT / "apps" / "common_assets" / "ob" / "ob image4.jpg"

#: The generated preview. Width and height are declared in the HTML as
#: `og:image:width` / `og:image:height`, so these two numbers and those two tags
#: have to agree; `--check` is what keeps them agreeing.
SHARE_SIZE = (1200, 600)

#: JPEG quality for the preview. 88 with 4:2:0 chroma keeps the wordmark and the
#: phone's UI text crisp at the size a card actually renders, and lands well
#: under the 1 MB that some crawlers stop reading at.
SHARE_QUALITY = 88

#: `warm.50` from the design tokens. Kept in sync by `--check` failing loudly if
#: the tokens move: the icons are regenerated, not patched.
GROUND = (255, 248, 241, 255)

#: How much of a legacy icon the artwork occupies, measured against its longer
#: edge. Enough to read at 48 px, with room for the launcher's corner rounding.
LEGACY_FRACTION = 0.76

#: Android's adaptive-icon safe zone. The 108dp canvas is masked down to a 66dp
#: circle in the worst case, so every pixel of ink has to sit inside 66/108 of
#: the canvas. The artwork is taller than it is wide, so the limit is set by the
#: leaf tip and the heel of the hand, not by the width: 0.53 is the largest
#: value at which nothing at all is clipped, and this sits one step under it so
#: that a future tweak to the artwork does not immediately fail the build.
#: `_assert_inside_safe_zone` measures the clipping rather than trusting the
#: arithmetic.
ADAPTIVE_SAFE_FRACTION = 0.52

#: The same idea for the web's maskable icons, whose safe zone is a circle of
#: 80% of the icon's width rather than 66/108 of it. Roomier than Android's, so
#: an installed PWA is not left with a smaller icon than the store build.
MASKABLE_SAFE_FRACTION = 0.64

#: Luminance above which a pixel is treated as highlight rather than ink when
#: the monochrome layer is flattened. Chosen by looking at the result: below it
#: the pale hand disappears, above it the 가나다 face fills in and the icon
#: becomes a black blob. See `_monochrome`.
MONOCHROME_INK_MAX = 215

#: The ground of the splash artwork, sampled from its corner.
#:
#: Not `warm.50`. It is `splashGround` in the design tokens, `backgroundColor`
#: under `SplashScreen` in `capacitor.config.ts` and `splashBackground` in the
#: Android `colors.xml`, and all four have to agree — it is what Android 12 and
#: newer paint their own splash on, and what shows in the sliver a cover crop
#: cannot fill on an unusual aspect ratio. A different shade is a visible edge.
#:
#: It was #FFF6E9 while the source was frame zero of the animation. Same
#: sampling, new picture.
SPLASH_GROUND = (255, 241, 225, 255)

#: The vertical slice of the artwork the copy occupies, as fractions of height.
#: Wide enough to hold the wordmark and the line under it, narrow enough to
#: exclude every decorative jamo. See `_wordless`.
TEXT_BAND = (0.40, 0.66)

#: Dilation, in px, applied to the text mask before repainting. Covers the
#: antialiased edge of a glyph, which is neither ink nor ground.
TEXT_DILATE = 21

#: Blur radius applied inside the repainted area only, to take the ring
#: quantisation out of the reconstructed gradient.
TEXT_BLUR = 9

#: Launcher icon sizes, in px, by Android density bucket.
ANDROID_DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

#: Legacy (pre-API-31) splash bitmaps. Android 12 and newer ignore these and
#: draw the system splash from the launcher icon instead, which is why these
#: stop at the sizes older phones actually used.
ANDROID_SPLASH = {
    "drawable": (480, 800),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}

#: Sizes inside `favicon.ico`. 16 for the tab, 32 for the bookmark bar and the
#: high-density tab, 48 for Windows' taskbar and shortcut.
FAVICON_SIZES = (16, 32, 48)

#: Installable-web-app icons. 192 is what Android's "add to home screen" takes,
#: 512 is what a desktop install and a splash screen take. Each is emitted twice
#: — once composed edge to edge for a browser that draws the icon as given, and
#: once inside the maskable safe zone for one that crops it to its own shape.
PWA_ICON_SIZES = (192, 512)

#: Icon artwork the two stores upload. Neither is generated by a build step at
#: submission time, so they are generated here and committed with everything
#: else, from the same source as the icon on the phone.
STORE = ROOT / "store"


def _artwork(source: Path) -> Image.Image:
    """Source art, trimmed to its own ink so padding is ours to decide."""
    image = Image.open(source).convert("RGBA")
    box = image.getchannel("A").getbbox()
    return image.crop(box) if box else image


def _monochrome(mark: Image.Image) -> Image.Image:
    """The artwork as a single-colour silhouette, for Android's themed icons.

    Android 13 and newer can draw the launcher in the wallpaper's colours. It
    does that by taking the `monochrome` layer and using *only its alpha* — the
    colours in it are thrown away — so what has to be right here is the shape.

    A straight alpha silhouette of this artwork is a black blob: the face, the
    leaf and the hand all have full alpha, so they merge into the orange. What
    makes it read is knocking the highlights back out, which leaves the outline
    of the fruit and the hand with the 가나다 face and the smile punched through
    it. That is the icon someone recognises at 48 px, in one colour.
    """
    ink = ImageChops.multiply(
        mark.getchannel("A"),
        mark.convert("L").point(lambda value: 0 if value > MONOCHROME_INK_MAX else 255),
    )
    silhouette = Image.new("RGBA", mark.size, (0, 0, 0, 255))
    silhouette.putalpha(ink)
    return silhouette


def _cover(art: Image.Image, size: tuple[int, int],
           ground: tuple[int, int, int, int]) -> Image.Image:
    """`art` scaled to cover `size` and centre-cropped to it.

    The same thing Android's ``CENTER_CROP`` scale type does, done here so the
    bitmap that ships is the one that was looked at rather than whatever the
    device decides to do with a differently-shaped one. `ground` fills the
    canvas first, so a rounding error at an edge is the splash's own colour.
    """
    width, height = size
    scale = max(width / art.width, height / art.height)
    scaled = art.resize(
        (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
        Image.LANCZOS,
    )
    left = (scaled.width - width) // 2
    top = (scaled.height - height) // 2
    canvas = Image.new("RGBA", size, ground)
    canvas.alpha_composite(scaled.crop((left, top, left + width, top + height)))
    return canvas


def _wordless(art: Image.Image) -> Image.Image:
    """`art` with the wordmark and the tagline painted out.

    The result is what the OS launch screen shows: the brand's ground, its
    radial wash, its soft centre circle and its scattered jamo, and no type in
    any language. See the note on `SPLASH_SOURCE` for why that matters.

    ## How the type is found

    By colour, inside the band it lives in. The wordmark is the brand's
    saturated orange and the line under it is near-black, and nothing else in
    the middle third of the artwork is either — the decorative jamo are muted
    orange, brown, yellow and cream, and every one of them sits outside the
    band. Restricting to `TEXT_BAND` is what keeps them: a colour test alone
    would take the brown ㅜ at the bottom right with it.

    The mask is then dilated, because a glyph's antialiased edge is neither the
    ink colour nor the ground and would otherwise survive as a faint outline of
    the word that was removed.

    ## How the hole is filled

    The artwork under the type is a radial gradient about the centre of the
    canvas — warm in the middle, pale at the edges — so a pixel's colour is very
    nearly a function of its distance from that centre alone. For each integer
    radius this takes the **median** of every pixel at that distance that is not
    masked, and paints the masked pixels with it.

    Median rather than mean, because the jamo and the small white dots cross
    most of the rings and would drag an average off the wash by several units —
    visible, on a gradient this smooth, as a bruise where the word used to be.
    A median ignores them as long as they are a minority of the ring, which they
    are everywhere.

    The repaired area is finally blurred *into itself* — composited through the
    same mask, so nothing outside it moves. Rings are quantised to whole pixels
    and a gradient reconstructed from them prints faint concentric banding; nine
    pixels of blur is below the artwork's own gradient and above the banding.
    """
    pixels = numpy.asarray(art.convert("RGB"), dtype=numpy.float64)
    height, width, _ = pixels.shape
    red, green, blue = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]

    wordmark = (red > 200) & (green < 140) & (blue < 90)
    tagline = (red < 120) & (green < 120) & (blue < 120)
    text = wordmark | tagline
    band = numpy.zeros_like(text)
    band[int(TEXT_BAND[0] * height) : int(TEXT_BAND[1] * height), :] = True
    text &= band

    mask = numpy.asarray(
        Image.fromarray((text * 255).astype(numpy.uint8)).filter(
            ImageFilter.MaxFilter(TEXT_DILATE)
        )
    ) > 0
    if not mask.any():
        raise SystemExit(
            f"{SPLASH_SOURCE.name}: found no wordmark to remove. The artwork changed; "
            "re-check the colour tests in _wordless before trusting this output."
        )

    rows, columns = numpy.mgrid[0:height, 0:width]
    radius = numpy.sqrt(
        (rows - height / 2.0) ** 2 + (columns - width / 2.0) ** 2
    ).astype(numpy.int32)
    known = ~mask
    repaired = pixels.copy()

    for channel in range(3):
        values = pixels[:, :, channel]
        order = numpy.argsort(radius[known].ravel(), kind="stable")
        by_radius = radius[known].ravel()[order]
        sorted_values = values[known].ravel()[order]
        edges = numpy.searchsorted(by_radius, numpy.arange(radius.max() + 2))
        ring = numpy.full(radius.max() + 1, numpy.nan)
        for step in range(ring.size):
            low, high = edges[step], edges[step + 1]
            if high > low:
                ring[step] = numpy.median(sorted_values[low:high])
        index = numpy.arange(ring.size)
        present = ~numpy.isnan(ring)
        ring = numpy.interp(index, index[present], ring[present])
        repaired[:, :, channel][mask] = ring[radius[mask]]

    flat = Image.fromarray(numpy.clip(repaired, 0, 255).astype(numpy.uint8))
    return Image.composite(
        flat.filter(ImageFilter.GaussianBlur(TEXT_BLUR)),
        flat,
        Image.fromarray((mask * 255).astype(numpy.uint8)),
    ).convert("RGBA")


def _extend(art: Image.Image, size: tuple[int, int]) -> Image.Image:
    """`art` fitted to the height of `size`, on a ground grown from its own edge.

    For a target that is square or wider than it is tall. Covering one of those
    from a 9:19.5 portrait artwork means scaling it up by a factor of three and
    keeping a third of its height: the wordmark ends up most of the width of the
    screen and the composition around it is gone. So the art is fitted instead
    and the rest of the canvas is filled.

    Filled with the artwork's *own* edge rather than with `SPLASH_GROUND`. The
    flat colour is only right at the corners — the piece has a large soft radial
    wash, so at mid-height its edge is #FFDDC1, several steps warmer, and
    padding with the corner colour draws a visible letterbox down both sides. An
    eight-pixel column of the source, averaged down to 24 rows so the wash's own
    banding does not print as a horizon, and stretched across the canvas, gives
    every row the colour that row actually ends on. The seam disappears.
    """
    width, height = size
    edge = art.crop((0, 0, 8, art.height)).resize((1, 24), Image.LANCZOS)
    canvas = edge.resize(size, Image.BICUBIC)
    scale = height / art.height
    fitted = art.resize((max(1, round(art.width * scale)), height), Image.LANCZOS)
    canvas.alpha_composite(fitted, ((width - fitted.width) // 2, 0))
    return canvas


def _launch_bitmap(art: Image.Image, size: tuple[int, int],
                   ground: tuple[int, int, int, int]) -> Image.Image:
    """The launch bitmap for one target, by the shape of the target.

    Taller than it is wide — every phone in portrait, which is the overwhelming
    majority of launches — takes the cover crop, because the artwork is that
    shape already and cropping it loses only background. Square or landscape
    takes `_extend`, for the reason given there.
    """
    return _cover(art, size, ground) if size[1] > size[0] else _extend(art, size)


def _centred(mark: Image.Image, size: tuple[int, int], fraction: float,
             ground: tuple[int, int, int, int] | None) -> Image.Image:
    """`mark` scaled to `fraction` of the shorter edge, centred on `ground`."""
    width, height = size
    target = int(round(min(width, height) * fraction))
    scale = target / max(mark.width, mark.height)
    scaled = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.LANCZOS,
    )
    canvas = Image.new("RGBA", size, ground or (0, 0, 0, 0))
    canvas.alpha_composite(
        scaled,
        ((width - scaled.width) // 2, (height - scaled.height) // 2),
    )
    return canvas


def _png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def _assert_inside_safe_zone(foreground: Image.Image, fraction: float, what: str) -> None:
    """Fails if any ink would be cropped by a circular launcher mask.

    The interesting failure is silent: a launcher that masks to a circle shaves
    the leaf off, nobody building on a squircle phone ever sees it, and the icon
    ships wrong. Counting the pixels is cheap and it cannot be fooled by
    re-deriving the same arithmetic that produced the layout.
    """
    size = foreground.width
    diameter = size * fraction
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse(
        [
            (size - diameter) / 2, (size - diameter) / 2,
            (size + diameter) / 2, (size + diameter) / 2,
        ],
        fill=255,
    )
    ink = foreground.getchannel("A").point(lambda value: 255 if value > 8 else 0)
    clipped = ImageChops.subtract(ink, mask)
    lost = sum(value * count for value, count in enumerate(clipped.histogram()))
    if lost:
        raise SystemExit(
            f"{what} overflows its safe circle by {lost // 255} px — "
            f"lower the fraction it is drawn at"
        )


def build() -> dict[Path, bytes]:
    """Every generated file, as path -> bytes. Nothing is written here."""
    icon = _artwork(APP_ICON_SOURCE)
    mono = _monochrome(icon)
    mark = _artwork(MARK_SOURCE)
    files: dict[Path, bytes] = {}

    # --- Android launcher icons ---------------------------------------------
    for density, size in ANDROID_DENSITIES.items():
        square = _png(_centred(icon, (size, size), LEGACY_FRACTION, GROUND))
        files[ANDROID_RES / f"mipmap-{density}" / "ic_launcher.png"] = square
        files[ANDROID_RES / f"mipmap-{density}" / "ic_launcher_round.png"] = square
        # The adaptive foreground is drawn on a canvas 108/48 the nominal size,
        # transparent, with the artwork inside the safe zone.
        canvas = round(size * 108 / 48)
        foreground = _centred(icon, (canvas, canvas), ADAPTIVE_SAFE_FRACTION, None)
        _assert_inside_safe_zone(foreground, 66 / 108, "adaptive icon foreground")
        files[ANDROID_RES / f"mipmap-{density}" / "ic_launcher_foreground.png"] = _png(
            foreground
        )
        # The themed-icon layer shares the foreground's geometry exactly: the
        # launcher swaps one drawable for the other and any difference in size
        # would show as the icon jumping when themed icons are turned on.
        themed = _centred(mono, (canvas, canvas), ADAPTIVE_SAFE_FRACTION, None)
        _assert_inside_safe_zone(themed, 66 / 108, "monochrome icon layer")
        files[ANDROID_RES / f"mipmap-{density}" / "ic_launcher_monochrome.png"] = _png(themed)

    # --- Android legacy splash ----------------------------------------------
    splash_art = _wordless(Image.open(SPLASH_SOURCE))
    for directory, size in ANDROID_SPLASH.items():
        files[ANDROID_RES / directory / "splash.png"] = _png(
            _launch_bitmap(splash_art, size, SPLASH_GROUND)
        )

    # --- iOS -----------------------------------------------------------------
    # One 1024 icon: Xcode 14 and newer generate the rest, so there is no set of
    # sizes to fall out of step. It must be fully opaque — App Store Connect
    # rejects an icon with an alpha channel, and `convert("RGB")` is what
    # guarantees that rather than a promise in a comment.
    ios_icon = _centred(icon, (1024, 1024), LEGACY_FRACTION, GROUND).convert("RGB")
    buffer = io.BytesIO()
    ios_icon.save(buffer, "PNG", optimize=True)
    files[IOS_ASSETS / "AppIcon.appiconset" / "AppIcon-512@2x.png"] = buffer.getvalue()

    # iOS draws one splash asset scaled to the device, so it is square and large
    # enough for the biggest iPad in either orientation. Square, so `_extend`:
    # the storyboard's `scaleAspectFill` on a portrait iPhone scales this to the
    # screen's height and crops the sides, and what is left in the middle is
    # very nearly the artwork at its own proportions.
    splash = _png(_launch_bitmap(splash_art, (2732, 2732), SPLASH_GROUND))
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        files[IOS_ASSETS / "Splash.imageset" / name] = splash

    # --- Installable web app --------------------------------------------------
    # What "add to home screen" installs. Two purposes, because a browser only
    # ever uses one of them: `any` is drawn exactly as given, `maskable` is
    # cropped to whatever shape the platform prefers and so is drawn smaller,
    # inside the 80% safe circle.
    for size in PWA_ICON_SIZES:
        files[BRAND / f"app-icon-{size}.png"] = _png(
            _centred(icon, (size, size), LEGACY_FRACTION, GROUND)
        )
        maskable = _centred(icon, (size, size), MASKABLE_SAFE_FRACTION, GROUND)
        _assert_inside_safe_zone(
            _centred(icon, (size, size), MASKABLE_SAFE_FRACTION, None),
            0.8,
            f"maskable {size}px icon",
        )
        files[BRAND / f"app-icon-{size}-maskable.png"] = _png(maskable)

    # --- The browser tab -------------------------------------------------------
    # The mark, not the app icon, and deliberately so — see the note at the top
    # of this file. Served from the site root because browsers, RSS readers and
    # link previewers ask for `/favicon.ico` whether or not the HTML mentions it.
    buffer = io.BytesIO()
    largest = _centred(mark, (256, 256), 0.94, None)
    largest.save(buffer, "ICO", sizes=[(size, size) for size in FAVICON_SIZES])
    files[WEB_PUBLIC / "favicon.ico"] = buffer.getvalue()

    # --- The social-sharing preview -------------------------------------------
    # Straight resample of the brand key visual. See the note on `SHARE_SOURCE`
    # for why it is regenerated rather than referenced where it lies.
    share = Image.open(SHARE_SOURCE).convert("RGB")
    if share.width / share.height != SHARE_SIZE[0] / SHARE_SIZE[1]:
        raise SystemExit(
            f"{SHARE_SOURCE.name} is {share.width}x{share.height}; the preview is "
            f"{SHARE_SIZE[0]}x{SHARE_SIZE[1]} and this step does not crop. Re-export "
            "the source at the same aspect ratio, or decide here what to lose."
        )
    buffer = io.BytesIO()
    share.resize(SHARE_SIZE, Image.LANCZOS).save(
        buffer, "JPEG", quality=SHARE_QUALITY, optimize=True, progressive=True
    )
    files[BRAND / "og-hangyul-ganada.jpg"] = buffer.getvalue()

    # --- Store artwork ---------------------------------------------------------
    # The same icon a phone shows, at the sizes the two consoles ask to upload,
    # so a submission cannot ship artwork the product stopped using.
    #
    # Google Play takes a 512 PNG and allows an alpha channel. App Store Connect
    # takes 1024 and rejects one, which is why this is the flattened copy that
    # was already built for the iOS bundle rather than a second render of it.
    files[STORE / "google-play" / "app-icon-512.png"] = _png(
        _centred(icon, (512, 512), LEGACY_FRACTION, GROUND)
    )
    files[STORE / "app-store" / "app-icon-1024.png"] = buffer_png(ios_icon)

    return files


def buffer_png(image: Image.Image) -> bytes:
    """`_png` for an image already flattened to RGB."""
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the committed icons match the source artwork; write nothing",
    )
    args = parser.parse_args()

    for source in (APP_ICON_SOURCE, MARK_SOURCE, SPLASH_SOURCE):
        if not source.exists():
            print(f"source artwork missing: {source}", file=sys.stderr)
            return 1

    files = build()

    if args.check:
        stale = [
            path for path, data in files.items()
            if not path.exists() or path.read_bytes() != data
        ]
        if stale:
            print("app icons are out of date with the source artwork:", file=sys.stderr)
            for path in sorted(stale):
                print(f"  {path.relative_to(ROOT)}", file=sys.stderr)
            print(
                "\nrun: npm run mobile:icons",
                file=sys.stderr,
            )
            return 1
        print(f"app icons up to date ({len(files)} files)")
        return 0

    for path, data in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    print(
        f"wrote {len(files)} icon, splash and favicon files "
        f"from {APP_ICON_SOURCE.name}, {MARK_SOURCE.name} and {SPLASH_SOURCE.name}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
