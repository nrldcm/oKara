// okara native monitor engine: mic → FX → speaker at the lowest latency the
// hardware allows. Uses Oboe (AAudio) with LowLatency performance mode and
// Exclusive sharing, which enables MMAP no-IRQ paths on supported devices —
// typically a 10–25 ms round trip, the practical floor on Android.
//
// DSP (all mono float, done inside the audio callback):
//   volume  — output gain
//   bass    — RBJ low-shelf biquad @ 220 Hz
//   treble  — RBJ high-shelf biquad @ 3.2 kHz
//   echo    — ring-buffer delay with feedback
//   reverb  — small Freeverb-style network (4 combs + 2 allpasses)

#include <jni.h>
#include <oboe/Oboe.h>

#include <atomic>
#include <cmath>
#include <cstring>
#include <memory>
#include <mutex>
#include <vector>

namespace {

constexpr float kPi = 3.14159265358979323846f;

struct Biquad {
    float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    void reset() { x1 = x2 = y1 = y2 = 0; }

    void shelf(bool low, float rate, float f0, float dbGain) {
        float A = std::pow(10.0f, dbGain / 40.0f);
        float w0 = 2.0f * kPi * f0 / rate;
        float cw = std::cos(w0);
        float alpha = std::sin(w0) / 2.0f * std::sqrt(2.0f); // S = 1
        float sqA2a = 2.0f * std::sqrt(A) * alpha;
        float a0;
        if (low) {
            b0 = A * ((A + 1) - (A - 1) * cw + sqA2a);
            b1 = 2 * A * ((A - 1) - (A + 1) * cw);
            b2 = A * ((A + 1) - (A - 1) * cw - sqA2a);
            a0 = (A + 1) + (A - 1) * cw + sqA2a;
            a1 = -2 * ((A - 1) + (A + 1) * cw);
            a2 = (A + 1) + (A - 1) * cw - sqA2a;
        } else {
            b0 = A * ((A + 1) + (A - 1) * cw + sqA2a);
            b1 = -2 * A * ((A - 1) + (A + 1) * cw);
            b2 = A * ((A + 1) + (A - 1) * cw - sqA2a);
            a0 = (A + 1) - (A - 1) * cw + sqA2a;
            a1 = 2 * ((A - 1) - (A + 1) * cw);
            a2 = (A + 1) - (A - 1) * cw - sqA2a;
        }
        b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    }

    inline float process(float x) {
        float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x;
        y2 = y1; y1 = y;
        return y;
    }
};

struct Comb {
    std::vector<float> buf;
    size_t idx = 0;
    float store = 0;

    void init(size_t len) { buf.assign(len, 0.0f); idx = 0; store = 0; }

    inline float process(float input, float feedback, float damp) {
        float out = buf[idx];
        store = out * (1.0f - damp) + store * damp;
        buf[idx] = input + store * feedback;
        if (++idx >= buf.size()) idx = 0;
        return out;
    }
};

struct Allpass {
    std::vector<float> buf;
    size_t idx = 0;

    void init(size_t len) { buf.assign(len, 0.0f); idx = 0; }

    inline float process(float input) {
        float bufout = buf[idx];
        float out = -input + bufout;
        buf[idx] = input + bufout * 0.5f;
        if (++idx >= buf.size()) idx = 0;
        return out;
    }
};

class Engine : public oboe::AudioStreamDataCallback, public oboe::AudioStreamErrorCallback {
public:
    bool start() {
        std::lock_guard<std::mutex> lock(lifecycle_);
        if (running_) return true;

        oboe::AudioStreamBuilder ob;
        ob.setDirection(oboe::Direction::Output)
                ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
                ->setSharingMode(oboe::SharingMode::Exclusive)
                ->setFormat(oboe::AudioFormat::Float)
                ->setChannelCount(oboe::ChannelCount::Mono)
                ->setUsage(oboe::Usage::Media)
                ->setDataCallback(this)
                ->setErrorCallback(this);
        if (ob.openStream(outStream_) != oboe::Result::OK) return false;

        oboe::AudioStreamBuilder ib;
        ib.setDirection(oboe::Direction::Input)
                ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
                ->setSharingMode(oboe::SharingMode::Exclusive)
                ->setFormat(oboe::AudioFormat::Float)
                ->setChannelCount(oboe::ChannelCount::Mono)
                ->setSampleRate(outStream_->getSampleRate())
                ->setInputPreset(oboe::InputPreset::VoicePerformance);
        if (ib.openStream(inStream_) != oboe::Result::OK) {
            // Some devices reject VoicePerformance — retry with the default preset.
            ib.setInputPreset(oboe::InputPreset::VoiceRecognition);
            if (ib.openStream(inStream_) != oboe::Result::OK) {
                outStream_->close();
                outStream_.reset();
                return false;
            }
        }

        setupDsp(outStream_->getSampleRate());
        inBuf_.assign(static_cast<size_t>(outStream_->getFramesPerBurst()) * 4, 0.0f);

        if (inStream_->requestStart() != oboe::Result::OK ||
            outStream_->requestStart() != oboe::Result::OK) {
            teardown();
            return false;
        }
        running_ = true;
        return true;
    }

    void stop() {
        std::lock_guard<std::mutex> lock(lifecycle_);
        teardown();
    }

    void setParams(float volume, float reverb, float echo, float echoTime, float bass, float treble) {
        volume_.store(volume);
        reverb_.store(reverb);
        echo_.store(echo);
        echoTime_.store(echoTime);
        bass_.store(bass);
        treble_.store(treble);
        eqDirty_.store(true);
    }

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream*, void* audioData, int32_t numFrames) override {
        auto* out = static_cast<float*>(audioData);
        if (!inStream_) {
            std::memset(out, 0, sizeof(float) * numFrames);
            return oboe::DataCallbackResult::Continue;
        }
        if (inBuf_.size() < static_cast<size_t>(numFrames)) inBuf_.resize(numFrames);

        // Drop any input backlog so latency can't creep upward over time.
        auto avail = inStream_->getAvailableFrames();
        if (avail && avail.value() > numFrames * 3) {
            int32_t drop = avail.value() - numFrames;
            while (drop > 0) {
                int32_t n = std::min(drop, numFrames);
                if (!inStream_->read(inBuf_.data(), n, 0)) break;
                drop -= n;
            }
        }

        auto res = inStream_->read(inBuf_.data(), numFrames, 0);
        int32_t got = res ? res.value() : 0;

        if (eqDirty_.exchange(false)) {
            bassFilter_.shelf(true, rate_, 220.0f, bass_.load());
            trebleFilter_.shelf(false, rate_, 3200.0f, treble_.load());
        }
        float vol = volume_.load();
        float wet = reverb_.load();
        float echoMix = echo_.load();
        float echoFb = std::min(0.85f, echoMix * 0.7f);
        auto delaySamples = static_cast<size_t>(echoTime_.load() * rate_);
        if (delaySamples < 1) delaySamples = 1;
        if (delaySamples >= ring_.size()) delaySamples = ring_.size() - 1;

        for (int32_t i = 0; i < numFrames; i++) {
            float x = i < got ? inBuf_[i] : 0.0f;
            x = trebleFilter_.process(bassFilter_.process(x));

            size_t readPos = ringPos_ >= delaySamples ? ringPos_ - delaySamples
                                                      : ringPos_ + ring_.size() - delaySamples;
            float delayed = ring_[readPos];
            ring_[ringPos_] = x + delayed * echoFb;
            if (++ringPos_ >= ring_.size()) ringPos_ = 0;

            float rev = 0.0f;
            if (wet > 0.001f) {
                for (auto& c : combs_) rev += c.process(x, 0.84f, 0.2f);
                rev *= 0.25f;
                for (auto& a : allpasses_) rev = a.process(rev);
            }

            float y = (x + delayed * echoMix + rev * wet * 1.4f) * vol;
            // Soft clip: with mic boost up to 200%, tanh limits gracefully
            // instead of the harsh distortion of a hard clamp.
            out[i] = std::tanh(y);
        }
        return oboe::DataCallbackResult::Continue;
    }

    void onErrorAfterClose(oboe::AudioStream*, oboe::Result) override {
        // Device route changed (e.g. speaker→headset). Mark stopped; the app
        // simply toggles the monitor to restart on the new route.
        running_ = false;
    }

private:
    void setupDsp(int32_t rate) {
        rate_ = static_cast<float>(rate);
        ring_.assign(static_cast<size_t>(rate), 0.0f);
        ringPos_ = 0;
        bassFilter_.reset();
        trebleFilter_.reset();
        eqDirty_.store(true);
        static const int combLens[4] = {1116, 1188, 1277, 1356};
        static const int apLens[2] = {556, 441};
        float scale = rate_ / 44100.0f;
        for (int i = 0; i < 4; i++) combs_[i].init(static_cast<size_t>(combLens[i] * scale));
        for (int i = 0; i < 2; i++) allpasses_[i].init(static_cast<size_t>(apLens[i] * scale));
    }

    void teardown() {
        running_ = false;
        if (inStream_) { inStream_->stop(); inStream_->close(); inStream_.reset(); }
        if (outStream_) { outStream_->stop(); outStream_->close(); outStream_.reset(); }
    }

    std::mutex lifecycle_;
    std::shared_ptr<oboe::AudioStream> inStream_;
    std::shared_ptr<oboe::AudioStream> outStream_;
    std::vector<float> inBuf_;
    bool running_ = false;

    float rate_ = 48000.0f;
    Biquad bassFilter_, trebleFilter_;
    Comb combs_[4];
    Allpass allpasses_[2];
    std::vector<float> ring_;
    size_t ringPos_ = 0;

    std::atomic<float> volume_{0.85f}, reverb_{0.28f}, echo_{0.14f}, echoTime_{0.23f};
    std::atomic<float> bass_{0.0f}, treble_{0.0f};
    std::atomic<bool> eqDirty_{true};
};

Engine* engine() {
    static Engine instance;
    return &instance;
}

} // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_com_okara_app_MonitorEngine_nativeStart(JNIEnv*, jclass) {
    return engine()->start() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_okara_app_MonitorEngine_nativeStop(JNIEnv*, jclass) {
    engine()->stop();
}

extern "C" JNIEXPORT void JNICALL
Java_com_okara_app_MonitorEngine_nativeSetParams(JNIEnv*, jclass, jfloat volume, jfloat reverb,
                                                 jfloat echo, jfloat echoTime, jfloat bass, jfloat treble) {
    engine()->setParams(volume, reverb, echo, echoTime, bass, treble);
}
