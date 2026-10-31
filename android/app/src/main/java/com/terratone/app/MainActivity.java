package com.terratone.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TerraToneTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
