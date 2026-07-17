package com.okara.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.media.audiofx.Equalizer;
import android.media.audiofx.PresetReverb;
import android.os.Build;
import android.os.Process;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native low-latency mic monitor: a direct AudioRecord → AudioTrack
 * passthrough on a dedicated audio thread. The WebView's Web Audio path adds
 * 150–300 ms of output latency on Android, which is unusable for live vocal
 * monitoring; this native loop runs at the device's native buffer size with
 * PERFORMANCE_MODE_LOW_LATENCY (~20–50 ms mic-to-speaker). Echo is done in
 * the loop (ring-buffer delay); reverb and bass/treble use Android's built-in
 * PresetReverb/Equalizer attached to the track session. Pitch scoring keeps
 * using getUserMedia in the WebView — Android allows both captures within
 * the same app.
 */
@CapacitorPlugin(name = "Monitor")
public class MonitorPlugin extends Plugin {

    private Thread thread;
    private volatile boolean running = false;

    // Live-tunable FX params (written from JS, read by the audio thread).
    private volatile float volume = 0.85f;
    private volatile float reverb = 0.28f;
    private volatile float echo = 0.14f;
    private volatile float echoTime = 0.23f;
    private volatile float bassDb = 0f;
    private volatile float trebleDb = 0f;

    private PresetReverb presetReverb;
    private Equalizer equalizer;

    private void readParams(PluginCall call) {
        Double v;
        if ((v = call.getDouble("volume")) != null) volume = v.floatValue();
        if ((v = call.getDouble("reverb")) != null) reverb = v.floatValue();
        if ((v = call.getDouble("echo")) != null) echo = v.floatValue();
        if ((v = call.getDouble("echoTime")) != null) echoTime = v.floatValue();
        if ((v = call.getDouble("bass")) != null) bassDb = v.floatValue();
        if ((v = call.getDouble("treble")) != null) trebleDb = v.floatValue();
    }

    @PluginMethod
    public void start(PluginCall call) {
        readParams(call);
        if (running) {
            call.resolve();
            return;
        }
        running = true;
        thread = new Thread(this::audioLoop, "okara-monitor");
        thread.start();
        call.resolve();
    }

    @PluginMethod
    public void setParams(PluginCall call) {
        readParams(call);
        applyEffectParams();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopLoop();
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", running);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        stopLoop();
    }

    private void stopLoop() {
        running = false;
        Thread t = thread;
        if (t != null) {
            try { t.join(600); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            thread = null;
        }
    }

    private int outProperty(String key, int fallback) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            String v = am.getProperty(key);
            return v != null ? Integer.parseInt(v) : fallback;
        } catch (Exception e) {
            return fallback;
        }
    }

    private void applyEffectParams() {
        try {
            if (presetReverb != null) {
                short preset =
                        reverb <= 0.02f ? PresetReverb.PRESET_NONE
                        : reverb < 0.2f ? PresetReverb.PRESET_SMALLROOM
                        : reverb < 0.4f ? PresetReverb.PRESET_MEDIUMROOM
                        : reverb < 0.6f ? PresetReverb.PRESET_LARGEHALL
                        : PresetReverb.PRESET_PLATE;
                presetReverb.setPreset(preset);
                presetReverb.setEnabled(reverb > 0.02f);
            }
            if (equalizer != null) {
                short bands = equalizer.getNumberOfBands();
                short min = equalizer.getBandLevelRange()[0];
                short max = equalizer.getBandLevelRange()[1];
                short bassLevel = (short) Math.max(min, Math.min(max, (int) (bassDb * 100)));
                short trebleLevel = (short) Math.max(min, Math.min(max, (int) (trebleDb * 100)));
                if (bands > 0) equalizer.setBandLevel((short) 0, bassLevel);
                if (bands > 1) equalizer.setBandLevel((short) (bands - 1), trebleLevel);
                equalizer.setEnabled(bassDb != 0f || trebleDb != 0f);
            }
        } catch (Exception ignored) {
            // effects are best-effort; the dry passthrough keeps working
        }
    }

    private void audioLoop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO);

        int rate = outProperty("android.media.property.OUTPUT_SAMPLE_RATE", 48000);
        int frames = outProperty("android.media.property.OUTPUT_FRAMES_PER_BUFFER", 240);
        if (frames <= 0) frames = 240;

        AudioRecord record = null;
        AudioTrack track = null;
        try {
            int minIn = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            int source = Build.VERSION.SDK_INT >= 29
                    ? MediaRecorder.AudioSource.VOICE_PERFORMANCE
                    : MediaRecorder.AudioSource.MIC;
            record = new AudioRecord.Builder()
                    .setAudioSource(source)
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(rate)
                            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                            .build())
                    .setBufferSizeInBytes(Math.max(minIn, frames * 2 * 2))
                    .build();

            int minOut = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
            AudioTrack.Builder tb = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(rate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setBufferSizeInBytes(Math.max(minOut, frames * 2 * 2));
            if (Build.VERSION.SDK_INT >= 26) tb.setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY);
            track = tb.build();

            try {
                presetReverb = new PresetReverb(0, track.getAudioSessionId());
                equalizer = new Equalizer(0, track.getAudioSessionId());
            } catch (Exception ignored) {
                // some devices ship without these effects — dry monitor still works
            }
            applyEffectParams();

            // Echo: simple ring-buffer delay with feedback, up to 1 s.
            short[] buf = new short[frames];
            float[] ring = new float[rate];
            int ringPos = 0;

            record.startRecording();
            track.play();

            while (running) {
                int n = record.read(buf, 0, buf.length);
                if (n <= 0) continue;
                int delaySamples = Math.max(1, Math.min(ring.length - 1, (int) (echoTime * rate)));
                float fb = Math.min(0.85f, echo * 0.7f);
                float mix = echo;
                float vol = volume;
                for (int i = 0; i < n; i++) {
                    float dry = buf[i];
                    int readPos = ringPos - delaySamples;
                    if (readPos < 0) readPos += ring.length;
                    float delayed = ring[readPos];
                    ring[ringPos] = dry + delayed * fb;
                    ringPos++;
                    if (ringPos >= ring.length) ringPos = 0;
                    float out = (dry + delayed * mix) * vol;
                    if (out > 32767f) out = 32767f;
                    if (out < -32768f) out = -32768f;
                    buf[i] = (short) out;
                }
                track.write(buf, 0, n);
            }
        } catch (Exception ignored) {
            // fall through to cleanup; JS shows the monitor as off on failure
        } finally {
            running = false;
            try { if (presetReverb != null) { presetReverb.release(); presetReverb = null; } } catch (Exception ignored) { }
            try { if (equalizer != null) { equalizer.release(); equalizer = null; } } catch (Exception ignored) { }
            try { if (record != null) { record.stop(); record.release(); } } catch (Exception ignored) { }
            try { if (track != null) { track.stop(); track.release(); } } catch (Exception ignored) { }
        }
    }
}
