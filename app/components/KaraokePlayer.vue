<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'
import { beatToMs, parseUltraStar, type Line, type Note } from '~/utils/ultrastar'
import {
  midiToFreq, pitchClassDistance, relativePitchToMidi,
} from '~/utils/pitch'

const props = defineProps<{ song: RuntimeSong }>()
const emit = defineEmits<{ close: [] }>()

const { settings } = useSettings()
const pitch = usePitch()
const bus = useRemoteBus()
const volume = ref(1)

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

// ---- transport state ----
const canvas = ref<HTMLCanvasElement | null>(null)
const audioEl = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const finished = ref(false)
const score = ref(0)
const combo = ref(0)
const feedback = ref<{ text: string; kind: string } | null>(null)

let raf = 0
let lastFrame = 0

// synth clock
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
    const peak = 0.25 * volume.value
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + 0.02)
    gain.gain.setValueAtTime(Math.max(0.0002, peak), Math.max(startAt + 0.02, endAt - 0.05))
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

async function play() {
  if (finished.value) restart()
  if (!pitch.active.value) await pitch.start(settings.value.micDeviceId || undefined)
  playing.value = true
  if (isSynth) {
    scheduleSynth(pausedMs)
  } else {
    await audioEl.value?.play().catch(() => {})
  }
  lastFrame = performance.now()
  loop()
}

function pause() {
  playing.value = false
  if (isSynth) {
    pausedMs = nowMs()
    stopSynth()
  } else {
    audioEl.value?.pause()
  }
  cancelAnimationFrame(raf)
}

function restart() {
  finished.value = false
  score.value = 0
  combo.value = 0
  pausedMs = 0
  allNotes.forEach((n) => { n.hit = 0 })
  if (isSynth) stopSynth()
  else if (audioEl.value) audioEl.value.currentTime = 0
}

function toggle() {
  playing.value ? pause() : play()
}

function applyVolume() {
  if (audioEl.value) audioEl.value.volume = volume.value
}

watch(playing, (v) => { bus.state.value = { ...bus.state.value, playing: v, volume: volume.value } })

watch(() => bus.command.value.seq, () => {
  const c = bus.command.value
  switch (c.action) {
    case 'play': if (!playing.value) play(); break
    case 'pause': if (playing.value) pause(); break
    case 'toggle': toggle(); break
    case 'restart': restart(); play(); break
    case 'volume': volume.value = Math.min(1, Math.max(0, c.value ?? 1)); applyVolume(); break
  }
})

// ---- main loop ----
function loop() {
  const t = nowMs()
  const frameTime = performance.now()
  const dt = Math.min(100, frameTime - lastFrame)
  lastFrame = frameTime

  const sung = pitch.sample()
  updateScore(t, dt, sung)
  draw(t, sung)

  if (t >= songEndMs) {
    finish()
    return
  }
  if (playing.value) raf = requestAnimationFrame(loop)
}

function updateScore(t: number, dt: number, sung: number | null) {
  const active = allNotes.find((n) => n.scorable && t >= n.startMs && t < n.endMs)
  if (active && sung != null) {
    const dist = pitchClassDistance(sung, active.midi)
    const tol = settings.value.scoringTolerance
    const quality = dist === 0 ? 1 : dist <= tol ? 0.5 : 0
    if (quality > 0) {
      active.hit = Math.min(active.durMs, active.hit + dt * quality)
    }
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
  drawFinal()
}

// ---- drawing ----
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
  const norm = (midi - min) / range
  return top + h - norm * h
}

function draw(t: number, sung: number | null) {
  const cv = canvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')!
  const W = cv.width
  const H = cv.height
  ctx.clearRect(0, 0, W, H)

  const { line, next } = currentLineAt(t)

  // ----- pitch view (top 55%) -----
  const padX = 24
  const top = 20
  const zoneH = H * 0.5
  if (line && line.timed.length) {
    const midis = line.timed.map((n) => n.midi)
    const minM = Math.min(...midis) - 3
    const maxM = Math.max(...midis) + 3
    const lo = line.startMs
    const hi = Math.max(line.endMs, lo + 1)
    const mapX = (ms: number) => padX + ((ms - lo) / (hi - lo)) * (W - padX * 2)

    // faint pitch grid
    for (const n of line.timed) {
      const x = mapX(n.startMs)
      const w = Math.max(6, mapX(n.endMs) - x)
      const y = mapY(n.midi, minM, maxM, top, zoneH - 40)
      const barH = 12
      const done = n.hit / n.durMs
      const isActive = t >= n.startMs && t < n.endMs
      ctx.fillStyle = '#2a2a44'
      roundRect(ctx, x, y - barH / 2, w, barH, 6)
      ctx.fill()
      // filled portion by score
      const grad = n.type.includes('golden') ? '#ffd54a' : '#4ad7ff'
      ctx.fillStyle = grad
      roundRect(ctx, x, y - barH / 2, w * Math.min(1, done), barH, 6)
      ctx.fill()
      if (isActive) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        roundRect(ctx, x, y - barH / 2, w, barH, 6)
        ctx.stroke()
      }
    }
    // playhead
    const px = mapX(Math.min(hi, Math.max(lo, t)))
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + zoneH - 30); ctx.stroke()

    // sung pitch dot (octave-folded to nearest target)
    if (sung != null) {
      let m = sung
      while (m < minM - 6) m += 12
      while (m > maxM + 6) m -= 12
      const y = mapY(m, minM, maxM, top, zoneH - 40)
      ctx.fillStyle = '#ff5da2'
      ctx.beginPath(); ctx.arc(px, y, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,93,162,0.25)'
      ctx.beginPath(); ctx.arc(px, y, 16, 0, Math.PI * 2); ctx.fill()
    }
  }

  // ----- lyrics (bottom) -----
  drawLyrics(ctx, W, H, line, next, t)
}

function drawLyrics(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  line: TimedLine | null, next: TimedLine | null, t: number,
) {
  const baseY = H * 0.72
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (line) {
    const font = 'bold 34px system-ui, sans-serif'
    ctx.font = font
    const widths = line.timed.map((n) => ctx.measureText(n.text).width)
    const total = widths.reduce((a, b) => a + b, 0)
    let x = W / 2 - total / 2
    line.timed.forEach((n, i) => {
      const w = widths[i]
      const past = t >= n.endMs
      const active = t >= n.startMs && t < n.endMs
      ctx.fillStyle = past ? '#ffd54a' : active ? '#ffffff' : 'rgba(255,255,255,0.45)'
      ctx.textAlign = 'left'
      ctx.fillText(n.text, x, baseY)
      if (active) {
        const p = (t - n.startMs) / n.durMs
        ctx.fillStyle = '#ffd54a'
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, baseY - 24, w * Math.min(1, p), 48)
        ctx.clip()
        ctx.fillText(n.text, x, baseY)
        ctx.restore()
      }
      x += w
    })
  }

  if (next) {
    ctx.font = '22px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.textAlign = 'center'
    ctx.fillText(next.timed.map((n) => n.text).join(''), W / 2, H * 0.72 + 46)
  }
}

function drawFinal() {
  const cv = canvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, cv.width, cv.height)
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

// ---- sizing ----
function resize() {
  const cv = canvas.value
  if (!cv) return
  const parent = cv.parentElement!
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  cv.width = parent.clientWidth * dpr
  cv.height = parent.clientHeight * dpr
  const ctx = cv.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  cv.width = parent.clientWidth * dpr
  cv.height = parent.clientHeight * dpr
  draw(nowMs(), pitch.currentMidi.value)
}

const percent = computed(() => Math.round((score.value / MAX_SCORE) * 100))
const stars = computed(() => Math.round((percent.value / 100) * 5))
const rating = computed(() => {
  const p = percent.value
  if (p >= 90) return 'Superstar! ⭐'
  if (p >= 75) return 'Sikat ka! 🎤'
  if (p >= 50) return 'Ayos ah! 👍'
  if (p >= 25) return 'Keri lang 🙂'
  return 'Practice pa 💪'
})

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  stopSynth()
  pitch.stop()
})
</script>

<template>
  <div class="player">
    <header class="player__bar">
      <button class="icon-btn" @click="emit('close')">← Balik</button>
      <div class="player__title">
        <strong>{{ props.song.title }}</strong>
        <span>{{ props.song.artist }}</span>
      </div>
      <div class="player__score">{{ score.toLocaleString() }}</div>
    </header>

    <div class="stage">
      <canvas ref="canvas" />
      <div v-if="!playing && !finished" class="overlay">
        <button class="big-btn" @click="play">▶ Kanta na!</button>
        <p class="hint">
          {{ isSynth ? 'Synth melody — sing along, i-detect ang pitch mo.' : 'I-play at sabayan ang kanta.' }}
        </p>
      </div>

      <div v-if="finished" class="overlay result">
        <h2>{{ rating }}</h2>
        <div class="stars">
          <span v-for="i in 5" :key="i" :class="{ on: i <= stars }">★</span>
        </div>
        <p class="final-score">{{ score.toLocaleString() }} <small>/ {{ MAX_SCORE.toLocaleString() }}</small></p>
        <div class="result-actions">
          <button class="big-btn" @click="() => { restart(); play() }">Ulit</button>
          <button class="icon-btn" @click="emit('close')">Library</button>
        </div>
      </div>
    </div>

    <footer class="player__controls" v-if="!finished">
      <button class="ctrl" @click="toggle">{{ playing ? '⏸ Pause' : '▶ Play' }}</button>
      <button class="ctrl ghost" @click="restart">↻ Restart</button>
      <div class="mic" :class="{ live: pitch.active.value }">
        <span class="dot" /> Mic {{ pitch.active.value ? 'on' : 'off' }}
        <template v-if="pitch.currentMidi.value != null"> · singing</template>
      </div>
    </footer>

    <audio
      v-if="!isSynth"
      ref="audioEl"
      :src="props.song.audioUrl"
      preload="auto"
      @ended="finish"
    />
  </div>
</template>

<style scoped>
.player { display: flex; flex-direction: column; height: 100%; background: #0d0d1a; }
.player__bar { display: flex; align-items: center; gap: 16px; padding: 12px 16px; }
.player__title { flex: 1; display: flex; flex-direction: column; line-height: 1.2; }
.player__title span { font-size: 13px; opacity: .6; }
.player__score { font-variant-numeric: tabular-nums; font-size: 26px; font-weight: 800; color: #ffd54a; }
.stage { position: relative; flex: 1; margin: 0 12px; border-radius: 16px; overflow: hidden;
  background: radial-gradient(120% 100% at 50% 0%, #1a1a33 0%, #0d0d1a 70%); }
.stage canvas { width: 100%; height: 100%; display: block; }
.overlay { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px; background: rgba(10,10,22,.55); }
.big-btn { font-size: 22px; font-weight: 700; padding: 16px 34px; border: none; border-radius: 999px;
  background: linear-gradient(135deg, #ff5da2, #ff9d5d); color: #fff; cursor: pointer; }
.big-btn:hover { filter: brightness(1.08); }
.hint { opacity: .65; font-size: 14px; }
.result h2 { font-size: 30px; margin: 0; }
.stars span { font-size: 40px; color: #333; }
.stars span.on { color: #ffd54a; }
.final-score { font-size: 34px; font-weight: 800; color: #ffd54a; }
.final-score small { font-size: 16px; opacity: .5; color: #fff; }
.result-actions { display: flex; gap: 12px; }
.player__controls { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.ctrl { padding: 10px 20px; border-radius: 999px; border: none; font-weight: 600; cursor: pointer;
  background: #ff5da2; color: #fff; }
.ctrl.ghost { background: #23233a; color: #fff; }
.mic { margin-left: auto; font-size: 13px; opacity: .6; display: flex; align-items: center; gap: 8px; }
.mic .dot { width: 9px; height: 9px; border-radius: 50%; background: #555; }
.mic.live .dot { background: #4be07a; box-shadow: 0 0 8px #4be07a; }
.icon-btn { background: none; border: none; color: #fff; opacity: .8; cursor: pointer; font-size: 15px; }
</style>
