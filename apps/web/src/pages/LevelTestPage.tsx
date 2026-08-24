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
  TIME_LIMIT_MS,
  type AskedItem,
  type ItemKind,
  estimate,
  nextLevel,
  planKinds,
  shouldStop,
} from '../domain/levelTest';
import type { LevelTestItem, RenderedItem } from '../domain/levelTestTypes';
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
 * A placement, not a lesson and not a certificate. **Thirty questions, eight
 * minutes**, one clock over the whole sitting and none on any single question.
 * It reports a position on the Hangyul Vocabulary Level ladder — level 5 is
 * roughly the first 735 words of Korean by frequency, level 30 beyond 10,635 —
 * with a confidence band.
 *
 * The count is fixed and the *difficulty* adapts. It used to be the other way
 * about: the sitting stopped when the estimate was sure enough, so the intro
 * screen had to promise "18 to 36 questions, 3 to 6 minutes", which is four
 * numbers and no answer to the only question somebody about to start has.
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
 * and nowhere else. No progress, no memory, no session, no streak. Sitting the
 * test five times changes nothing about what the app will teach next.
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
  const { state, saveLevelTestResult } = useLearner();
  const { locale } = useLocale();
  const font = getFont(state.settings.selected_font_id);

  const [bank, setBank] = useState<LevelTestBank | null>(null);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [asked, setAsked] = useState<AskedItem[]>([]);
  /** Item ids asked most recently, newest first. Feeds the word cooldown. */
  const recentWords = useRef<string[]>([]);
  const [current, setCurrent] = useState<LevelTestItem | null>(null);
  const [done, setDone] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const used = useRef<Set<string>>(new Set());
  const seen = useRef<string[]>([]);
  /** Which kind each of the thirty is. Fixed when the sitting starts. */
  const kinds = useRef<ItemKind[]>(planKinds());

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

  /** Picks the next question, or ends the sitting. */
  const advance = useCallback(
    (history: AskedItem[]) => {
      if (!bank) return;
      if (shouldStop(history)) {
        setDone(true);
        setCurrent(null);
        return;
      }
      /*
        The plan says what kind; the model says what level.

        The two are chosen independently and then reconciled here, because the
        contextual bank is thin at the top of the scale — level 27 has one item
        — and a sitting that insisted on its twelfth contextual question at
        level 27 would either repeat one or stop. So the kind is a preference:
        the wanted kind at the wanted level, then the wanted kind at a
        neighbouring level, then any kind at the wanted level.
      */
      const wanted = kinds.current[history.length] ?? 'meaning';
      const open = [...bank.byLevel.keys()].filter((level) =>
        (bank.byLevel.get(level) ?? []).some((item) => !used.current.has(item.id)),
      );
      const level = nextLevel(history, open);
      if (level === null) {
        setDone(true);
        setCurrent(null);
        return;
      }

      const unused = (list: readonly LevelTestItem[] | undefined) =>
        (list ?? []).filter((item) => !used.current.has(item.id));

      let pool = unused(bank.byLevelKind.get(levelKind(level, wanted)));
      if (pool.length === 0) {
        for (const nearby of [level - 1, level + 1, level - 2, level + 2]) {
          pool = unused(bank.byLevelKind.get(levelKind(nearby, wanted)));
          if (pool.length > 0) break;
        }
      }
      if (pool.length === 0) pool = unused(bank.byLevel.get(level));
      if (pool.length === 0) {
        setDone(true);
        setCurrent(null);
        return;
      }

      /*
        Not the same word twice in a row, whatever kind the two questions are.

        `used` holds item ids, and one word has several: 끝없다 owns both
        word_kkeuteopda:context and word_kkeuteopda:meaning. So a sitting could
        end one question by revealing 끝없다 as the answer and open the next with
        끝없다 · 이 단어는 무슨 뜻일까요?, which is not a question — the learner
        was looking at the answer a second ago. It was reported from a device
        and it is the sort of thing that makes an adaptive test feel random.

        The word id is the part of the item id before the colon, so no data
        change is needed to group them. Spacing is a preference and finishing
        the sitting is the contract, so if honouring it would empty the pool the
        cooldown is dropped rather than the question.
      */
      const wordOf = (id: string) => id.split(':')[0]!;
      const cooling = new Set(recentWords.current.slice(0, WORD_COOLDOWN).map(wordOf));
      const spaced = pool.filter((item) => !cooling.has(wordOf(item.id)));
      const respectful = spaced.length > 0 ? spaced : pool;

      const fresh = respectful.filter((item) => !previous.has(item.id));
      const from = fresh.length > 0 ? fresh : respectful;
      const item = from[Math.floor(Math.random() * from.length)]!;
      used.current.add(item.id);
      recentWords.current.unshift(item.id);
      seen.current.unshift(item.id);
      setCurrent(item);
    },
    [bank, previous],
  );

  /**
   * The clock, and what happens when it stops.
   *
   * One deadline for the sitting, set when the first question appears rather
   * than when the learner taps Start, so that the seconds spent waiting for the
   * bank to arrive are not charged to them.
   *
   * On expiry the sitting is **scored, not discarded**. Everything answered is
   * evidence; everything unanswered is read as "I don't know", which is exactly
   * what running out of time on a question means and is a response the model
   * already understands. Throwing the sitting away would punish the learner for
   * the one thing the test asked them to do — think about it.
   */
  useEffect(() => {
    if (deadline === null || done) return undefined;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [deadline, done]);

  useEffect(() => {
    if (deadline === null || done || now < deadline) return;
    setAsked((history) => {
      const remaining = Math.max(0, ITEM_COUNT - history.length);
      const level = current?.level ?? history[history.length - 1]?.level ?? 1;
      return [
        ...history,
        ...Array.from({ length: remaining }, () => ({ level, response: 'unknown' as const })),
      ];
    });
    setDone(true);
    setCurrent(null);
  }, [now, deadline, done, current]);

  useEffect(() => {
    if (bank && started && !current && !done) {
      advance([]);
      setDeadline((existing) => existing ?? Date.now() + TIME_LIMIT_MS);
    }
  }, [bank, started, current, done, advance]);

  const answer = (response: AskedItem['response']) => {
    if (!current) return;
    const history = [...asked, { level: current.level, response }];
    setAsked(history);
    advance(history);
  };

  const result = useMemo(() => estimate(asked), [asked]);

  /*
    Written once, when the sitting ends.

    In an effect rather than in the click that finished it, so a learner who
    closes the app on the last question still has their result — and guarded, so
    a re-render cannot write it twice.
  */
  const saved = useRef(false);
  useEffect(() => {
    if (!done || saved.current || asked.length === 0) return;
    saved.current = true;
    saveLevelTestResult({
      level: result.reported,
      low: result.low,
      high: result.high,
      items: asked.length,
      takenAt: new Date().toISOString(),
      recentItems: seen.current,
    });
  }, [done, asked.length, result, saveLevelTestResult]);

  if (!started) {
    return (
      <div className={styles.page}>
        <AppHeader title={t('levelTest:title')} onBack={() => navigate(-1)} />
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
            {t('levelTest:intro.shape', { questions: ITEM_COUNT, minutes: TIME_LIMIT_MS / 60000 })}
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
        <AppHeader title={t('levelTest:title')} onBack={() => navigate(-1)} />
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
        <AppHeader title={t('levelTest:title')} onBack={() => navigate('/me')} />
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

  const remaining = deadline === null ? TIME_LIMIT_MS : Math.max(0, deadline - now);
  const clock = `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`;

  if (!bank || !current) {
    return (
      <div className={styles.page}>
        <AppHeader title={t('levelTest:title')} onBack={() => navigate(-1)} />
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
        onBack={() => navigate(-1)}
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

        <ul className={styles.options} role="group" aria-label={t('levelTest:optionsLabel')}>
          {rendered.options.map((option) => (
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
                onClick={() => answer(option.correct ? 'correct' : 'wrong')}
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
