import { useMemo } from 'react';

import { quoteOnOpen, renderQuote } from '../data/quotes';
import { useLocale } from '../i18n';
import styles from './QuoteOfTheSession.module.css';

/**
 * One quotation, chosen once per app load, in the learner's language.
 *
 * The choice itself — random per mount, with a short in-memory history so the
 * same line never appears twice running — is `quoteOnOpen` in
 * `data/quotes.ts`.
 *
 * ## Which line leads
 *
 * Two lines at most, and which one is primary depends on what the original is:
 *
 * * **A Korean original leads.** This is a Korean-learning app, and 꿈을 크게
 *   가져라 at the foot of the home screen is a sentence the learner is here to
 *   be able to read. So it takes the primary line, in Korean type, and the
 *   translation in the learner's language sits beneath it in the quieter
 *   secondary style — present, legible, and clearly the gloss rather than the
 *   text. `renderQuote` says so through `leadsWithOriginal`.
 * * **Any other original follows.** A Greek, Latin or German line is
 *   provenance, not study material: the translation leads and the original
 *   sits beneath it, as it did before.
 * * **Never the same sentence twice.** A Korean reader looking at a Korean
 *   line gets one line, not the same words in two type sizes. `renderQuote`
 *   returns `original: null` for that case and there is nothing to lead.
 *
 * ## The byline is never blank
 *
 * Every row either names a person or says, in the learner's language, that
 * nobody can be named — 작자 미상, *Author unknown*, *Auteur inconnu*. A blank
 * under one quotation and a name under the next reads as a missing string.
 *
 * Each line carries its own `lang` and the Korean line pins `dir="ltr"`, so a
 * screen reader speaks the Korean with a Korean voice and a right-to-left
 * interface does not mirror it.
 */
export function QuoteOfTheSession({ className }: { className?: string }) {
  /*
    Chosen once per mount, which is once per app load.

    `useMemo` with no dependencies rather than `useState`: this must not change
    while the learner is looking at it — a line that re-rolled on every render
    would flicker whenever anything above it updated — and it must be different
    the next time they open the app. See `quoteOnOpen`.
  */
  const quote = useMemo(() => quoteOnOpen(), []);
  const { locale } = useLocale();
  const rendered = useMemo(() => renderQuote(quote, locale), [quote, locale]);

  const korean = rendered.original && rendered.leadsWithOriginal ? rendered.original : null;

  return (
    <figure className={`${styles.card} ${className ?? ''}`} data-testid="home-quote">
      <span className={styles.mark} aria-hidden="true">
        &ldquo;
      </span>
      <div className={styles.text}>
        {korean ? (
          <>
            {/*
              Korean first. The original is the text; the translation is the
              gloss. Both are real content — the blockquote holds the original
              because that is what is being quoted, and the translation is a
              paragraph inside the same figure so a screen reader reads them in
              this order: the Korean, then what it means.
            */}
            <blockquote
              className={styles.body}
              lang={korean.lang}
              dir="ltr"
              data-testid="home-quote-original"
            >
              {korean.text}
            </blockquote>
            <p className={styles.translation} lang={locale} data-testid="home-quote-translation">
              {rendered.text}
            </p>
          </>
        ) : (
          <>
            <blockquote className={styles.body} lang={locale} data-testid="home-quote-text">
              {rendered.text}
            </blockquote>
            {rendered.original && (
              // Chinese and Latin never mirror, whatever the interface language
              // does, so the original line pins its own direction.
              <p
                className={styles.original}
                lang={rendered.original.lang}
                dir="ltr"
                data-testid="home-quote-original"
              >
                {rendered.original.text}
              </p>
            )}
          </>
        )}
        <figcaption
          className={styles.author}
          lang={locale}
          data-testid="home-quote-author"
          data-authorship={rendered.authorship}
        >
          {/* An em dash and the name, the way a printed epigraph sets it. */}
          <span aria-hidden="true">&mdash;&nbsp;</span>
          {rendered.author}
        </figcaption>
      </div>
    </figure>
  );
}
