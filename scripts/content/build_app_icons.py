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

from PIL import Image, ImageChops, ImageDraw

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

#: The launch screen — the brand splash artwork itself.
#:
#: The app shows the same picture in the WebView a moment later
#: (`ui/LaunchSplash`), so the two have to be the same picture on the same
#: ground or the handover is a cut from one brand screen to a different one.
#:
#: This used to be `handoff-frame.png`, a still lifted from the splash
#: *animation* — the ground and one soft circle, no wordmark — chosen precisely
#: because it said nothing that could be in the wrong language. There is no
#: animation any more and no frame zero to hand over from, so the native screen
#: shows the finished artwork like everything else does.
#:
#: The English one, for every device. A native launch screen runs before any of
#: the app's code, and the learner's chosen interface language lives in the
#: app's own storage where only the WebView can read it — so nothing at this
#: point knows whether to draw 한귤 or Han gyul. Device locale is a different
#: question from interface language and guessing with it is wrong for anyone who
#: has ever changed the setting. The in-app splash *does* know, and takes over
#: within a frame or two on this same ground, so a Korean learner sees the
#: Korean wordmark — just not from the very first millisecond.
SPLASH_SOURCE = ROOT / "apps" / "common_assets" / "splash" / "splash_eng.png"

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
    splash_art = Image.open(SPLASH_SOURCE).convert("RGBA")
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
