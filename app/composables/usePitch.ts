import { autoCorrelate, freqToMidi } from '~/utils/pitch'

export function usePitch() {
  const active = ref(false)
  const error = ref<string | null>(null)
  const currentFreq = ref(0)
  const currentMidi = ref<number | null>(null)

  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let stream: MediaStream | null = null
  let buffer: Float32Array | null = null

  async function start(deviceId?: string) {
    if (active.value) return
    error.value = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      })
      audioCtx = new AudioContext()
      const src = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      buffer = new Float32Array(analyser.fftSize)
      src.connect(analyser)
      active.value = true
    } catch (e: any) {
      error.value = e?.message || 'Dili ma-access ang mic'
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
    stream?.getTracks().forEach((t) => t.stop())
    audioCtx?.close().catch(() => {})
    analyser = null
    audioCtx = null
    stream = null
    buffer = null
    active.value = false
    currentMidi.value = null
    currentFreq.value = 0
  }

  return { active, error, currentFreq, currentMidi, start, sample, stop }
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'audioinput')
  } catch {
    return []
  }
}
