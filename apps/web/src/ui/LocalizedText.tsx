import type { ElementType, ReactNode } from 'react';

import { directionOf } from '../i18n';

export interface LocalizedTextProps {
  /** The locale the text actually came from — often a fallback, not the UI locale. */
  locale: string;
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Lets a caller mark the run for the end-to-end tests. */
  'data-testid'?: string;
}

/**
 * Renders text that may not be in the interface's language.
 *
 * When a translation is missing, the learner sees the English. Dropping an
 * English sentence into an Arabic page without saying so leaves the bidi
 * algorithm to guess, and it guesses wrong in the most visible way possible:
 * the full stop migrates to the front of the sentence and quotation marks swap
 * ends. Stating `lang` and `dir` for the run it actually is fixes that, and
 * also gives a screen reader the right voice rather than reading English words
 * with Arabic phonology.
 *
 * `contentLocale` comes from `resolveContent`, so this is never a guess.
 */
export function LocalizedText({
  locale,
  children,
  as: Tag = 'p',
  className,
  'data-testid': testId,
}: LocalizedTextProps) {
  return (
    <Tag lang={locale} dir={directionOf(locale)} className={className} data-testid={testId}>
      {children}
    </Tag>
  );
}
