import { autoCorrelate, freqToMidi } from '~/utils/pitch'

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.max(1, Math.floor(rate * seconds))
  const buf = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}

// Phone-as-mic scoring buffer is shared across every usePitch() instance:
// useRemote() feeds it, KaraokePlayer's instance samples it. Module scope keeps
// them pointing at the same buffer (per-call closures would not).
const EXT_SIZE = 2048
let externalBuf = new Float32Array(EXT_SIZE)
let externalRate = 16000
let externalWritten = 0

export function usePitch() {
  const { settings } = useSettings()
  const active = ref(false)
  const error = ref<string | null>(null)
  const currentFreq = ref(0)
  const currentMidi = ref<number | null>(null)

  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let stream: MediaStream | null = null
  let buffer: Float32Array | null = null

  // External audio source: a phone acting as the mic streams PCM to the host,
  // which scores from it instead of the local microphone. The phone does its
  // own local monitoring, so the host only needs the samples for pitch.
  const externalActive = useState('okara-pitch-external', () => false)

  // FX graph
  // Playback of relayed phone audio through the host speakers.
  let playCtx: AudioContext | null = null
  let playNext = 0

  let bass: BiquadFilterNode | null = null
  let treble: BiquadFilterNode | null = null
  let dryGain: GainNode | null = null
  let convolver: ConvolverNode | null = null
  let reverbGain: GainNode | null = null
  let delay: DelayNode | null = null
  let feedback: GainNode | null = null
  let echoGain: GainNode | null = null
  let outGain: GainNode | null = null
  let monitorOn = false

  function buildFx(src: MediaStreamAudioSourceNode) {
    const ctx = audioCtx!
    const fxIn = ctx.createGain()
    bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 220
    treble = ctx.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 3200
    dryGain = ctx.createGain()
    convolver = ctx.createConvolver(); convolver.buffer = makeImpulse(ctx, 2.4, 2.6)
    reverbGain = ctx.createGain()
    delay = ctx.createDelay(1.0)
    feedback = ctx.createGain()
    echoGain = ctx.createGain()
    outGain = ctx.createGain()

    src.connect(fxIn)
    fxIn.connect(bass); bass.connect(treble)
    treble.connect(dryGain); dryGain.connect(outGain)
    treble.connect(convolver); convolver.connect(reverbGain); reverbGain.connect(outGain)
    treble.connect(delay); delay.connect(feedback); feedback.connect(delay)
    delay.connect(echoGain); echoGain.connect(outGain)

    dryGain.gain.value = 1
    applyFx()
    setMonitor(settings.value.fx.monitor)
  }

  // On Android the WebView's audio output adds 150-300 ms — unusable for
  // hearing your own voice. When the native passthrough monitor exists, it
  // handles mic→speaker (+FX) at ~20-50 ms and the Web Audio graph is used
  // only for pitch analysis.
  function nativeMonitor() {
    return (window as any).okara?.nativeMonitor
  }

  function fxParams() {
    const fx = settings.value.fx
    return {
      volume: fx.volume, reverb: fx.reverb, echo: fx.echo,
      echoTime: fx.echoTime, bass: fx.bass, treble: fx.treble,
    }
  }

  function applyFx() {
    const native = nativeMonitor()
    if (native && monitorOn) native.setParams(fxParams()).catch(() => {})
    if (!audioCtx || !outGain) return
    const fx = settings.value.fx
    const t = audioCtx.currentTime
    outGain.gain.setTargetAtTime(fx.volume, t, 0.02)
    bass!.gain.setTargetAtTime(fx.bass, t, 0.02)
    treble!.gain.setTargetAtTime(fx.treble, t, 0.02)
    reverbGain!.gain.setTargetAtTime(fx.reverb, t, 0.02)
    delay!.delayTime.setTargetAtTime(fx.echoTime, t, 0.02)
    feedback!.gain.setTargetAtTime(Math.min(0.85, fx.echo * 0.7), t, 0.02)
    echoGain!.gain.setTargetAtTime(fx.echo, t, 0.02)
  }

  function stopHostMicMonitor() {
    const native = nativeMonitor()
    if (native) native.stop().catch(() => {})
    if (audioCtx && outGain) { try { outGain.disconnect(audioCtx.destination) } catch { /* */ } }
  }

  function setMonitor(on: boolean) {
    monitorOn = on
    // Phone-as-mic: the host must NEVER run its own mic monitor — doing so
    // captures the host's built-in mic and feeds back as echo/static. The
    // singer already hears themselves from the phone (local, near-zero).
    if (externalActive.value) { stopHostMicMonitor(); return }
    const native = nativeMonitor()
    if (native) {
      // Native path owns the speaker; keep the web graph detached.
      if (audioCtx && outGain) { try { outGain.disconnect(audioCtx.destination) } catch { /* */ } }
      if (on) native.start(fxParams()).catch(() => {})
      else native.stop().catch(() => {})
      return
    }
    if (!audioCtx || !outGain) return
    try { outGain.disconnect(audioCtx.destination) } catch { /* */ }
    if (on) outGain.connect(audioCtx.destination)
  }

  watch(() => settings.value.fx, applyFx, { deep: true })
  watch(() => settings.value.fx.monitor, (on) => setMonitor(on))

  /** Turn phone-as-mic scoring on/off (host reads streamed PCM, not local mic). */
  function setExternal(on: boolean) {
    externalActive.value = on
    if (on) {
      externalBuf = new Float32Array(EXT_SIZE)
      externalWritten = 0
      stopHostMicMonitor() // kill any host-mic monitor immediately (no feedback)
    } else {
      stopExternalPlayback()
      // Restore the host-mic monitor if the user had "hear my voice" on.
      if (settings.value.fx.monitor) setMonitor(true)
    }
  }

  /** Feed a chunk of streamed mic PCM (from the phone) into the ring buffer. */
  function feedExternal(samples: Float32Array, rate: number) {
    externalRate = rate
    const n = samples.length
    if (n >= EXT_SIZE) {
      externalBuf.set(samples.subarray(n - EXT_SIZE))
    } else {
      externalBuf.copyWithin(0, n)
      externalBuf.set(samples, EXT_SIZE - n)
    }
    externalWritten = Math.min(EXT_SIZE, externalWritten + n)
    if (externalActive.value) playExternal(samples, rate)
  }

  // Play the relayed phone voice through the HOST speakers so the room hears
  // the singer. A small jitter cushion keeps scheduled chunks gap-free. The
  // singer's own monitoring stays on the phone (near-zero), so this stream's
  // network latency doesn't affect what the singer hears.
  function playExternal(samples: Float32Array, rate: number) {
    if (!import.meta.client) return
    if (!playCtx) { playCtx = new AudioContext(); playNext = 0 }
    const ctx = playCtx
    const buf = ctx.createBuffer(1, samples.length, rate)
    buf.copyToChannel(samples.slice(), 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const now = ctx.currentTime
    if (playNext < now) playNext = now + 0.06
    src.start(playNext)
    playNext += buf.duration
  }

  function stopExternalPlayback() {
    playCtx?.close().catch(() => {})
    playCtx = null
    playNext = 0
  }

  async function start(deviceId?: string) {
    if (active.value) return
    error.value = null
    // Phone-as-mic: the host scores from streamed audio; no local mic needed.
    if (externalActive.value) { active.value = true; return }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        } as MediaTrackConstraints,
      })
      audioCtx = new AudioContext({ latencyHint: 0 })
      const src = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      buffer = new Float32Array(analyser.fftSize)
      src.connect(analyser)
      buildFx(src)
      active.value = true
    } catch (e: any) {
      error.value = e?.message || 'Cannot access the microphone'
      active.value = false
    }
  }

  function sample(): number | null {
    if (externalActive.value) {
      if (externalWritten < EXT_SIZE) return null
      const freq = autoCorrelate(externalBuf, externalRate)
      if (freq > 0 && freq < 2000) {
        currentFreq.value = freq
        const midi = freqToMidi(freq)
        currentMidi.value = midi
        return midi
      }
      currentFreq.value = 0
      currentMidi.value = null
      return null
    }
    if (!analyser || !audioCtx || !buffer) return null
    analyser.getFloatTimeDomainData(buffer)
    const freq = autoCorrelate(buffer, audioCtx.sampleRate)
    if (freq > 0 && freq < 2000) {
      currentFreq.value = freq
      const midi = freqToMidi(freq)
      currentMidi.value = midi
      return midi
    }
    currentFreq.value = 0
    currentMidi.value = null
    return null
  }

  function stop() {
    nativeMonitor()?.stop().catch(() => {})
    stopExternalPlayback()
    stream?.getTracks().forEach((t) => t.stop())
    audioCtx?.close().catch(() => {})
    analyser = null
    audioCtx = null
    stream = null
    buffer = null
    outGain = null
    active.value = false
    currentMidi.value = null
    currentFreq.value = 0
  }

  return { active, error, currentFreq, currentMidi, externalActive, setExternal, feedExternal, start, sample, stop, setMonitor }
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'audioinput')
  } catch {
    return []
  }
}
