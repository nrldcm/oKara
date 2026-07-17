<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'

const props = defineProps<{ song: RuntimeSong }>()
const emit = defineEmits<{ close: []; ended: [] }>()
const { settings } = useSettings()

const bus = useRemoteBus()
const mediaEl = ref<HTMLMediaElement | null>(null)
const isVideo = computed(() => props.song.kind === 'video')
const channel = ref<'stereo' | 'left' | 'right'>(settings.value.voiceChannel)

let ctx: AudioContext | null = null
let source: MediaElementAudioSourceNode | null = null
let splitter: ChannelSplitterNode | null = null
let merger: ChannelMergerNode | null = null

function ensureGraph() {
  if (ctx || !mediaEl.value) return
  ctx = new AudioContext()
  source = ctx.createMediaElementSource(mediaEl.value)
  splitter = ctx.createChannelSplitter(2)
  merger = ctx.createChannelMerger(2)
  source.connect(splitter)
  applyChannel()
  merger.connect(ctx.destination)
}

function applyChannel() {
  if (!splitter || !merger) return
  try { splitter.disconnect() } catch { /* */ }
  if (channel.value === 'stereo') {
    splitter.connect(merger, 0, 0)
    splitter.connect(merger, 1, 1)
  } else if (channel.value === 'left') {
    splitter.connect(merger, 0, 0)
    splitter.connect(merger, 0, 1)
  } else {
    splitter.connect(merger, 1, 0)
    splitter.connect(merger, 1, 1)
  }
}

watch(channel, () => { settings.value.voiceChannel = channel.value; applyChannel() })

async function onPlay() {
  ensureGraph()
  if (ctx?.state === 'suspended') await ctx.resume()
  bus.state.value = { ...bus.state.value, playing: true }
}

function onPause() {
  bus.state.value = { ...bus.state.value, playing: false }
}

function onEnded() {
  bus.state.value = { ...bus.state.value, playing: false }
  emit('ended')
}

const offCommand = bus.onCommand((c) => {
  const el = mediaEl.value
  if (!el) return
  switch (c.action) {
    case 'play': onPlay(); el.play().catch(() => {}); break
    case 'pause': el.pause(); break
    case 'toggle': el.paused ? (onPlay(), el.play().catch(() => {})) : el.pause(); break
    case 'restart': el.currentTime = 0; onPlay(); el.play().catch(() => {}); break
    case 'volume': el.volume = Math.min(1, Math.max(0, c.value ?? 1)); break
  }
})

onBeforeUnmount(() => { offCommand(); ctx?.close().catch(() => {}) })

const channelLabels: Record<string, string> = {
  stereo: 'Original (L+R)',
  left: 'Left channel',
  right: 'Right channel',
}
</script>

<template>
  <div class="mplayer">
    <header class="mplayer__bar">
      <button class="icon-btn" @click="emit('close')"><i class="bi bi-arrow-left" /> Back</button>
      <div class="mplayer__title">
        <strong>{{ props.song.title }}</strong>
        <span>{{ props.song.artist }} · {{ props.song.source }}</span>
      </div>
    </header>

    <div class="stage">
      <video v-if="isVideo" ref="mediaEl" :src="props.song.videoUrl" controls @play="onPlay" @pause="onPause" @ended="onEnded" />
      <div v-else class="audio-stage">
        <div class="disc"><i class="bi bi-music-note-beamed" /></div>
        <audio ref="mediaEl" :src="props.song.audioUrl" controls @play="onPlay" @pause="onPause" @ended="onEnded" />
      </div>
    </div>

    <footer class="mplayer__controls">
      <div class="voice">
        <span class="label">Voice / Minus-one:</span>
        <div class="segmented">
          <button
            v-for="opt in (['stereo', 'left', 'right'] as const)"
            :key="opt"
            :class="{ active: channel === opt }"
            @click="channel = opt"
          >{{ channelLabels[opt] }}</button>
        </div>
      </div>
      <p class="tip">
        Tip: if the guide vocals are on one channel, pick "Left" or "Right" for minus-one.
      </p>
    </footer>
  </div>
</template>

<style scoped>
.mplayer { display: flex; flex-direction: column; height: 100%; background: var(--bg); }
.mplayer__bar { display: flex; align-items: center; gap: 14px; padding: 12px 16px; }
.mplayer__title { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.mplayer__title strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mplayer__title span { font-size: 13px; color: var(--text-muted); }
.stage { flex: 1; margin: 0 12px; border-radius: 16px; overflow: hidden; background: #000;
  display: flex; align-items: center; justify-content: center; }
.stage video { width: 100%; height: 100%; object-fit: contain; }
.audio-stage { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 16px;
  background: radial-gradient(120% 100% at 50% 0%, var(--stage-1) 0%, var(--stage-2) 70%); width: 100%; height: 100%;
  justify-content: center; }
.disc { font-size: 84px; }
.audio-stage audio { width: 100%; max-width: 420px; }
.mplayer__controls { padding: 16px; }
.voice { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.label { font-size: 14px; color: var(--text-muted); }
.segmented { display: inline-flex; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 4px; }
.segmented button { border: none; background: none; color: var(--text); padding: 8px 16px; border-radius: 999px;
  cursor: pointer; font-size: 13px; opacity: .7; }
.segmented button.active { background: var(--accent); color: var(--on-accent); opacity: 1; font-weight: 600; }
.tip { font-size: 12px; color: var(--text-faint); margin-top: 10px; }
.icon-btn { background: none; border: none; color: var(--text); cursor: pointer; font-size: 15px; }

@media (max-width: 560px) {
  .segmented { width: 100%; display: flex; }
  .segmented button { flex: 1; padding: 9px 6px; }
  .disc { font-size: 64px; }
}
</style>
