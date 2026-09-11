#!/usr/bin/env bash
# Records a cold start of the installed app on the running emulator and
# extracts the frames, so the launch sequence can be *looked at* rather than
# reasoned about. See docs/report.md §20Z.2.
#
#   scripts/qa-cold-start-android.sh <apk> <out-dir> [warm|clean|upgrade]
#
# clean    uninstall first, then install (a first install)
# upgrade  install over whatever is there (-r), keeping data
# warm     do not (re)install; force-stop and start again
set -euo pipefail
APK="$1"; OUT="$2"; MODE="${3:-upgrade}"
ADB="${ANDROID_HOME:-/root/android-sdk}/platform-tools/adb"
PKG=com.talkhangyul.ganada
mkdir -p "$OUT"
case "$MODE" in
  clean) "$ADB" uninstall "$PKG" >/dev/null 2>&1 || true; "$ADB" install "$APK" >/dev/null ;;
  upgrade) "$ADB" install -r "$APK" >/dev/null ;;
  warm) ;;
esac
"$ADB" shell am force-stop "$PKG"
sleep 1
"$ADB" shell "screenrecord --time-limit 8 --bit-rate 6000000 /sdcard/coldstart-$MODE.mp4" &
REC=$!
sleep 1.2
"$ADB" shell am start -W -n "$PKG/.MainActivity" > "$OUT/am-start-$MODE.txt"
wait $REC || true
"$ADB" pull "/sdcard/coldstart-$MODE.mp4" "$OUT/coldstart-$MODE.mp4" >/dev/null
# One frame every 100 ms for the first 6 s.
ffmpeg -loglevel error -y -i "$OUT/coldstart-$MODE.mp4" -vf "fps=10,scale=270:-1" "$OUT/frame-$MODE-%03d.png"
ls "$OUT" | grep -c "frame-$MODE-" | sed "s/^/frames: /"
