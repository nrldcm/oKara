/** Fundamental frequency (Hz) of a time-domain buffer, or -1 if none (ACF2+). */
export function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length

  let rms = 0
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01) return -1

  let r1 = 0
  let r2 = SIZE - 1
  const threshold = 0.2
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < threshold) { r1 = i; break }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < threshold) { r2 = SIZE - i; break }
  }

  const trimmed = buf.subarray(r1, r2)
  const n = trimmed.length
  if (n < 2) return -1

  const c = new Float32Array(n)
  for (let lag = 0; lag < n; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) sum += trimmed[i] * trimmed[i + lag]
    c[lag] = sum
  }

  let d = 0
  while (d < n - 1 && c[d] > c[d + 1]) d++

  let maxVal = -1
  let maxPos = -1
  for (let i = d; i < n; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i }
  }
  if (maxPos <= 0) return -1

  let T0 = maxPos
  const x1 = c[T0 - 1] ?? 0
  const x2 = c[T0]
  const x3 = c[T0 + 1] ?? 0
  const a = (x1 + x3 - 2 * x2) / 2
  const b = (x3 - x1) / 2
  if (a) T0 -= b / (2 * a)

  return sampleRate / T0
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440)
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function midiName(midi: number): string {
  const m = Math.round(midi)
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`
}

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12
}

/** Smallest circular distance between two pitch classes (0..6). */
export function pitchClassDistance(a: number, b: number): number {
  const diff = Math.abs(pitchClass(a) - pitchClass(b))
  return Math.min(diff, 12 - diff)
}

/** UltraStar relative pitch -> absolute MIDI, using C4 (60) as the base. */
export const PITCH_BASE_MIDI = 60
export function relativePitchToMidi(pitch: number): number {
  return PITCH_BASE_MIDI + pitch
}
