import { useTranslation } from 'react-i18next';
import type { CurriculumUnit } from '@hangyul-ganada/shared-types';

import { HangyulMascot } from '../../ui/HangyulMascot';
import { SyllableEquation } from './SyllableEquation';
import styles from './UnitIntro.module.css';

/**
 * The explainer before a unit that needs one.
 *
 * Three moments in the curriculum are conceptual rather than mechanical: what
 * this writing system *is* before the first letter, how letters stack into a
 * block before the first syllable, and what a consonant at the foot of a block
 * does before the first 받침. A learner who meets 각 without ever being told
 * that blocks are read top-to-bottom will invent a wrong rule and keep it.
 *
 * Everywhere else there is no explainer, on purpose. A screen of prose between
 * a learner and the practice is an obstacle, not a lesson.
 *
 * The copy lives in `learning.json` under `units.<id>.*` so it translates like
 * everything else; the illustration is built from the Korean itself, which does
 * not.
 *
 * The button that leaves this screen is **not** here. It belongs to the
 * session's `FocusScreen` footer, which is the only place in a learning screen
 * that knows how much of the foot of the phone belongs to Android — see
 * `ui/FocusScreen.tsx`.
 */
export function UnitIntro({ unit }: { unit: CurriculumUnit }) {
  const { t } = useTranslation('learning');
  const key = `units.${unit.id}`;
  const points = t(`${key}.points`, { returnObjects: true }) as unknown;
  const bullets = Array.isArray(points) ? (points as string[]) : [];

  return (
    <section className={styles.intro} aria-labelledby="unit-intro-title">
      <HangyulMascot mood="happy" size={64} />
      <h2 id="unit-intro-title" className={styles.title}>
        {t(`${key}.title`)}
      </h2>
      <p className={styles.body}>{t(`${key}.body`)}</p>

      {unit.intro_diagram &&
        (unit.intro_diagram.includes('=') ? (
          // An equation: drawn as tiles, because "letters go into a box" is a
          // shape a beginner has to see rather than read.
          <SyllableEquation diagram={unit.intro_diagram} />
        ) : (
          // A plain preview of the letters this unit teaches. Korean, laid out
          // as the writing system lays it out — never mirrored, never
          // reordered, whatever the interface language is doing.
          <p className={styles.diagram} lang="ko" dir="ltr">
            {unit.intro_diagram}
          </p>
        ))}

      {bullets.length > 0 && (
        <ul className={styles.points}>
          {bullets.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
