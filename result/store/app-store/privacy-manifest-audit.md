# Privacy manifest audit — iOS

Apple rejects at upload any app that uses a *required reason* API without
declaring it, and the requirement extends to every third-party SDK in the
binary. This is the audit behind `apps/mobile/ios/App/App/PrivacyInfo.xcprivacy`.

## Method

Every Swift and Objective-C source in the app target and in each Capacitor
plugin was read for the five API families Apple lists. Reading the sources
rather than trusting a plugin's own manifest matters: a plugin that ships no
`PrivacyInfo.xcprivacy` has not thereby avoided the requirement, it has left it
to the app.

```bash
# What was actually grepped, across the app target and every plugin's ios/ dir:
UserDefaults|NSUserDefaults          # CA92.1 …
stat|modificationTime|creationDate   # C617.1 …
volumeAvailableCapacity|systemFreeSize
UIApplication.*activeInputModes
systemUptime|mach_absolute_time
```

## What is in the binary

| Component | Required-reason API | Declared |
| --- | --- | --- |
| App target (`HangyulStorePlugin.swift`, `HangyulViewController.swift`, `AppDelegate.swift`) | none. SQLite3 and `AVAudioSession` are not on Apple's list | — |
| `@capacitor/core` | none | — |
| `@capacitor/app` | none | — |
| `@capacitor/haptics` | none | — |
| `@capacitor/keyboard` | none | — |
| `@capacitor/splash-screen` | none | — |
| `@capacitor/local-notifications` | none. `UNUserNotificationCenter` is permission-gated, not reason-gated | — |

## There are no declarations, and there used to be one

`NSPrivacyAccessedAPITypes` is now an empty array.

It carried `NSPrivacyAccessedAPICategoryFileTimestamp` with reason `C617.1` —
*"Accessing file timestamps for files inside the app container"* — because
`@capacitor/filesystem` calls `stat` and reads `modificationTime`. The single
path that reached it was the JSON backup export, which wrote into this app's own
cache directory before handing the file to the share sheet.

That feature was removed from the product, and `@capacitor/filesystem` and
`@capacitor/share` were removed with it: they were in the dependency list for
that one feature and nothing else. The table above is the audit re-run against
the remaining five plugins, and it finds no required-reason API in the binary.
The declaration was therefore removed rather than left in place. An
over-declaration is not a safe default — it is a claim about the binary that
does not hold, and the next person to audit this has to disprove it.

## What is deliberately not declared

* **`CA92.1` (`UserDefaults`).** `@capacitor/preferences` was removed from this
  project during the native cycle, specifically so this declaration would not be
  needed: the learner's data belongs in the app's own SQLite store, and a second
  storage mechanism is a second thing to keep in step. Capacitor's core reads no
  `UserDefaults` in this configuration.
* **Disk space, active keyboard, system boot time.** Nothing in the binary
  touches them.

## Tracking

`NSPrivacyTracking` is `false` and `NSPrivacyTrackingDomains` is empty. Not "no
tracking domains among the ones we contact" — the app contacts no domain at all
at runtime.

## When this has to be redone

Any time a dependency is added or upgraded. The manifest is a claim about the
whole binary, and a plugin added six months from now that reads `UserDefaults`
makes this file wrong without changing a line of it.
