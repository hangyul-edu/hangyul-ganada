#!/usr/bin/env python3
"""Does a cold start show the approved splash and nothing else?

    python3 scripts/check-native-splash.py            the source resources and the iOS catalogue
    python3 scripts/check-native-splash.py --apk      the same, plus what the delivered APK packages
    python3 scripts/check-native-splash.py --check    exit non-zero on a finding

## The defect this exists for

A customer photographed the Android launch: an orange logo the app draws
nowhere else, then the *Han gyul* splash, then the app. The orange was
`mipmap/splash_icon`, built from `brand/logo-symbol.png` and handed to Android
12's system splash as `windowSplashScreenAnimatedIcon`. The approved splash
artwork carries no mark — it is a wordmark on a soft wash — so any mark in the
system frame is a second picture in front of the first.

The icon is now cut from the artwork itself (see
`scripts/content/build_app_icons.py`, `SPLASH_CENTRE_FRACTION`). This proves
that stays true, in every place a launch frame comes from:

1. **The Android theme** hands the system the artwork's ground colour and the
   generated icon, animates nothing, and gives pre-12 devices the artwork.
2. **Every density of `splash_icon.png`** is wordless and mark-free: no pixel
   is saturated or dark, its opaque centre is the artwork's own centre colour,
   and its edge is feathered to transparent. The brand mark is orange and
   cannot pass this.
3. **Nothing in the Android sources references the brand mark**, no launcher
   icon is used as a splash, and no second splash resource is packaged.
4. **The ground colour agrees** between `colors.xml`, `capacitor.config.ts`
   and the iOS storyboard.
5. **iOS** launches on the wordless artwork: the storyboard shows the `Splash`
   image set aspect-filled, every file in it is free of type, and every file
   is listed.
6. **The delivered APK** (with `--apk`) packages exactly one splash icon per
   density, each wordless, and no brand mark under any resource name.

Wordless is the property, not "matches a golden file": the artwork will be
redrawn some day, and the rule that must survive that is *the system frame says
nothing and shows no mark*.
"""

from __future__ import annotations

import io
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path

import numpy
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "apps" / "mobile" / "android" / "app" / "src" / "main" / "res"
MAIN = ROOT / "apps" / "mobile" / "android" / "app" / "src" / "main"
IOS = ROOT / "apps" / "mobile" / "ios" / "App" / "App"
APK = ROOT / "result" / "hangyul-ganada-release.apk"
DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]

CHECK = "--check" in sys.argv
WITH_APK = "--apk" in sys.argv

findings: list[str] = []


def fail(what: str) -> None:
    findings.append(what)


def ok(what: str) -> None:
    print(f"  ok   {what}")


def ink_in(image: Image.Image) -> tuple[int, int, int]:
    """(saturated, dark, visible) pixel counts. Type and marks are one of the first two."""
    px = numpy.asarray(image.convert("RGBA"), dtype=numpy.int32)
    visible = px[:, :, 3] > 32
    rgb = px[:, :, :3][visible]
    if rgb.size == 0:
        return 0, 0, 0
    spread = rgb.max(axis=1) - rgb.min(axis=1)
    return int((spread > 110).sum()), int((rgb.min(axis=1) < 150).sum()), int(visible.sum())


def type_in_band(image: Image.Image) -> tuple[int, int]:
    """(wordmark, tagline) pixels in the artwork's text band — see `_wordless`."""
    px = numpy.asarray(image.convert("RGB"), dtype=numpy.int32)
    h = px.shape[0]
    band = px[int(h * 0.40) : int(h * 0.66), :, :]
    r, g, b = band[:, :, 0], band[:, :, 1], band[:, :, 2]
    wordmark = (r > 200) & (g < 140) & (b < 90)
    tagline = (r < 120) & (g < 120) & (b < 120)
    return int(wordmark.sum()), int(tagline.sum())


def is_artwork_centre(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    return r >= 250 and 195 <= g <= 225 and 160 <= b <= 190


def check_icon(image: Image.Image, label: str) -> None:
    saturated, dark, visible = ink_in(image)
    if visible == 0:
        fail(f"{label} is fully transparent")
        return
    if saturated or dark:
        fail(f"{label} carries ink ({saturated} saturated, {dark} dark pixels) — a mark or a word is in the system splash")
    rgba = image.convert("RGBA")
    r, g, b, a = rgba.getpixel((rgba.width // 2, rgba.height // 2))
    if a < 250:
        fail(f"{label}: the centre is not opaque")
    if not is_artwork_centre((r, g, b)):
        fail(f"{label}: the centre colour is rgb({r},{g},{b}), not the artwork's centre wash")
    if rgba.getpixel((0, 0))[3] != 0:
        fail(f"{label}: the corner is not transparent — the feather does not reach the edge")


# --- 1. the theme -------------------------------------------------------------
styles = (RES / "values" / "styles.xml").read_text(encoding="utf-8")
launch = re.search(r'<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?</style>', styles)
launch_text = launch.group(0) if launch else ""


def item(name: str) -> str | None:
    found = re.search(rf'<item name="{re.escape(name)}">([^<]+)</item>', launch_text)
    return found.group(1).strip() if found else None


before = len(findings)
if not launch:
    fail("styles.xml: AppTheme.NoActionBarLaunch is missing")
if item("windowSplashScreenBackground") != "@color/splashBackground":
    fail(f"styles.xml: windowSplashScreenBackground is {item('windowSplashScreenBackground')}, not @color/splashBackground")
if item("windowSplashScreenAnimatedIcon") != "@mipmap/splash_icon":
    fail(f"styles.xml: windowSplashScreenAnimatedIcon is {item('windowSplashScreenAnimatedIcon')}, not the generated @mipmap/splash_icon")
if item("windowSplashScreenAnimationDuration") != "0":
    fail("styles.xml: the system splash icon is animated; a duration only holds the app behind a still frame")
if item("android:windowBackground") != "@drawable/splash":
    fail("styles.xml: pre-Android-12 windowBackground is not the splash artwork")
if "windowSplashScreenIconBackgroundColor" in launch_text:
    fail("styles.xml: an icon background colour would draw a disc behind the cut and break the wash")
if len(findings) == before:
    ok("AppTheme.NoActionBarLaunch: artwork ground, generated icon, no animation, artwork on pre-12")

# --- 4. the ground colour, three places ---------------------------------------
before = len(findings)
colours = (RES / "values" / "colors.xml").read_text(encoding="utf-8")
found = re.search(r'<color name="splashBackground">(#[0-9A-Fa-f]{6})</color>', colours)
splash_background = found.group(1).upper() if found else None
capacitor = (ROOT / "apps" / "mobile" / "capacitor.config.ts").read_text(encoding="utf-8")
found = re.search(r"SplashScreen:\s*\{[\s\S]*?backgroundColor:\s*'(#[0-9A-Fa-f]{6})'", capacitor)
capacitor_ground = found.group(1).upper() if found else None
if not splash_background:
    fail("colors.xml: no splashBackground")
if not capacitor_ground:
    fail("capacitor.config.ts: no SplashScreen.backgroundColor")
if splash_background and capacitor_ground and splash_background != capacitor_ground:
    fail(f"ground colour disagrees: colors.xml {splash_background}, capacitor.config.ts {capacitor_ground}")
ground = tuple(int(splash_background[i : i + 2], 16) for i in (1, 3, 5)) if splash_background else None
if len(findings) == before:
    ok(f"ground colour {splash_background} agrees between colors.xml and capacitor.config.ts")

# --- 2. the icon, every density -----------------------------------------------
before = len(findings)
for density in DENSITIES:
    path = RES / f"mipmap-{density}" / "splash_icon.png"
    if not path.exists():
        fail(f"mipmap-{density}/splash_icon.png is missing")
        continue
    check_icon(Image.open(path), f"mipmap-{density}/splash_icon.png")
if len(findings) == before:
    ok(f"splash_icon.png at {len(DENSITIES)} densities: wordless, mark-free, artwork centre, feathered to transparent")

# --- 3. nothing else is a splash ----------------------------------------------
before = len(findings)
for path in MAIN.rglob("*"):
    if path.suffix not in {".xml", ".java", ".kt"}:
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    # Comments may *discuss* the mark — the theme's does — but no attribute may name it.
    text = re.sub(r"<!--[\s\S]*?-->|/\*[\s\S]*?\*/|//[^\n]*", "", text)
    if re.search(r"logo[-_]symbol|brand_mark", text):
        fail(f"{path.relative_to(ROOT)} references the brand mark")
    if re.search(r'windowSplashScreenAnimatedIcon">@mipmap/ic_launcher', text):
        fail(f"{path.relative_to(ROOT)} uses the launcher icon as the system splash icon")
for density in DENSITIES:
    for name in os.listdir(RES / f"mipmap-{density}"):
        if "splash" in name.lower() and name != "splash_icon.png":
            fail(f"mipmap-{density}/{name}: a second splash resource that nothing generates")
for directory in sorted(RES.iterdir()):
    if directory.name.startswith("drawable"):
        for name in os.listdir(directory):
            if name != "splash.png":
                fail(f"{directory.name}/{name}: not a launch bitmap this build generates")
if len(findings) == before:
    ok("no other resource is used as a launch frame; the brand mark is referenced nowhere in the Android sources")

# --- 5. iOS -------------------------------------------------------------------
before = len(findings)
storyboard = (IOS / "Base.lproj" / "LaunchScreen.storyboard").read_text(encoding="utf-8")
if 'image="Splash"' not in storyboard:
    fail("LaunchScreen.storyboard does not show the Splash image set")
if 'contentMode="scaleAspectFill"' not in storyboard:
    fail("LaunchScreen.storyboard: the splash is not aspect-filled")
colour = re.search(r'backgroundColor" red="([0-9.]+)" green="([0-9.]+)" blue="([0-9.]+)"', storyboard)
if colour and ground:
    rgb = [round(float(v) * 255) for v in colour.groups()]
    if any(abs(v - g) > 1 for v, g in zip(rgb, ground)):
        fail(f"LaunchScreen.storyboard background is rgb({rgb}) but the splash ground is rgb({list(ground)})")
imageset = IOS / "Assets.xcassets" / "Splash.imageset"
contents = json.loads((imageset / "Contents.json").read_text(encoding="utf-8"))
listed = {image["filename"] for image in contents["images"]}
for name in sorted(os.listdir(imageset)):
    if name == "Contents.json":
        continue
    if name not in listed:
        fail(f"Splash.imageset/{name} is packaged but not listed in Contents.json")
    image = Image.open(imageset / name)
    wordmark, tagline = type_in_band(image)
    if wordmark or tagline:
        fail(f"Splash.imageset/{name} carries type in its middle band ({wordmark} wordmark, {tagline} tagline pixels)")
    if ink_in(image)[2] == 0:
        fail(f"Splash.imageset/{name} is empty")
for missing in listed - set(os.listdir(imageset)):
    fail(f"Splash.imageset/{missing} is listed but missing")
for name in os.listdir(IOS / "Assets.xcassets" / "AppIcon.appiconset"):
    if re.search(r"splash|launch", name, re.I):
        fail(f"AppIcon.appiconset/{name}: a launch image in the icon set")
if len(findings) == before:
    ok("iOS: LaunchScreen shows the wordless Splash image set on the same ground; nothing else launches")

# --- 6. the delivered APK -----------------------------------------------------
def find_aapt2() -> Path | None:
    home = Path(os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or "/root/android-sdk")
    tools = home / "build-tools"
    if not tools.is_dir():
        return None
    for version in sorted(os.listdir(tools), reverse=True):
        candidate = tools / version / "aapt2"
        if candidate.exists():
            return candidate
    return None


if WITH_APK:
    before = len(findings)
    if not APK.exists():
        fail(f"{APK.relative_to(ROOT)} is not there to inspect")
    else:
        aapt2 = find_aapt2()
        if aapt2 is None:
            fail("aapt2 not found under ANDROID_HOME/build-tools; cannot read the packaged resources")
        else:
            table = subprocess.run(
                [str(aapt2), "dump", "resources", str(APK)], capture_output=True, text=True, check=True
            ).stdout
            entry = re.search(r"resource 0x[0-9a-f]+ mipmap/splash_icon\n((?:      .*\n)+)", table)
            if not entry:
                fail("the APK packages no mipmap/splash_icon")
            else:
                paths = re.findall(r"\(file\) (res/\S+)", entry.group(1))
                if len(paths) != len(DENSITIES):
                    fail(f"the APK packages {len(paths)} splash_icon files, expected {len(DENSITIES)}")
                with zipfile.ZipFile(APK) as apk:
                    for packaged in paths:
                        image = Image.open(io.BytesIO(apk.read(packaged)))
                        check_icon(image, f"packaged {packaged}")
            for kind, name in re.findall(r"resource 0x[0-9a-f]+ (mipmap|drawable)/(\S*(?:logo|symbol|brand)\S*)", table):
                fail(f"the APK packages {kind}/{name}")
            if "windowSplashScreenAnimatedIcon" not in table:
                fail("the APK resource table has no windowSplashScreenAnimatedIcon attribute")
            theme = re.search(r"resource 0x[0-9a-f]+ style/AppTheme\.NoActionBarLaunch\n((?:      .*\n)+)", table)
            if theme and "mipmap/splash_icon" not in theme.group(1) and "0x7f" not in theme.group(1):
                fail("the packaged launch theme does not reference the splash icon")
            if len(findings) == before:
                ok(f"APK: {len(DENSITIES)} packaged splash icons, each wordless and mark-free; no brand mark packaged")

print("\nLaunch screen — the approved splash and nothing else")
if not findings:
    print("\n  every launch frame comes from the approved artwork; no mark, no words, one ground.")
else:
    print(f"\n{len(findings)} finding(s):")
    for f in findings:
        print(f"  ! {f}")
if CHECK and findings:
    raise SystemExit(1)
