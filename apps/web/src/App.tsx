import { Suspense, lazy, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';

import './styles/fonts';
import { PronunciationProvider } from './audio/PronunciationProvider';
import { LocaleProvider } from './i18n';
import { HomePage } from './pages/HomePage';

/**
 * Every screen but Home is loaded when it is first opened.
 *
 * Home is eager on purpose: it is what a learner sees on launch, and a spinner
 * in front of the first screen is a worse trade than a slightly larger first
 * chunk. Everything else — and in particular the two session screens, which
 * pull in the handwriting evaluator and the glyph rasteriser — arrives when the
 * learner actually navigates to it.
 *
 * The vocabulary dataset is the other half of this. It is eight languages of
 * meanings and example sentences for the whole corpus, it is only read by the
 * Words screens, and a static import would put all of it in the first chunk for
 * a learner who has not left the alphabet yet.
 */
const ActivityPage = lazy(() =>
  import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })),
);
const LanguagePage = lazy(() =>
  import('./pages/LanguagePage').then((m) => ({ default: m.LanguagePage })),
);
const LettersPage = lazy(() =>
  import('./pages/LettersPage').then((m) => ({ default: m.LettersPage })),
);
const LetterSessionPage = lazy(() =>
  import('./pages/LetterSessionPage').then((m) => ({ default: m.LetterSessionPage })),
);
const WordsPage = lazy(() => import('./pages/WordsPage').then((m) => ({ default: m.WordsPage })));
const WordSessionPage = lazy(() =>
  import('./pages/WordSessionPage').then((m) => ({ default: m.WordSessionPage })),
);
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const ReviewSessionPage = lazy(() =>
  import('./pages/ReviewSessionPage').then((m) => ({ default: m.ReviewSessionPage })),
);
const SoundChangesPage = lazy(() =>
  import('./pages/SoundChangesPage').then((m) => ({ default: m.SoundChangesPage })),
);
const MyPage = lazy(() => import('./pages/MyPage').then((m) => ({ default: m.MyPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })));
const PrivacyPage = lazy(() =>
  import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
);
/*
 * Development only, and not in the production bundle.
 *
 * `import.meta.env.DEV` is a compile-time constant, so the route below is
 * removed entirely from a release build and this chunk is never emitted. It is
 * reachable only by typing the path — nothing links to it. See the note in
 * `pages/StrokeGalleryPage.tsx`.
 */
const StrokeGalleryPage = lazy(() =>
  import('./pages/StrokeGalleryPage').then((m) => ({ default: m.StrokeGalleryPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
import { useLearner } from './store/LearnerContext';
import { LearnerProvider } from './store/LearnerProvider';
import { AppShell } from './ui/AppShell';
import { SystemBack } from './ui/SystemBack';
import { BottomNavigation } from './ui/BottomNavigation';
import { DocumentMetadata } from './ui/DocumentMetadata';
import { useAppearance, useSystemBarStyle } from './ui/appearance';

/**
 * What fills the frame while a lazily-loaded screen arrives.
 *
 * Deliberately blank rather than a spinner. On a phone the chunk is already
 * cached by the service worker after the first visit, so the wait is a frame or
 * two; a spinner that flashes for 30 ms reads as a glitch, not as progress.
 */
function ScreenFallback() {
  return <div aria-busy="true" style={{ minHeight: '50vh' }} />;
}

/** Tabbed screens keep the bottom navigation. */
function TabLayout() {
  return (
    <AppShell footer={<BottomNavigation />}>
      <Suspense fallback={<ScreenFallback />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

/**
 * Session screens drop the navigation on purpose: a learner mid-attempt should
 * have one obvious way forward and one way back, not five competing exits.
 *
 * They also take their own scrolling. Dropping Hangyul's bottom navigation does
 * not drop Android's — the system's navigation bar is still there, over the
 * foot of the screen — and the layout that keeps a primary action clear of it
 * is `FocusScreen`'s three rows, which need the shell to hand them a fixed
 * height rather than a scroll of its own. See `ui/FocusScreen.tsx`.
 */
function FocusLayout() {
  return (
    <AppShell tone="session" scroll={false}>
      <Suspense fallback={<ScreenFallback />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

function SkipLink() {
  const { t } = useTranslation('common');
  return (
    <a className="hg-skip-link" href="#main">
      {t('a11y.skipToContent')}
    </a>
  );
}

/**
 * Binds the locale and the pronunciation voice to the learner's stored profile.
 *
 * Both live in the same place for the same reason: they are preferences with no
 * account behind them, and the app has to be usable — in the right language,
 * with the right voice — from the first frame after launch.
 */
function LearnerScopedProviders({ children }: { children: React.ReactNode }) {
  const { state, setPreferences } = useLearner();

  const handleLocaleChange = useCallback(
    (locale: string) => setPreferences({ locale }),
    [setPreferences],
  );

  // Light, dark or the device's own choice. Here with the locale and the voice
  // because it is the same kind of thing: a preference with no account behind
  // it that has to be right from the first frame after launch.
  useAppearance(state.settings.appearance);
  useSystemBarStyle();

  return (
    <LocaleProvider profileLocale={state.settings.locale} onLocaleChange={handleLocaleChange}>
      <PronunciationProvider voice={state.settings.voice}>{children}</PronunciationProvider>
    </LocaleProvider>
  );
}

export function App() {
  return (
    <LearnerProvider>
      <LearnerScopedProviders>
        <DocumentMetadata />
        <BrowserRouter>
          <SkipLink />
          {/* The phone's Back button, which means something different from the
              header's back arrow — see `ui/SystemBack.tsx`. Inside the router
              because the rule is about where the learner is. */}
          <SystemBack />
          <Routes>
            <Route element={<TabLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/letters" element={<LettersPage />} />
              <Route path="/words" element={<WordsPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/me" element={<MyPage />} />
              {/* Reached from the streak on Home. Its own screen rather than a
                  section of Settings: it is the learner's record, not a
                  preference. */}
              <Route path="/me/activity" element={<ActivityPage />} />
              <Route path="/me/language" element={<LanguagePage />} />
              <Route path="/me/privacy" element={<PrivacyPage />} />
              <Route path="/me/legal" element={<LegalPage />} />
            </Route>

            <Route element={<FocusLayout />}>
              <Route path="/letters/sounds" element={<SoundChangesPage />} />
              <Route path="/letters/:lessonId" element={<LetterSessionPage />} />
              <Route path="/words/:lessonId" element={<WordSessionPage />} />
              <Route path="/review/session" element={<ReviewSessionPage />} />
            </Route>

            {import.meta.env.DEV && (
              <Route path="/dev/stroke-gallery" element={<StrokeGalleryPage />} />
            )}

            <Route
              path="*"
              element={
                <AppShell footer={<BottomNavigation />}>
                  <NotFoundPage />
                </AppShell>
              }
            />
          </Routes>
        </BrowserRouter>
      </LearnerScopedProviders>
    </LearnerProvider>
  );
}
