import { Suspense, lazy, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";

import "./styles/fonts";
import { PronunciationProvider } from "./audio/PronunciationProvider";
import { LocaleProvider } from "./i18n";
import { HomePage } from "./pages/HomePage";

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
  import("./pages/ActivityPage").then((m) => ({ default: m.ActivityPage })),
);
const LanguagePage = lazy(() =>
  import("./pages/LanguagePage").then((m) => ({ default: m.LanguagePage })),
);
const LettersPage = lazy(() =>
  import("./pages/LettersPage").then((m) => ({ default: m.LettersPage })),
);
const LetterSessionPage = lazy(() =>
  import("./pages/LetterSessionPage").then((m) => ({
    default: m.LetterSessionPage,
  })),
);
const NumbersPage = lazy(() =>
  import("./pages/NumbersPage").then((m) => ({ default: m.NumbersPage })),
);
const NumberSessionPage = lazy(() =>
  import("./pages/NumberSessionPage").then((m) => ({
    default: m.NumberSessionPage,
  })),
);
const WordsPage = lazy(() =>
  import("./pages/WordsPage").then((m) => ({ default: m.WordsPage })),
);
const WordCategoryPage = lazy(() =>
  import("./pages/WordsPage").then((m) => ({ default: m.WordCategoryRoute })),
);
const WordDetailPage = lazy(() =>
  import("./pages/WordDetailPage").then((m) => ({ default: m.WordDetailPage })),
);
/*
 * Lazy like the rest, and for a second reason: the module it pulls in is the
 * only route that talks to `data/dictionary`, so a learner who never opens a
 * dictionary entry never parses the code that would fetch one.
 */
/* Lazy like the rest, and the only route that pulls in the level-test bank. */
const LevelTestPage = lazy(() =>
  import("./pages/LevelTestPage").then((m) => ({ default: m.LevelTestPage })),
);
const DictionaryWordPage = lazy(() =>
  import("./pages/DictionaryWordPage").then((m) => ({
    default: m.DictionaryWordPage,
  })),
);
const SavedWordsPage = lazy(() =>
  import("./pages/SavedWordsPage").then((m) => ({ default: m.SavedWordsPage })),
);
const MistakesPage = lazy(() =>
  import("./pages/MistakesPage").then((m) => ({ default: m.MistakesPage })),
);
const WordSessionPage = lazy(() =>
  import("./pages/WordSessionPage").then((m) => ({
    default: m.WordSessionPage,
  })),
);
const ReviewPage = lazy(() =>
  import("./pages/ReviewPage").then((m) => ({ default: m.ReviewPage })),
);
const ReviewSessionPage = lazy(() =>
  import("./pages/ReviewSessionPage").then((m) => ({
    default: m.ReviewSessionPage,
  })),
);
const SoundChangesPage = lazy(() =>
  import("./pages/SoundChangesPage").then((m) => ({
    default: m.SoundChangesPage,
  })),
);
const MyPage = lazy(() =>
  import("./pages/MyPage").then((m) => ({ default: m.MyPage })),
);
const LegalPage = lazy(() =>
  import("./pages/LegalPage").then((m) => ({ default: m.LegalPage })),
);
const PrivacyPage = lazy(() =>
  import("./pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
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
  import("./pages/StrokeGalleryPage").then((m) => ({
    default: m.StrokeGalleryPage,
  })),
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);
import { corpusCoreReady } from "./data/corpus";
import { useCorpus } from "./data/useCorpus";
import { useLearner } from "./store/LearnerContext";
import { LearnerProvider } from "./store/LearnerProvider";
import { LaunchSplash } from "./ui/LaunchSplash";
import { AppShell } from "./ui/AppShell";
import { SystemBack } from "./ui/SystemBack";
import { BottomNavigation } from "./ui/BottomNavigation";
import { DocumentMetadata } from "./ui/DocumentMetadata";
import { useAppearance, useSystemBarStyle } from "./ui/appearance";

/**
 * What fills the frame while a lazily-loaded screen arrives.
 *
 * Deliberately blank rather than a spinner. On a phone the chunk is already
 * cached by the service worker after the first visit, so the wait is a frame or
 * two; a spinner that flashes for 30 ms reads as a glitch, not as progress.
 */
function ScreenFallback() {
  return <div aria-busy="true" style={{ minHeight: "50vh" }} />;
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
  const { t } = useTranslation("common");
  return (
    <a className="hg-skip-link" href="#main">
      {t("a11y.skipToContent")}
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
    <LocaleProvider
      profileLocale={state.settings.locale}
      onLocaleChange={handleLocaleChange}
    >
      <PronunciationProvider voice={state.settings.voice}>
        {children}
      </PronunciationProvider>
    </LocaleProvider>
  );
}

/**
 * Holds the router back until there is a corpus to render against.
 *
 * The launch screen is an overlay, not a gate: the route underneath mounts
 * straight away, behind the picture. That is right for everything the app draws
 * from its own code and wrong for everything it draws from the corpus, which
 * arrives over the network a moment later — a screen that reads it once and has
 * no reason to look again renders empty and stays empty.
 *
 * So the corpus core is the gate, and the launch screen is what a learner sees
 * while it is closed. `LearnerProvider` starts the fetch in the same effect
 * that opens the database, and both are usually done before the splash's 900 ms
 * minimum is up. If the fetch fails there is nothing to wait for and the router
 * mounts anyway: an app with no words is a poor app, and an app that never
 * appears is not one.
 */
function CorpusGate({ children }: { children: ReactNode }) {
  useCorpus();
  const { ready } = useLearner();
  if (!corpusCoreReady() && !ready) return null;
  return <>{children}</>;
}

export function App() {
  return (
    <LearnerProvider>
      <LearnerScopedProviders>
        <DocumentMetadata />
        {/* Above the router, so it covers the app whatever route was opened —
            a cold start, a refresh in the middle of a lesson, or a shared link
            straight to a word. See `ui/LaunchSplash`. */}
        <LaunchSplash />
        <CorpusGate>
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
                <Route path="/letters/numbers" element={<NumbersPage />} />
                <Route path="/words" element={<WordsPage />} />
                {/* Browsing one category. A tab-layout screen rather than a focus
                  one: it is a reference view the learner can wander in and out
                  of, not a sitting they are part-way through. */}
                <Route
                  path="/words/category/:category"
                  element={<WordCategoryPage />}
                />
                {/* One word, in depth. A tab-layout screen: the learner is
                  looking something up, not part-way through a sitting. */}
                <Route
                  path="/words/word/:wordId"
                  element={<WordDetailPage />}
                />
                <Route
                  path="/words/dictionary/:headword"
                  element={<DictionaryWordPage />}
                />
                <Route path="/words/saved" element={<SavedWordsPage />} />
                <Route path="/review/mistakes" element={<MistakesPage />} />
                <Route path="/review" element={<ReviewPage />} />
                <Route path="/me" element={<MyPage />} />
                {/* Reached from the streak on Home. Its own screen rather than a
                  section of Settings: it is the learner's record, not a
                  preference. */}
                <Route path="/me/activity" element={<ActivityPage />} />
                <Route path="/me/level-test" element={<LevelTestPage />} />
                <Route path="/me/language" element={<LanguagePage />} />
                <Route path="/me/privacy" element={<PrivacyPage />} />
                <Route path="/me/legal" element={<LegalPage />} />
              </Route>

              <Route element={<FocusLayout />}>
                <Route path="/letters/sounds" element={<SoundChangesPage />} />
                {/*
                  Before the `/letters/:lessonId` catch-all, which would
                  otherwise swallow `/letters/numbers/...` and try to open a
                  letter lesson called "numbers".
                */}
                <Route
                  path="/letters/numbers/:lessonId"
                  element={<NumberSessionPage />}
                />
                <Route
                  path="/letters/:lessonId"
                  element={<LetterSessionPage />}
                />
                {/*
                One route, no lesson id. Vocabulary is no longer browsed as
                numbered sets and then written syllable by syllable; there is a
                plan for today and this runs it. See `WordSessionPage`.
              */}
                <Route path="/words/today" element={<WordSessionPage />} />
                <Route path="/review/session" element={<ReviewSessionPage />} />
              </Route>

              {import.meta.env.DEV && (
                <Route
                  path="/dev/stroke-gallery"
                  element={<StrokeGalleryPage />}
                />
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
        </CorpusGate>
      </LearnerScopedProviders>
    </LearnerProvider>
  );
}
