package com.okara.app;

/**
 * JNI wrapper for the Oboe-based native monitor engine (see
 * src/main/cpp/monitor_engine.cpp). AVAILABLE is false if the native library
 * failed to load (e.g. an unsupported ABI) — callers then fall back to the
 * Java AudioRecord/AudioTrack loop in MonitorPlugin.
 */
final class MonitorEngine {

    static final boolean AVAILABLE;

    static {
        boolean ok;
        try {
            System.loadLibrary("okaramonitor");
            ok = true;
        } catch (Throwable t) {
            ok = false;
        }
        AVAILABLE = ok;
    }

    private MonitorEngine() {}

    static native boolean nativeStart();

    static native void nativeStop();

    static native void nativeSetParams(float volume, float reverb, float echo,
                                       float echoTime, float bass, float treble);
}
