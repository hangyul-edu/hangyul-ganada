import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';

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
 *
 * ## One push away from Home, and replacements after that
 *
 * A bottom bar is a switch between five places, not a trail through them.
 * Pushing every tap built a history chain nobody asked for: a learner who
 * tapped Words, then Letters, then Review and pressed Back was walked back
 * through Letters and Words one screen at a time, reaching the exit
 * confirmation on the fourth press. The policy in `ui/routePolicy` answers that
 * press — every non-Home tab root goes straight Home — and this stops the chain
 * being built at all.
 *
 * Replacing *every* tap was the first version and it was wrong in the browser.
 * Home is the entry the app opened on, so a tab tap that replaced it left the
 * learner one press of the browser's own Back button from leaving the site
 * entirely, from the first screen they touched. The web build is a real
 * surface; a bottom tab is not a link off the product.
 *
 * So the first tap — the one leaving Home — pushes, and every tap after it
 * replaces. The stack across the whole tab layer is therefore `[Home, wherever
 * they are]`, whichever route they took to get there, which is exactly what
 * both buttons want: the browser's Back reaches Home, and the policy's own
 * answer is the same screen by a different route.
 *
 * The Home tab itself always replaces, so tapping it twice cannot stack two
 * copies of the screen the app opens on.
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
  const atHome = useLocation().pathname === '/';

  return (
    <nav className={styles.nav} aria-label={t('navigation:primary')}>
      <ul className={styles.list}>
        {ITEMS.map(({ to, key, Icon, end }) => (
          <li key={to} className={styles.item}>
            <NavLink
              to={to}
              end={end}
              replace={to === '/' || !atHome}
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
