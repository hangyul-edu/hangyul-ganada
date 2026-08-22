import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { loadLevelTestBank, type LevelTestBank } from '../data/levelTest';
import { getFont } from '../data/fonts';
import {
  CUMULATIVE_WORDS,
  LEVELS,
  MAX_ITEMS,
  type AskedItem,
  estimate,
  nextLevel,
  shouldStop,
} from '../domain/levelTest';
import type { LevelTestItem } from '../domain/levelTestTypes';
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
 * A placement, not a lesson and not a certificate. It reports a position on the
 * Hangyul Vocabulary Level ladder — level 5 is roughly the first 735 words of
 * Korean by frequency, level 30 beyond 10,635 — with a confidence band, and it
 * says in as many words that it is neither TOPIK nor CEFR and not a count of
 * words the learner knows.
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
export function LevelTestPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['levelTest', 'common']);
  const { state, saveLevelTestResult } = useLearner();
  const font = getFont(state.settings.selected_font_id);

  const [bank, setBank] = useState<LevelTestBank | null>(null);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [asked, setAsked] = useState<AskedItem[]>([]);
  const [current, setCurrent] = useState<LevelTestItem | null>(null);
  const [done, setDone] = useState(false);
  const used = useRef<Set<string>>(new Set());
  const seen = useRef<string[]>([]);

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

  useEffect(() => {
    if (!started || bank) return;
    let live = true;
    loadLevelTestBank().then(
      (loaded) => live && setBank(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [started, bank]);

  /** Picks the next question, or ends the sitting. */
  const advance = useCallback(
    (history: AskedItem[]) => {
      if (!bank) return;
      if (shouldStop(history)) {
        setDone(true);
        setCurrent(null);
        return;
      }
      const open = [...bank.byLevel.keys()].filter((level) =>
        (bank.byLevel.get(level) ?? []).some((item) => !used.current.has(item.id)),
      );
      const level = nextLevel(history, open);
      if (level === null) {
        setDone(true);
        setCurrent(null);
        return;
      }
      const pool = (bank.byLevel.get(level) ?? []).filter((item) => !used.current.has(item.id));
      const fresh = pool.filter((item) => !previous.has(item.id));
      const from = fresh.length > 0 ? fresh : pool;
      const item = from[Math.floor(Math.random() * from.length)]!;
      used.current.add(item.id);
      seen.current.unshift(item.id);
      setCurrent(item);
    },
    [bank, previous],
  );

  useEffect(() => {
    if (bank && started && !current && !done) advance([]);
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
          <Card tone="featured" padding="lg" className={styles.intro}>
            <h2 className={styles.introTitle}>{t('levelTest:intro.title')}</h2>
            <p className={styles.introBody}>{t('levelTest:intro.body')}</p>
            <ul className={styles.facts}>
              <li>{t('levelTest:intro.length')}</li>
              <li>{t('levelTest:intro.noHelp')}</li>
              <li>{t('levelTest:intro.noProgress')}</li>
            </ul>
            <Button size="lg" fullWidth onClick={() => setStarted(true)} data-testid="level-start">
              {state.settings.level_test ? t('levelTest:intro.retake') : t('levelTest:intro.start')}
            </Button>
          </Card>
          {state.settings.level_test && (
            <p className={styles.previous}>
              {t('levelTest:intro.previous', { level: state.settings.level_test.level })}
            </p>
          )}
          <p className={styles.disclaimer}>{t('levelTest:disclaimer')}</p>
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
    const words = CUMULATIVE_WORDS[Math.min(CUMULATIVE_WORDS.length, result.reported) - 1];
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
            <p className={styles.resultBand}>
              {t('levelTest:result.band', { low: result.low, high: result.high })}
            </p>
            <p className={styles.resultWords}>{t('levelTest:result.words', { count: words })}</p>
            <p className={styles.resultItems}>
              {t('levelTest:result.items', { count: asked.length })}
            </p>
          </Card>
          <p className={styles.disclaimer}>{t('levelTest:disclaimer')}</p>
          <Button size="lg" fullWidth onClick={() => navigate('/me')}>
            {t('common:actions.done')}
          </Button>
        </div>
      </div>
    );
  }

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

  const korean = current.kind !== 'produce';
  return (
    <div className={styles.page}>
      <AppHeader
        title={t('levelTest:title')}
        onBack={() => navigate(-1)}
        /* How far through, never how well. See the note at the top of the file. */
        action={
          <span className={`${styles.count} hg-numeric`}>
            {t('levelTest:progress', { asked: asked.length + 1, most: MAX_ITEMS })}
          </span>
        }
      />
      <div className={styles.body}>
        <p className={styles.prompt}>{t(`levelTest:ask.${current.kind}`)}</p>
        <Card padding="lg" className={styles.stimulus}>
          <p
            className={korean ? styles.korean : styles.meaning}
            lang={korean ? 'ko' : 'en'}
            dir="ltr"
            style={korean ? { fontFamily: font.font_family } : undefined}
          >
            {current.prompt}
          </p>
        </Card>

        <ul className={styles.options} role="group" aria-label={t('levelTest:optionsLabel')}>
          {current.options.map((option) => (
            <li key={option}>
              <button
                type="button"
                className={styles.option}
                lang={current.kind === 'meaning' ? 'en' : 'ko'}
                dir="ltr"
                style={current.kind === 'meaning' ? undefined : { fontFamily: font.font_family }}
                onClick={() => answer(option === current.answer ? 'correct' : 'wrong')}
              >
                {option}
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
