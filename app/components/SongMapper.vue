<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'

const props = defineProps<{ song: RuntimeSong }>()
const emit = defineEmits<{ close: []; saved: [number] }>()
const library = useLibrary()

interface Cue { startSec: number; number: number | null; title: string; artist: string }

const videoEl = ref<HTMLVideoElement | null>(null)
const cues = ref<Cue[]>([])
const saving = ref(false)
const nextNumber = ref<number>(1001)
// A raw (streamed) source has no direct URL — resolve a live-stream URL of the
// whole file so it can be played forward and marked. (Scrubbing is limited on a
// stream; play forward and click "Mark song start" as each song begins.)
const videoSrc = ref<string | undefined>(props.song.videoUrl)

onMounted(async () => {
  const max = library.songs.value.reduce((m, s) => Math.max(m, s.number || 0), 1000)
  nextNumber.value = max + 1
  if (!videoSrc.value && props.song.needsStream && props.song.videoPath) {
    const res = await (window as any).okara?.discStream?.({ file: props.song.videoPath })
    if (res?.url) videoSrc.value = res.url
  }
})

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function markHere() {
  const t = videoEl.value?.currentTime ?? 0
  if (cues.value.some((c) => Math.abs(c.startSec - t) < 0.5)) return // avoid dupes
  cues.value.push({ startSec: t, number: nextNumber.value++, title: '', artist: '' })
  cues.value.sort((a, b) => a.startSec - b.startSec)
}

function seekTo(sec: number) {
  if (videoEl.value) { videoEl.value.currentTime = sec; videoEl.value.play().catch(() => {}) }
}

function removeCue(i: number) { cues.value.splice(i, 1) }

const validCount = computed(() => cues.value.filter((c) => c.title.trim() && c.number != null).length)

async function save() {
  const list = cues.value
    .filter((c) => c.title.trim() && c.number != null)
    .map((c) => ({ number: Number(c.number), title: c.title.trim(), artist: c.artist.trim(), startSec: c.startSec }))
  if (!list.length) return
  saving.value = true
  try {
    const n = await library.addClips(props.song, list)
    emit('saved', n)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mapper-backdrop" @click.self="emit('close')">
    <div class="mapper">
      <header class="mapper__head">
        <div>
          <h3><i class="bi bi-scissors" /> Map songs in this video</h3>
          <p class="muted">Play the video, and each time a new song starts click <strong>Mark song start</strong>. Then type the number, title, and artist from your songbook.</p>
        </div>
        <button class="close" @click="emit('close')"><i class="bi bi-x-lg" /></button>
      </header>

      <div class="mapper__body">
        <div class="mapper__video">
          <video ref="videoEl" :src="videoSrc" controls />
          <p v-if="props.song.needsStream" class="stream-note"><i class="bi bi-info-circle" /> Streamed source — play forward and click “Mark song start” as each song begins (scrubbing back is limited).</p>
          <button class="mark" @click="markHere"><i class="bi bi-bookmark-plus-fill" /> Mark song start (at current time)</button>
        </div>

        <div class="mapper__cues">
          <div class="cues__head">
            <strong>{{ cues.length }} song{{ cues.length === 1 ? '' : 's' }} marked</strong>
            <span v-if="validCount !== cues.length" class="muted small">{{ validCount }} ready (need number + title)</span>
          </div>
          <p v-if="!cues.length" class="empty">No songs marked yet. Play the video and click “Mark song start” when a song begins.</p>
          <div v-for="(c, i) in cues" :key="i" class="cue">
            <button class="cue__time" title="Jump here" @click="seekTo(c.startSec)"><i class="bi bi-play-fill" /> {{ fmt(c.startSec) }}</button>
            <input v-model.number="c.number" class="cue__num" type="number" min="1" placeholder="No." />
            <input v-model="c.title" class="cue__title" type="text" placeholder="Song title" />
            <input v-model="c.artist" class="cue__artist" type="text" placeholder="Artist" />
            <button class="cue__del" title="Remove" @click="removeCue(i)"><i class="bi bi-x-lg" /></button>
          </div>
        </div>
      </div>

      <footer class="mapper__foot">
        <span class="muted small">Saved songs are searchable by number/title/artist and play from their start time — on the host and the phone remote.</span>
        <button class="save" :disabled="!validCount || saving" @click="save">
          <i class="bi bi-check-lg" /> {{ saving ? 'Saving…' : `Save ${validCount} song${validCount === 1 ? '' : 's'}` }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.mapper-backdrop { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; padding: 20px; }
.mapper { width: min(1100px, 100%); max-height: 92vh; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; }
.mapper__head { display: flex; align-items: flex-start; gap: 14px; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.mapper__head h3 { margin: 0 0 4px; font-size: 16px; display: flex; align-items: center; gap: 8px; }
.muted { color: var(--text-muted); }
.muted.small, .small { font-size: 12px; }
.mapper__head p { margin: 0; font-size: 13px; line-height: 1.5; max-width: 720px; }
.close { border: none; background: var(--surface-2); color: var(--text); width: 34px; height: 34px; border-radius: 10px; cursor: pointer; margin-left: auto; }
.mapper__body { display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; padding: 16px 18px; overflow: auto; }
.mapper__video video { width: 100%; border-radius: 12px; background: #000; aspect-ratio: 16/9; }
.stream-note { font-size: 12px; color: var(--text-faint); margin: 8px 0 0; display: flex; gap: 6px; align-items: flex-start; }
.mark { margin-top: 10px; width: 100%; border: none; background: var(--accent-grad); color: #fff; padding: 12px; border-radius: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.cues__head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.empty { color: var(--text-faint); font-size: 13px; }
.mapper__cues { display: flex; flex-direction: column; min-height: 0; }
.cue { display: grid; grid-template-columns: auto 64px 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
.cue__time { border: 1px solid var(--border); background: var(--bg); color: var(--text); border-radius: 8px; padding: 7px 10px; font-variant-numeric: tabular-nums; cursor: pointer; white-space: nowrap; }
.cue input { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 13px; min-width: 0; }
.cue__del { border: none; background: var(--surface-2); color: var(--text-muted); width: 32px; height: 32px; border-radius: 8px; cursor: pointer; }
.mapper__foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 18px; border-top: 1px solid var(--border); flex-wrap: wrap; }
.save { border: none; background: var(--accent-grad); color: #fff; padding: 12px 20px; border-radius: 999px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.save:disabled { opacity: .5; cursor: default; }
@media (max-width: 760px) { .mapper__body { grid-template-columns: 1fr; } }
</style>
