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

  // FX graph
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

  function setMonitor(on: boolean) {
    monitorOn = on
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

  async function start(deviceId?: string) {
    if (active.value) return
    error.value = null
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

  return { active, error, currentFreq, currentMidi, start, sample, stop, setMonitor }
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'audioinput')
  } catch {
    return []
  }
}
