# Age rating — the answers for App Store Connect

App Store Connect › App Information › Age Rating.

## Expected outcome

**4+**, and there is nothing in the questionnaire that moves it.

## The questionnaire

Every item is *None*:

| | |
| --- | --- |
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Prolonged graphic or sadistic realistic violence | None |
| Profanity or crude humour | None |
| Mature/suggestive themes | None |
| Horror/fear themes | None |
| Medical/treatment information | None |
| Alcohol, tobacco, or drug use or references | None |
| Simulated gambling | None |
| Sexual content or nudity | None |
| Graphic sexual content and nudity | None |
| Contests | None |

| Additional question | Answer |
| --- | --- |
| Unrestricted web access | **No.** The app has no browser, no in-app web view of remote content, and makes no network request at runtime. |
| Gambling and contests | No |
| Made for Kids | **No.** Usable by a child, not designed for one — see `../google-play/target-audience.md` for the same reasoning in Play's terms. |

## Content that could be questioned, and why it is not a rating issue

The vocabulary is a 2,581-word beginner corpus built from the sources in
`content/vocabulary/METHODOLOGY.md`, hand-reviewed word by word, with 328
candidates removed and each removal carrying its reason in the pack. Words
whose register is wrong for a beginner product were among the categories cut.

The example sentences are all checked against the rules in
`scripts/content/examples_qa.py`, which include a register rule: no news
headlines, no legal or academic Korean, and nothing outside ordinary daily
situations.
