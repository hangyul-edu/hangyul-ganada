import { useTranslation } from 'react-i18next';

import { PRODUCT, productName } from '../config/product';
import { useLocale } from '../i18n';
import { AppHeader } from '../ui/AppHeader';
import { Card } from '../ui/Card';
import styles from './PrivacyPage.module.css';

/**
 * The privacy policy, written for the person who bought the app.
 *
 * ## Why this is a screen and not three bullet points in Settings
 *
 * Settings used to carry a group headed "Your progress stays with you on this
 * device", with three lines under it about there being no account and nothing
 * being uploaded. Every learner opening Settings to change the practice
 * typeface read an explanation of the app's architecture on the way past, and
 * none of them had asked for one.
 *
 * The information is not wrong and it is not unwanted — it is simply wanted at
 * a different moment. Someone who wants to know what an app does with their
 * work goes looking for it, under the word they expect: *Privacy*. So it moved
 * behind that word, where it can be complete instead of compressed.
 *
 * ## What belongs here rather than in `docs/legal/privacy-policy.md`
 *
 * That file is the legal document: the one a store reviewer or a regulator
 * reads, with the storage engines named, the GDPR articles addressed and the
 * permission table spelled out. This screen is the same commitments in the
 * words a learner uses. Neither is a summary of the other in the sense that
 * matters — they must not be able to disagree — so anything substantive that
 * changes in one is changed in both, and the two are reviewed together at
 * release. The document is what the store listing links to; this is what the
 * app shows.
 *
 * Nothing here explains *how* any of it works. That the storage is IndexedDB in
 * a browser and SQLite on a phone is true, and it is in the document, and it is
 * not something a learner should have to read to find out whether anyone can
 * see what they are bad at.
 */
export function PrivacyPage() {
  const { t } = useTranslation(['settings']);
  const { locale } = useLocale();

  /*
   * Four questions a person actually has about an app like this: where does my
   * work go, is anyone watching, what is it allowed to touch, and can I get rid
   * of it. In that order, one card each, one or two sentences apiece.
   *
   * What went, and why: a section headed "What the app keeps" that listed the
   * fields of the progress record, and a lede that told the reader the product
   * "does not collect anything about you" — a sentence about the product rather
   * than an answer to anything. Neither was untrue. Both were the app
   * describing itself instead of answering the question that got somebody to
   * open this screen.
   */
  const sections = ['device', 'tracking', 'permissions', 'erase'] as const;

  return (
    <div className={styles.page}>
      <AppHeader title={t('settings:privacy.title')} />

      <div className={styles.body}>
        <p className={styles.lede}>{t('settings:privacy.lede')}</p>

        {sections.map((section) => (
          <Card key={section} padding="md" className={styles.section}>
            <h2 className={styles.heading}>{t(`settings:privacy.${section}.title`)}</h2>
            <ul className={styles.points}>
              {(
                t(`settings:privacy.${section}.points`, {
                  returnObjects: true,
                  // Named rather than spelled out, so the sentence still points
                  // at the right screen when that screen is renamed or read in
                  // another language.
                  screen: t('settings:title'),
                }) as string[]
              ).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </Card>
        ))}

        <p className={styles.version}>
          {productName(locale)} · {t('settings:about.version', { version: PRODUCT.version })}
        </p>
      </div>
    </div>
  );
}
