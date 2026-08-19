import { useMemo } from 'react';

import { quoteForThisSession, renderQuote } from '../data/quotes';
import { useLocale } from '../i18n';
import styles from './QuoteOfTheSession.module.css';

/**
 * One quotation, chosen once per app session, in the learner's language.
 *
 * The choice itself — once per run of the app, from a shuffled bag that never
 * repeats until the set is exhausted — is `quoteForThisSession` in
 * `data/quotes.ts`.
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
  const quote = useMemo(quoteForThisSession, []);
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
        <figcaption className={styles.author} lang={locale}>
          {/* An em dash and the name, the way a printed epigraph sets it. */}
          <span aria-hidden="true">&mdash;&nbsp;</span>
          {rendered.author}
        </figcaption>
      </div>
    </figure>
  );
}
