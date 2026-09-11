# Child-safe content remediation ledger

**11 September 2026 · policy 1.0.0.** Every learner-facing item the policy
changed, with what it was, why, and what a learner who already had it keeps.
The audit that produced it is `docs/CHILD_SAFE_CONTENT_AUDIT.md`; the machine
record of the tombstones is `content/vocabulary/retired-words.json`.

## 1. Taught words retired (23)

A retirement is `k: 0` on the pack row with the reason written out, a
tombstone below, and nothing else. The id stays in `word-ids.json`; the
learner's progress, memory, saved-word and mistakes rows for it are kept on
the device; Today's Vocabulary drops it from what is still owed
(`repairPlanForRetiredWords`) and Review stops scheduling it (`canAsk` refuses
a word the corpus cannot resolve). No replacement word was authored: every
affected level band keeps at least 43 assessment anchors and well over the 30
distinct taught words the daily plan needs (`leveltest:bank:check`,
`dailyplan:level:check`), so retiring without replacing does not open a gap
a learner would meet. Authoring a replacement costs 32 translations and two
recordings per word and is the right thing to do with a native reviewer in
the loop — see §5.

| Id | Word | Level | Category · POS | Policy | Previous example | Reason |
|:--|:--|--:|:--|:--|:--|:--|
| `word_jugida` | 죽이다 | 9 | actions · verb | violence | 방에 들어온 모기를 죽였어요. | To kill, with an example of killing an animal; retired under the violence rule. |
| `word_babo` | 바보 | 11 | people · noun | profanity | 바보 같은 말이에요. | A fool; an insult attacking intelligence, retired under the profanity rule. |
| `word_jeonjaeng` | 전쟁 | 13 | society · noun | violence | 전쟁이 끝나고 평화가 왔어요. | War, defined as nations fighting with weapons; retired under the violence and conflict rules. |
| `word_suljip` | 술집 | 14 | places-travel · noun | drugs | 술집이 시끄러워요. | A bar; an adult venue retired under the substance-abuse rule. |
| `word_jugeum` | 죽음 | 14 | body-health · noun | mortality | 죽음은 누구에게나 찾아와요. | Death as a headword with a death-comes-to-everyone example; retired under the mortality rule (죽다 stays, with its flower-in-the-pot example). |
| `word_kiseu` | 키스 | 15 | society · noun | sexual | 영화에 키스 장면이 나와요. | A kiss scene in a film; adult-relationship content retired under the sexual-content rule (키스하다, a kiss on the forehead, stays). |
| `word_mugi` | 무기 | 16 | society · noun | violence | 무기를 내려놓으세요. | A weapon, with a put-the-weapon-down example; retired under the weapons rule. |
| `word_chwihada` | 취하다 | 16 | body-health · verb | drugs | 술에 취했어요. | To get drunk, with a casual intoxication example; retired under the substance-abuse rule. |
| `word_sarin` | 살인 | 18 | society · noun | violence | 살인 사건이 일어났어요. | Murder is graphic crime; a beginner course does not ask what 살인 means. |
| `word_jeontu` | 전투 | 20 | society · noun | violence | 전투가 끝났어요. | A battle between armies; retired under the violence rule. |
| `word_chongal` | 총알 | 20 | society · noun | violence | 총알이 빨라요. | A bullet; retired under the weapons rule. |
| `word_gangdo` | 강도 | 22 | people · noun | violence | 강도를 신고했어요. | A violent criminal as a level-22 people noun; retired under the violence rule. |
| `word_jombi` | 좀비 | 23 | society · noun | violence | 영화에 좀비가 나와요. | A zombie, glossed in Korean as a reanimated corpse; retired under the graphic-content rule. |
| `word_sagyeok` | 사격 | 23 | society · noun | violence | 사격 연습을 해요. | Shooting, glossed 총을 쏘는 일; retired under the weapons rule. |
| `word_misail` | 미사일 | 24 | society · noun | violence | 뉴스에 미사일 이야기가 나왔어요. | A missile, glossed in Korean as a weapon; retired under the weapons rule. |
| `word_samanghada` | 사망하다 | 26 | body-health · verb | mortality | 사고로 사망했어요. | To die, formal, with an accident example; retired under the mortality rule. |
| `word_sumjida` | 숨지다 | 27 | body-health · verb | mortality | 사고로 한 사람이 숨졌어요. | To die, with an accident example; retired under the mortality rule. |
| `word_hyeopbakada` | 협박하다 | 28 | society · verb | violence | 협박하면 안 돼요. | To threaten; threats are excluded, retired under the violence rule (위협하다 stays with its prohibition example). |
| `word_meongcheonghada` | 멍청하다 | 28 | describing · adjective | profanity | 멍청한 실수였어요. | To be dim; an insult attacking intelligence, retired under the profanity rule. |
| `word_beolgeobeotda` | 벌거벗다 | 28 | body-health · verb | sexual | 아이가 벌거벗고 뛰어요. | To strip bare, with a naked-child example; retired under the sexual-content rule. |
| `word_paeop` | 파업 | 29 | school-work · noun | political | 지하철 파업으로 늦었어요. | A strike by workers; political activism is excluded, retired under the political rule. |
| `word_inyeom` | 이념 | 30 | society · noun | political | 이념보다 사람이 먼저예요. | Ideology; political ideologies are excluded, retired under the political rule. |
| `word_salsinseongin` | 살신성인 | 30 | society · noun | mortality | 살신성인의 정신을 기려요. | Giving one's life; a death-centred idiom retired under the mortality rule. |

## 2. Items rewritten (2)

| Item | Field | Was | Now | Why |
|:--|:--|:--|:--|:--|
| 베다 (`word_beda`, level 17) | example + 31 translations + 2 recordings | 칼에 손을 베었어요. — *I cut my hand on a knife.* | 풀을 베어요. — *I cut the grass.* | An injury-centred example replaced with a daily-life one at the same level and structure; the verb, its sense (*to cut, to slice*) and the object slot are unchanged. The 24 pack translations were written in this pass and are marked EXTERNAL_REVIEW. |
| 치다 (`word_chida`, level 11) | Korean definition | 손이나 물건으로 때리다 | 손이나 물건으로 두드리다 | The definition named a violent verb; *to tap/strike* describes the taught sense (공을 쳐요) without it. |

## 3. Dictionary rows refused at publication

694 headwords (367 by headword, 327 because every sense was refused) and 525
individual senses, recorded as counts in `public/dictionary/manifest.json →
childSafety` and not listed by word in any shipped file. A sense is dropped on
its own gloss and an example on its own sentence, so 보다 keeps eighteen
senses and loses one Wiktionary example about killing oneself, and 방 keeps
*room* and loses *a round fired by a gun*. Death vocabulary (505 rows) stays:
a dictionary is looked up, never dealt at random.

## 4. Assessment and practice items regenerated

| Artefact | Before | After | What changed |
|:--|--:|--:|:--|
| Level Test bank | 3,995 items (`bank-8b0e5dba`) | 3,990 items | 4 items carrying 섹스하다 gone; dictionary anchors filtered by the policy; retired words excluded from the pool; 0 items refused by the publication gate |
| Level Test meanings | 32 files | 32 files | rebuilt from the corrected pack |
| Gap-fills (`cloze.json`) | 513 | 510 | retired words' sentences gone; composed sentences now read through the policy (넘어진 아이를 괴롭혔어요 no longer composes) |
| Audio manifest | 6,998 entries | 6,952 | 94 recordings of retired sentences removed, 2 added |
| Relations | 292 words | 292 words | rebuilt without retired ids |

Every regenerated item keeps its id; a learner's stored sitting that named an
item the new bank lacks is not resumed (`sittingIsServable`), which costs
nothing because an unfinished sitting has never written a level.

## 5. Human review still required

- Native review of the 30 non-Korean, non-English policy surface lists.
- Native review of the 24 new translations of 풀을 베어요.
- A decision on replacements for the 23 retired words (family, school, food,
  weather, hobbies at the same level and part of speech) — not required for
  supply, recommended for breadth at levels 9–16 where five words left.
