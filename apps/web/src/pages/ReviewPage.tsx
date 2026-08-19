import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { getCharacterByGlyph } from '../data/characters';
import { getWord } from '../data/vocabulary';
import { wordCopy } from '../data/wordCopy';
import { candidates, type ExerciseMode } from '../domain/review';
import { useFormatters, useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { HangyulMascot } from '../ui/HangyulMascot';
import { LocalizedText } from '../ui/LocalizedText';
import { SpeakerButton } from '../ui/SpeakerButton';
import { ChevronRightIcon } from '../ui/icons';
import styles from './ReviewPage.module.css';

/**
 * Review.
 *
 * ## What the learner is offered
 *
 * One button. *Review for you* is the scheduler's recommendation and it is the
 * default because it is almost always the right answer — it knows which skill
 * for which item is weakest, and a learner does not.
 *
 * Under it, three counts a person can act on: **needs practice** (I keep losing
 * these), **due today** (these are fading), **saved** (I chose these). And
 * below those, the manual modes, for the learner who wants to spend ten minutes
 * only on listening. They are secondary, not hidden: a paid product should let
 * someone practise the thing they came to practise.
 *
 * ## What is deliberately not here
 *
 * No stability, no difficulty coefficient, no predicted recall percentage.
 * Those numbers decide what this screen offers and none of them is on it. A
 * learner cannot act on "stability 4.7", and showing it invites optimising the
 * number instead of learning Korean.
 */

const MANUAL_MODES: Array<{ mode: ExerciseMode; key: string }> = [
  { mode: 'read', key: 'read' },
  { mode: 'listen', key: 'listen' },
  { mode: 'write', key: 'write' },
];

/** How many items the preview lists before it stops. */
const PREVIEW = 8;

export function ReviewPage() {
  const navigate = useNavigate();
  const { state, reviewSummary } = useLearner();
  const { t } = useTranslation(['learning', 'common']);
  const { locale } = useLocale();
  const format = useFormatters();

  // The same function the session builder uses, so what this screen previews
  // and what the session contains cannot disagree.
  //
  // One row per *item*, though, where `candidates` returns one per item and
  // skill. A learner reading this list is answering "what is coming up", and
  // ㄱ listed three times because three different things about it are weak is
  // a list that looks broken — the fact that it will be asked three ways is
  // the scheduler's business, not theirs.
  const upcoming = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ kind: 'character' | 'word'; itemKey: string }> = [];
    for (const candidate of candidates(state.progress, state.memory, new Date())) {
      const key = `${candidate.kind}:${candidate.itemKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ kind: candidate.kind, itemKey: candidate.itemKey });
      if (rows.length >= PREVIEW) break;
    }
    return rows;
  }, [state.progress, state.memory]);

  const empty = reviewSummary.total === 0;

  return (
    <div className={styles.page}>
      <AppHeader title={t('learning:review.title')} />

      <div className={`${styles.body} ${empty ? styles.bodyEmpty : ''}`}>
        {empty ? (
          <Card tone="warm" padding="lg" className={styles.empty}>
            <HangyulMascot mood="happy" size={72} />
            <p className={styles.emptyTitle}>{t('learning:review.empty.title')}</p>
            <p className={styles.emptyBody}>{t('learning:review.empty.body')}</p>
            <Link to="/letters" className={styles.emptyLink}>
              {t('learning:review.empty.cta')}
              <ChevronRightIcon size={16} />
            </Link>
          </Card>
        ) : (
          <>
            <Card tone="featured" padding="lg" className={styles.start}>
              <p className={styles.startTitle}>{t('learning:review.forYou')}</p>
              <p className={styles.startBody}>
                {t('learning:review.sessionLength', { count: reviewSummary.sessionSize })}
              </p>
              <Button size="lg" fullWidth onClick={() => navigate('/review/session')}>
                {t('learning:review.startCta')}
              </Button>
            </Card>

            <ul className={styles.counts}>
              <CountRow
                label={t('learning:review.needsPractice')}
                value={format.number(reviewSummary.needsPractice)}
              />
              <CountRow
                label={t('learning:review.dueToday')}
                value={format.number(reviewSummary.dueToday)}
              />
              <CountRow
                label={t('learning:review.savedWords')}
                value={format.number(reviewSummary.saved)}
                to={reviewSummary.saved > 0 ? '/review/session?set=saved' : undefined}
              />
            </ul>

            <section aria-labelledby="review-modes">
              <h2 id="review-modes" className={styles.sectionTitle}>
                {t('learning:review.chooseMode')}
              </h2>
              <div className={styles.modes}>
                {MANUAL_MODES.map(({ mode, key }) => (
                  <Link key={mode} to={`/review/session?mode=${mode}`} className={styles.mode}>
                    {t(`learning:review.mode.${key}`)}
                  </Link>
                ))}
              </div>
            </section>

            <section aria-labelledby="review-next">
              <h2 id="review-next" className={styles.sectionTitle}>
                {t('learning:review.comingUp')}
              </h2>
              <ul className={styles.list}>
                {upcoming.map((row) => (
                  <PreviewRow
                    key={`${row.kind}:${row.itemKey}`}
                    kind={row.kind}
                    itemKey={row.itemKey}
                    locale={locale}
                  />
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function CountRow({ label, value, to }: { label: string; value: string; to?: string }) {
  const inner = (
    <>
      <span className={styles.countLabel}>{label}</span>
      <span className={`${styles.countValue} hg-numeric`}>{value}</span>
      {to && <ChevronRightIcon size={18} />}
    </>
  );
  return (
    <li className={styles.count}>
      {to ? (
        <Link to={to} className={styles.countLink}>
          {inner}
        </Link>
      ) : (
        <span className={styles.countLink}>{inner}</span>
      )}
    </li>
  );
}

/**
 * One item in the preview.
 *
 * What it is and how it sounds, and nothing about why it was chosen. The row
 * used to say "missed 3 times", which is true, discouraging, and not something
 * a learner can do anything about from a list.
 */
function PreviewRow({
  kind,
  itemKey,
  locale,
}: {
  kind: 'character' | 'word';
  itemKey: string;
  locale: string;
}) {
  const character = kind === 'character' ? getCharacterByGlyph(itemKey) : undefined;
  const word = kind === 'word' ? getWord(itemKey) : undefined;

  if (kind === 'character') {
    return (
      <li className={styles.row}>
        <span className={styles.rowGlyph} lang="ko" dir="ltr">
          {itemKey}
        </span>
        <span className={styles.rowText}>
          <span className={styles.rowPrimary}>{character?.romanization ?? itemKey}</span>
        </span>
        <SpeakerButton
          audioId={character?.audio.sound}
          label={character?.sound_example ?? itemKey}
          size="sm"
          tone="plain"
        />
      </li>
    );
  }

  if (!word) return null;
  const meaning = wordCopy(word, locale);
  return (
    <li className={styles.row}>
      <span className={styles.rowWord} lang="ko" dir="ltr">
        {word.word}
      </span>
      <span className={styles.rowText}>
        <LocalizedText as="span" locale={meaning.locale} className={styles.rowPrimary}>
          {meaning.value.meaning}
        </LocalizedText>
      </span>
      <SpeakerButton audioId={word.audio.word} label={word.word} size="sm" tone="plain" />
    </li>
  );
}
