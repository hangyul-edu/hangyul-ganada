import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AppHeader } from '../ui/AppHeader';
import { HangyulMascot } from '../ui/HangyulMascot';
import styles from './NotFoundPage.module.css';

/**
 * Takes a key rather than a sentence.
 *
 * Callers name *what* was not found — a page, a lesson, a word lesson — and the
 * copy comes from the `errors` namespace. Passing a pre-formatted string would
 * push the translation decision back out to every caller, which is how a
 * localized app grows an untranslated corner.
 */
export function NotFoundBody({ messageKey }: { messageKey: string }) {
  const { t } = useTranslation(['errors', 'common']);
  /*
   * The header used to be given `title=""`, which rendered an `<h1>` with no
   * name — the one heading on the screen, and it said nothing to a screen
   * reader or to the tab strip. The title names the state; the sentence under
   * the mascot still names what was not found.
   */
  return (
    <div className={styles.page}>
      <AppHeader title={t('errors:notFound.title')} />
      <div className={styles.body}>
        <HangyulMascot mood="sad" size={88} />
        <p className={styles.title}>{t(`errors:${messageKey}`)}</p>
        <Link to="/" className={styles.link}>
          {t('common:actions.goHome')}
        </Link>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return <NotFoundBody messageKey="notFound.page" />;
}
