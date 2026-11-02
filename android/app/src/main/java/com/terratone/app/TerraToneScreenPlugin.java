package com.terratone.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Simulator fullscreen for the Android app. Web pages can't rotate the
 * screen inside a WebView, so the app does it natively: fullscreen turns to
 * landscape and hides the status / navigation bars (swipe to peek), leaving
 * fullscreen goes back to portrait with the bars restored.
 */
@CapacitorPlugin(name = "TerraToneScreen")
public class TerraToneScreenPlugin extends Plugin {
    /** Read by MainActivity: Back leaves fullscreen instead of asking to quit. */
    static volatile boolean fullscreen = false;

    @PluginMethod
    public void setFullscreen(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        activity.runOnUiThread(() -> {
            activity.setRequestedOrientation(on
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            WindowInsetsControllerCompat bars =
                WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
            if (on) {
                bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                bars.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                bars.show(WindowInsetsCompat.Type.systemBars());
            }
            fullscreen = on;
            call.resolve();
        });
    }
}
