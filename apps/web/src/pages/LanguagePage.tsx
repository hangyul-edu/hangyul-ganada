import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WORD_COPY_LOCALES } from '../data/wordCopy';
import { flagFor } from '../i18n/flags';
import { describeLocale, localeMatches, useLocale } from '../i18n';
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
  const { locale, available, setLocale, contentLocale, contentIsBorrowed, contentLocales, setContentLocale } =
    useLocale();
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
      <AppHeader title={t('settings:language.pickerTitle')} />

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
              const flag = flagFor(entry.code);
              return (
                <li key={entry.code}>
                  <button
                    type="button"
                    className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
                    onClick={() => void choose(entry.code)}
                    aria-pressed={selected}
                  >
                    {/*
                      The flag, decorative and nothing more.

                      `alt=""` and `aria-hidden` because the row is already
                      named by the language: a screen reader that read "flag of
                      South Korea, 한국어, Korean" would be announcing the same
                      row three times, and the flag is the one of the three that
                      is not actually a fact about the language. Sighted readers
                      get a mark that makes thirty-two rows scannable; everyone
                      else loses nothing.

                      Fixed box, `object-fit: contain`: the assets are all 20×13
                      today and a refreshed pack with one 4:3 flag in it must not
                      make one row taller than the rest.
                    */}
                    {flag ? (
                      <img className={styles.flag} src={flag} alt="" aria-hidden="true" />
                    ) : (
                      <span className={styles.flagBlank} aria-hidden="true" />
                    )}
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
                      {/*
                        Said on the row, not only in the note at the foot.

                        Every language here has a translated interface and a
                        translated alphabet course; twenty-two of them do not
                        yet have the 2,581 word meanings, and fall back to
                        English on the word cards. A learner deserves to know
                        that before they choose, and a blanket "some text may
                        be in English" at the bottom of the list tells the ten
                        complete languages the same thing as the twenty-two
                        incomplete ones, which is a way of telling nobody.
                      */}
                      {!WORD_COPY_LOCALES.includes(entry.code) && (
                        <span className={styles.partial}>
                          {t('settings:language.wordsInEnglish')}
                        </span>
                      )}
                    </span>
                    {/*
                      The BCP-47 tag used to sit here, in a column of its own:
                      EN, PT-BR, ZH-CN. It is a developer's identifier printed
                      on a customer's screen — it told a learner nothing they
                      could act on, and at thirty-two rows it was a column of
                      noise beside the only thing on the row they can read. It
                      is still searchable; it is no longer displayed.
                    */}
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

        {/*
          Which language the *word meanings* are in, and a way to change it.

          Only drawn when it is a real question — that is, when the interface
          language has no meanings of its own. For the ten that do, this whole
          section would be a setting whose only value is the one already in
          force, which is a decision the learner does not have to make.

          It exists because "falls back to English" was being done silently, in
          the middle of a quiz: a Tamil question with four English answers. The
          fallback itself is not the defect — the corpus genuinely has ten
          languages — but doing it without saying so, and without offering the
          learner any of the other nine, is.
        */}
        {contentIsBorrowed && contentLocales.length > 0 && (
          <section className={styles.meanings} aria-labelledby="meaning-language">
            <h2 id="meaning-language" className={styles.meaningsTitle}>
              {t('settings:language.meaningsTitle')}
            </h2>
            <p className={styles.meaningsBody}>
              {t('settings:language.meaningsBody', {
                language: describeLocale(contentLocale).nativeName,
              })}
            </p>
            <div className={styles.meaningsOptions} role="group" aria-label={t('settings:language.meaningsTitle')}>
              {contentLocales.map((entry) => (
                <button
                  key={entry.code}
                  type="button"
                  className={`${styles.meaningsOption} ${entry.code === contentLocale ? styles.meaningsOptionOn : ''}`}
                  onClick={() => setContentLocale(entry.code)}
                  aria-pressed={entry.code === contentLocale}
                  lang={entry.code}
                >
                  <bdi>{entry.nativeName}</bdi>
                </button>
              ))}
            </div>
          </section>
        )}

        <p className={styles.coverage}>{t('settings:language.coverageNote')}</p>
      </div>
    </div>
  );
}
