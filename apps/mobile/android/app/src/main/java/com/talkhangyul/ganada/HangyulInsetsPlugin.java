package com.talkhangyul.ganada;

import android.graphics.Rect;
import android.os.Build;
import android.view.View;
import android.view.ViewTreeObserver;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * The one place that knows how much of this screen belongs to Android.
 *
 * <h2>The bug this exists to make impossible</h2>
 *
 * A physical Samsung device photographed the orange <em>Trace it</em> button of
 * the ㄱ lesson running underneath the three-button navigation bar. The Pixel 7
 * emulator this project had been testing on did not reproduce it, and the
 * reason is worth writing down because it is the whole argument for this file.
 *
 * Capacitor's core {@code SystemBars} plugin publishes safe-area insets, and it
 * does so two completely different ways depending on the version of Android
 * System WebView installed on the device:
 *
 * <ul>
 *   <li><b>WebView 140 and newer</b>, with {@code viewport-fit=cover}: the
 *       WebView is left edge-to-edge and the real inset values are published as
 *       {@code --safe-area-inset-*}. The web layer is genuinely responsible for
 *       keeping its controls clear of the bars.</li>
 *   <li><b>WebView 139 and older</b>: the plugin pads the WebView's parent by
 *       the system bars instead and publishes <b>zero</b>. The web layer sits
 *       between the bars and correctly does nothing.</li>
 * </ul>
 *
 * The QA emulator ships WebView 133, so it took the second path and every
 * inset it ever reported was {@code 0px}. A current Samsung takes the first,
 * and every pixel of inset the layout failed to honour became a pixel of button
 * underneath the navigation bar. A layout bug that only appears on up-to-date
 * devices is the worst kind: it ships.
 *
 * <h2>What this publishes instead</h2>
 *
 * Not "the window's insets" — <b>the part of the system's furniture the WebView
 * is actually drawn underneath</b>, measured from the two rectangles at the
 * moment of asking:
 *
 * <pre>
 *   window ┌───────────────────────────┐
 *          │ ▓▓▓▓ status bar ▓▓▓▓▓▓▓▓▓ │
 *          │   ┌───────────────────┐   │  ← the WebView, wherever the
 *          │   │                   │   │    platform has chosen to put it
 *          │   │                   │   │
 *          │   └───────────────────┘   │
 *          │ ▓▓▓▓ navigation bar ▓▓▓▓▓ │
 *          └───────────────────────────┘
 *
 *   bottom inset = max(0, webViewBottom − (windowBottom − systemBars.bottom))
 * </pre>
 *
 * That subtraction is what makes this correct on both of the paths above and on
 * any third one an OEM invents. If something — Capacitor, an OEM shell, a
 * future Chromium — has already moved the WebView clear of a bar, the residual
 * is zero and the app adds no padding. If nothing has, the residual is the
 * whole bar and the app pads by exactly it. Nothing here identifies a device,
 * asks for a version, or hard-codes a height.
 *
 * <h2>What is measured, and what is not</h2>
 *
 * {@code systemBars() | displayCutout()} — the status bar, the navigation bar
 * or gesture handle, and the notch — is one number, because they are one
 * question: where may the app draw a button. The IME is measured
 * <b>separately</b> and published separately: a keyboard is a transient overlay
 * over one focused input, and adding its height to the permanent bottom padding
 * of a lesson screen would leave a 300 px gap under the alphabet.
 *
 * <h2>Physical pixels are not CSS pixels</h2>
 *
 * {@link WindowInsetsCompat} answers in physical pixels. A 48 dp navigation bar
 * on this 2.625× Samsung is 126 of them, and publishing {@code 126px} to a
 * stylesheet would push the button most of the way up the screen. Both numbers
 * are therefore published: the CSS-pixel value this divides out with the display
 * density, <em>and</em> the raw physical value with the density beside it, so
 * {@code native/insets.ts} can check the conversion against the viewport width
 * the WebView actually reports and correct it if a scale is applied. See the
 * note there — the check has to live on the side that owns the CSS pixel.
 *
 * <h2>When it recalculates</h2>
 *
 * Insets are not a launch-time constant. They change when the phone is rotated,
 * when the learner switches between gesture and three-button navigation in
 * Settings and comes back, when a bar is hidden or shown, and when the keyboard
 * opens. Rather than subscribe to each of those, this listens for the one thing
 * all of them cause — a layout pass on the WebView — plus the window-inset
 * dispatch and {@code onResume}, and republishes only when a number has
 * actually moved.
 *
 * <h2>Why it is not a window-inset consumer</h2>
 *
 * The listener installed below returns the insets it was handed, unmodified.
 * Chromium computes {@code env(safe-area-inset-*)} from what reaches the
 * WebView, and a plugin that consumed them here would silently switch the CSS
 * environment off. The stylesheet takes {@code max()} of this and {@code env()}
 * so that whichever of the two a given device populates, the layout is right
 * once — never twice.
 */
@CapacitorPlugin(name = "HangyulInsets")
public class HangyulInsetsPlugin extends Plugin {

    /** Physical pixels of system furniture the WebView is drawn underneath. */
    private int top = 0;
    private int right = 0;
    private int bottom = 0;
    private int left = 0;
    /** Physical pixels of keyboard the WebView is drawn underneath. Transient. */
    private int keyboard = 0;
    private boolean published = false;

    private View host;
    private ViewTreeObserver.OnGlobalLayoutListener layoutListener;

    @Override
    public void load() {
        super.load();

        final View webView = getBridge().getWebView();
        host = (View) webView.getParent();

        /*
         * Pass-through, deliberately. See the class note: the return value is
         * what Chromium reads to compute `env(safe-area-inset-*)`, and this
         * plugin's job is to observe the dispatch, not to take part in it.
         *
         * `insetsHandling: 'disable'` in `capacitor.config.ts` is what makes the
         * parent free to carry a listener at all — with the default, Capacitor's
         * own listener occupies this slot and installing one here would replace
         * it, which would take the keyboard handling with it.
         */
        ViewCompat.setOnApplyWindowInsetsListener(host, (v, insets) -> {
            applyKeyboardPadding(v, insets);
            measure();
            return insets;
        });

        // Rotation, a navigation-mode change, a bar hiding, the keyboard: every
        // one of them lands as a layout pass here, and none of them is worth a
        // separate subscription.
        layoutListener = this::measure;
        webView.getViewTreeObserver().addOnGlobalLayoutListener(layoutListener);

        measure();
    }

    /**
     * The keyboard, and only the keyboard, moves the WebView.
     *
     * <p>With {@code insetsHandling: 'disable'} nothing else pads this view, so
     * the app keeps the whole screen and the stylesheet keeps the bars clear —
     * which is the entire point. The IME is the exception, and it is an
     * exception on its own merits rather than an inconsistency: a keyboard
     * covering the bottom half of the window while a text field is focused has
     * to shorten the viewport, or the field it was opened for is underneath it.
     * The bars get padding in CSS because they are permanent; the keyboard gets
     * it here because it is not.
     *
     * <p>The bottom system-bar residual falls to zero on its own while this is
     * applied — the WebView no longer reaches the navigation bar, because the
     * keyboard is over it — so the two can never add up.
     */
    private void applyKeyboardPadding(View view, WindowInsetsCompat insets) {
        boolean visible = insets.isVisible(WindowInsetsCompat.Type.ime());
        int height = visible ? insets.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0;
        if (view.getPaddingBottom() != height) {
            view.setPadding(0, 0, 0, height);
        }
    }

    @Override
    protected void handleOnConfigurationChanged(android.content.res.Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        // Rotation and a light/dark switch both arrive here. The window is
        // re-laid-out afterwards, but asking for the dispatch makes the new
        // geometry reach CSS in the same frame rather than the next one.
        getBridge().executeOnMainThread(() -> {
            if (host != null) ViewCompat.requestApplyInsets(host);
            measure();
        });
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // Coming back from Settings with three-button navigation newly turned
        // on: the window is already laid out, so nothing else would fire.
        getBridge().executeOnMainThread(() -> {
            if (host != null) ViewCompat.requestApplyInsets(host);
            measure();
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (layoutListener != null && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getViewTreeObserver().removeOnGlobalLayoutListener(layoutListener);
            layoutListener = null;
        }
    }

    /**
     * The numbers, for automated QA.
     *
     * <p>There is deliberately no screen anywhere in the app that shows these.
     * A customer should never read {@code bottomInset = 126} out of a learning
     * app; a test should be able to, because "the button is above the navigation
     * bar" is only checkable against a number somebody trusts. This is that
     * number, and {@code scripts/qa-native-android.mjs} is what asks for it.
     */
    @PluginMethod
    public void getInsets(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            measure();
            call.resolve(snapshot());
        });
    }

    private JSObject snapshot() {
        float density = getActivity().getResources().getDisplayMetrics().density;
        View webView = getBridge().getWebView();

        JSObject result = new JSObject();
        // CSS pixels — what the stylesheet is handed.
        result.put("top", Math.round(top / density));
        result.put("right", Math.round(right / density));
        result.put("bottom", Math.round(bottom / density));
        result.put("left", Math.round(left / density));
        result.put("keyboard", Math.round(keyboard / density));
        // And the raw measurement behind them, so the conversion is checkable
        // rather than trusted.
        result.put("physicalTop", top);
        result.put("physicalRight", right);
        result.put("physicalBottom", bottom);
        result.put("physicalLeft", left);
        result.put("physicalKeyboard", keyboard);
        result.put("density", density);
        result.put("webViewWidth", webView == null ? 0 : webView.getWidth());
        result.put("webViewHeight", webView == null ? 0 : webView.getHeight());
        result.put("navigationMode", navigationMode());
        return result;
    }

    /**
     * Which way the learner navigates, for the QA record only.
     *
     * <p>Nothing in the app branches on this and nothing should: the whole point
     * of measuring a residual is that a 126 px three-button bar and a 27 px
     * gesture handle are the same problem with different arithmetic. It is
     * reported so a QA run can state which of the two configurations it actually
     * exercised instead of claiming both.
     */
    private String navigationMode() {
        WindowInsetsCompat insets = rootInsets();
        if (insets == null) return "unknown";
        int navBottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
        int tappable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? insets.getInsets(WindowInsetsCompat.Type.tappableElement()).bottom
            : navBottom;
        if (navBottom == 0) return "none";
        // A gesture bar is a handle the app may draw under; a button bar is a
        // strip of tappable system UI. The platform draws that distinction for
        // us in `tappableElement`, which is empty at the foot of a gesture
        // device and the full bar height on a three-button one.
        return tappable == 0 ? "gesture" : "buttons";
    }

    private WindowInsetsCompat rootInsets() {
        View view = getBridge() == null ? null : getBridge().getWebView();
        return view == null ? null : ViewCompat.getRootWindowInsets(view);
    }

    /**
     * Measures the residual and publishes it if it moved.
     *
     * <p>Runs on every layout pass of the WebView, which on a scrolling page is
     * often; the equality check below is what keeps that from being a
     * {@code evaluateJavascript} per frame.
     */
    private void measure() {
        View webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;

        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(webView);
        if (insets == null) return;

        Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
        Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
        boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

        Rect window = windowFrame();
        Rect web = viewFrame(webView);
        if (window.isEmpty() || web.isEmpty()) return;

        // The rectangle inside the window the system leaves to the app...
        int safeTop = window.top + bars.top;
        int safeBottom = window.bottom - bars.bottom;
        int safeLeft = window.left + bars.left;
        int safeRight = window.right - bars.right;

        // ...and how far outside it the WebView reaches. Zero on a platform
        // that already inset the view; the full bar on one that did not.
        int nextTop = Math.max(0, safeTop - web.top);
        int nextBottom = Math.max(0, web.bottom - safeBottom);
        int nextLeft = Math.max(0, safeLeft - web.left);
        int nextRight = Math.max(0, web.right - safeRight);
        int nextKeyboard = imeVisible ? Math.max(0, web.bottom - (window.bottom - ime.bottom)) : 0;

        if (published && nextTop == top && nextBottom == bottom && nextLeft == left && nextRight == right && nextKeyboard == keyboard) {
            return;
        }

        top = nextTop;
        bottom = nextBottom;
        left = nextLeft;
        right = nextRight;
        keyboard = nextKeyboard;
        published = true;
        publish();
    }

    /** The window's rectangle on screen. The decor view is the window. */
    private Rect windowFrame() {
        View decor = getActivity() == null ? null : getActivity().getWindow().getDecorView();
        return decor == null ? new Rect() : viewFrame(decor);
    }

    private Rect viewFrame(View view) {
        if (view.getWidth() == 0 || view.getHeight() == 0) return new Rect();
        int[] at = new int[2];
        view.getLocationOnScreen(at);
        return new Rect(at[0], at[1], at[0] + view.getWidth(), at[1] + view.getHeight());
    }

    /**
     * Writes the numbers where CSS can read them, and tells JavaScript they moved.
     *
     * <p>Both, on purpose. The custom properties are set from here so that the
     * very first frame after launch is already correct — waiting for a
     * JavaScript listener to attach would paint one frame of a button in the
     * navigation bar, which is the bug. The event is what lets
     * {@code native/insets.ts} apply the viewport-scale correction afterwards.
     */
    private void publish() {
        JSObject snapshot = snapshot();
        getBridge().executeOnMainThread(() -> {
            if (bridge == null || bridge.getWebView() == null) return;
            String script = String.format(
                Locale.US,
                """
                try {
                  var root = document.documentElement.style;
                  root.setProperty('--hg-native-safe-top', '%dpx');
                  root.setProperty('--hg-native-safe-right', '%dpx');
                  root.setProperty('--hg-native-safe-bottom', '%dpx');
                  root.setProperty('--hg-native-safe-left', '%dpx');
                  root.setProperty('--hg-native-keyboard', '%dpx');
                } catch (e) {}
                """,
                snapshot.getInteger("top", 0),
                snapshot.getInteger("right", 0),
                snapshot.getInteger("bottom", 0),
                snapshot.getInteger("left", 0),
                snapshot.getInteger("keyboard", 0)
            );
            bridge.getWebView().evaluateJavascript(script, null);
        });
        notifyListeners("insetsChanged", snapshot);
    }
}
