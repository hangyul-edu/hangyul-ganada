# Export compliance — the answers for App Store Connect

## The declaration

`ITSAppUsesNonExemptEncryption` = **`false`**, set in `Info.plist` so the
question is answered once at build time rather than re-answered by hand on every
upload. With it present and false, App Store Connect does not ask again and no
CCATS or self-classification report is required.

## Why that is the correct answer

The app uses no encryption of its own. Specifically:

| | |
| --- | --- |
| Custom or proprietary cryptography | None |
| An encryption library bundled with the app | None. The dependency list is in `RELEASE_VALIDATION.md`; there is no crypto library in it |
| HTTPS to a remote server | None — the app makes no network request at runtime. The `https://localhost` origin the WebView serves the bundle from is a local scheme handled inside the app process, not a TLS connection to anything |
| Encrypted local storage | None. The learner's progress is in a plain SQLite file in the app container, protected by iOS file protection, which is the operating system's encryption and is explicitly exempt |
| Authentication or key exchange | None. There is no account |

`crypto.randomUUID()` is called to generate an install id and session ids. That
is a random number generator, not encryption, and does not affect the answer.

## The one exemption relied on

None. The answer is "does not use encryption", not "uses exempt encryption", so
no exemption category is claimed.

## France declaration

Not applicable: with `ITSAppUsesNonExemptEncryption` false, the French
encryption declaration question is not asked.
