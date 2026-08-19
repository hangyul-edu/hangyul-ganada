import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { getCharacterByGlyph } from '../data/characters';
import { getWord } from '../data/vocabulary';
import { wordCopy } from '../data/wordCopy';
import type { PracticePlan } from '../domain/plan';
import type { ExerciseMode } from '../domain/review';
import { useLocale } from '../i18n';
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
 * ## One number, and it is the session
 *
 * This screen used to say *8 questions*, and Start opened a page reading "not
 * found". Both numbers were computed honestly from different things: the screen
 * counted what the scheduler thought was worth asking, and the session counted
 * what could actually be turned into a question after the interleaving rules
 * and the option generators had had their say.
 *
 * There is now one object. `practicePlan()` resolves a plan in which every item
 * has already been proved to produce a question; this screen prints its count
 * and hands the same plan to the session. See `domain/plan.ts`.
 *
 * ## Modes that lead somewhere
 *
 * Reading, Listening and Writing each get their own resolved plan before the
 * button is drawn, so a mode with nothing behind it is shown as having nothing
 * rather than offered and then apologised for. **Writing is letters and
 * syllables only** — no word has a writing skill, so the scheduler cannot put
 * one in a writing plan and this screen cannot offer one.
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
  // Hangul formation only. See the note above, and `WORD_SKILLS`.
  { mode: 'write', key: 'write' },
];

/** How many items the preview lists before it stops. */
const PREVIEW = 8;

export function ReviewPage() {
  const navigate = useNavigate();
  const { practicePlan, reviewSummary, mistakes } = useLearner();
  const { t } = useTranslation(['learning', 'common']);
  const { locale } = useLocale();

  // The plan Start will run. Resolved here, once, and carried to the session
  // rather than rebuilt there — see `handoff` below.
  const plan = useMemo(() => practicePlan(), [practicePlan]);
  const modes = useMemo(
    () => MANUAL_MODES.map((entry) => ({ ...entry, plan: practicePlan({ mode: entry.mode }) })),
    [practicePlan],
  );

  /**
   * The items coming up, one row per item.
   *
   * Read off the plan rather than off the scheduler, so this lists the things
   * the learner is about to be asked about and not the things that were
   * considered. Deduplicated by item: ㄱ appearing three times because three
   * different things about it are weak is a list that looks broken, and how
   * many ways it will be asked is the scheduler's business.
   */
  const upcoming = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ kind: 'character' | 'word'; itemKey: string }> = [];
    for (const item of plan.items) {
      const key = `${item.kind}:${item.itemKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ kind: item.kind, itemKey: item.itemKey });
      if (rows.length >= PREVIEW) break;
    }
    return rows;
  }, [plan]);

  /**
   * Hands a resolved plan to the session.
   *
   * Through the router's own state, which survives the navigation and is
   * structured-cloneable. The session resolves its own plan if it arrives
   * without one — a deep link, a refresh — but on the path a learner actually
   * takes, the plan the screen counted *is* the plan that runs.
   */
  const start = (chosen: PracticePlan, search = '') => {
    navigate(`/review/session${search}`, { state: { plan: chosen } });
  };

  if (plan.count === 0) {
    return (
      <div className={styles.page}>
        <AppHeader title={t('learning:review.title')} />
        <div className={`${styles.body} ${styles.bodyEmpty}`}>
          <Card tone="warm" padding="lg" className={styles.empty}>
            <HangyulMascot mood="happy" size={72} />
            <p className={styles.emptyTitle}>{t('learning:review.empty.title')}</p>
            <p className={styles.emptyBody}>{t('learning:review.empty.body')}</p>
            <Link to="/letters" className={styles.emptyLink}>
              {t('learning:review.empty.cta')}
              <ChevronRightIcon size={16} />
            </Link>
          </Card>

          {/*
            Nothing due is not the same as nothing to do.
            
            The learner's own two lists stay reachable on a quiet day — that is
            the day somebody is most likely to want to look back at what they
            got wrong, and a screen that offers only "come back later" hides the
            two things they can still act on.
          */}
          <div className={styles.owned}>
            <Link to="/review/mistakes" className={styles.savedRow}>
              <span className={styles.savedLabel}>{t('learning:mistakes.title')}</span>
              <span className={`${styles.savedCount} hg-numeric`}>{mistakes.length}</span>
              <ChevronRightIcon size={16} />
            </Link>
            <Link to="/words/saved" className={styles.savedRow}>
              <span className={styles.savedLabel}>{t('learning:review.savedWords')}</span>
              <span className={`${styles.savedCount} hg-numeric`}>{reviewSummary.saved}</span>
              <ChevronRightIcon size={16} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader title={t('learning:review.title')} />

      <div className={styles.body}>
        <Card tone="featured" padding="lg" className={styles.start}>
          <p className={styles.startTitle}>{t('learning:review.forYou')}</p>
          {/*
            `plan.count`, which is `plan.items.length`. Not a prediction of how
            long the session will be — the session it names.
          */}
          <p className={styles.startBody} data-testid="review-length">
            {t('learning:review.sessionLength', { count: plan.count })}
          </p>
          <Button size="lg" fullWidth onClick={() => start(plan)}>
            {t('learning:review.startCta')}
          </Button>
        </Card>

        {/*
          Two counts, not three.

          "Needs practice" is *I keep losing these* and "Due today" is *these
          are fading*, and both are things a learner can recognise about
          themselves. A third row counted saved words, which is a different kind
          of fact — a list they made — and it now sits with the button that
          opens it rather than in a column of scheduler output.
        */}
        <ul className={styles.counts}>
          <CountRow
            label={t('learning:review.needsPractice')}
            value={reviewSummary.needsPractice}
          />
          <CountRow label={t('learning:review.dueToday')} value={reviewSummary.dueToday} />
        </ul>

        <section aria-labelledby="review-modes">
          <h2 id="review-modes" className={styles.sectionTitle}>
            {t('learning:review.chooseMode')}
          </h2>
          <div className={styles.modes}>
            {modes.map(({ mode, key, plan: modePlan }) => (
              <button
                key={mode}
                type="button"
                className={styles.mode}
                onClick={() => start(modePlan, `?mode=${mode}`)}
                /*
                 * Disabled rather than hidden, and with its count beside it.
                 *
                 * A mode that vanishes on days it has nothing is a mode the
                 * learner cannot learn the shape of; one that is visibly empty
                 * says "not today" and stays where it was yesterday. Either way
                 * it cannot be pressed into a dead end — which it could, and
                 * did, when availability was decided after Start.
                 */
                disabled={modePlan.count === 0}
                aria-disabled={modePlan.count === 0}
              >
                <span>{t(`learning:review.mode.${key}`)}</span>
                <span className={`${styles.modeCount} hg-numeric`}>{modePlan.count}</span>
              </button>
            ))}
          </div>
          {modes.every((entry) => entry.plan.count === 0) && (
            <p className={styles.modeNote} role="status">
              {t('learning:review.modesEmpty')}
            </p>
          )}
        </section>

        {/*
          The two lists the learner owns, as rows rather than as counts in a
          column of scheduler output — §41. Saved words are *their* choice and
          the notebook is a record of what happened; neither is the scheduler
          telling them what is fading, which is what the numbers above are.
        */}
        <div className={styles.owned}>
          <Link to="/review/mistakes" className={styles.savedRow}>
            <span className={styles.savedLabel}>{t('learning:mistakes.title')}</span>
            <span className={`${styles.savedCount} hg-numeric`}>{mistakes.length}</span>
            <ChevronRightIcon size={18} />
          </Link>
          <Link to="/words/saved" className={styles.savedRow}>
            <span className={styles.savedLabel}>{t('learning:review.savedWords')}</span>
            <span className={`${styles.savedCount} hg-numeric`}>{reviewSummary.saved}</span>
            <ChevronRightIcon size={18} />
          </Link>
        </div>

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
      </div>
    </div>
  );
}

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <li className={styles.count}>
      <span className={styles.countLink}>
        <span className={styles.countLabel}>{label}</span>
        <span className={`${styles.countValue} hg-numeric`}>{value}</span>
      </span>
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
