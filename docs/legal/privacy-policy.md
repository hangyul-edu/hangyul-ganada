# Privacy policy

**Hangyul ganada** · version 1.0.3 · last updated 18 August 2026

## The short version

Hangyul ganada does not collect anything about you.

There is no account, no sign-in, no analytics, no advertising and no server. The
app makes no network request while you use it. Everything you practise is stored
on your own device and stays there.

If that is all you needed, you can stop reading. The rest of this page says the
same thing in the detail a regulator, a store reviewer or a careful reader would
want.

---

## What is stored, and where

All of it is on your device, in storage that belongs to this app alone. On
Android and iOS that is a SQLite database inside the app's own container; in a
web browser it is IndexedDB.

| What | Why it exists |
| --- | --- |
| Which letters and words you have learned, and how far through each you are | so the app can show you your progress and pick what to teach next |
| How well you remember each one — per skill: meaning, reading, listening, writing | so review brings back the thing you are actually weakest at |
| Which wrong answers you chose | so the app can notice that you mix up two particular letters and give you the two side by side |
| A short history of recent exercises | so the weekly summary can be true rather than generic |
| One roll-up row per day you practised | the calendar and the streak on the Learning activity screen |
| Your settings — language, voice, typeface, daily goal, appearance | so the app is the way you left it |
| Words you saved | so you can study them again |
| An install identifier | a random string, generated on this device, used to stamp the stored record. It is not linked to you, it is not sent anywhere, and resetting your progress replaces it |

**Nothing in that list leaves your device**, and nothing in it is a name, an
email address, a phone number, a location or a contact — the app never asks for
any of those.

## What the app does not do

* It does not create an account and has nothing to log in to.
* It does not contain analytics, crash reporting, attribution or advertising
  software of any kind.
* It does not read an advertising identifier. On Android the `AD_ID` permission
  is not declared.
* It does not track you across other apps or websites. On iOS the app requests
  no tracking authorisation because it has nothing to track with.
* It does not request access to your camera, microphone, photos, contacts,
  calendar, location, phone, or messages.
* It does not upload your handwriting. What you draw is compared with the shape
  of the letter on the device, scored, and discarded.

## Permissions

**The app never asks you for a permission.** There is no prompt to accept and
none to decline, on any screen, at any point.

Two are granted by Android at install, without asking, because they cannot be
used to learn anything about you:

| Permission | Why the package declares it |
| --- | --- |
| Internet (Android) | The app's own screens are served to the system web view over an internal address. No remote server is contacted. |
| Vibration (Android) | The small tap you feel when a letter is accepted. |

That is the whole list; `aapt2 dump permissions` on the shipped package prints
those two and nothing else. The notification permission was here until this
release, for an optional daily reminder. **The reminder has been removed** —
not hidden, removed: the feature, its stored time, its Android permissions and
its Android receivers are all gone. An alarm set by an earlier version is
delivered to a receiver this package no longer contains, so it is dropped by
Android rather than shown.

## Your copy of your data

* **Delete.** My Learning → Reset → *Reset learning progress* removes everything
  the app has stored on the device. It takes effect immediately and there is
  nothing to request from anyone, because there is no copy anywhere else.
* **Uninstalling** the app also removes it.

Version 1.0.0 removed the export and import of a backup file. It wrote your
record to a JSON file which you then had to keep somewhere and restore by hand,
which is not something a person buying a Korean course should have to
understand, and it is not currently replaced by anything: there is no cloud
copy, and moving to a new device starts the record again.

## Children

The app is suitable for any age and is not directed at children. Because it
collects nothing at all, it collects nothing from children either — so COPPA,
the UK Age Appropriate Design Code and the GDPR's provisions on children's data
have no data to apply to.

## Your rights under the GDPR, UK GDPR, CCPA and similar laws

These laws give you rights of access, correction, deletion, portability and
objection over personal data a company holds about you.

We hold none. There is no database with your name in it, because there is no
database. The practical equivalents are on your own device and under your own
control: *Reset learning progress* is deletion, and access is the app itself.
Portability has nothing to port — there is no copy held by anyone to hand over.

## Payment

The app is bought once, through Google Play or the App Store. Those transactions
are handled entirely by Apple and Google under their own privacy policies; the
app never sees your payment details and receives no information about you from
either store.

## Changes

If a future version of the app ever collects anything, this page will say so
before that version ships, and the change will be listed in the release notes.

## Contact

See the support page.
