import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import { HomeIcon, LetterIcon, ProfileIcon, ReviewIcon, WordIcon } from './icons';
import styles from './BottomNavigation.module.css';

/**
 * Five destinations, matching the Hangyul bottom-nav pattern but adapted to
 * this product: Hangyul's home / lessons / tailored study / league / more
 * becomes home / letters / words / review / profile. League and subscription
 * are out of scope for the MVP, and review earns a tab because failed items are
 * the thing a beginner most needs to come back to.
 *
 * Labels are keys, not strings — a tab bar is the first place a hard-coded word
 * survives a localization pass, and the widest of these labels is what sets the
 * bar's height in a language like German.
 */
const ITEMS = [
  { to: '/', key: 'home', Icon: HomeIcon, end: true },
  { to: '/letters', key: 'letters', Icon: LetterIcon, end: false },
  { to: '/words', key: 'words', Icon: WordIcon, end: false },
  { to: '/review', key: 'review', Icon: ReviewIcon, end: false },
  { to: '/me', key: 'profile', Icon: ProfileIcon, end: false },
] as const;

export function BottomNavigation() {
  const { t } = useTranslation(['navigation', 'common']);

  return (
    <nav className={styles.nav} aria-label={t('navigation:primary')}>
      <ul className={styles.list}>
        {ITEMS.map(({ to, key, Icon, end }) => (
          <li key={to} className={styles.item}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} />
                  <span className={styles.label}>{t(`navigation:tabs.${key}`)}</span>
                  {isActive && <span className="hg-sr-only">{t('common:a11y.currentPage')}</span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
