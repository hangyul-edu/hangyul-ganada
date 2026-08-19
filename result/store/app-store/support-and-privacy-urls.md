# Support URL, marketing URL, privacy policy URL

App Store Connect requires a **support URL** and a **privacy policy URL** before
an app can be submitted. Google Play requires an email address and, once the
Data safety form declares anything, a privacy policy URL.

## Status: not set, and deliberately so

| Field | Required by | Status |
| --- | --- | --- |
| Privacy policy URL | App Store, Play | **EXTERNAL HOSTING REQUIRED** |
| Support URL | App Store | **EXTERNAL HOSTING REQUIRED** |
| Support email | Play | **CONFIGURATION REQUIRED** |
| Marketing URL | optional | not provided |

Nothing here is a guess. No domain has been registered for this product, so any
URL written into this file would be a URL that returns nothing — and a privacy
policy link that 404s is worse for a customer than one that is missing, because
the missing one cannot be submitted by accident.

## What exists, ready to host

The pages themselves are written and are in this repository. Hosting them is a
transcription step, not an authoring one:

| Page | File | Goes at |
| --- | --- | --- |
| Privacy policy | `docs/legal/privacy-policy.md` | `https://<domain>/privacy` |
| Support | `docs/legal/support.md` | `https://<domain>/support` |
| Content sources and licences | `docs/legal/licences.md` | `https://<domain>/licences` |

All three are also **in the app**, under My Learning → Legal & Licences, and are
readable with the device offline. The hosted copies exist because the stores
require a URL, not because the app depends on them.

## The support email

The app's "Report a problem" action opens a mail draft to the address in
`VITE_SUPPORT_EMAIL`. That variable is unset in this repository, and where it is
unset **the action is not rendered at all** — see `apps/web/src/config/product.ts`.
Setting it is a one-line build configuration change; inventing the address is
not something a build can do.

## Before submission

1. Register a domain and publish the three pages above.
2. Set `VITE_SUPPORT_EMAIL` and rebuild, so "Report a problem" appears.
3. Put the privacy URL in both consoles and the support URL in App Store Connect.
4. Re-run `npm run verify` and rebuild the release artefacts, because step 2
   changes the bundle.
