import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import {
  levelKind,
  loadLevelTestBank,
  resolveItem,
  type LevelTestBank,
} from '../data/levelTest';
import { getFont, textFamily } from '../data/fonts';
import {
  ITEM_COUNT,
  LEVELS,
  MAX_ITEM_COUNT,
  MIN_ITEM_COUNT,
  TIME_LIMIT_MS,
  type AskedDetail,
  type AskedItem,
  type ItemKind,
  estimate,
  nextLevel,
  pickIndex,
  planKinds,
  reachCeiling,
  shouldStop,
  sittingIsServable,
} from '../domain/levelTest';
import type {
  LevelTestItem,
  LevelTestSitting,
  RenderedItem,
} from '../domain/levelTestTypes';
import { useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import styles from './LevelTestPage.module.css';

/**
 * The Hangyul Vocabulary Level test.
 *
 * ## What it is, and what it is careful not to be
 *
 * A placement, not a lesson and not a certificate. **Twenty to thirty questions,
 * eight minutes**, one clock over the whole sitting and none on any single
 * question. It reports a position on the Hangyul Vocabulary Level ladder —
 * level 5 is roughly the first 735 words of Korean by frequency, level 30 beyond
 * 10,635 — with a confidence band.
 *
 * ## It starts where the learner is
 *
 * The first question used to be at **level 14** — for everybody, including
 * somebody who had finished the alphabet an hour earlier. That was not a bug in
 * the estimator; it was the estimator being asked to choose the opening move.
 * With nothing asked yet the posterior is the prior, the prior sits in the
 * middle of the scale, and the most informative item is therefore in the middle
 * of the scale. It is the correct answer to the wrong question.
 *
 * So the first three questions come off a warm-up ladder instead — 2, 4, 6 for a
 * new learner, and four levels below their last result for somebody coming back
 * — the difficulty moves by at most three levels between any two questions, and
 * no level is asked three times running. `domain/levelTest.ts` documents each
 * rule against the behaviour it replaced.
 *
 * ## Leaving does not lose it
 *
 * The sitting is written to the device after every answer, so a call, a tab
 * eviction or a closed app costs nothing: reopening the screen returns the
 * question that was on it, with the answers already given still counted. The
 * leave guard that used to warn about this has gone with the thing it warned
 * about. See `LevelTestSitting`.
 *
 * ## Why this screen is stripped
 *
 * Everything the learning screens do to help is absent, and each absence is a
 * decision:
 *
 * * **No hints.** A hint ladder exists to get a stuck learner moving; here,
 *   being stuck is the measurement.
 * * **No answer revealed.** Showing the answer would teach mid-assessment, and
 *   a learner who has just been taught a word answers the next question about
 *   it differently. They can find out afterwards, in the app, where the word is
 *   a card with a recording and a sentence.
 * * **No score as it goes.** A running tally invites quitting when it looks bad,
 *   which is exactly the sitting whose result would have been most useful.
 * * **An explicit *I don't know*.** Guessing is not free — the model assumes a
 *   quarter of four-option answers are luck — so a learner who says they do not
 *   know gives a cleaner signal than one who picks at random, and the estimate
 *   uses it as such. It is offered on every question, at the same weight as an
 *   answer, so that not knowing is a normal thing to say rather than a failure
 *   to do something.
 * * **No listening and no writing.** This measures vocabulary. A learner who
 *   cannot hear, or who is on a device without a usable canvas, must be able to
 *   get the same number as anyone else.
 *
 * ## Nothing here touches learning
 *
 * The result goes to one field on the settings row through `saveLevelTestResult`
 * and the sitting in progress to one more through `saveLevelTestSitting`. No
 * progress, no memory, no session, no streak, no mastery, no saved word, no
 * review queue. Sitting the test five times changes nothing about what the
 * learner has *done*; it changes only which words they are offered next, which
 * is what they asked for by taking it.
 */
/**
 * How many questions must pass before the same word may be asked about again.
 *
 * Six is "several other learning events" — enough that the answer has to be
 * recalled rather than still being on the screen behind this one.
 */
const WORD_COOLDOWN = 6;



export function LevelTestPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['levelTest', 'common']);
  const { state, ready, saveLevelTestResult, saveLevelTestSitting } = useLearner();
  const { locale } = useLocale();
  const font = getFont(state.settings.selected_font_id);

  const [bank, setBank] = useState<LevelTestBank | null>(null);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /**
   * The sitting, and the only thing this screen keeps.
   *
   * It used to keep six pieces of state and three refs — an answer list, the
   * current item, a used-id set, a shown-id list, a word-cooldown list and a
   * deadline — and none of them survived the screen unmounting. They are all
   * derivable from the two parallel arrays in `LevelTestSitting`, so they are
   * derived, and the one object is what gets written to the device.
   *
   * That is not tidiness. It is what makes the resume trustworthy: there is one
   * record of what happened, the screen renders from it, and the copy on the
   * device is that same record rather than a summary of it.
   */
  const [sitting, setSitting] = useState<LevelTestSitting | null>(null);

  /** Which kind each question is. Fixed, and the same for every learner. */
  const kinds = useRef<ItemKind[]>(planKinds());

  /*
    The *interface* language, not `contentLocale`.

    `contentLocale` is the fallback-resolved one — it is what a word card reads
    so that a learner in a language with no meaning for 사과 sees a marked
    English gloss instead of a blank. The Level Test must not do that: §3 is
    absolute, and a question is either asked in the learner's language or not
    asked. Reading `contentLocale` here would put the English back.
  */
  useEffect(() => {
    if (!started || bank) return;
    let live = true;
    loadLevelTestBank(locale).then(
      (loaded) => live && setBank(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [started, bank, locale]);

  const byId = useMemo(() => {
    if (!bank) return null;
    return new Map(bank.items.map((item) => [item.id, item]));
  }, [bank]);

  /**
   * The stored sitting, if this build and this learner can honestly resume it.
   *
   * Three things disqualify one, and each is a promise the resume could not
   * otherwise keep:
   *
   * * **A different language.** The bank resolves meanings per locale, so the
   *   questions already presented may not exist in the new one — and somebody
   *   who changed language mid-assessment has asked for a different test.
   * * **Stale.** A sitting is a few minutes of somebody's attention, not a
   *   bookmark. One whose clock ran out while the app was closed is finished,
   *   and offering to resume it would be offering a test with no time on it.
   * * **Unreadable.** `isReadableSitting` in the repository has already rejected
   *   anything whose own two records of itself disagree.
   * * **Unservable.** An update can regenerate the bank, and a sitting whose
   *   items this build no longer has cannot keep either promise a resume makes:
   *   the replay silently drops an answered question it cannot find, and the
   *   question that was on screen may have no item to draw. See
   *   `sittingIsServable`.
   */
  const stored = state.settings.level_test_sitting;
  const resumable = useMemo(() => {
    if (!stored) return null;
    if (stored.locale !== locale) return null;
    if (stored.deadline <= Date.now()) return null;
    if (stored.presented.length === 0) return null;
    // Only once the bank has arrived; until then there is nothing to check against.
    if (byId && !sittingIsServable(stored.presented, byId)) return null;
    return stored;
  }, [stored, locale, byId]);

  /**
   * A sitting in progress opens itself.
   *
   * There is no "resume?" prompt, and the intro screen is not shown. A sitting
   * has a running clock on it, so a screen that stops to ask would be spending
   * the learner's remaining time on a question whose answer is obvious — they
   * came back to the Level Test, and there is a Level Test of theirs in
   * progress. A finished sitting is cleared when its result is written, so this
   * can never re-enter a test that has already been scored.
   */
  useEffect(() => {
    if (!ready || started || done) return;
    if (resumable) setStarted(true);
  }, [ready, started, done, resumable]);

  /*
    Every response so far, in the order given.

    Derived rather than stored twice. An item still on screen has a `null`
    response and is not evidence yet, so it is dropped here — which is also what
    makes a resumed sitting score identically to one that was never interrupted.
  */
  const asked = useMemo<AskedDetail[]>(() => {
    if (!sitting || !byId) return [];
    const out: AskedDetail[] = [];
    sitting.presented.forEach((id, index) => {
      const response = sitting.responses[index];
      if (!response) return;
      const item = byId.get(id);
      // The kind travels with the answer: `reach` requires evidence spread
      // across question kinds before it opens a band, so a history of levels
      // alone would let three word questions unlock the sentence band.
      if (item) out.push({ level: item.level, response, kind: item.kind });
    });
    return out;
  }, [sitting, byId]);

  /** The question on screen: the one presented and not yet answered. */
  const current = useMemo<LevelTestItem | null>(() => {
    if (!sitting || !byId) return null;
    const index = sitting.responses.indexOf(null);
    if (index < 0) return null;
    return byId.get(sitting.presented[index]!) ?? null;
  }, [sitting, byId]);

  /*
    Questions the last sitting asked, avoided in this one.

    A retake that repeats the same twenty words measures memory of the test
    rather than knowledge of Korean. The list is capped when it is stored, so
    this only ever excludes a couple of sittings' worth — and it is a
    preference, not a rule: if avoiding them would leave a level with nothing to
    ask, the level is asked anyway rather than skipped.
  */
  const previous = useMemo(
    () => new Set(state.settings.level_test?.recentItems ?? []),
    [state.settings.level_test],
  );

  /**
   * Appends the next question to a sitting, or reports that it is over.
   *
   * A pure function of the sitting and the bank, which is the property the
   * whole resume rests on: run it twice on the same sitting and it appends the
   * same question, because the only choice it makes — which item to take from a
   * level's pool — comes from `pickIndex(seed, index, size)` rather than from a
   * random number generator.
   */
  const chooseNext = useCallback(
    (from: LevelTestSitting, loaded: LevelTestBank): LevelTestSitting | 'over' => {
      const items = new Map(loaded.items.map((item) => [item.id, item]));
      const history: AskedDetail[] = [];
      from.presented.forEach((id, index) => {
        const response = from.responses[index];
        const item = items.get(id);
        if (response && item) history.push({ level: item.level, response, kind: item.kind });
      });
      if (shouldStop(history)) return 'over';

      /*
        The plan says what kind; the model says what level.

        The two are chosen independently and then reconciled here, because the
        contextual bank is thin at the top of the scale — level 27 has one item
        — and a sitting that insisted on its twelfth contextual question at
        level 27 would either repeat one or stop. So the kind is a preference:
        the wanted kind at the wanted level, then the wanted kind at a
        neighbouring level, then any kind at the wanted level.
      */
      const index = history.length;
      const wanted = kinds.current[index] ?? 'meaning';
      const used = new Set(from.presented);
      const unused = (list: readonly LevelTestItem[] | undefined) =>
        (list ?? []).filter((item) => !used.has(item.id));

      const open = [...loaded.byLevel.keys()].filter(
        (level) => unused(loaded.byLevel.get(level)).length > 0,
      );
      /*
        `seededFrom` is the level a previous sitting reported, and it reaches
        exactly one thing: the warm-up ladder. See `warmupLadder` for why it
        must not reach the posterior — a retake exists because the old number
        may be wrong, and a learner should not have to out-argue their own
        history to move.
      */
      const level = nextLevel(history, open, { previousLevel: from.seededFrom });
      if (level === null) return 'over';

      /*
        The neighbour search may not cross the ceiling the evidence gate set.

        Band 1 holds three contextual items, so `levelKind(3, 'context')` is
        often empty and the fallback used to reach level 5 — a band-2 sentence
        served to a learner who has proved nothing beyond band 1. Searching
        downward first and never above `ceiling` keeps the fallback inside what
        was earned; when nothing is left it drops the *kind* rather than the
        ceiling, which is the right trade: a word question at the right level
        measures something, a sentence at the wrong one does not.
      */
      const ceiling = reachCeiling(history);
      let pool = unused(loaded.byLevelKind.get(levelKind(level, wanted)));
      if (pool.length === 0) {
        for (const nearby of [level - 1, level + 1, level - 2, level + 2]) {
          if (nearby < 1 || nearby > ceiling) continue;
          pool = unused(loaded.byLevelKind.get(levelKind(nearby, wanted)));
          if (pool.length > 0) break;
        }
      }
      if (pool.length === 0) pool = unused(loaded.byLevel.get(level));
      if (pool.length === 0) return 'over';

      /*
        Not the same word twice, and not one asked a few questions ago.

        `presented` holds item ids, and one word has several: 끝없다 owns both
        word_kkeuteopda:context and word_kkeuteopda:meaning. So a sitting could
        end one question by revealing 끝없다 as the answer and open the next with
        끝없다 · 이 단어는 무슨 뜻일까요?, which is not a question — the learner
        was looking at the answer a second ago.

        The word id is the part of the item id before the colon, so no data
        change is needed to group them. Two rules, not one: no word may appear
        twice in a sitting at all, and none may return within `WORD_COOLDOWN`
        questions. The second is a preference and finishing the sitting is the
        contract, so if honouring it would empty the pool it is dropped; the
        first is absolute, because asking about the same word twice is not a
        second measurement.
      */
      const wordOf = (id: string) => id.split(':')[0]!;
      const asPresented = from.presented.map(wordOf);
      const everSeen = new Set(asPresented);
      const distinct = pool.filter((item) => !everSeen.has(wordOf(item.id)));
      const noRepeat = distinct.length > 0 ? distinct : pool;

      const cooling = new Set(asPresented.slice(-WORD_COOLDOWN));
      const spaced = noRepeat.filter((item) => !cooling.has(wordOf(item.id)));
      const respectful = spaced.length > 0 ? spaced : noRepeat;

      const fresh = respectful.filter((item) => !previous.has(item.id));
      const candidates = fresh.length > 0 ? fresh : respectful;

      /*
        Sorted before choosing, because a bank's array order is an accident of
        how it was built and `pickIndex` has to index into something stable. Two
        sittings with the same seed and the same answers must present the same
        questions, on any device, in any release that ships this bank.
      */
      const ordered = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const item = ordered[pickIndex(from.seed, index, ordered.length)]!;
      return {
        ...from,
        presented: [...from.presented, item.id],
        responses: [...from.responses, null],
      };
    },
    [previous],
  );

  /** Writes a sitting to the device and to the screen in one move. */
  const commit = useCallback(
    (next: LevelTestSitting | null) => {
      setSitting(next);
      saveLevelTestSitting(next);
    },
    [saveLevelTestSitting],
  );

  /**
   * Opens the sitting: a resume if there is one, otherwise a new one.
   *
   * Runs once the bank has arrived, and once. A resumed sitting is *not*
   * re-planned — `presented` is replayed exactly as it stands, and the question
   * that was on screen when the app closed is the question that comes back.
   */
  useEffect(() => {
    if (!bank || !started || sitting || done) return;
    if (resumable) {
      const restored = resumable.responses.includes(null)
        ? resumable
        : chooseNext(resumable, bank);
      if (restored === 'over') {
        setSitting(resumable);
        setDone(true);
        return;
      }
      commit(restored);
      return;
    }
    const opened: LevelTestSitting = {
      /*
        A seed per sitting, so a retake does not replay the previous one's
        choices, and `crypto.randomUUID` where it exists because two sittings on
        the same device a second apart must not collide.
      */
      seed:
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`,
      startedAt: new Date().toISOString(),
      /*
        The clock starts when the first question can be shown, not when the
        learner tapped Start: the seconds spent waiting for the bank to arrive
        are not theirs to lose.
      */
      deadline: Date.now() + TIME_LIMIT_MS,
      locale,
      seededFrom: state.settings.level_test?.level ?? null,
      presented: [],
      responses: [],
    };
    const first = chooseNext(opened, bank);
    if (first === 'over') {
      setDone(true);
      return;
    }
    commit(first);
  }, [bank, started, sitting, done, resumable, chooseNext, commit, locale, state.settings.level_test]);

  /**
   * The clock, and what happens when it stops.
   *
   * One deadline for the sitting, kept on the sitting itself so that it
   * survives the app being closed — a learner cannot buy themselves more time
   * by force-quitting.
   *
   * On expiry the sitting is **scored, not discarded**: everything answered is
   * evidence, and the question on screen is read as *I don't know*, which is
   * what running out of time on a question means.
   *
   * What it no longer does is invent the rest. The previous version padded the
   * history out to a full thirty responses at the current item's level, so a
   * learner who answered five questions and then put the phone down was scored
   * on twenty-five answers they were never shown — which dragged the estimate
   * hard toward wherever the clock happened to stop. Questions that were never
   * asked are not evidence, and the confidence band is the right place for a
   * short sitting to be uncertain.
   */
  useEffect(() => {
    if (!sitting || done) return undefined;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [sitting, done]);

  useEffect(() => {
    if (!sitting || done || now < sitting.deadline) return;
    const index = sitting.responses.indexOf(null);
    if (index >= 0) {
      const responses = [...sitting.responses];
      responses[index] = 'unknown';
      commit({ ...sitting, responses });
    }
    setDone(true);
  }, [now, sitting, done, commit]);

  const [announce, setAnnounce] = useState('');

  /*
    One answer per question.

    A tap is committed the instant it lands: the option list is replaced by the
    next question, and `announce` tells a screen-reader user that the answer
    was recorded, since nothing visible says so — the test deliberately shows
    no correct/incorrect verdict (§10).

    The guard is the sitting itself. An answer is only accepted for the question
    that is actually open, so a second tap in the same frame, or a tap on a
    stale option while React is still committing the next question, finds no
    open question and is dropped rather than scored against the wrong item.
  */
  const lastTap = useRef<{ at: number; index: number } | null>(null);
  const answer = (response: AskedItem['response'], index: number | null = null) => {
    if (!sitting || !bank || done) return;
    const open = sitting.responses.indexOf(null);
    if (open < 0) return;
    /*
      The second half of the guard is about the *next* question. A double tap is
      two taps in the same place within a few hundred milliseconds; React commits
      the next question between them, so the second tap lands on whichever option
      now sits under the finger and would be a legitimate — and unintended —
      answer to a question the learner has not read. A tap on the same option
      position within 250 ms of the previous answer is dropped. Nothing is
      disabled and nothing waits, so there is no dead zone, and a tap in a
      different place is accepted at once. "I don't know" is exempt: it is one
      button in one place and tapping it twice quickly is two honest answers.
    */
    const at = performance.now();
    if (index !== null && lastTap.current && lastTap.current.index === index && at - lastTap.current.at < 250) {
      return;
    }
    if (index !== null) lastTap.current = { at, index };

    const responses = [...sitting.responses];
    responses[open] = response;
    const answered: LevelTestSitting = { ...sitting, responses };
    setAnnounce(t('levelTest:answerRecorded', { current: open + 1 }));
    const next = chooseNext(answered, bank);
    if (next === 'over') {
      commit(answered);
      setDone(true);
      return;
    }
    commit(next);
  };

  const result = useMemo(() => estimate(asked), [asked]);

  /*
    Written once, when the sitting ends.

    In an effect rather than in the click that finished it, so a learner who
    closes the app on the last question still has their result — and guarded, so
    a re-render cannot write it twice. `saveLevelTestResult` clears the sitting
    in the same write, so there is no moment at which the device holds both.
  */
  const saved = useRef(false);
  useEffect(() => {
    if (!done || saved.current || asked.length === 0 || !sitting) return;
    saved.current = true;
    saveLevelTestResult({
      level: result.reported,
      low: result.low,
      high: result.high,
      items: asked.length,
      takenAt: new Date().toISOString(),
      recentItems: [...sitting.presented].reverse(),
    });
  }, [done, asked.length, result, saveLevelTestResult, sitting]);

  if (!started) {
    return (
      <div className={styles.page}>
        <AppHeader title={t('levelTest:title')} />
        <div className={styles.body}>
          {/*
            Four lines and a button.

            The previous version of this screen explained adaptive testing, said
            that the scale was our own, and said that it was not an official
            examination — three paragraphs of methodology in front of somebody
            who has not started yet. None of it helps them decide, and the last
            two raise doubts that only exist because the screen raised them. What
            a person wants before a test is what it costs and what they get, so
            that is what is here: thirty questions, eight minutes, permission not
            to know, and what the result will be used for.
          */}
          <h2 className={styles.introTitle}>{t('levelTest:intro.title')}</h2>
          <p className={styles.introBody}>{t('levelTest:intro.body')}</p>
          <p className={styles.introFacts}>
            {t('levelTest:intro.shape', {
              min: MIN_ITEM_COUNT,
              max: MAX_ITEM_COUNT,
              minutes: TIME_LIMIT_MS / 60000,
            })}
          </p>
          <p className={styles.introNote}>{t('levelTest:intro.unsure')}</p>
          <p className={styles.introNote}>{t('levelTest:intro.usedFor')}</p>
          {state.settings.level_test && (
            <p className={styles.previous}>
              {t('levelTest:intro.previous', { level: state.settings.level_test.level })}
            </p>
          )}
          <Button size="lg" fullWidth onClick={() => setStarted(true)} data-testid="level-start">
            {state.settings.level_test ? t('levelTest:intro.retake') : t('levelTest:intro.start')}
          </Button>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className={styles.page}>
        <AppHeader title={t('levelTest:title')} />
        <div className={styles.body}>
          <p className={styles.status} role="status">
            {t('levelTest:unavailable')}
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.page}>
        <AppHeader title={t('levelTest:title')} />
        <div className={styles.body}>
          <Card tone="featured" padding="lg" className={styles.result}>
            <p className={styles.resultLabel}>{t('levelTest:result.label')}</p>
            <p className={styles.resultLevel} data-testid="level-result">
              <span className="hg-numeric">{result.reported}</span>
              <span className={styles.resultOf}>{t('levelTest:result.of', { levels: LEVELS })}</span>
            </p>
            {/*
              One number, and nothing about how it was arrived at.

              Two things used to be printed here and both were the product
              talking to itself in front of a customer.

              The confidence band — "15~21 사이일 가능성이 높아요" — is a real
              property of the estimator and not a result. A learner who has just
              spent eight minutes being measured is told the measurement is
              uncertain to six levels, which reads as an apology and is of no
              use to anybody outside this repository. `result.low` and
              `result.high` are still computed and still saved; they are
              analytics.

              The ceiling notice — "지금은 23단계까지 물어볼 수 있어요. 그 위
              단계의 단어는 아직 번역되지 않았어요" — is worse: it is a content
              backlog, described to the person who bought the finished product.
              Whether this language's bank reaches level 23 or level 30 is ours
              to fix, and until it is fixed the honest thing is to report the
              level actually measured rather than to explain the engineering.
              §15 of the review brief is unambiguous about this and it is right.
            */}
            <p className={styles.resultRecommend}>{t('levelTest:result.recommend')}</p>
          </Card>
          {/*
            The result leads to the words it just changed — §24.

            It used to end on Done, which returned to the settings screen the
            learner came from. They had sat thirty questions to find out which
            words suit them, and the app's closing move was to put them back
            where they started. The number is only worth measuring because it
            changes what happens next, so the button is what happens next.
          */}
          <Button size="lg" fullWidth onClick={() => navigate('/words/today')}>
            {t('levelTest:result.start')}
          </Button>
        </div>
      </div>
    );
  }

  const remaining = sitting === null ? TIME_LIMIT_MS : Math.max(0, sitting.deadline - now);
  const clock = `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`;

  if (!bank || !current) {
    return (
      <div className={styles.page}>
        <AppHeader title={t('levelTest:title')} />
        <div className={styles.body}>
          <p className={styles.status} role="status">
            {t('levelTest:loading')}
          </p>
        </div>
      </div>
    );
  }

  /*
    Resolved here rather than at pick time so that a language change mid-sitting
    cannot leave the previous language's strings on screen: the bank is keyed by
    locale and so is this.
  */
  const rendered: RenderedItem | null = bank
    ? resolveItem(current, bank.meanings, bank.locale)
    : null;
  if (!rendered) return null;
  const korean = rendered.promptLocale === 'ko';
  return (
    <div className={styles.page}>
      <AppHeader
        title={t('levelTest:title')}
        
        /* How far through and how long is left. Never how well — see the note
           at the top of the file. */
        action={
          <span className={styles.meta}>
            <span className={`${styles.count} hg-numeric`}>
              {t('levelTest:progress', { asked: asked.length + 1, total: ITEM_COUNT })}
            </span>
            <span
              className={`${styles.clock} hg-numeric${remaining <= 60_000 ? ` ${styles.clockLow}` : ''}`}
              /* Named, because on its own it is four characters that could be
                 anything, and announced once a minute rather than every second:
                 a live region that updated 480 times would be unusable. */
              aria-label={`${t('levelTest:timeLeft')} ${clock}`}
              aria-live={remaining % 60_000 < 1000 ? 'polite' : 'off'}
            >
              {clock}
            </span>
          </span>
        }
      />
      <div className={styles.body}>
        <p className={styles.prompt}>{t(`levelTest:ask.${current.kind}`)}</p>
        <Card padding="lg" className={styles.stimulus}>
          <p
            className={korean ? styles.korean : styles.meaning}
            lang={rendered.promptLocale}
            dir={korean ? 'ltr' : undefined}
            style={korean ? { fontFamily: textFamily(font) } : undefined}
          >
            {rendered.prompt}
          </p>
        </Card>

        {/* Read by assistive tech only; the sighted cue is the next question arriving. */}
        <p className="hg-sr-only" role="status" aria-live="polite" data-testid="level-announce">
          {announce}
        </p>

        <ul className={styles.options} role="group" aria-label={t('levelTest:optionsLabel')}>
          {rendered.options.map((option, index) => (
            <li key={option.text}>
              <button
                type="button"
                className={styles.option}
                /*
                  The language each string is *actually* in, from the resolver.

                  It used to be `lang={kind === 'meaning' ? 'en' : 'ko'}` —
                  the markup asserting that every meaning option was English,
                  which was true and was the defect. It now says what the
                  resolver resolved, which is what a screen reader and a
                  regression test both need.
                */
                lang={option.resolvedLocale}
                dir={option.resolvedLocale === 'ko' ? 'ltr' : undefined}
                data-resolved-locale={option.resolvedLocale}
                style={
                  option.resolvedLocale === 'ko' ? { fontFamily: textFamily(font) } : undefined
                }
                data-testid="level-option"
                onClick={() => answer(option.correct ? 'correct' : 'wrong', index)}
              >
                {option.text}
              </button>
            </li>
          ))}
        </ul>

        {/*
          Not a give-up button. It is an answer, weighted as one, and the model
          reads it as cleaner evidence than a wrong guess — see `likelihood`.
        */}
        <button
          type="button"
          className={styles.unknown}
          onClick={() => answer('unknown')}
          data-testid="level-unknown"
        >
          {t('levelTest:unknown')}
        </button>
      </div>
    </div>
  );
}
