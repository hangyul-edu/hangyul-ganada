import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { PRODUCT, productName } from '../config/product';
import { PRACTICE_FONTS } from '../data/fonts';
import { CONTENT_SOURCES } from '../data/vocabulary';
import { useLocale } from '../i18n';
import { AppHeader } from '../ui/AppHeader';
import { Card } from '../ui/Card';
import styles from './LegalPage.module.css';

/**
 * The notices this app is legally required to carry, and nothing else.
 *
 * ## What changed, and why
 *
 * This screen used to be called Content Sources, and it was a different thing:
 * it listed dataset statistics, named the speech engine, and every word card in
 * the product linked to the dictionary entry it had been built from. All of that
 * was accurate and none of it was for the learner. Someone who has paid for a
 * Korean course is not shopping for a data pipeline, and being told that a
 * definition came from Wiktionary — on the card, mid-lesson — mostly reads as an
 * admission that nobody wrote it.
 *
 * So the provenance stayed in the build and left the interface. Every word still
 * carries its full source record; `npm run content:coverage` still refuses to
 * ship a word without one; the licence audit still runs on every build. What is
 * on this page is the subset that the licences actually oblige us to show:
 *
 * ```
 * CC BY-SA content   →  named, with the licence and a link      (required)
 * OFL 1.1 typefaces  →  named, with the licence                 (required)
 * speech engine      →  not shown; the licence does not ask     (removed)
 * dataset counts     →  not shown; nobody's licence asks        (removed)
 * per-word links     →  not shown; see above                    (removed)
 * ```
 *
 * A source whose licence asks for nothing is not listed here. That is not
 * hiding it — it is the difference between a legal notice and a colophon, and
 * padding a legal notice with things that do not belong in it is how people
 * stop reading legal notices.
 *
 * ## The levels disclaimer that used to be at the foot of this page
 *
 * "About the order" — three sentences saying that the vocabulary order is this
 * product's own, that it is not the difficulty a Korean would feel, and that it
 * is neither a TOPIK grade nor a dictionary grade. It was written when the app
 * showed learners a Level 1–8 badge on every word, where a reader could see a
 * number and reasonably ask what it meant.
 *
 * The app has not shown those levels for two cycles. What was left was a
 * disclaimer about a thing the learner cannot see, on a page they opened to
 * read a font licence, raising TOPIK to somebody who had not thought about it.
 * No licence asks for it and no claim needs it, so it is gone. The ordering
 * itself is unchanged and still internal; see `docs/VOCABULARY_DATA.md`.
 */
export function LegalPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['settings']);
  const { locale } = useLocale();

  // Exactly the sources whose licence asks to be credited. `attribution` is set
  // by the content pipeline when it is required and left null when it is not,
  // so this list cannot drift from what the licences actually say.
  const credited = CONTENT_SOURCES.filter((source) => source.attribution);

  // One row per licence rather than per face: six typefaces under OFL 1.1 is
  // one notice, and printing it six times would not make it more complied with.
  const fontLicences = [...new Set(PRACTICE_FONTS.map((font) => font.license_short))].sort();
  const fontsByLicence = fontLicences.map((licence) => ({
    licence,
    families: [
      ...new Set(
        PRACTICE_FONTS.filter((font) => font.license_short === licence).map(
          (font) => font.family_name,
        ),
      ),
    ].sort(),
  }));

  return (
    <div className={styles.page}>
      <AppHeader title={t('settings:legal.title')} onBack={() => navigate('/me')} />

      <div className={styles.body}>
        <p className={styles.intro}>{t('settings:legal.intro')}</p>

        <section aria-labelledby="legal-content">
          <h2 id="legal-content" className={styles.heading}>
            {t('settings:legal.contentHeading')}
          </h2>
          <ul className={styles.list}>
            {credited.map((source) => (
              <li key={source.id}>
                <Card padding="md" className={styles.notice}>
                  <p className={styles.noticeName}>{source.name}</p>
                  <p className={styles.noticeBody}>{source.attribution}</p>
                  {source.license_url && (
                    <a
                      className={styles.noticeLink}
                      href={source.license_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {source.license}
                    </a>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="legal-fonts">
          <h2 id="legal-fonts" className={styles.heading}>
            {t('settings:legal.fontsHeading')}
          </h2>
          <ul className={styles.list}>
            {fontsByLicence.map(({ licence, families }) => (
              <li key={licence}>
                <Card padding="md" className={styles.notice}>
                  <p className={styles.noticeName}>{licence}</p>
                  <p className={styles.noticeBody}>{families.join(' · ')}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <p className={styles.version}>
          {productName(locale)} · {t('settings:about.version', { version: PRODUCT.version })}
        </p>
      </div>
    </div>
  );
}
