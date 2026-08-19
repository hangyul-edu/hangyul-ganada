import { useTranslation } from 'react-i18next';

import { hapticSelection } from '../native/haptics';
import { BookmarkIcon } from './icons';
import styles from './SaveButton.module.css';

/**
 * Bookmarking a word.
 *
 * Local, and that is the whole feature: the list is a handful of ids on the
 * learner's own device, it goes into their export and comes back from their
 * import, and nothing about it reaches a network. There is no account for it to
 * be an account of.
 *
 * Deliberately quiet — a text button with a small icon, below the meaning
 * rather than beside the headword. Saving is a thing some learners do
 * constantly and most never do at all, and a prominent control would put a
 * decision in front of everyone on every card. It is findable, it is not
 * insistent, and it says what it did rather than changing into a different
 * icon and leaving the learner to work out which state means saved.
 */
export function SaveButton({
  saved,
  onToggle,
  label,
}: {
  saved: boolean;
  onToggle: () => void;
  /** The word, for the accessible name. "Save" alone is ambiguous in a list. */
  label: string;
}) {
  const { t } = useTranslation('vocabulary');
  return (
    <button
      type="button"
      className={`${styles.save} ${saved ? styles.on : ''}`}
      onClick={() => {
        hapticSelection();
        onToggle();
      }}
      aria-pressed={saved}
      aria-label={t(saved ? 'save.remove' : 'save.add', { word: label })}
    >
      <BookmarkIcon size={16} filled={saved} />
      <span>{t(saved ? 'save.saved' : 'save.action')}</span>
    </button>
  );
}
