import { useTranslation } from 'react-i18next';

import { conjugationTable, type Form } from '@hangyul-ganada/korean-morphology';

import styles from './Conjugation.module.css';

/**
 * 활용 — how a verb or adjective actually appears in a sentence.
 *
 * ## Why a word card needs this at all
 *
 * Korean never writes the dictionary form. A learner who has met 먹다 on a card
 * and then reads 먹었어요 in a sentence has, as far as they can tell, met a
 * different word — and a dictionary that gives them 먹다 and stops has answered
 * the question they could already answer. The five or six forms below are what
 * turns a headword into something a beginner can recognise in the wild.
 *
 * ## Why these forms and not a paradigm
 *
 * Because a paradigm is a reference and this is a card. Korean has hundreds of
 * endings; a learner in their first year needs the polite present, the polite
 * past, the future, the formal register they will hear in announcements, the
 * connective that joins two clauses, and — for verbs — the two ways of asking
 * somebody to do something. Everything else is a grammar book, and printing it
 * here would bury the six that matter.
 *
 * ## What it refuses to print
 *
 * An imperative of an adjective. "Please be cold" is not a sentence, and a card
 * that showed one would be teaching a mistake with the authority of a table.
 * `conjugate` returns null for those and they are simply absent — see
 * `takesImperative`.
 *
 * ## Where the forms come from
 *
 * `@hangyul-ganada/korean-morphology`, which is the only conjugator in this
 * repository and is checked against every verb and adjective in the teaching
 * corpus by `npm run conjugation:qa` — 1,303 hand-authored surface forms, all
 * reproduced. A wrong form here would be worse than no panel, so the panel is
 * only as good as that check, and that check is the reason to trust it.
 */
export function Conjugation({
  lemma,
  partOfSpeech,
  fontFamily,
}: {
  lemma: string;
  partOfSpeech: string;
  fontFamily?: string;
}) {
  const { t } = useTranslation(['vocabulary']);
  if (partOfSpeech !== 'verb' && partOfSpeech !== 'adjective') return null;

  const rows = conjugationTable(lemma, { partOfSpeech }).filter(
    // The 아/어 stem and the adnominal are building blocks rather than things a
    // learner says: 먹어 on its own is blunt, and 먹는 only exists in front of a
    // noun. They are generated because the rest is built on them, and they are
    // not shown because neither is a sentence.
    (row) => row.form !== 'infinitive' && row.form !== 'adnominal',
  );
  if (rows.length === 0) return null;

  return (
    <section className={styles.panel} aria-labelledby="conjugation-heading" data-testid="conjugation">
      <h2 id="conjugation-heading" className={styles.heading}>
        {t('vocabulary:conjugation.title')}
      </h2>
      <dl className={styles.rows}>
        {rows.map((row) => (
          <div key={row.form} className={styles.row}>
            <dt className={styles.label}>{t(`vocabulary:conjugation.form.${row.form as Form}`)}</dt>
            <dd className={styles.value} lang="ko" dir="ltr" style={{ fontFamily }}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
