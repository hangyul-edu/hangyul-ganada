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

#: The application icon, per platform, delivered as a finished square.
#:
#: ## Two files, and they are not interchangeable
#:
#: `app_logo_android.png` is what an Android launcher and the Play listing show;
#: `app_logo_iphone.png` is what an iPhone home screen and App Store Connect
#: show. They are close but not identical - the iPhone art is drawn at 1024 for
#: a mask that rounds harder, the Android art at 512 for a launcher that may
#: crop to a circle - and the two stores are the two audiences, so consolidating
#: them into one source would mean one of the platforms shipping art drawn for
#: the other. Nothing below reads across: the Android outputs read the Android
#: file, the iOS outputs read the iPhone file, and `--check` fails if that stops
#: being true.
#:
#: ## They arrive composed, and are used composed
#:
#: Both are opaque, square, and carry their own ground - the cream the character
#: sits on is part of the drawing, not something this script adds. So the legacy
#: and store icons are a straight resample, edge to edge: no re-inset on a
#: different ground, no second rounded mask over artwork that was already
#: composed for one. The only place the artwork is taken apart is the adaptive
#: and round layers, where a launcher's own mask would cut the arms off, and
#: there it is the *ink* that is repositioned rather than the picture stretched.
ANDROID_APP_ICON_SOURCE = ROOT / "apps" / "common_assets" / "logo" / "app_logo_android.png"
IOS_APP_ICON_SOURCE = ROOT / "apps" / "common_assets" / "logo" / "app_logo_iphone.png"

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
#: The Korean artwork, for `drawable-ko`. See the note in `build`.
SPLASH_KO_SOURCE = ROOT / "apps" / "common_assets" / "splash" / "splash_ko.png"

#: The social-sharing preview, and the one asset here that is not a mark.
#:
#: `apps/common_assets/ob/hangyul_ganada_ob_image.png` is the brand's own key
#: visual — the wordmark, the line, and a phone showing the actual product. It
#: is 3200 x 1600, which is exactly the 2:1 that `twitter:card=summary_large_image`
#: specifies and close enough to Open Graph's preferred 1.91:1 that no crop is
#: needed. So this is a straight resample: no crop, no letterbox, no stretch,
#: and nothing drawn over the artwork.
#:
#: It is regenerated rather than copied because a 1.1 MB, 3200 px PNG is a slow
#: first fetch for a preview card that renders at 600 px wide. The generated
#: file is one deterministic, web-safe name at a sensible size. It stays PNG —
#: the format the artwork was delivered in — so the `og:image:type` the HTML
#: declares is the type the crawler receives. The source's alpha channel is
#: 254–255 everywhere, i.e. visually opaque, so flattening to RGB changes
#: nothing a viewer can see and avoids messengers compositing near-transparent
#: pixels over their own background.
SHARE_SOURCE = ROOT / "apps" / "common_assets" / "ob" / "hangyul_ganada_ob_image.png"

#: The generated preview. Width and height are declared in the HTML as
#: `og:image:width` / `og:image:height`, so these two numbers and those two tags
#: have to agree; `--check` is what keeps them agreeing.
SHARE_SIZE = (1200, 600)

#: The generated preview file, under the web public root. `.png` because the
#: canonical source is a PNG and the HTML declares `og:image:type` `image/png`;
#: at 1200x600 the optimized PNG is ~200 kB, well under the ~5 MB where some
#: crawlers stop reading.
SHARE_OUTPUT_NAME = "og-hangyul-ganada.png"

#: `warm.50` from the design tokens. Kept in sync by `--check` failing loudly if
#: the tokens move: the icons are regenerated, not patched.
GROUND = (255, 248, 241, 255)

#: The ground the delivered app-icon artwork is drawn on, read out of the file
#: rather than typed here - see `_ground_of`. It is what the adaptive icon's
#: flat background layer has to be, because the foreground is the same picture
#: with that colour keyed out: any other value and the launcher paints a cream
#: character on a differently-cream tile, with the seam showing wherever the
#: artwork's own soft shadow ends. `ic_launcher_background` in `colors.xml`
#: carries the same value and `--check` fails when the two disagree.
ANDROID_BACKGROUND_COLOR = ROOT / "apps" / "mobile" / "android" / "app" / "src" / "main" / "res" / "values" / "colors.xml"

#: How much of the *round* launcher icon the ink occupies.
#:
#: `ic_launcher_round.png` is used by launchers that crop to a circle on API
#: levels below 26, where there is no adaptive icon to fall back to. Shipping
#: the full-bleed square there is what takes the character's arms off: the
#: artwork runs to all four edges by design. 0.80 is the largest fraction at
#: which no ink pixel leaves the circle, measured rather than guessed, and this
#: sits under it.
ROUND_ICON_FRACTION = 0.76

#: The same measurement for Android's adaptive foreground, whose worst case is
#: the 66/108 circle rather than the whole canvas. 0.48 is where the first ink
#: pixel crosses; this is one step under so a redraw of the artwork does not
#: immediately fail the build. `_assert_inside_safe_zone` measures the clipping
#: either way - the number is the starting point, not the guarantee.
ANDROID_ADAPTIVE_FRACTION = 0.46

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
MASKABLE_SAFE_FRACTION = 0.62

#: Luminance below which a pixel is a *feature* rather than the body, when the
#: monochrome layer is flattened.
#:
#: The mandarin's eyes are black and its open mouth is a dark red (L≈26); the
#: body is orange (L≈164) and the cheeks a deeper orange (L≈125). Anything under
#: this is punched out of the silhouette so it reads as a hole. See
#: `_monochrome` for why a plain silhouette does not work.
MONOCHROME_FEATURE_MAX = 110

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


def _ground_of(image: Image.Image) -> tuple[int, int, int, int]:
    """The colour the artwork is composed on, sampled from its top-left pixel.

    Read rather than declared. The delivered icon arrives as a finished square
    and its ground is a fact about the file; a constant here would be a second
    copy of that fact, and the first thing to go stale when the artwork is
    redrawn a shade warmer.
    """
    red, green, blue = image.convert("RGB").getpixel((0, 0))
    return (red, green, blue, 255)


#: How far a pixel has to be from the ground before it counts as ink, and how
#: far before it counts fully. A ramp rather than a threshold: the artwork's
#: drop shadows fade into the cream over several units, and a hard cut leaves a
#: visible outline of the shadow where the key stopped.
_INK_SOFT = (10, 34)


def _ink(image: Image.Image) -> Image.Image:
    """`image` with its own ground keyed out, trimmed to what is left.

    Used only where a launcher mask would cut the composed square - the adaptive
    foreground, the round icon, the maskable web icon. Everywhere else the
    artwork is used as delivered.

    The keyed-out area is filled by the flat background layer, which is that
    same ground colour, so nothing a person sees is removed: what the key buys
    is a *measurable* ink boundary, which is what `_assert_inside_safe_zone`
    needs in order to say whether the leaf and the arms survive the crop.
    """
    pixels = numpy.asarray(image.convert("RGBA")).astype(numpy.float64)
    ground = numpy.asarray(_ground_of(image)[:3], dtype=numpy.float64)
    distance = numpy.abs(pixels[:, :, :3] - ground).max(axis=2)
    low, high = _INK_SOFT
    keyed = numpy.clip((distance - low) / (high - low), 0.0, 1.0) * (pixels[:, :, 3] / 255.0)
    pixels[:, :, 3] = keyed * 255.0
    out = Image.fromarray(pixels.astype(numpy.uint8), "RGBA")
    box = out.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
    return out.crop(box) if box else out


def _full_bleed(art: Image.Image, size: int) -> Image.Image:
    """`art` at `size`x`size`, edge to edge, with nothing added over it.

    The delivered artwork is square, so this is a resample and never a stretch;
    a source that stops being square is a build failure rather than a squashed
    mandarin.
    """
    if art.width != art.height:
        raise SystemExit(
            f"app icon artwork is {art.width}x{art.height}; it must be square, because "
            "resizing it to a launcher's square would otherwise distort the drawing"
        )
    return art.resize((size, size), Image.LANCZOS)


def _monochrome(mark: Image.Image) -> Image.Image:
    """The artwork as a single-colour silhouette, for Android's themed icons.

    Android 13 and newer can draw the launcher in the wallpaper's colours. It
    does that by taking the `monochrome` layer and using *only its alpha* — the
    colours in it are thrown away — so what has to be right here is the shape.

    ## Why a plain silhouette is not it

    Every pixel of this artwork is opaque, so its alpha channel is one blob: a
    mandarin, its leaf, its two arms and three letters, all merged into a single
    filled shape with no face. At 48 px that is not the app's icon, it is a
    smudge with 가나다 over it.

    What makes it read is punching the *features* out — the eyes and the open
    mouth become holes rather than more ink — so the face is drawn by the
    wallpaper showing through, which is exactly how a themed icon is meant to
    work.

    ## Dark, but not green

    The features are found by luminance, with one exception that a luminance
    test alone gets wrong: the leaf is a dark green (L≈58) and the green letter
    darker than the orange ones (L≈102), so a plain threshold punches a
    leaf-shaped hole in the top of the fruit and hollows out the ㄷ. Both are
    green-dominant and neither of the real features is, so that is the test —
    stated as a fact about this artwork rather than as a general rule.
    """
    pixels = numpy.asarray(mark.convert("RGBA")).astype(numpy.int16)
    red, green, blue = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    feature = (luminance < MONOCHROME_FEATURE_MAX) & ~((green > red) & (green > blue))
    alpha = pixels[:, :, 3].copy()
    alpha[feature] = 0
    silhouette = Image.new("RGBA", mark.size, (0, 0, 0, 255))
    silhouette.putalpha(Image.fromarray(alpha.astype(numpy.uint8), "L"))
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
    android_art = Image.open(ANDROID_APP_ICON_SOURCE).convert("RGBA")
    ios_art = Image.open(IOS_APP_ICON_SOURCE).convert("RGBA")
    android_ground = _ground_of(android_art)
    android_ink = _ink(android_art)
    mono = _monochrome(android_ink)
    mark = _artwork(MARK_SOURCE)
    files: dict[Path, bytes] = {}

    _assert_background_colour_matches(android_ground)

    # --- Android launcher icons ---------------------------------------------
    #
    # Three shapes, three treatments, and the difference between them is what a
    # launcher does to the file it is given.
    #
    # `ic_launcher.png` is drawn as delivered: the artwork is composed on its
    # own ground, edge to edge, and a launcher that wants rounded corners rounds
    # them itself. Insetting it on a second ground - which is what this script
    # did while the source was a transparent mark - would put a cream border
    # round a cream tile and shrink the character for no reason.
    #
    # `ic_launcher_round.png` is the same picture with the ink moved inside a
    # full circle, because a launcher that asks for the round variant is going
    # to cut a circle out of it, and this artwork runs to all four edges: the
    # arms and the bottom of the character are the first things to go.
    #
    # The adaptive pair is the API-26-and-up path and has the tightest crop of
    # the three - 66 of 108 dp guaranteed - so it gets the smallest ink and a
    # flat background in the artwork's own colour.
    for density, size in ANDROID_DENSITIES.items():
        files[ANDROID_RES / f"mipmap-{density}" / "ic_launcher.png"] = _png(
            _full_bleed(android_art, size)
        )
        round_icon = _centred(android_ink, (size, size), ROUND_ICON_FRACTION, android_ground)
        _assert_inside_safe_zone(
            _centred(android_ink, (size, size), ROUND_ICON_FRACTION, None),
            1.0,
            "round launcher icon",
        )
        files[ANDROID_RES / f"mipmap-{density}" / "ic_launcher_round.png"] = _png(round_icon)
        # The adaptive foreground is drawn on a canvas 108/48 the nominal size,
        # transparent, with the artwork inside the safe zone.
        canvas = round(size * 108 / 48)
        foreground = _centred(android_ink, (canvas, canvas), ANDROID_ADAPTIVE_FRACTION, None)
        _assert_inside_safe_zone(foreground, 66 / 108, "adaptive icon foreground")
        files[ANDROID_RES / f"mipmap-{density}" / "ic_launcher_foreground.png"] = _png(
            foreground
        )
        # The themed-icon layer shares the foreground's geometry exactly: the
        # launcher swaps one drawable for the other and any difference in size
        # would show as the icon jumping when themed icons are turned on.
        themed = _centred(mono, (canvas, canvas), ANDROID_ADAPTIVE_FRACTION, None)
        _assert_inside_safe_zone(themed, 66 / 108, "monochrome icon layer")
        files[ANDROID_RES / f"mipmap-{density}" / "ic_launcher_monochrome.png"] = _png(themed)

    # --- Android 12+ system splash icon --------------------------------------
    #
    # Android 12 and newer always draw a system splash and an app cannot opt
    # out. Left unset, `windowSplashScreenAnimatedIcon` falls back to the
    # **launcher icon**, so a cold start read as three screens: the mandarin
    # tile, then the app's own splash with the jamo mark, then the app. Two
    # different marks in a row is what makes it read as two splashes.
    #
    # Supplying the splash's *own* mark makes the system frame the first frame
    # of the configured splash rather than a picture of the launcher. The ground
    # colour already matches, so what a learner sees is the ground, the mark,
    # then the wordmark resolving on top of it — one splash.
    #
    # Drawn on the adaptive-icon canvas because the system masks and scales this
    # the same way it does a launcher icon: 108/48 of the nominal size, artwork
    # inside the safe circle, transparent outside it.
    # A shade smaller than the launcher's fraction: the mark is wider than the
    # app icon's artwork and overflowed the safe circle by two pixels at the
    # same setting, which the assertion below caught.
    SPLASH_ICON_FRACTION = ADAPTIVE_SAFE_FRACTION * 0.94
    for density, size in ANDROID_DENSITIES.items():
        canvas = round(size * 108 / 48)
        splash_icon = _centred(mark, (canvas, canvas), SPLASH_ICON_FRACTION, None)
        _assert_inside_safe_zone(splash_icon, 66 / 108, "splash screen icon")
        files[ANDROID_RES / f"mipmap-{density}" / "splash_icon.png"] = _png(splash_icon)

    # --- Android legacy splash, localized ------------------------------------
    #
    # The pre-Android-12 path, where there is no system splash and the window
    # background *is* the splash — and the one place the full artwork can be
    # shown natively.
    #
    # Two versions, chosen by resource qualifier: Korean devices get the Korean
    # artwork, everything else the English. This used to be one wordless bitmap
    # built by painting the type out, because a single localized file would have
    # put an English wordmark in front of Korean learners. Qualifying the
    # resource solves that properly — each learner gets their own words —
    # without the reconstruction.
    #
    # The qualifier follows the *system* locale, or the per-app locale on
    # Android 13 and newer where one is set. A learner whose phone is in English
    # and who switched the app to Korean gets the English native splash and then
    # the Korean web one; that is a real gap and it is stated in the report
    # rather than papered over.
    #
    # The qualifier goes **after `drawable` and before everything else**.
    # Android fixes the order — language, then orientation, then density — and
    # `drawable-land-xhdpi-ko` is not a slightly-wrong name, it is a build
    # failure: "Invalid resource directory name".
    for locale, source in ((None, SPLASH_SOURCE), ("ko", SPLASH_KO_SOURCE)):
        art = Image.open(source).convert("RGBA")
        for directory, size in ANDROID_SPLASH.items():
            name = directory if locale is None else directory.replace(
                "drawable", f"drawable-{locale}", 1
            )
            files[ANDROID_RES / name / "splash.png"] = _png(
                _launch_bitmap(art, size, SPLASH_GROUND)
            )
    splash_art = _wordless(Image.open(SPLASH_SOURCE))

    # --- iOS -----------------------------------------------------------------
    #
    # From `app_logo_iphone.png` and from nothing else. The Android file is a
    # different drawing at a different size and this is the line that keeps the
    # two apart.
    #
    # One 1024 icon, because that is what the asset catalogue asks for: a single
    # `universal` entry at 1024x1024, which Xcode 14 and newer downsample to
    # every slot a device needs. `Contents.json` is left exactly as it is - the
    # per-idiom iPhone and iPad entries an older project would list are not in
    # it, and adding them would be editing the Xcode-managed catalogue rather
    # than replacing the image inside it.
    #
    # Full bleed, and opaque. The artwork is composed for a home screen already,
    # so insetting it on a second ground would shrink it inside iOS's own
    # rounding; and App Store Connect rejects an icon with an alpha channel,
    # which `convert("RGB")` guarantees rather than promises.
    ios_icon = _full_bleed(ios_art, 1024).convert("RGB")
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
    #
    # Built from the Android artwork, which is the drawing for every platform
    # that is not Apple's. An installed web app sitting on the same home screen
    # as the Play build with a different mandarin on it is the inconsistency
    # this avoids.
    for size in PWA_ICON_SIZES:
        files[BRAND / f"app-icon-{size}.png"] = _png(_full_bleed(android_art, size))
        maskable = _centred(android_ink, (size, size), MASKABLE_SAFE_FRACTION, android_ground)
        _assert_inside_safe_zone(
            _centred(android_ink, (size, size), MASKABLE_SAFE_FRACTION, None),
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
    share.resize(SHARE_SIZE, Image.LANCZOS).save(buffer, "PNG", optimize=True)
    files[BRAND / SHARE_OUTPUT_NAME] = buffer.getvalue()

    # --- Store artwork ---------------------------------------------------------
    # The same icon a phone shows, at the sizes the two consoles ask to upload,
    # so a submission cannot ship artwork the product stopped using.
    #
    # Google Play takes a 512 PNG and allows an alpha channel. App Store Connect
    # takes 1024 and rejects one, which is why this is the flattened copy that
    # was already built for the iOS bundle rather than a second render of it.
    files[STORE / "google-play" / "app-icon-512.png"] = _png(_full_bleed(android_art, 512))
    files[STORE / "app-store" / "app-icon-1024.png"] = buffer_png(ios_icon)

    return files


def _assert_background_colour_matches(ground: tuple[int, int, int, int]) -> None:
    """`ic_launcher_background` is the artwork's own ground, or the build stops.

    The adaptive icon is a flat colour with a keyed-out picture on top of it. If
    the colour resource and the picture's ground drift apart, the launcher draws
    the character on one cream and its shadow fading into another, and the seam
    is a faint square inside a round icon - the kind of defect that survives
    review because nobody can say what is wrong with it.
    """
    expected = "#{:02X}{:02X}{:02X}".format(*ground[:3])
    text = ANDROID_BACKGROUND_COLOR.read_text(encoding="utf-8")
    found = None
    for line in text.splitlines():
        if 'name="ic_launcher_background"' in line:
            found = line.split(">", 1)[1].split("<", 1)[0].strip().upper()
    if found is None:
        raise SystemExit(
            f"{ANDROID_BACKGROUND_COLOR.relative_to(ROOT)} no longer defines "
            "ic_launcher_background, which the adaptive icon draws behind its foreground"
        )
    if found != expected:
        raise SystemExit(
            f"ic_launcher_background is {found} but the app icon artwork is composed on "
            f"{expected}. Set the colour resource to {expected} and rebuild the icons."
        )


def buffer_png(image: Image.Image) -> bytes:
    """`_png` for an image already flattened to RGB."""
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


#: Directories whose whole PNG contents this script owns.
#:
#: A launcher icon that stops being generated does not stop being *packaged* —
#: `aapt` ships whatever is in `mipmap-*`, so a density left behind after a
#: rename is an old mandarin shipped at one screen size and the new one at every
#: other. The asset catalogue is the same story with the store's copy of the
#: icon. Listing the directories rather than the files means a new one appearing
#: is caught too.
OWNED_ICON_DIRS = [
    *(ANDROID_RES / f"mipmap-{density}" for density in ANDROID_DENSITIES),
    IOS_ASSETS / "AppIcon.appiconset",
]


def _obsolete(files: dict[Path, bytes]) -> list[Path]:
    """PNGs sitting in an owned directory that this run did not produce."""
    generated = set(files)
    found: list[Path] = []
    for directory in OWNED_ICON_DIRS:
        if not directory.is_dir():
            continue
        for path in directory.iterdir():
            if path.suffix.lower() == ".png" and path not in generated:
                found.append(path)
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the committed icons match the source artwork; write nothing",
    )
    args = parser.parse_args()

    for source in (ANDROID_APP_ICON_SOURCE, IOS_APP_ICON_SOURCE, MARK_SOURCE, SPLASH_SOURCE):
        if not source.exists():
            print(f"source artwork missing: {source}", file=sys.stderr)
            return 1

    files = build()

    if args.check:
        missing = [path for path in files if not path.exists()]
        stale = [
            path for path, data in files.items()
            if path.exists() and path.read_bytes() != data
        ]
        obsolete = _obsolete(files)
        if missing or stale or obsolete:
            if missing:
                print("required icon resources are missing:", file=sys.stderr)
                for path in sorted(missing):
                    print(f"  {path.relative_to(ROOT)}", file=sys.stderr)
            if stale:
                print("app icons are out of date with the source artwork:", file=sys.stderr)
                for path in sorted(stale):
                    print(f"  {path.relative_to(ROOT)}", file=sys.stderr)
            if obsolete:
                print("icon resources nothing generates any more:", file=sys.stderr)
                for path in sorted(obsolete):
                    print(f"  {path.relative_to(ROOT)}", file=sys.stderr)
            print("\nrun: npm run mobile:icons", file=sys.stderr)
            return 1
        print(
            f"app icons up to date ({len(files)} files) — Android from "
            f"{ANDROID_APP_ICON_SOURCE.name}, iOS from {IOS_APP_ICON_SOURCE.name}"
        )
        return 0

    for path, data in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    print(
        f"wrote {len(files)} icon, splash and favicon files from "
        f"{ANDROID_APP_ICON_SOURCE.name} (Android, web), {IOS_APP_ICON_SOURCE.name} (iOS), "
        f"{MARK_SOURCE.name} and {SPLASH_SOURCE.name}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
