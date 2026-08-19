# Ads — the answers for Play Console

Play Console › App content › Ads.

## The answer

**"No, my app does not contain ads."**

## What that covers

Play's question is broader than banner ads, and the answer is no to all of it:

| | |
| --- | --- |
| Banner, interstitial, native or rewarded ads | none |
| An ads SDK of any kind | none — see the dependency audit in `RELEASE_VALIDATION.md` |
| Advertising ID (`AAID`) | not requested, not read, not linked. `com.google.android.gms.permission.AD_ID` is **not** in the manifest |
| Cross-promotion of other apps | none. The app mentions no other product and links to no store page |
| Sponsored or paid content inside the learning material | none. The corpus is built from the sources named in `content/vocabulary/METHODOLOGY.md` |
| Affiliate links | none. The app makes no outbound link at runtime |

## The one thing that could be mistaken for it

The app belongs to a product family called Hangyul, and says so in its own name.
There is no banner, card, link or upsell for any other Hangyul product anywhere
in the interface. The reasoning is written down in `apps/web/src/config/product.ts`:
this is a paid app that has already been bought, and advertising a different
product's subscription to the person who just bought this one is an advert, not
a feature.

## Consequence for the data declaration

Because there is no advertising ID and no ads SDK, the Data safety form declares
**no** data collected or shared for advertising or marketing, and the app is not
subject to the Families ads policy on that count. See `data-safety.md`.
