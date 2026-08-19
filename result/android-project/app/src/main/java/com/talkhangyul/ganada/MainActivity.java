package com.talkhangyul.ganada;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * The app's single Activity.
 *
 * `singleTask` in the manifest, so the launcher icon returns to the practice a
 * learner left rather than starting a second copy of it — the behaviour anyone
 * expects from a phone app and the one a WebView shell most often gets wrong.
 *
 * ## Back is handled in JavaScript, deliberately
 *
 * Nothing here registers a back callback. Capacitor's `App` plugin already adds
 * one to the AndroidX dispatcher and forwards the press into the web layer,
 * which is where the router lives and therefore the only place that knows what
 * "back" should mean on the current screen. A native callback added here would
 * be pushed on top of the plugin's and would win, which is exactly what
 * happened during emulator QA — and it could only answer the question with
 * `WebView.canGoBack()`, which is the signal that was wrong in the first place.
 *
 * See `apps/web/src/native/shell.ts`.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before `super.onCreate`, which is when the bridge is
        // built: a plugin registered afterwards is not there when the WebView
        // loads, and the first thing the app does on launch is open its store.
        registerPlugin(HangyulStorePlugin.class);
        registerPlugin(HangyulInsetsPlugin.class);
        super.onCreate(savedInstanceState);
        // Edge-to-edge on every API level this ships to, not only on the ones
        // that enforce it. Android 15 and newer give an app the whole window
        // whether it asks or not; below that the default is to fit the window
        // between the bars. Asking for the same geometry everywhere means the
        // safe-area path — `HangyulInsetsPlugin` measuring a residual, the
        // stylesheet padding by it — is the one path that runs, rather than a
        // path that only the newest devices take and only the newest devices
        // can therefore be tested on. That difference is exactly how the
        // navigation bar came to be sitting on top of the Trace it button.
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Android 15 and newer force both bars transparent and ignore these
        // setters; below that they default to a solid colour, and a solid black
        // strip under a warm cream app is the "web page in a frame" look this
        // whole cycle is about. Setting them transparent lets the app's own
        // ground continue behind the bars on every device — and only the
        // *ground* does: `FocusScreen`'s footer holds its button above the
        // inset that `HangyulInsetsPlugin` measures. Background may sit behind
        // system UI; a control may not.
        //
        // Glyph colour is not set here. It follows the learner's chosen
        // appearance at runtime, which is a question only the web layer can
        // answer — see `useSystemBarStyle` in `apps/web/src/ui/appearance.ts`.
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
            getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        }
    }
}
