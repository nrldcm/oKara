<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'
import { beatToMs, parseUltraStar, type Line, type Note } from '~/utils/ultrastar'
import { midiToFreq, pitchClassDistance, relativePitchToMidi } from '~/utils/pitch'

const props = defineProps<{ song: RuntimeSong }>()
const emit = defineEmits<{ close: []; ended: [] }>()

const { settings } = useSettings()
const { theme } = useTheme()
const pitch = usePitch()
const bus = useRemoteBus()
const volume = ref(1)
const showFx = ref(false)

const parsed = parseUltraStar(props.song.txt ?? '')
const isSynth = !props.song.audioUrl

interface TimedNote extends Note {
  startMs: number
  endMs: number
  durMs: number
  weight: number
  scorable: boolean
  midi: number
  hit: number
}
interface TimedLine extends Line {
  startMs: number
  endMs: number
  timed: TimedNote[]
}

const timedLines: TimedLine[] = parsed.lines.map((line) => {
  const timed = line.notes.map((n) => {
    const startMs = beatToMs(n.startBeat, parsed.bpm, parsed.gap)
    const endMs = beatToMs(n.startBeat + n.length, parsed.bpm, parsed.gap)
    const scorable = n.type !== 'freestyle'
    const golden = n.type === 'golden' || n.type === 'goldenRap'
    return {
      ...n,
      startMs,
      endMs,
      durMs: Math.max(1, endMs - startMs),
      weight: scorable ? n.length * (golden ? 2 : 1) : 0,
      scorable,
      midi: relativePitchToMidi(n.pitch),
      hit: 0,
    } as TimedNote
  })
  return {
    ...line,
    startMs: beatToMs(line.startBeat, parsed.bpm, parsed.gap),
    endMs: beatToMs(line.endBeat, parsed.bpm, parsed.gap),
    timed,
  }
})

const allNotes = timedLines.flatMap((l) => l.timed)
const totalWeight = allNotes.reduce((s, n) => s + n.weight, 0) || 1
const songEndMs = (allNotes.at(-1)?.endMs ?? 0) + 1500
const MAX_SCORE = 10000

const canvas = ref<HTMLCanvasElement | null>(null)
const audioEl = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const finished = ref(false)
const score = ref(0)

let raf = 0
let lastFrame = 0

let synthCtx: AudioContext | null = null
let synthStart = 0
let pausedMs = 0
let scheduled: { osc: OscillatorNode; gain: GainNode }[] = []

function nowMs(): number {
  if (isSynth) {
    return playing.value && synthCtx ? (synthCtx.currentTime - synthStart) * 1000 : pausedMs
  }
  return (audioEl.value?.currentTime ?? 0) * 1000
}

function scheduleSynth(fromMs: number) {
  synthCtx = new AudioContext()
  synthStart = synthCtx.currentTime - fromMs / 1000
  scheduled = []
  for (const n of allNotes) {
    if (n.endMs <= fromMs) continue
    const startAt = Math.max(synthCtx.currentTime, synthStart + n.startMs / 1000)
    const endAt = synthStart + n.endMs / 1000
    const osc = synthCtx.createOscillator()
    const gain = synthCtx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = midiToFreq(n.midi)
    const peak = Math.max(0.0002, 0.25 * volume.value)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02)
    gain.gain.setValueAtTime(peak, Math.max(startAt + 0.02, endAt - 0.05))
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt)
    osc.connect(gain).connect(synthCtx.destination)
    osc.start(startAt)
    osc.stop(endAt + 0.05)
    scheduled.push({ osc, gain })
  }
}

function stopSynth() {
  scheduled.forEach(({ osc }) => { try { osc.stop() } catch { /* */ } })
  scheduled = []
  synthCtx?.close().catch(() => {})
  synthCtx = null
}

let starting = false
let disposed = false

function resetScore() {
  score.value = 0
  allNotes.forEach((n) => { n.hit = 0 })
}

async function play() {
  if (playing.value || starting) return
  if (finished.value) {
    finished.value = false
    pausedMs = 0
    resetScore()
    if (isSynth) stopSynth()
    else if (audioEl.value) audioEl.value.currentTime = 0
  }
  starting = true
  try {
    if (!pitch.active.value) await pitch.start(settings.value.micDeviceId || undefined)
  } finally {
    starting = false
  }
  if (disposed) return
  playing.value = true
  if (isSynth) scheduleSynth(pausedMs)
  else await audioEl.value?.play().catch(() => {})
  lastFrame = performance.now()
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(loop)
}

function pause() {
  if (!playing.value) return
  if (isSynth) { pausedMs = nowMs(); stopSynth() }
  else audioEl.value?.pause()
  playing.value = false
  cancelAnimationFrame(raf)
}

function restart() {
  const wasPlaying = playing.value
  cancelAnimationFrame(raf)
  if (isSynth) stopSynth()
  else if (audioEl.value) audioEl.value.currentTime = 0
  finished.value = false
  pausedMs = 0
  resetScore()
  playing.value = false
  if (wasPlaying) play()
}

function toggle() {
  playing.value ? pause() : play()
}

const modeNames = Object.keys(MIC_MODES)
function cycleMode() {
  const i = modeNames.indexOf(settings.value.fx.mode)
  applyMicMode(settings.value.fx, modeNames[(i + 1) % modeNames.length])
}

function applyVolume() {
  if (audioEl.value) audioEl.value.volume = volume.value
}

watch(playing, (v) => { bus.state.value = { ...bus.state.value, playing: v, volume: volume.value } })

const offCommand = bus.onCommand((c) => {
  switch (c.action) {
    case 'play': play(); break
    case 'pause': pause(); break
    case 'toggle': toggle(); break
    case 'restart': restart(); break
    case 'volume': volume.value = Math.min(1, Math.max(0, c.value ?? 1)); applyVolume(); break
  }
})

function loop() {
  const t = nowMs()
  const frameTime = performance.now()
  const dt = Math.min(100, frameTime - lastFrame)
  lastFrame = frameTime

  const sung = pitch.sample()
  updateScore(t, dt, sung)
  draw(t, sung)

  if (t >= songEndMs) { finish(); return }
  if (playing.value) raf = requestAnimationFrame(loop)
}

function updateScore(t: number, dt: number, sung: number | null) {
  const active = allNotes.find((n) => n.scorable && t >= n.startMs && t < n.endMs)
  if (active && sung != null) {
    const dist = pitchClassDistance(sung, active.midi)
    const tol = settings.value.scoringTolerance
    const quality = dist === 0 ? 1 : dist <= tol ? 0.5 : 0
    if (quality > 0) active.hit = Math.min(active.durMs, active.hit + dt * quality)
  }
  let sum = 0
  for (const n of allNotes) sum += Math.min(1, n.hit / n.durMs) * n.weight
  score.value = Math.round((sum / totalWeight) * MAX_SCORE)
}

function finish() {
  playing.value = false
  finished.value = true
  if (isSynth) stopSynth()
  cancelAnimationFrame(raf)
  emit('ended')
}

interface Palette {
  text: string; muted: string; faint: string; accent: string; gold: string; noteBg: string; info: string
}
let palette: Palette = defaultPalette()
function defaultPalette(): Palette {
  return { text: '#fff', muted: '#aaa', faint: '#777', accent: '#ff5da2', gold: '#ffd54a', noteBg: '#2a2a44', info: '#4ad7ff' }
}
function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement)
  const g = (n: string, fb: string) => s.getPropertyValue(n).trim() || fb
  return {
    text: g('--text', '#fff'),
    muted: g('--text-muted', '#aaa'),
    faint: g('--text-faint', '#777'),
    accent: g('--accent', '#ff5da2'),
    gold: g('--gold', '#ffd54a'),
    noteBg: g('--note-bg', '#2a2a44'),
    info: g('--info', '#4ad7ff'),
  }
}
watch(theme, () => { palette = readPalette(); draw(nowMs(), pitch.currentMidi.value) })

function currentLineAt(t: number): { line: TimedLine | null; next: TimedLine | null } {
  let line: TimedLine | null = null
  let next: TimedLine | null = null
  for (const l of timedLines) {
    if (l.startMs <= t + 400) line = l
    else if (!next) next = l
  }
  if (!line && timedLines.length) line = timedLines[0]
  return { line, next }
}

function mapY(midi: number, min: number, max: number, top: number, h: number): number {
  const range = Math.max(4, max - min)
  return top + h - ((midi - min) / range) * h
}

function draw(t: number, sung: number | null) {
  const cv = canvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')!
  const W = cv.clientWidth
  const H = cv.clientHeight
  ctx.clearRect(0, 0, W, H)

  const { line, next } = currentLineAt(t)

  const padX = Math.max(14, W * 0.04)
  const top = 18
  const zoneH = H * 0.5

  if (line && line.timed.length) {
    const midis = line.timed.map((n) => n.midi)
    const minM = Math.min(...midis) - 3
    const maxM = Math.max(...midis) + 3
    const lo = line.startMs
    const hi = Math.max(line.endMs, lo + 1)
    const mapX = (ms: number) => padX + ((ms - lo) / (hi - lo)) * (W - padX * 2)

    for (const n of line.timed) {
      const x = mapX(n.startMs)
      const w = Math.max(6, mapX(n.endMs) - x)
      const y = mapY(n.midi, minM, maxM, top, zoneH - 40)
      const barH = 12
      const done = n.hit / n.durMs
      const isActive = t >= n.startMs && t < n.endMs
      ctx.fillStyle = palette.noteBg
      roundRect(ctx, x, y - barH / 2, w, barH, 6); ctx.fill()
      ctx.fillStyle = n.type.includes('golden') ? palette.gold : palette.info
      roundRect(ctx, x, y - barH / 2, w * Math.min(1, done), barH, 6); ctx.fill()
      if (isActive) {
        ctx.strokeStyle = palette.text
        ctx.lineWidth = 2
        roundRect(ctx, x, y - barH / 2, w, barH, 6); ctx.stroke()
      }
    }

    const px = mapX(Math.min(hi, Math.max(lo, t)))
    ctx.strokeStyle = palette.faint
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + zoneH - 30); ctx.stroke()

    if (sung != null) {
      let m = sung
      while (m < minM - 6) m += 12
      while (m > maxM + 6) m -= 12
      const y = mapY(m, minM, maxM, top, zoneH - 40)
      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.fillStyle = palette.accent
      ctx.beginPath(); ctx.arc(px, y, 16, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = palette.accent
      ctx.beginPath(); ctx.arc(px, y, 8, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
  }

  drawLyrics(ctx, W, H, line, next, t)
}

function drawLyrics(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  line: TimedLine | null, next: TimedLine | null, t: number,
) {
  const baseY = H * 0.72
  const fs = Math.max(20, Math.min(40, W / 16))
  ctx.textBaseline = 'middle'

  if (line) {
    ctx.font = `bold ${fs}px system-ui, sans-serif`
    const widths = line.timed.map((n) => ctx.measureText(n.text).width)
    const total = widths.reduce((a, b) => a + b, 0)
    let x = W / 2 - total / 2
    line.timed.forEach((n, i) => {
      const w = widths[i]
      const past = t >= n.endMs
      const active = t >= n.startMs && t < n.endMs
      ctx.fillStyle = past ? palette.gold : active ? palette.text : palette.muted
      ctx.textAlign = 'left'
      ctx.fillText(n.text, x, baseY)
      if (active) {
        const p = (t - n.startMs) / n.durMs
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, baseY - fs, w * Math.min(1, p), fs * 2)
        ctx.clip()
        ctx.fillStyle = palette.gold
        ctx.fillText(n.text, x, baseY)
        ctx.restore()
      }
      x += w
    })
  }

  if (next) {
    ctx.font = `${fs * 0.62}px system-ui, sans-serif`
    ctx.fillStyle = palette.faint
    ctx.textAlign = 'center'
    ctx.fillText(next.timed.map((n) => n.text).join(''), W / 2, baseY + fs * 1.35)
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function resize() {
  const cv = canvas.value
  if (!cv) return
  const parent = cv.parentElement!
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  cv.width = parent.clientWidth * dpr
  cv.height = parent.clientHeight * dpr
  const ctx = cv.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw(nowMs(), pitch.currentMidi.value)
}

const percent = computed(() => Math.round((score.value / MAX_SCORE) * 100))
const stars = computed(() => Math.round((percent.value / 100) * 5))
const rating = computed(() => {
  const p = percent.value
  if (p >= 90) return 'Superstar! ⭐'
  if (p >= 75) return "You're a star! 🎤"
  if (p >= 50) return 'Nice! 👍'
  if (p >= 25) return 'Not bad 🙂'
  return 'Keep practicing 💪'
})

onMounted(() => {
  palette = readPalette()
  resize()
  window.addEventListener('resize', resize)
})
onBeforeUnmount(() => {
  disposed = true
  offCommand()
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  stopSynth()
  pitch.stop()
})
</script>

<template>
  <div class="player">
    <header class="player__bar">
      <button class="icon-btn" @click="emit('close')"><i class="bi bi-arrow-left" /> Back</button>
      <div class="player__title">
        <strong>{{ props.song.title }}</strong>
        <span>{{ props.song.artist }}</span>
      </div>
      <div class="player__score">{{ score.toLocaleString() }}</div>
    </header>

    <div class="stage">
      <canvas ref="canvas" />
      <div v-if="!playing && !finished" class="overlay">
        <button class="big-btn" @click="play"><i class="bi bi-play-fill" /> Sing!</button>
        <p class="hint">
          {{ isSynth ? 'Synth melody — sing along and it detects your pitch.' : 'Play and sing along.' }}
        </p>
      </div>

      <div v-if="finished" class="overlay result">
        <h2>{{ rating }}</h2>
        <div class="stars">
          <i v-for="i in 5" :key="i" class="bi" :class="i <= stars ? 'bi-star-fill on' : 'bi-star'" />
        </div>
        <p class="final-score">{{ score.toLocaleString() }} <small>/ {{ MAX_SCORE.toLocaleString() }}</small></p>
        <div class="result-actions">
          <button class="big-btn" @click="play">Again</button>
          <button class="icon-btn" @click="emit('close')">Library</button>
        </div>
      </div>
    </div>

    <footer class="player__controls" v-if="!finished">
      <button class="ctrl" @click="toggle">
        <i class="bi" :class="playing ? 'bi-pause-fill' : 'bi-play-fill'" /> {{ playing ? 'Pause' : 'Play' }}
      </button>
      <button class="ctrl ghost" @click="restart"><i class="bi bi-arrow-clockwise" /> Restart</button>
      <button class="ctrl ghost" @click="cycleMode" title="Quick mic mode"><i class="bi bi-mic-fill" /> {{ settings.fx.mode }}</button>
      <button class="ctrl ghost" @click="showFx = !showFx"><i class="bi bi-sliders" /> FX</button>
      <div class="mic" :class="{ live: pitch.active.value }">
        <span class="dot" /> Mic {{ pitch.active.value ? 'on' : 'off' }}
      </div>
    </footer>

    <div v-if="showFx" class="fx-modal" @click.self="showFx = false">
      <div class="fx-sheet">
        <div class="fx-sheet__head">
          <strong>Vocal effects</strong>
          <button class="icon-btn" @click="showFx = false"><i class="bi bi-x-lg" /></button>
        </div>
        <VocalFxPanel />
      </div>
    </div>

    <audio v-if="!isSynth" ref="audioEl" :src="props.song.audioUrl" preload="auto" @ended="finish" />
  </div>
</template>

<style scoped>
.player { display: flex; flex-direction: column; height: 100%; background: var(--bg); }
.player__bar { display: flex; align-items: center; gap: 14px; padding: 12px 16px; }
.player__title { flex: 1; display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.player__title strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.player__title span { font-size: 13px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.player__score { font-variant-numeric: tabular-nums; font-size: 26px; font-weight: 800; color: var(--gold); flex-shrink: 0; }
.stage { position: relative; flex: 1; margin: 0 12px; border-radius: 16px; overflow: hidden;
  background: radial-gradient(120% 100% at 50% 0%, var(--stage-1) 0%, var(--stage-2) 70%); }
.stage canvas { width: 100%; height: 100%; display: block; }
.overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 14px; background: color-mix(in srgb, var(--bg) 55%, transparent); padding: 16px; }
.big-btn { font-size: 20px; font-weight: 700; padding: 15px 32px; border: none; border-radius: 999px;
  background: var(--accent-grad); color: #fff; cursor: pointer; }
.big-btn:hover { filter: brightness(1.08); }
.hint { color: var(--text-muted); font-size: 14px; text-align: center; }
.result h2 { font-size: 28px; margin: 0; }
.stars { display: flex; gap: 6px; }
.stars i { font-size: 34px; color: var(--border); }
.stars i.on { color: var(--gold); }
.final-score { font-size: 32px; font-weight: 800; color: var(--gold); }
.final-score small { font-size: 16px; color: var(--text-muted); }
.result-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.player__controls { display: flex; align-items: center; gap: 12px; padding: 14px 16px; flex-wrap: wrap; }
.ctrl { padding: 11px 22px; border-radius: 999px; border: none; font-weight: 600; cursor: pointer;
  background: var(--accent); color: var(--on-accent); }
.ctrl.ghost { background: var(--surface-2); color: var(--text); }
.mic { margin-left: auto; font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
.mic .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text-faint); }
.mic.live .dot { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
.icon-btn { background: none; border: none; color: var(--text); cursor: pointer; font-size: 15px; }
.fx-modal { position: absolute; inset: 0; z-index: 10; background: color-mix(in srgb, var(--bg) 60%, transparent);
  display: flex; align-items: flex-end; justify-content: center; }
.fx-sheet { width: 100%; max-width: 640px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 18px 18px 0 0; padding: 18px 20px 24px; box-shadow: var(--shadow); }
.fx-sheet__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.fx-sheet__head strong { font-size: 17px; }

@media (max-width: 560px) {
  .player__score { font-size: 22px; }
  .big-btn { font-size: 18px; padding: 14px 26px; }
  .ctrl { flex: 1; }
  .mic { width: 100%; margin-left: 0; justify-content: center; }
}
</style>
