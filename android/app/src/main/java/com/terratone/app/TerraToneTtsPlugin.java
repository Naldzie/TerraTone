package com.terratone.app;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

@CapacitorPlugin(name = "TerraToneTts")
public class TerraToneTtsPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private boolean ready = false;
    private boolean failed = false;
    private PluginCall pendingCall;
    private String pendingText;
    private float pendingPitch = 1f;
    private float pendingRate = 1f;
    private PluginCall activeCall;
    private String activeUtteranceId;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS || tts == null) {
            failed = true;
            rejectPending("Text-to-speech is not available on this device.");
            return;
        }

        int language = tts.setLanguage(Locale.US);
        if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
            language = tts.setLanguage(Locale.getDefault());
        }
        if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
            failed = true;
            rejectPending("No text-to-speech voice is installed.");
            return;
        }

        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {}

            @Override
            public void onDone(String utteranceId) {
                finish(utteranceId, true, null);
            }

            @Override
            public void onError(String utteranceId) {
                finish(utteranceId, false, "Speech synthesis failed.");
            }

            @Override
            public void onStop(String utteranceId, boolean interrupted) {
                finish(utteranceId, true, null);
            }
        });

        ready = true;
        if (pendingCall != null) {
            PluginCall call = pendingCall;
            String text = pendingText;
            float pitch = pendingPitch;
            float rate = pendingRate;
            pendingCall = null;
            pendingText = null;
            doSpeak(call, text, pitch, rate);
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", ready && !failed);
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("No text to speak.");
            return;
        }
        if (failed) {
            call.reject("Text-to-speech is not available on this device.");
            return;
        }

        float pitch = clamp(call.getFloat("pitch", 1f));
        float rate = clamp(call.getFloat("rate", 1f));

        if (!ready) {
            if (pendingCall != null) pendingCall.reject("Superseded by a newer speech request.");
            pendingCall = call;
            pendingText = text;
            pendingPitch = pitch;
            pendingRate = rate;
            return;
        }

        doSpeak(call, text, pitch, rate);
    }

    private void doSpeak(PluginCall call, String text, float pitch, float rate) {
        if (activeCall != null) {
            activeCall.resolve();
            activeCall = null;
        }
        activeUtteranceId = "terratone-" + System.nanoTime();
        activeCall = call;
        call.setKeepAlive(true);
        tts.setPitch(pitch);
        tts.setSpeechRate(rate);
        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, activeUtteranceId);
        if (result != TextToSpeech.SUCCESS) {
            finish(activeUtteranceId, false, "Could not start text-to-speech.");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (pendingCall != null) {
            pendingCall.resolve();
            pendingCall = null;
            pendingText = null;
        }
        if (tts != null) tts.stop();
        if (activeCall != null) {
            activeCall.resolve();
            activeCall = null;
        }
        activeUtteranceId = null;
        call.resolve();
    }

    private void finish(String utteranceId, boolean success, String message) {
        if (utteranceId == null || !utteranceId.equals(activeUtteranceId)) return;
        PluginCall call = activeCall;
        activeCall = null;
        activeUtteranceId = null;
        if (call == null) return;
        if (success) call.resolve(); else call.reject(message != null ? message : "Speech synthesis failed.");
    }

    private void rejectPending(String message) {
        if (pendingCall != null) {
            pendingCall.reject(message);
            pendingCall = null;
            pendingText = null;
        }
    }

    private float clamp(float value) {
        return Math.max(0.5f, Math.min(2.0f, value));
    }

    @Override
    protected void handleOnDestroy() {
        if (pendingCall != null) {
            pendingCall.resolve();
            pendingCall = null;
        }
        if (activeCall != null) {
            activeCall.resolve();
            activeCall = null;
        }
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        super.handleOnDestroy();
    }
}
