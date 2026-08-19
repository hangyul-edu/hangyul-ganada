import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { localeMatches, useLocale } from '../i18n';
import { AppHeader } from '../ui/AppHeader';
import { CheckIcon, SearchIcon } from '../ui/icons';
import styles from './LanguagePage.module.css';

/**
 * The language picker.
 *
 * Every language is listed by its own name first, in its own script, tagged
 * with `lang` so the browser picks the right face and a screen reader the right
 * voice. The English name sits underneath as the bridge for someone who cannot
 * yet read either — which, for a Korean-learning app used worldwide, is a real
 * situation rather than a hypothetical.
 *
 * Selecting applies immediately: no Save button, because there is nothing to
 * batch and because the result of the choice is the screen you are looking at.
 * The change persists before the interface repaints, so a reload mid-tap cannot
 * land the learner back where they started.
 */
export function LanguagePage() {
  const navigate = useNavigate();
  const { locale, available, setLocale } = useLocale();
  const { t } = useTranslation(['settings', 'common']);

  const [query, setQuery] = useState('');
  // Filtering a few dozen rows is cheap, but the list grows with every language
  // added and typing must never feel like it lags.
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(
    () => available.filter((entry) => localeMatches(entry, deferredQuery)),
    [available, deferredQuery],
  );

  const choose = async (code: string) => {
    await setLocale(code);
  };

  return (
    <div className={styles.page}>
      <AppHeader title={t('settings:language.pickerTitle')} onBack={() => navigate('/me')} />

      <div className={styles.body}>
        <p className={styles.intro}>{t('settings:language.pickerIntro')}</p>

        {/*
          The "your browser is set to X, switch?" card that was here is gone.
          
          It existed because the device's language was deliberately *not* used
          to pick the interface — so the app knew what the learner probably read
          and asked them about it instead of acting on it. The device language
          is now applied on first launch (see `resolveLocale`), which means by
          the time anybody reaches this screen the suggestion has either already
          happened or names a language we do not ship. A card that can only ever
          offer what you are already using is not a nudge, it is furniture.
        */}
        <div className={styles.search}>
          <span className={styles.searchIcon} aria-hidden="true">
            <SearchIcon size={18} />
          </span>
          <input
            type="search"
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('settings:language.searchLabel')}
            placeholder={t('settings:language.searchPlaceholder')}
            autoComplete="off"
          />
        </div>

        {results.length === 0 ? (
          <p className={styles.noResults}>
            {t('settings:language.noResults', { query: deferredQuery })}
          </p>
        ) : (
          <ul className={styles.list} aria-label={t('settings:language.listAria')}>
            {results.map((entry) => {
              const selected = entry.code === locale;
              return (
                <li key={entry.code}>
                  <button
                    type="button"
                    className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
                    onClick={() => void choose(entry.code)}
                    aria-pressed={selected}
                  >
                    <span className={styles.names}>
                      {/*
                       * <bdi> rather than dir= on the span: a right-to-left
                       * endonym must render right-to-left inside an English
                       * list, but
                       * setting `dir` on a block also flips its text alignment,
                       * which would leave every row in the list aligned to a
                       * different edge. <bdi> isolates the bidi run and leaves
                       * the column alone.
                       */}
                      <span className={styles.native} lang={entry.code}>
                        <bdi>{entry.nativeName}</bdi>
                      </span>
                      {entry.englishName !== entry.nativeName && (
                        <span className={styles.english}>
                          <bdi>{entry.englishName}</bdi>
                        </span>
                      )}
                    </span>
                    <span className={styles.code}>{entry.code}</span>
                    {selected && (
                      <span className={styles.check}>
                        <CheckIcon size={16} />
                        <span className="hg-sr-only">{t('settings:language.selected')}</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className={styles.coverage}>{t('settings:language.coverageNote')}</p>
      </div>
    </div>
  );
}
