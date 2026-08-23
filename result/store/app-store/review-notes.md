# Notes for App Review

Pasted into App Store Connect › the version's *Notes* field.

---

**Sign-in:** none required. There is no account system in this app — no sign-up,
no sign-in, no server. Every screen is reachable from a fresh install, so there
is no demo account to provide.

**Offline:** the app performs no network request at runtime. Every lesson,
recording and typeface is inside the binary. Reviewing it in Airplane Mode is a
fair test and the correct result is that nothing changes.

**What it does, in five minutes:** open it, tap the button on the home screen,
and follow it. Within three screens you will hear a Korean letter, watch it drawn
stroke by stroke, and trace it on the canvas with a finger. The app compares what
you drew against the outline of that letter and tells you what to change. That
comparison runs on the device.

**Guideline 4.2 (minimum functionality).** This is not a website in a container.
The app is fully bundled and has no server to point at; handwriting capture and
evaluation are on-device; the learner's record is in an app-private SQLite
database written by a plugin in this project; the audio is 5,275 packaged
utterances; and the app uses the platform directly for its splash screen, safe
areas, haptics, audio session, share sheet and (optionally) local notifications.
A fuller answer is in `docs/report.md` § *Native applications*.

**Permissions.** One, and only on request: Settings contains an optional daily
study reminder, off by default. Switching it on and choosing a time is the only
action in the app that produces a system permission prompt. Nothing else asks for
anything, and there are no usage-description strings in `Info.plist` because
there is nothing to describe.

**Encryption.** `ITSAppUsesNonExemptEncryption` is false. The app contains no
cryptography and makes no TLS connection.

**Content.** 2,844 beginner Korean words, hand-reviewed, with sources recorded in
`content/vocabulary/METHODOLOGY.md`. Every example sentence passes an automated
teaching-quality gate before it can ship (`npm run examples:qa`).

**What it is not:** not a TOPIK preparation course, not a chatbot, not a
subscription, not a social app. It is bought once.
