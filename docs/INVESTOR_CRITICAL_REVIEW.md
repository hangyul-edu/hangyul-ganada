# Investor critical review — Hangyul ganada

**Written from the repository, and only from the repository.** Every number here
was recomputed on the tree this document ships with, and the command that
produced it is named. Where an investor would expect a number and there is none,
the row says *none exists* rather than an estimate.

This document is deliberately adversarial about its own product. A review that
lists strengths is a pitch; the useful document is the one that says what would
have to be true for the product to fail, and then says which of those things are
already true.

---

## 0. Four things this review will not do

**It will not report revenue, users, retention or conversion.** The application
is standalone, paid and wholly offline: it opens no network connection at
runtime, holds no account and reports no telemetry. There is therefore no usage
data of any kind, and none can be produced from this repository. Neither store
listing exists yet — `apps/mobile/app.identity.json` records
`registered.googlePlay: false` and `registered.appStoreConnect: false` — so
there is also no pre-launch waitlist, no beta cohort and no download history.

**It will not report a learning outcome.** No study has been run. No learner has
been measured before and after. The product's own tests measure whether the
software does what it was built to do, which is a different claim and is not
evidence of pedagogical effect.

**It will not describe the content as reviewed by a speaker.** Thirty-two
interface languages ship and not one has been read by a native speaker,
including Korean. `docs/LOCALIZATION_NATIVE_REVIEW.md` and issue I-17 say so in
the same words.

**It will not present the patent package as an asset with a value.** A technical
disclosure has been prepared for counsel. Nothing has been filed, nothing has
been examined, and no opinion on novelty, inventive step or freedom to operate
exists. `patent/README.md` is explicit that the package is not committed to the
public remote precisely because a publication before filing cannot be undone.

---

## 1. What exists, and how to check it

| Asset | Figure | Where it comes from |
|:---|---:|:---|
| Taught vocabulary | **3,393 words** | `npm run vocabulary:qa` |
| Interface languages | **32** | `npm run locale:content:check` — 32 complete, 0 partial |
| Meanings written by hand | **108,576 rows** | 3,393 × 32, same command |
| Searchable dictionary | **30,334 headwords**, 39,628 senses | `npm run dictionary:qa` |
| Pronunciation recordings | **13,740 clips**, two voices, 67.0 MB | `npm run audio:qa` |
| Level-test bank | **4,194 items** | `npm run leveltest:qa:check` |
| Automated gates | ~90 named checks, chained in `verify:release` | `package.json` |
| Unit tests | 1,300+ web · 237 morphology · 96 handwriting | `npm test` |
| Delivered Android artefacts | signed APK + AAB, `com.talkhangyul.ganada` | `result/build-info.json` |

The gates are the part of this list an investor should weigh most heavily,
because they are the reason the other numbers can be trusted. `verify:release`
fails on a single mis-declared answer domain, a single question whose options a
learner could answer without reading Korean, a single language whose interface
string is missing, and a single artefact whose bytes do not match the commit it
claims. That is unusual discipline for a product at this stage and it is the
strongest single thing in the repository.

---

## 2. What does not exist

| An investor will ask about | The honest answer |
|:---|:---|
| Revenue, users, retention | None. Nothing has shipped to a store. |
| Market validation | None in this repository. No interviews, no survey, no pricing test. |
| Learning-outcome evidence | None. No study, no control group, no pre/post measurement. |
| Native-speaker review | None, in any of the 32 languages. |
| Teacher or linguist review | None. |
| Usability study | None. `docs/BEGINNER_TEST_PROTOCOL.md` is a protocol that has not been run with beginners. |
| Physical-device testing | None. Everything was measured in headless Chromium and one Android emulator. |
| iOS build | Not produced. See §4. |
| Filed patent | None. A disclosure exists; nothing is filed. |
| Competitive analysis | None in this repository. |

Every row above is a gap that money and time close. None of them is closed by
writing more code, which is worth saying plainly: **the repository is further
ahead than the business is**, and the next unit of effort is worth more spent
outside it than inside it.

---

## 3. The five questions that decide this

### 3.1 Can it be distributed?

**Not yet, and this is the largest single risk.** Neither store identifier has
been registered. Registration is not difficult, but until it happens there is no
evidence that the app id is available, that the listing passes review, or that
the 84 MB download is acceptable to the stores' policies for the categories it
would be listed under. Nothing in the repository can answer any of those, and
they are all answerable in a week by a person with an account.

Related and separate: the production web host is unidentified. Nothing in the
repository names who serves the domain, so deploy configuration cannot be
verified from here.

### 3.2 Is the content deep enough to charge for?

The product's own stated target is **10,000 taught words**. It has 3,393.
`npm run vocabulary:qa:target` prints *6,607 short of the 10,000 target* and has
not been disabled, weakened or removed from the release chain — it is the one
check whose job is to state a distance rather than be satisfied.

The honest reading is that 3,393 words is a real course, not a demo: it is
enough for a learner to work through daily for well over a year, and every word
of it carries a hand-written example, a recorded pronunciation and a meaning in
thirty-two languages. It is *not* the product that was described, and the gap is
not closable by generation without lowering the bar the gates enforce.
`examples:qa` refused six of 263 entries in one cycle and thirty-three of 273 in
another, for defects a generator would reproduce at scale.

There is a second content ceiling worth naming, because it bites sooner than the
first: a learner who tests into the top of the scale meets **524 words at levels
28–30**. At ten new words a day that is about eleven weeks before the top of the
course runs out. Issue I-79 tracks it.

### 3.3 Is the language quality good enough to charge for?

**Unknown, and not knowable from here.** Machine checks prove that a string
exists, that its placeholders survived, that it is in the right script, that it
is not a copy of the English, that it does not flatten two Korean words into one
sentence where English keeps them apart, and that a negated Korean sentence
stayed negated in the target language. Those gates are real and they found 192
collisions and 43 polarity defects in this cycle alone.

None of that is a speaker's judgement. A sentence can pass every check and still
read as translated. For a paid language product this is the risk that most
directly reaches the customer, and the mitigation is not another gate; it is
thirty-two people.

### 3.4 Is the engineering real, or is it a demo?

It is real, and the repository is unusually honest about the places it is not.
The three strongest pieces of evidence:

* Handwriting is graded against **one canonical stroke geometry** from which the
  practice guide, the grading mask and the animation are all derived, so the
  shape a learner is shown and the shape they are graded against cannot
  disagree. `strokes:corners:check` reads 73 characters and 510 stroke ends.
* Every generated question is checked by a verifier that **does not trust the
  content's own declaration** — it renders each option in each of 32 languages
  and rejects an item whose correct answer is the only one that expresses a
  quantity. That rule found three defects that every declaration-based check had
  passed.
* The delivered package is compared file-by-file against the build
  (`native:bundle:check`, 14,152 files), and the release gate fails if the
  artefacts were built from a tree that does not match a commit.

Against that: five defects in the last cycle were **invisible to a full green
suite**, which the report says in its own words. Green means the questions
somebody thought to ask were answered.

### 3.5 Is there a defensible technical position?

There is a disclosure covering seven mechanisms, six of them implemented and
tested on this tree, and one reference patent has been read element by element.
The engineering-side view is recorded in `patent/prior_art_differentiation.md`
and it is careful: it concedes direct overlap where there is direct overlap —
Unicode batchim arithmetic is ordinary Hangul programming and nothing is claimed
in it — and it names the distinctions it does rest on.

**No legal opinion exists.** Whether any of it is patentable is counsel's
determination and has not been made.

---

## 4. iOS

The iOS project is at `MARKETING_VERSION` 1.0.2 / `CURRENT_PROJECT_VERSION` 4
while Android is at 1.0.3 build 15. That lag is deliberate and recorded:
`project.pbxproj` is Xcode-managed and is not edited from Linux by text
substitution, because that is how a project file loses a setting nobody asked
about. `npm run version:check` prints the pending action on every run.

The practical consequence for an investor is simple: **there is no iOS build,
and one cannot be produced from this environment.** It requires a macOS machine
with Xcode, a person with the signing identity, and the two version values set
through the Xcode UI. Everything else for iOS — the web bundle, the Capacitor
sync, the entitlements, the bundle identifier — is in place and unchanged.

---

## 5. Risks, ranked by what would actually kill it

| # | Risk | Why it ranks here | What closes it |
|:--|:---|:---|:---|
| 1 | **No distribution** | A finished product nobody can install has no business at all | Register both identifiers; run one store review |
| 2 | **Language quality unverified** | The customer meets it on day one, in a paid product, in their own language | Thirty-two native readers; budget and schedule, not code |
| 3 | **Content depth against the stated target** | The claim and the artefact differ by 6,607 words | Either author them at the quality the gates enforce, or restate the target |
| 4 | **iOS not built** | Half the paying market for a paid app | One macOS machine and one afternoon |
| 5 | **No evidence of learning effect** | The category's buy-in question; also a marketing and regulatory exposure | A study, which is months and money |
| 6 | **Top-of-scale exhaustion** | An advanced learner runs out in about eleven weeks | More words at levels 28–30; partially addressed this cycle |
| 7 | **Package size** | 84 MB download, and the precache projection at the 10,000-word target is 3,779 kB against a 1,500 kB budget | A delivery strategy — on-demand bands rather than one binary |
| 8 | **Single maintainer, no physical devices** | Bus factor, and a whole class of defects that only a real handset shows | Hiring; a device lab |

Risks 1 and 4 are the cheap ones and they are ranked first because of it. A
review that put "no learning study" at the top would be describing a harder
problem than the one actually in the way.

---

## 6. What we would tell an investor to verify themselves

Not one of these requires trusting this document:

1. `npm run verify:release` on a clean checkout. It either passes or it names
   what failed.
2. `npm run vocabulary:qa:target` — read the gap it prints.
3. Install the APK in `result/` and use the app for twenty minutes in a language
   you speak. The language question in §3.3 is answerable in twenty minutes by
   one person for one language.
4. Read `docs/report.md` §7.2, which is this project's own account of a defect
   it shipped and a green suite that certified it. A team's honesty about its
   worst cycle is the cheapest signal available.

---

## 7. The summary a board would want, in four sentences

The engineering is genuinely built and unusually well checked; the business
around it is not started. The two things standing between this and a first
customer — store registration and an iOS build — are days of work by somebody
with the right accounts and a Mac, not engineering problems. The two things
standing between a first customer and a good product are native-speaker review
in thirty-two languages and 6,607 more words, and both are money and calendar
rather than invention. Nothing in this repository supports a claim about
learning outcomes, and no such claim should be made until a study exists.
