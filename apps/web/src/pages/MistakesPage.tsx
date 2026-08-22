import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { getCharacterByGlyph } from '../data/characters';
import { getWord } from '../data/vocabulary';
import { wordCopy } from '../data/wordCopy';
import type { Mistake } from '../domain/mistakes';
import { SessionSize } from '../features/review/SessionSize';
import { defaultSessionSize } from '../features/review/sessionSizes';
import { useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { HangyulMascot } from '../ui/HangyulMascot';
import { LocalizedText } from '../ui/LocalizedText';
import { SpeakerButton } from '../ui/SpeakerButton';
import { ChevronRightIcon } from '../ui/icons';
import styles from './ListPage.module.css';

type Filter = 'all' | 'character' | 'word';

/**
 * The wrong-answer notebook: what the learner actually got wrong.
 *
 * ## Collected, never saved
 *
 * §35: the learner does not save a mistake. Every answer in the app is reported
 * through one function, and that function writes the notebook — so a mistake
 * made in a daily session, in review, in a saved-words session or in a lesson
 * all arrive here identically, and none of them depends on a screen having
 * remembered to.
 *
 * ## What a row has to say, and what it must not
 *
 * Three things, in the order somebody asks them: *what was it*, *what did I
 * put*, *what was right*. Plus how often it has happened, because two is a
 * different situation from seven.
 *
 * What it does not say is anything about scheduling. There is no next-review
 * date, no memory strength, no priority. The notebook is a record of the past;
 * what to do about it is the Review screen's business, and putting the
 * scheduler's reasoning here would be two screens explaining the same model
 * and neither of them being about the learner.
 *
 * ## Fixed mistakes leave
 *
 * §39. Answer it right twice and it stops appearing, without being forgotten —
 * the history is what tells the scheduler this item is genuinely hard for this
 * learner. The switch is there for anyone who wants to look back at what they
 * used to get wrong, which is a genuinely encouraging thing to be able to do.
 */
export function MistakesPage() {
  const navigate = useNavigate();
  const { mistakes, practicePlan, clearMistake, state } = useLearner();
  const { t } = useTranslation(['learning', 'vocabulary', 'common']);
  const { locale } = useLocale();

  /*
    Vocabulary first, because that is the list the learner came for.

    The notebook holds letter mistakes too and it should — one wrong-answer
    system, not two — but "wrong vocabulary" is what the Review hub offers and
    what somebody is looking for when they open it. Letters are one tap away and
    are never mixed into the vocabulary practice session.
  */
  const [filter, setFilter] = useState<Filter>('word');
  const [size, setSize] = useState<number | null>(null);

  const shown = useMemo(
    () => (filter === 'all' ? mistakes : mistakes.filter((row) => row.kind === filter)),
    [mistakes, filter],
  );

  const full = useMemo(() => practicePlan({ mistakesOnly: true }), [practicePlan]);
  const chosen = size ?? defaultSessionSize(full.count);
  const plan = useMemo(
    () => practicePlan({ mistakesOnly: true, size: Math.max(1, chosen) }),
    [practicePlan, chosen],
  );

  if (mistakes.length === 0) {
    return (
      <div className={styles.page}>
        <AppHeader title={t('learning:mistakes.title')} onBack={() => navigate('/review')} />
        <div className={`${styles.body} ${styles.bodyEmpty}`}>
          <Card tone="warm" padding="lg" className={styles.empty}>
            <HangyulMascot mood="happy" size={64} />
            <p className={styles.emptyTitle}>{t('learning:mistakes.emptyTitle')}</p>
            <p className={styles.emptyBody}>{t('learning:mistakes.emptyBody')}</p>
            <Link to="/review" className={styles.emptyLink}>
              {t('learning:mistakes.emptyCta')}
              <ChevronRightIcon size={16} />
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader title={t('learning:mistakes.title')} onBack={() => navigate('/review')} />

      <div className={styles.body}>
        {/*
          One button, and it runs the ordinary quiz engine — §40. Deliberately
          not a replay of the exact questions that were missed: the learner
          would be memorising a screen layout rather than the word. The session
          is built from the *items*, and asks about them however the scheduler
          would ask about anything else.
        */}
        {full.count > 0 && (
          <div className={styles.practice}>
            <SessionSize available={full.count} value={chosen} onChange={setSize} />
            <Button
              size="lg"
              fullWidth
              data-testid="practice-wrong"
              onClick={() => navigate('/review/session?set=mistakes', { state: { plan } })}
            >
              {t('learning:mistakes.review', { count: plan.count })}
            </Button>
          </div>
        )}

        <div className={styles.chips} role="group" aria-label={t('learning:mistakes.filterLabel')}>
          {(['word', 'character', 'all'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`${styles.chip} ${filter === option ? styles.chipOn : ''}`}
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
            >
              {t(`learning:mistakes.filter.${option}`)}
            </button>
          ))}
        </div>

        <ul className={styles.list}>
          {shown.map((mistake) => (
            <MistakeRow
              key={mistake.id}
              mistake={mistake}
              locale={locale}
              fontFamily={state.settings.selected_font_id}
              onOpen={() =>
                mistake.kind === 'word'
                  ? navigate(`/words/word/${mistake.itemKey}`)
                  : navigate('/letters')
              }
              onClear={() => clearMistake(mistake.id)}
            />
          ))}
        </ul>

        {shown.length === 0 && (
          <p className={styles.none} role="status">
            {t('learning:mistakes.noneOfKind')}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One mistake.
 *
 * The learner's answer and the right one are looked up from the ids stored on
 * the row, not from text saved at the time. Text saved at the time would be in
 * whatever language the interface was in when the mistake happened, and would
 * still be in it after they switched languages — a notebook half in German is
 * worse than one that occasionally cannot name an old wrong answer.
 */
function MistakeRow({
  mistake,
  locale,
  onOpen,
  onClear,
}: {
  mistake: Mistake;
  locale: string;
  fontFamily: string;
  onOpen: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation(['learning', 'common']);
  const label = describe(mistake.kind, mistake.itemKey, locale);
  const chosen = mistake.chose ? describe(mistake.kind, mistake.chose, locale) : null;
  const audioId =
    mistake.kind === 'word'
      ? getWord(mistake.itemKey)?.audio.word
      : getCharacterByGlyph(mistake.itemKey)?.audio.sound;

  return (
    <li>
      <Card padding="md" className={styles.mistake}>
        <div className={styles.mistakeHead}>
          <button type="button" className={styles.rowMain} onClick={onOpen}>
            <span className={styles.rowWord} lang="ko" dir="ltr">
              {label.korean}
            </span>
            <span className={styles.rowText}>
              <LocalizedText as="span" locale={label.locale} className={styles.rowMeaning}>
                {label.meaning}
              </LocalizedText>
            </span>
            <ChevronRightIcon size={18} />
          </button>
          <SpeakerButton audioId={audioId} label={label.korean} size="sm" tone="plain" />
        </div>

        <dl className={styles.answers}>
          {/*
            Both answers, each with what it means.
            
            The meanings are the teaching, and they were the part missing. A row
            reading "you put 우유 · answer 물" tells a learner they were wrong,
            which they knew. "you put 우유 — milk · answer 물 — water" tells them
            *what they confused it with*, which is the only thing on this screen
            that could stop it happening again.
            
            Nothing is generated to say it. Both meanings are already in the
            corpus and were already being looked up for the row above; they were
            simply not rendered. §35 asks the notebook to teach rather than log,
            and a short factual gloss is the version of that which cannot be
            wrong — unlike a sentence about *why* the two are confusable, which
            nothing here knows.
          */}
          {chosen && (
            <div className={styles.answerRow}>
              <dt>{t('learning:mistakes.youPut')}</dt>
              <dd className={styles.wrongAnswer}>
                <span lang="ko" dir="ltr">
                  {chosen.korean}
                </span>
                {chosen.meaning && (
                  <LocalizedText as="span" locale={chosen.locale} className={styles.gloss}>
                    {chosen.meaning}
                  </LocalizedText>
                )}
              </dd>
            </div>
          )}
          <div className={styles.answerRow}>
            <dt>{t('learning:mistakes.answer')}</dt>
            <dd className={styles.rightAnswer}>
              <span lang="ko" dir="ltr">
                {label.korean}
              </span>
              {label.meaning && (
                <LocalizedText as="span" locale={label.locale} className={styles.gloss}>
                  {label.meaning}
                </LocalizedText>
              )}
            </dd>
          </div>
        </dl>

        <div className={styles.mistakeFoot}>
          {/* Only once it has happened more than once. "Wrong 1 time" is a
              sentence that adds nothing to a list of things you got wrong. */}
          {mistake.wrongCount > 1 && (
            <span className={styles.times}>
              {t('learning:mistakes.times', { count: mistake.wrongCount })}
            </span>
          )}
          <button type="button" className={styles.rowAction} onClick={onClear}>
            {t('learning:mistakes.clear')}
          </button>
        </div>
      </Card>
    </li>
  );
}

/** A learner-readable name for an item id, in their language. */
function describe(
  kind: ItemProgress['kind'],
  key: string,
  locale: string,
): { korean: string; meaning: string; locale: string } {
  if (kind === 'word') {
    const word = getWord(key);
    if (!word) return { korean: key, meaning: '', locale };
    const copy = wordCopy(word, locale);
    return { korean: word.word, meaning: copy.value.meaning, locale: copy.locale };
  }
  const character = getCharacterByGlyph(key);
  return { korean: key, meaning: character?.romanization ?? '', locale };
}
