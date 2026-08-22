import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import type { PracticePlan } from '../domain/plan';
import type { ExerciseMode } from '../domain/review';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { HangyulMascot } from '../ui/HangyulMascot';
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
 * ## Three questions, three destinations
 *
 * A learner arriving here is asking one of three things, and the screen is now
 * built as those three and nothing else:
 *
 * * **What should I review?** — the card at the top, with the session behind it.
 * * **What did I save?** — Saved words.
 * * **What did I get wrong?** — Wrong vocabulary.
 *
 * What used to be here as well: two scheduler counts (*needs practice*, *due
 * today*) and a preview list of the next eight items. Both were true and
 * neither was a question anybody had. The counts restated the number on the
 * button in two other units, and the preview told a learner what they were
 * about to be asked before asking it. Five things competing on one screen is
 * why a learner has to read it rather than recognise it.
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

export function ReviewPage() {
  const navigate = useNavigate();
  const { practicePlan, reviewSummary, mistakes } = useLearner();
  const { t } = useTranslation(['learning', 'common']);

  /*
    Vocabulary only, on this row.

    The notebook holds letter mistakes too and the row that opens it says
    *wrong vocabulary*, so the number beside it has to be the number of words —
    a count that included letters would be a label and a figure describing two
    different things. The notebook screen itself shows both, split.
  */
  const wrongWords = useMemo(
    () => mistakes.filter((row) => row.kind === 'word').length,
    [mistakes],
  );

  // The plan Start will run. Resolved here, once, and carried to the session
  // rather than rebuilt there — see `handoff` below.
  const plan = useMemo(() => practicePlan(), [practicePlan]);
  const modes = useMemo(
    () => MANUAL_MODES.map((entry) => ({ ...entry, plan: practicePlan({ mode: entry.mode }) })),
    [practicePlan],
  );

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
          <Hub saved={reviewSummary.saved} wrong={wrongWords} />
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

        <Hub saved={reviewSummary.saved} wrong={wrongWords} />
      </div>
    </div>
  );
}

/**
 * The learner's own two lists, as two rows.
 *
 * The same component in both states of this screen, because they are the same
 * two destinations whether or not there is a session waiting — and a quiet day
 * is exactly when somebody is most likely to want to look at what they saved.
 */
function Hub({ saved, wrong }: { saved: number; wrong: number }) {
  const { t } = useTranslation(['learning', 'vocabulary']);
  return (
    <div className={styles.owned}>
      <Link to="/words/saved" className={styles.savedRow} data-testid="hub-saved">
        <span className={styles.savedLabel}>{t('vocabulary:saved.title')}</span>
        <span className={`${styles.savedCount} hg-numeric`}>{saved}</span>
        <ChevronRightIcon size={18} />
      </Link>
      <Link to="/review/mistakes" className={styles.savedRow} data-testid="hub-wrong">
        <span className={styles.savedLabel}>{t('learning:mistakes.wrongVocabulary')}</span>
        <span className={`${styles.savedCount} hg-numeric`}>{wrong}</span>
        <ChevronRightIcon size={18} />
      </Link>
    </div>
  );
}
