package com.terratone.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** The "Quit TerraTone?" question while it's on screen (null otherwise). */
    private AlertDialog quitDialog;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TerraToneTtsPlugin.class);
        super.onCreate(savedInstanceState);

        // TerraTone switches pages inside one web view, so the system Back
        // button used to close the app straight away. Ask first instead.
        // Registered after super.onCreate so it takes priority over Capacitor's.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web != null && web.canGoBack()) {
                    web.goBack();
                    return;
                }
                askToQuit();
            }
        });
    }

    private void askToQuit() {
        if (quitDialog != null && quitDialog.isShowing()) {
            // Back pressed again while asking: treat it as "yes, quit".
            quitDialog.dismiss();
            finish();
            return;
        }
        quitDialog = new AlertDialog.Builder(this)
            .setTitle(R.string.quit_title)
            .setMessage(R.string.quit_message)
            .setNegativeButton(R.string.quit_stay, (dialog, which) -> dialog.dismiss())
            .setPositiveButton(R.string.quit_confirm, (dialog, which) -> finish())
            .setCancelable(true)
            .create();
        quitDialog.show();
    }

    @Override
    public void onDestroy() {
        if (quitDialog != null) quitDialog.dismiss();
        super.onDestroy();
    }
}
