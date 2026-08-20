/**
 * Locale-aware formatting.
 *
 * Numbers, percentages and dates go through `Intl`, never through string
 * concatenation. "1,234" is "1.234" in German and "١٬٢٣٤" in Arabic; a
 * hand-built `${a}/${b} (${pct}%)` is wrong in most of the world.
 *
 * Formatters are memoised per locale because constructing an `Intl.*Format` is
 * genuinely expensive and these run inside render.
 */
import { useMemo } from 'react';

import { useLocale } from './LocaleContext';

const numberCache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = numberCache.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(locale, options);
    numberCache.set(key, cached);
  }
  return cached;
}

export interface Formatters {
  /** A plain count: "1,234". */
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** A ratio in 0..1 rendered as a percentage: 0.94 → "94%". */
  percent: (ratio: number, fractionDigits?: number) => string;
  /**
   * A ratio rendered as a percentage **without** the 0..1 clamp: 1.2 → "120%".
   *
   * Separate from `percent` rather than an option on it, because the clamp is
   * right for everything `percent` is used for — a bar, a completion figure, a
   * share of a whole — and this is the one place a learner can honestly be past
   * the whole: extra vocabulary study, where twelve of a goal of ten is 120%.
   */
  percentOver: (ratio: number) => string;
  /** "3/5" as a locale-formatted fraction of a whole. */
  fraction: (value: number, total: number) => string;
  date: (value: Date | string, options?: Intl.DateTimeFormatOptions) => string;
  /** "English, Korean and Japanese". */
  list: (items: string[]) => string;
}

export function useFormatters(): Formatters {
  const { locale } = useLocale();

  return useMemo<Formatters>(
    () => ({
      number: (value, options) => formatter(locale, options ?? {}).format(value),
      percent: (ratio, fractionDigits = 0) =>
        formatter(locale, {
          style: 'percent',
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        }).format(clamp01(ratio)),
      percentOver: (ratio) =>
        formatter(locale, {
          style: 'percent',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(Math.max(0, ratio)),
      fraction: (value, total) => {
        const fmt = formatter(locale, {});
        // A fraction slash rather than a solidus keeps the pair reading as one
        // unit, and is direction-neutral in RTL layouts.
        return `${fmt.format(value)}/${fmt.format(total)}`;
      },
      date: (value, options) =>
        new Intl.DateTimeFormat(locale, options ?? { dateStyle: 'medium' }).format(
          typeof value === 'string' ? new Date(value) : value,
        ),
      list: (items) =>
        typeof Intl.ListFormat === 'function'
          ? new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items)
          : items.join(', '),
    }),
    [locale],
  );
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
