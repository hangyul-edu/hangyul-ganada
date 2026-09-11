# Child-safe content policy

**Policy version 1.0.0 — 11 September 2026.**
Machine form: `packages/content-safety/policy/child-safe-content-policy.json`.
Evaluators: `packages/content-safety/src/evaluate.ts` (TypeScript) and
`scripts/content/child_safety.py` (Python port). Contract between the two:
`packages/content-safety/fixtures/{negative,positive}.json`, which both must
pass in full before any gate runs.

Hangyul ganada teaches from the Hangul-reading stage and is used by children.
Every string a learner can be shown as *learning content* is governed by this
policy. Legal notices, internal engineering documents and the isolated test
fixtures that prove the policy are not learner content and are not rewritten
by it; the fixtures are refused from every packaged artefact by name.

## 1. What is prohibited

| Category | Excluded | Kept |
|:---|:---|:---|
| **Sexual** | Sexual acts, slang, innuendo, pornography, erotic description, hookup and adult-entertainment vocabulary, prostitution, sexualised description, sexual violence, adult-relationship content unsuitable for children; every conjugated, particle-attached, spaced, punctuated, romanised, misspelled or translated variant. `섹스하다` and its forms are the named regression. | Family and relationship vocabulary (애인, 결혼, 임신, 사랑), anatomy taught as health (가슴, 엉덩이, 피부), gender words (성별, 여성, 남성). |
| **Political** | Parties, politicians and candidates, campaigns and slogans, partisan advocacy, ideologies, propaganda, protest and activism, policy and geopolitical disputes, contested territories, current conflicts, praise or criticism of political groups or countries, polarising distractors. | Neutral civic vocabulary (정치, 대통령, 선거, 투표하다, 국회, 정부, 시민, 법) and country and city names (한국, 북한, 일본, 서울). |
| **Profanity** | Korean and foreign profanity, obscenity, masked, abbreviated, misspelled, spaced, punctuated and romanised profanity, insults on intelligence, appearance, nationality, ethnicity, gender, disability, religion or status, bullying or degrading sentences, slurs, translations that introduce an insult the Korean lacks. | Ordinary negative emotion (슬퍼요, 화가 나요, 싫어요, 무서워요); a word that is an insult only as a bare choice (년, 놈, 새끼, 자식) stays taught and is refused only in that slot. |
| **Drugs** | Illegal-drug names, use, purchase, sale, preparation, trafficking, casual or positive intoxication, substance-abuse slang, normalising description; translated and romanised forms; drug distractors. | Medicine and health (약, 약국, 약을 먹어요, 병원, 주사); 술, 맥주 and 담배 as nouns with non-glamorising examples. |
| **Gambling** | Betting, casinos, sports betting, online gambling, gambling apps, slot machines, wagering, bookmaking, gambling debts and slang, lottery as a gambling topic; translated or evasively spelled forms. | Games and sports that are not wagered on (보드게임, 윷놀이, 경기, 시합). |
| **Violence** | Assault, fighting as violence, murder, threats, torture, weapons, shooting, stabbing, bombs, graphic injury, blood and gore, kidnapping, violent abuse, glorification or instruction, violent crime, violent distractors, euphemisms. Unnecessary death- or injury-centred examples are replaced with daily-life ones even when not graphic. | Safe homonyms (죽 porridge, 총 as a total, 칼 peeling an apple), emergency and safety phrases (도와주세요, 경찰을 불러 주세요, 병원에 가요, 아파요), civic and health vocabulary (경찰, 범죄, 감옥, 상처, 다치다, 피). |
| **Self-harm** | Suicide and self-harm terminology, methods, encouragement, romanticisation, ideation, jokes, threats; translated, abbreviated, slang and euphemistic forms; in any field including hints, explanations and TTS. | Sad emotion and help-seeking (외로워요, 힘들어요, 상담하세요). |
| **Mortality** (CONTEXT_BLOCK) | Death-centred wording on any random or generated surface. | A named daily-life card: 죽다 (the flower in the pot died), 장례식, 애도, 무덤 — allowlisted by headword in the policy. |

## 2. Severity and lifecycle

```
HARD_BLOCK      never on any learner-facing surface — the dictionary included
CONTEXT_BLOCK   refused on every random or generated surface (assessment options,
                distractors, gap-fills, recommendations); allowed on a taught card
                or a dictionary row only when the item is named in `allow`
SAFE_ALLOWLIST  explicitly safe strings and headwords — the false-positive fixtures
INTERNAL_ONLY   policy documents and isolated test fixtures; never packaged
EXTERNAL_REVIEW flagged for a native reviewer — see §7
```

Content lifecycle: `DRAFT → STRUCTURALLY_VALID → CHILD_SAFETY_VALID →
LANGUAGE_VALID → REVIEWED → PUBLISHABLE`. A row that fails child-safety
validation does not advance: `build_vocabulary.py` stops with the row named,
`build_dictionary.py` drops the row or the sense, `build_level_test.{py,mjs}`
drop the anchor or the finished item, and `content:safety:check` fails the
release. Retirement is the only way a shipped word leaves the course: `k: 0`
with the reason on the pack row and a tombstone in
`content/vocabulary/retired-words.json`, so a learner's progress row keeps a
name.

## 3. The policy model

Every concept in the JSON carries: `id`, `category`, `severity`, `surfaces`
by language (32 locales; `*` for every language), `romanized` forms, `match`
overrides per surface, `exceptions` per language (longer safe strings blanked
before matching), `allow.headwords` and `allow.senseIds` (items the concept
may never flag), and `guidance` for replacement. `contextRules` hold the
regular expressions no term list can express (총을 쏘다 against 총 세 개);
`glossIndicators` classify a dictionary or assessment entry by its English
gloss; `allow.exact` and `allow.headwords` are the global safe list.

## 4. The evaluation pipeline

```
Unicode NFKC → zero-width/control removal → case folding → whitespace collapse
→ token de-obfuscation (leet, masks: f*ck, s.e.x, s e x) → compact form
(punctuation removed, single-syllable Hangul runs joined, word spaces kept)
→ lexeme matching in the surface's mode → context rules → gloss indicators
→ allow lists
```

Match modes: `substring` on the compact form (unambiguous multi-syllable
Korean lexemes — this catches 섹스하다, 섹 스, 섹.스, 섹스를 from the one entry
섹스; a term of three or more characters is also looked for with every space
removed), `token` at a script-run boundary optionally followed by one Korean
particle (short terms, and every space-delimited language), `phrase` (a token
sequence), `headword` (compared only against a headword or answer choice —
보지 마세요 is 보다). Combining marks are word characters, so a Thai vowel or a
Devanagari matra never makes a boundary. Romanised Korean is read only in
English text and romanisation fields. An English gloss indicator is a whole
word or a `*`-marked stem.

## 5. Where the policy is applied

| Gate | Where | What it reads |
|:---|:---|:---|
| Import / authoring | `scripts/content/build_vocabulary.py` → `refuse_unsafe_rows` | every kept pack row: headword, example, 7 inline meanings, 7 inline translations, definitions |
| Dictionary publication | `scripts/content/build_dictionary.py` | headword, every sense gloss, every example; HARD_BLOCK rows and senses are not written, counts go in the manifest |
| Assessment generation | `scripts/content/build_level_test.py` (anchors, retired words excluded from the dictionary pool) and `build_level_test.mjs` (distractor selection, composed sentences, then the finished item in every language) | prompt, answer, options, composed sentences, meanings in 32 locales |
| Gap-fills | `build_level_test.mjs` → `cloze.json` | options and the composed sentence |
| Runtime delivery | `apps/web/src/domain/contentSafety.ts` | a stored plan (retired words dropped from what is still owed), a stored sitting (not resumed if the loaded bank lacks an item), every bank item on load through `runtime-policy.json` — Korean and romanised forms, plus every dictionary anchor's headword read from its id |
| CI / release | `npm run content:safety:check` (in `verify:quick` and `verify:release`) | 14 content families, 32 locales, ~1.0 M fields, plus the fixture self-test |
| Packaged artefacts | `npm run content:safety:bundle:check` (in `verify:release`); `--apk`/`--aab` for the signed packages | every JSON asset and every Korean string literal in every JS chunk; refuses the fixtures by name |

A probabilistic classifier is not used. Every known term and structural
variant is a deterministic rule with a fixture.

## 6. The runtime subset

The app carries `packages/content-safety/policy/runtime-policy.json`: the
full policy minus the thirty-one locales that are validated at publication and
never generated on the device. Korean and romanised forms, the context rules
and the allow lists are complete; it fits, with the evaluator, inside the
24 kB route-chunk budget. A dictionary anchor
names its headword in its id, so an assessment item is refused from the Korean
in every interface language.

## 7. What a person still has to do

- **Native review of the thirty non-Korean, non-English surface lists.** They
  were written by the engineer who wrote this policy, not by native speakers,
  and are marked EXTERNAL_REVIEW. The scan they drive is real — it removed
  homonyms like Swedish *sex* (six), Filipino *patayin* (turn off) and Mongolian
  *бөмбөг* (ball) from the lists during calibration — but a native reviewer
  will find terms it lacks.
- **The 24 copy-pack translations of the one rewritten example** (베다: 풀을
  베어요) were written in the same pass and are marked EXTERNAL_REVIEW.
- **The CONTEXT_BLOCK allow list** is a judgement, recorded per headword in the
  policy. Adding to it means reading the card.
