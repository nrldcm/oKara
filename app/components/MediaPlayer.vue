<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'

const props = defineProps<{ song: RuntimeSong }>()
const emit = defineEmits<{ close: [] }>()
const { settings } = useSettings()

const bus = useRemoteBus()
const mediaEl = ref<HTMLMediaElement | null>(null)
const isVideo = computed(() => props.song.kind === 'video')
const channel = ref<'stereo' | 'left' | 'right'>(settings.value.voiceChannel)

// Route one stereo channel to both speakers (PH videoke discs put the guide
// vocal on one channel and the minus-one on the other).
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

watch(() => bus.command.value.seq, () => {
  const el = mediaEl.value
  if (!el) return
  const c = bus.command.value
  switch (c.action) {
    case 'play': onPlay(); el.play().catch(() => {}); break
    case 'pause': el.pause(); break
    case 'toggle': el.paused ? (onPlay(), el.play().catch(() => {})) : el.pause(); break
    case 'restart': el.currentTime = 0; onPlay(); el.play().catch(() => {}); break
    case 'volume': el.volume = Math.min(1, Math.max(0, c.value ?? 1)); break
  }
})

onBeforeUnmount(() => { ctx?.close().catch(() => {}) })

const channelLabels: Record<string, string> = {
  stereo: 'Original (L+R)',
  left: 'Left channel',
  right: 'Right channel',
}
</script>

<template>
  <div class="mplayer">
    <header class="mplayer__bar">
      <button class="icon-btn" @click="emit('close')">← Balik</button>
      <div class="mplayer__title">
        <strong>{{ props.song.title }}</strong>
        <span>{{ props.song.artist }} · {{ props.song.source }}</span>
      </div>
    </header>

    <div class="stage">
      <video
        v-if="isVideo"
        ref="mediaEl"
        :src="props.song.videoUrl"
        controls
        @play="onPlay"
        @pause="onPause"
      />
      <div v-else class="audio-stage">
        <div class="disc">🎵</div>
        <audio
          ref="mediaEl"
          :src="props.song.audioUrl"
          controls
          @play="onPlay"
          @pause="onPause"
        />
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
        Tip: kung naka-burn ang boses sa isang channel, pumili ng "Left" o "Right" para sa minus-one.
      </p>
    </footer>
  </div>
</template>

<style scoped>
.mplayer { display: flex; flex-direction: column; height: 100%; background: #0d0d1a; }
.mplayer__bar { display: flex; align-items: center; gap: 16px; padding: 12px 16px; }
.mplayer__title { display: flex; flex-direction: column; line-height: 1.2; }
.mplayer__title span { font-size: 13px; opacity: .6; }
.stage { flex: 1; margin: 0 12px; border-radius: 16px; overflow: hidden; background: #000;
  display: flex; align-items: center; justify-content: center; }
.stage video { width: 100%; height: 100%; object-fit: contain; }
.audio-stage { display: flex; flex-direction: column; align-items: center; gap: 24px; }
.disc { font-size: 90px; }
.mplayer__controls { padding: 16px; }
.voice { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.label { font-size: 14px; opacity: .8; }
.segmented { display: inline-flex; background: #1a1a2e; border-radius: 999px; padding: 4px; }
.segmented button { border: none; background: none; color: #fff; padding: 8px 16px; border-radius: 999px;
  cursor: pointer; font-size: 13px; opacity: .7; }
.segmented button.active { background: #ff5da2; opacity: 1; font-weight: 600; }
.tip { font-size: 12px; opacity: .5; margin-top: 10px; }
.icon-btn { background: none; border: none; color: #fff; opacity: .8; cursor: pointer; font-size: 15px; }
</style>
