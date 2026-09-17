import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { Button } from './Button';
import { HangyulMascot } from './HangyulMascot';
import styles from './ScreenErrorBoundary.module.css';

/**
 * What a learner sees when a screen cannot be drawn at all.
 *
 * Every screen but Home is a lazy chunk, and a chunk is a network request the
 * first time: a learner who installed the app on Wi-Fi and opens *Letters* on
 * the train before the worker finished precaching, or who kept a tab open
 * across a deploy that renamed every hashed file, gets a rejected import. React
 * answers a rejection inside `Suspense` by unmounting the nearest error
 * boundary's subtree — and with no boundary the nearest one was the root, so
 * the whole app disappeared: a blank, cream page with no header, no
 * navigation and nothing to tap. Reproduced in `screenErrorBoundary.test.tsx`
 * and, against the built bundle, with a server that 404s one chunk.
 *
 * This is the boundary. It sits inside the router, around the routed screen
 * and nothing else, so the header, the bottom navigation and Home — which is
 * not lazy — stay reachable. It offers the two things that actually recover
 * the situation: a reload, which asks the network again and picks up whatever
 * the current release is, and Home. A rejected `lazy()` never retries on its
 * own, so "try again" without a reload would draw this panel a second time.
 *
 * The error is cleared when the path changes: a learner who taps Home in the
 * navigation gets Home, not a stale failure panel keyed to the screen they
 * left.
 */
function ScreenFailed({ onReload }: { onReload: () => void }) {
  const { t } = useTranslation(['errors', 'common']);
  return (
    <div className={styles.page} role="alert">
      <HangyulMascot mood="sad" size={88} />
      <h1 className={styles.title}>{t('errors:screen.title')}</h1>
      <p className={styles.body}>{t('errors:screen.body')}</p>
      <div className={styles.actions}>
        <Button variant="primary" pill onClick={onReload}>
          {t('errors:screen.reload')}
        </Button>
        <Link to="/" className={styles.link}>
          {t('common:actions.goHome')}
        </Link>
      </div>
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  /** Changing this clears a caught error — the current path. */
  resetKey: string;
  /** Injected by tests; production reloads the document. */
  reload?: () => void;
}

interface BoundaryState {
  failed: boolean;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Kept out of the learner's way and in the console, where a support
    // conversation can find it. Nothing here leaves the device.
    console.error('screen failed to render', error, info.componentStack);
  }

  componentDidUpdate(previous: BoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <ScreenFailed onReload={this.props.reload ?? (() => window.location.reload())} />;
  }
}

export function ScreenErrorBoundary({
  children,
  reload,
}: {
  children: ReactNode;
  reload?: () => void;
}) {
  const { pathname } = useLocation();
  return (
    <Boundary resetKey={pathname} reload={reload}>
      {children}
    </Boundary>
  );
}
