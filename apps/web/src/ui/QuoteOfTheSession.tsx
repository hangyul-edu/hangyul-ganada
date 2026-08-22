import { useMemo } from 'react';

import { quoteForToday, renderQuote } from '../data/quotes';
import { useLocale } from '../i18n';
import styles from './QuoteOfTheSession.module.css';

/**
 * One quotation, chosen once a day, in the learner's language.
 *
 * The choice itself — once per calendar day, from a shuffled bag that walks the
 * whole library before anything repeats — is `quoteForToday` in
 * `data/quotes.ts`. It used to be once per *run of the app*, which meant three
 * different lines to somebody who opened Hangyul three times before breakfast.
 *
 * ## The learner's language is the quotation
 *
 * Not a gloss under an English original, and not English with the original
 * above it: the primary line is the one in the interface language, in the
 * interface language's own type size, and it is the only line most learners
 * will read. This screen used to show English to everybody, which told a
 * Spanish learner — on the last thing they see before closing the app — that
 * the product was built for somebody else.
 *
 * The original is a second, quieter line, and it appears only when it adds
 * something:
 *
 * * **Not when it would be the same sentence.** A German reader looking at
 *   Wittgenstein gets one line, not the same words twice with different type
 *   sizes. `renderQuote` returns `original: null` for that case.
 * * **Otherwise, yes.** 티끌 모아 태산 above the translation is a Korean
 *   sentence a learner will one day be able to read, on a screen in a Korean
 *   app, and 千里之行 is where the line actually comes from.
 *
 * Each line carries its own `lang`, so a screen reader speaks the Korean with a
 * Korean voice and the Latin with something that at least tries.
 */
export function QuoteOfTheSession({ className }: { className?: string }) {
  const quote = useMemo(() => quoteForToday(), []);
  const { locale } = useLocale();
  const rendered = useMemo(() => renderQuote(quote, locale), [quote, locale]);

  return (
    <figure className={`${styles.card} ${className ?? ''}`}>
      <span className={styles.mark} aria-hidden="true">
        &ldquo;
      </span>
      <div className={styles.text}>
        <blockquote className={styles.body} lang={locale}>
          {rendered.text}
        </blockquote>
        {rendered.original && (
          // Korean and Chinese never mirror, whatever the interface language
          // does, so the original line pins its own direction.
          <p className={styles.original} lang={rendered.original.lang} dir="ltr">
            {rendered.original.text}
          </p>
        )}
        {/*
          The name, when there is one to give.

          Absent rather than "Anonymous" when there is not: see `renderQuote`.
          A line that says the author is unknown is a line about the app's
          research, printed under a sentence meant to encourage somebody.
        */}
        {rendered.author && (
          <figcaption className={styles.author} lang={locale}>
            {/* An em dash and the name, the way a printed epigraph sets it. */}
            <span aria-hidden="true">&mdash;&nbsp;</span>
            {rendered.author}
          </figcaption>
        )}
      </div>
    </figure>
  );
}
