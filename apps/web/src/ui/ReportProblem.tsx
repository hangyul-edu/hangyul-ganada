import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SUPPORT_EMAIL, appVersion } from '../config/product';
import { useLocale } from '../i18n';
import { Modal } from './Modal';
import styles from './ReportProblem.module.css';

/**
 * "Report a problem", on a word or a lesson.
 *
 * ## Why an email and not a form
 *
 * Because a form needs a server, and this product does not have one. A support
 * address opened in the learner's own mail client keeps the promise the rest of
 * the app makes — nothing is sent anywhere the learner did not send it — and it
 * costs them one tap more than a form would.
 *
 * ## What goes in the message, and what does not
 *
 * The body is composed here, visible in the draft before it is sent, and
 * contains five things: what the item is, which category of problem, the app
 * version, the interface language, and a blank line for the learner to write
 * in. That is the whole of it.
 *
 * Nothing about their learning is attached. Not their progress, not their
 * streak, not what they got wrong — none of which would help fix a mistranslated
 * gloss, and all of which would be a learning history leaving the device
 * because somebody tapped a link labelled "report a problem". The identifiers
 * are the content's, not the learner's.
 */
const CATEGORIES = ['meaning', 'example', 'translation', 'audio', 'writing', 'other'] as const;

export function ReportProblem({
  itemId,
  korean,
}: {
  /** The content id, so a report can be traced to a row in the corpus. */
  itemId: string;
  /** The Korean itself, so a reader of the email does not need the corpus open. */
  korean: string;
}) {
  const { t } = useTranslation(['common']);
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);

  // No address configured, no button. See `SUPPORT_EMAIL`: an action that opens
  // a draft to nowhere is worse than one that is not offered.
  if (!SUPPORT_EMAIL) return null;

  const send = (category: string) => {
    const subject = `Hangyul ganada — ${category} — ${korean}`;
    const body = [
      `${t('common:report.field.item')}: ${korean} (${itemId})`,
      `${t('common:report.field.category')}: ${t(`common:report.category.${category}`)}`,
      `${t('common:report.field.version')}: ${appVersion()}`,
      `${t('common:report.field.language')}: ${locale}`,
      '',
      t('common:report.writeHere'),
      '',
    ].join('\n');
    // `mailto:` rather than a fetch. On the native build this hands off to the
    // system mail app; in a browser it opens whatever the learner has set.
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    setOpen(false);
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        {t('common:report.action')}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        variant="sheet"
        title={t('common:report.title')}
      >
        <p className={styles.blurb}>{t('common:report.blurb')}</p>
        <ul className={styles.list}>
          {CATEGORIES.map((category) => (
            <li key={category}>
              <button type="button" className={styles.row} onClick={() => send(category)}>
                {t(`common:report.category.${category}`)}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
