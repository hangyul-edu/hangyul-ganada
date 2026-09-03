import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { NumberItem } from '@hangyul-ganada/shared-types';

import { SpeakerButton } from '../../ui/SpeakerButton';
import { formatValue } from './meaning';
import { numberParts, type NumberPlace } from './parts';
import styles from './NumberBreakdown.module.css';

/**
 * One number, taken apart and put back together.
 *
 * ## What this replaced
 *
 * A paragraph. The lesson that teaches numbers past ten opened with:
 *
 * > 부분을 순서대로 읽어요. 십일은 십-일, 11. 이십은 이-십, 20. 삼십오는
 * > 삼-십-오, 35예요.
 *
 * Three examples, three arabic numerals, three hyphenated pseudo-spellings and
 * a rule, in one block of prose, in a course for people who cannot yet read the
 * alphabet fluently. Every problem with it is the same problem: the *structure*
 * of a number — that 삼십오 is three tens and a five — is a spatial fact, and it
 * was being delivered as a sentence the reader has to hold in their head and
 * rebuild.
 *
 * The hyphens were the worst of it. 십-일 is not how 십일 is written, spoken or
 * spelled; it is a diagram drawn in punctuation, and a beginner has no way to
 * know it is not part of the word.
 *
 * ## The four steps, as one card
 *
 * | | |
 * | --- | --- |
 * | **Hear** | the speaker plays the whole number, once, on request |
 * | **See the parts** | one chip per morpheme, coloured by what it does |
 * | **Put them together** | the chips resolve to the written word, beside its numeral |
 * | **Try one** | the practice phase, which already exists and follows |
 *
 * One number per card and one card per screen, so nothing is competing.
 *
 * ## Where the pieces come from
 *
 * `numberParts` **segments the authored Korean**; it never generates a reading.
 * A number it cannot segment — a counter, or one whose sound differs from its
 * spelling like 십육 — returns nothing and this component renders nothing, so
 * the lesson falls back to its sentence. A missing diagram is a smaller failure
 * than a diagram teaching a spelling the language does not have.
 *
 * The colour is not the teaching and never carries meaning on its own: each
 * chip is a different place, the tens chip is labelled, and the row reads
 * left to right in the order the number is said. A learner who cannot
 * distinguish the hues still has the order, the shapes and the words.
 */
export function NumberBreakdown({ item }: { item: NumberItem }) {
  const { t, i18n } = useTranslation(['numbers', 'common']);
  const parts = numberParts(item);
  if (!parts) return null;

  return (
    <figure className={styles.card} data-testid={`number-breakdown-${item.id}`}>
      {/*
        The numeral, big, and its sound beside it. A learner meets the thing
        they already recognise first — 35 — and the Korean is what the card then
        builds.
      */}
      <div className={styles.head}>
        {item.value !== null && (
          <span className={styles.numeral}>{formatValue(item.value, i18n.language)}</span>
        )}
        <SpeakerButton audioId={item.audio.word} label={item.korean} />
      </div>

      <div className={styles.parts} role="list" aria-label={t('numbers:breakdown.parts')}>
        {parts.map((part, at) => (
          <Fragment key={`${part.korean}-${at}`}>
            {/*
              The join sits *between* the chips, not inside one.

              It was a child of the list item, which made the item's text
              content "+일" — decorative to a sighted reader, part of the word
              to anything reading the tree. `role="presentation"` and
              `aria-hidden` together keep it out of the list and out of the
              accessibility tree, so a list item is exactly one morpheme.
            */}
            {at > 0 && (
              <span className={styles.plus} role="presentation" aria-hidden="true">
                +
              </span>
            )}
            <span className={styles.chip} data-place={place(part.place)} role="listitem" lang="ko">
              {part.korean}
            </span>
          </Fragment>
        ))}
      </div>

      <figcaption className={styles.result}>
        <span className={styles.equals} aria-hidden="true">
          =
        </span>
        <span className={styles.whole} lang="ko">
          {item.korean}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The chips are coloured by three groups, not by seven places.
 *
 * Ones, tens-and-up, and zero. A seven-colour key would be a legend to learn
 * before the number, and the distinction that carries the lesson is only ever
 * *this piece counts* against *this piece is a place*.
 */
function place(value: NumberPlace): 'ones' | 'place' | 'zero' {
  if (value === 'zero') return 'zero';
  return value === 'ones' ? 'ones' : 'place';
}
