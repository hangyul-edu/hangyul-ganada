import type { CapacitorConfig } from '@capacitor/cli';

import identity from './app.identity.json';

/**
 * The native shell.
 *
 * ## Why Capacitor and not a rewrite
 *
 * The learning experience is the product, and it is mature: a canvas that
 * captures strokes, a deterministic evaluator calibrated against real typeface
 * outlines, eight interface languages, a curriculum, and four schema versions
 * of learner history. Rebuilding that in React Native would be months of work
 * to arrive back where we started, with a second implementation of the
 * evaluator to keep in step with the first.
 *
 * Capacitor keeps that code and gives it a real native process around it: an
 * `Activity` and a `UIViewController` we own, real app lifecycle, a native
 * splash screen, native haptics, native file export, and — the part that
 * matters most — app-private storage that survives an app update.
 *
 * ## What stops it being a website in a box
 *
 * Apple rejects apps that are only a repackaged website, and rightly. What is
 * shipped here is not one:
 *
 * * The entire app is **bundled**. `server` below is deliberately absent, so
 *   the WebView loads from the app bundle and the app works in aeroplane mode
 *   from a cold start. There is no URL to point at.
 * * The **curriculum, 10,454 audio clips and six typefaces** are inside the
 *   binary.
 * * Handwriting capture and evaluation run **on the device**, with no network
 *   call in the learning path at all.
 * * Progress lives in **app-private storage** and is exported through the
 *   native share sheet.
 * * Android's hardware back button, the status bar, safe areas, haptics and
 *   the audio session are wired to platform behaviour rather than emulated.
 *
 * ## Identity
 *
 * Everything identifying lives in `app.identity.json` so the Android and iOS
 * projects cannot drift apart. Change it there, run `npx cap sync`, and both
 * follow.
 */
const config: CapacitorConfig = {
  appId: identity.appId,
  appName: identity.appName,

  // Built by the web workspace. Nothing is served over the network: `cap sync`
  // copies this whole directory into the Android assets and the iOS bundle.
  webDir: '../web/dist',

  android: {
    // The scheme the bundled app is served under. `https` rather than the
    // default `http` so the WebView treats the app as a secure context —
    // without it, `crypto.randomUUID`, service workers and IndexedDB in some
    // configurations are unavailable, and the app quietly loses its storage.
    androidScheme: 'https',
    // Nothing in the app needs to reach the network at runtime.
    allowMixedContent: false,
    // A learner drawing a stroke must not see the page flash grey behind the
    // WebView when they overscroll. `warm.50`, the same ground as the app icon
    // and the splash, so nothing changes colour between tapping the icon and
    // the first frame.
    backgroundColor: '#FFF8F1',
  },

  ios: {
    /*
     * The custom scheme the WebView serves the app from, and therefore the
     * origin its storage is keyed to. A **technical identifier**, never shown
     * to anybody: it keeps its original spelling through the rename to
     * "Hangyul ganada" precisely because changing it would move the origin and
     * take every existing learner's progress with it. Cosmetic branding does
     * not get to invalidate storage.
     */
    scheme: 'HangyulGaNaDa',
    backgroundColor: '#FFF8F1',
    // The canvas handles its own scrolling; the WebView bouncing underneath a
    // stroke is the single most "this is a web page" thing an iOS user can
    // feel.
    scrollEnabled: false,
    contentInset: 'never',
  },

  plugins: {
    SplashScreen: {
      // Hidden by the app itself, once React has painted something worth
      // looking at — a fixed timeout either flashes white or holds too long.
      launchAutoHide: false,
      /*
       * The ground of the splash artwork, not the app's warm ground.
       *
       * The `splash.png` drawables *are* the brand artwork now rather than the
       * first frame of an animation of it, and `ui/LaunchSplash` shows the same
       * picture in the WebView a moment later. Same picture, so it has to be on
       * the same colour or the handover blinks. `splashGround` in the design
       * tokens and `splashBackground` in `colors.xml` are this value; it is
       * written out three times because neither Gradle nor a Capacitor config
       * can import from the web workspace.
       *
       * The artwork is English on both platforms and that is not an oversight:
       * the learner's interface language lives in the app's own storage, which
       * only the WebView can read, so nothing running this early knows it. The
       * in-app splash does know, and it takes over on the same ground within a
       * frame or two — so a Korean learner sees the Korean wordmark, just not
       * from the very first millisecond.
       */
      backgroundColor: '#FFF1E1',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    /**
     * Status bar, gesture bar, and the notch.
     *
     * `SystemBars` is Capacitor 8's core plugin and it replaces `@capacitor/
     * status-bar` here for a concrete reason: from Android 16 (which this app
     * targets) the system enforces edge-to-edge and an app can no longer opt
     * out, so `StatusBar`'s `overlaysWebView` and `backgroundColor` have no
     * effect at all. Keeping that plugin would mean shipping configuration
     * that silently does nothing.
     *
     * ## Why `insetsHandling` is `disable` and not `css`
     *
     * Not because insets are unwanted — they are the whole point — but because
     * Capacitor's implementation of them is **conditional on the version of
     * Android System WebView installed on the device**, and an app cannot be
     * tested on a behaviour that changes underneath it.
     *
     * With `css`, the plugin leaves the WebView edge-to-edge and publishes the
     * real inset numbers on WebView 140 and newer, and on anything older pads
     * the WebView's parent instead and publishes zero. Two completely different
     * layouts, chosen by a component the user updates from the Play Store. The
     * QA emulator here runs WebView 133 and therefore only ever exercised the
     * second; a current Samsung runs the first, and the first is the one where
     * the bottom of the Trace it button ended up underneath the navigation bar.
     *
     * So the app takes one path on every device: `disable` stops Capacitor
     * touching the insets at all, `MainActivity` asks for edge-to-edge on every
     * API level, and `HangyulInsetsPlugin` measures how much of the system's
     * furniture the WebView is actually drawn under and publishes it as
     * `--hg-native-safe-*`. `styles/safe-area.css` takes `max()` of that and
     * `env(safe-area-inset-*)`, which is what iOS and a notched browser answer,
     * so one set of rules covers all three and nothing is ever counted twice.
     *
     * The keyboard is the one thing Capacitor was doing here that still needs
     * doing, and `HangyulInsetsPlugin.applyKeyboardPadding` does it — for the
     * IME only, which is the one inset that should shorten the viewport rather
     * than pad the layout.
     */
    SystemBars: {
      // The value at launch, before any JavaScript has run: dark glyphs, for
      // the light appearance the app opens in by default. From then on the
      // style follows the app's own resolved appearance — see
      // `useSystemBarStyle` in `apps/web/src/ui/appearance.ts`, which is the
      // only thing that knows whether the learner chose Light on a phone that
      // is in dark mode.
      style: 'LIGHT',
      hidden: false,
      insetsHandling: 'disable',
    },
    Keyboard: {
      // The only text input in the app is the language search box. Resizing
      // the body rather than the whole native view keeps the app bar in place.
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
