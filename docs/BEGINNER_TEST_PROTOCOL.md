# Beginner usability test — protocol

**No one has run this yet.** No human being who cannot read Hangul has used
Hangyul ganada, and nothing in this repository, this document or the product
report claims otherwise. What follows is the test that should be run when
participants are available, written now so that it can be run by someone else,
in an afternoon, without designing it first.

Every judgement about beginner comprehension anywhere in this project — in
`docs/report.md`, in code comments, in the copy review — is **reasoned, not
observed**. That distinction is the reason this file exists.

---

## Who to recruit

Five adults. Recruiting more is not obviously better: five people find most of
what a session like this can find, and a sixth costs the same as a sixth again
of the same findings.

Each participant must:

- be an adult who has decided to learn Korean, or would plausibly decide to;
- **not be able to read Hangul.** Not "a bit rusty" — cannot read 가;
- have used a smartphone daily for years, so nothing being learned is the phone;
- read one of the eight shipping interface languages fluently.

Recruit across at least three of the eight languages if you can. The copy was
written in English and translated; the translations have never been read aloud
by someone relying on them.

Do not recruit colleagues, and do not recruit anyone who has seen the app.

## What to bring

- A phone with the release build installed — the real APK or IPA, not a
  browser. The handwriting is a finger-on-glass task and a trackpad is a
  different task.
- A second device to take notes on. Do not type on the participant's phone.
- A consent form covering recording, if you record.
- A copy of the task list below, and nothing else. In particular, no tutorial.

## The rules for the person running it

1. **Hand over the phone and stop talking.** The first thirty seconds of a
   first launch are the most informative part of the session and they are
   destroyed by explaining anything.
2. **Never answer a question about how the app works.** Say "what would you
   do?" and wait. Silence is the instrument.
3. **Write down what they did, not what you concluded.** "Tapped Words, scrolled
   past Animals, went back" is data. "Confused by the category screen" is a
   theory.
4. **A participant who cannot finish a task has found a defect.** Let them fail,
   note where, and move on. Rescuing them destroys the finding.
5. Ask them to think aloud, once, at the start. Do not remind them again.

## Tasks

Give them one at a time. Do not read out the notes in brackets.

1. **"Have a look at this app and tell me what you think it's for."**
   *(Home. Does the first screen say what the product is, without being read
   word by word? Where do their eyes go? Do they press Start now?)*

2. **"Learn your first Korean letter."**
   *(Units 1–3. This is the core task. Watch for: do they watch the stroke
   demonstration through, or tap past it? Do they understand that the grey shape
   is to be traced? Do they try to write outside the box? What do they do when a
   check comes back "Not quite"?)*

3. **"Keep going until you've finished the first lesson."**
   *(Six letters. Watch for the moment the guide gets lighter on the second
   writing step: is it noticed, and is it a problem? Note anyone who says some
   version of "wait, where did it go".)*

4. **"Find out how to say 'apple' in Korean."**
   *(Words → search, or Words → Food & Drink. Which do they reach for? Does the
   search box read as a search box? Do they type "apple" or try to type
   Korean?)*

5. **"Find the words about animals."**
   *(The category picker. Do they use the Category button or the grid? Does
   "Coming & Going" or "Everyday Essentials" mean anything to them?)*

6. **"Make the app dark."**
   *(My Learning → Appearance. Was it findable? Did they look in the wrong
   place first, and where?)*

7. **"Show me what you've learned so far."**
   *(Learning activity. Does the record mean anything to them? Do they trust
   the streak?)*

8. Finally, ask: **"Would you open this again tomorrow?"** and then **"What
   would you tell a friend this app is?"** Write down their exact words.

## What to measure

Per participant, per task:

| Field | How |
| --- | --- |
| Completed unaided | yes / no |
| Time to complete | stopwatch, to the nearest 5 s |
| Wrong turns | count of taps that led somewhere they immediately left |
| Requests for help | count, even if refused |
| Verbatim quotes | anything they said while stuck |

And once, at the end of the session:

- Could they read 가 aloud? *(The product's actual claim, tested.)*
- Could they write ㅏ on paper, unprompted? *(The claim the removal of the
  memory-writing step deliberately stopped asserting. Worth knowing anyway —
  but a "no" here is not a defect, because the app no longer promises it.)*

## What counts as a finding worth fixing

- Two or more participants failing the same task unaided.
- Any participant unable to complete task 2. That is the product.
- Any place where a participant says a sentence in the app means something it
  does not mean.
- Any Korean text a participant read as English, or vice versa.

One participant struggling with one thing is a note, not a finding. Write it
down anyway.

## Reporting

Write the results into `docs/report.md` under Testing and verification, with:

- the number of participants and their languages,
- the completion rate per task,
- every finding, whether or not it was fixed,
- the date.

Do not summarise five people as "learners found the app clear". Report what
happened, including the parts that were fine.

---

## Until it is run

`docs/report.md` says, and must keep saying, that no beginner testing has been
performed. Simulated beginner QA — walking the product as if for the first time,
which *has* been done — is not the same thing and is reported separately under
its own name.
