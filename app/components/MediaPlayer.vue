<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'

const props = withDefaults(defineProps<{ song: RuntimeSong; autoplay?: boolean }>(), { autoplay: true })
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

// One-shot: timeupdate fires several times per second, so guard against
// emitting 'ended' more than once (which would skip queued songs). The player
// remounts per song (keyed by id), so this resets for each song.
let advanced = false
function onEnded() {
  if (advanced) return
  advanced = true
  bus.state.value = { ...bus.state.value, playing: false }
  emit('ended')
}

// Cue-point clip: this song may be one segment of a bigger merged video. Start
// at clip.startSec and stop at clip.endSec (→ next in queue).
// For a STREAMED clip the server already starts at the timecode and ends the
// clip (via -ss/-t), so the player must not also seek/cut — only file clips do.
const clipStart = computed(() => (props.song.needsStream ? 0 : props.song.clip?.startSec ?? 0))
function seekToStart() {
  const el = mediaEl.value
  if (!el || props.song.needsStream) return
  if (clipStart.value > 0) { try { el.currentTime = clipStart.value } catch { /* not seekable yet */ } }
  // For a clip we hold playback until metadata is ready, then start here — so
  // there's no flash of the file's beginning before the seek.
  if (props.autoplay && clipStart.value > 0) el.play().catch(() => {})
}
function onTimeUpdate() {
  if (props.song.needsStream) return
  const end = props.song.clip?.endSec
  const el = mediaEl.value
  if (end != null && el && !advanced && el.currentTime >= end) { el.pause(); onEnded() }
}

const offCommand = bus.onCommand((c) => {
  const el = mediaEl.value
  if (!el) return
  switch (c.action) {
    case 'play': onPlay(); el.play().catch(() => {}); break
    case 'pause': el.pause(); break
    case 'toggle': el.paused ? (onPlay(), el.play().catch(() => {})) : el.pause(); break
    case 'restart': el.currentTime = clipStart.value; onPlay(); el.play().catch(() => {}); break
    case 'volume': el.volume = Math.min(1, Math.max(0, c.value ?? 1)); break
  }
})

onMounted(() => {
  // Auto-start so a queued song plays immediately when it comes up. For a clip
  // that starts mid-file, playback is started in seekToStart (after the seek)
  // to avoid a flash of the file's beginning.
  if (props.autoplay && clipStart.value === 0) nextTick(() => { mediaEl.value?.play().catch(() => {}) })
})

// A clip song shares its file with others; when the song changes to a different
// clip (or the same file), jump to the new start time.
watch(() => props.song.id, () => nextTick(seekToStart))

// Auto-hiding controls (like a DVD player): the top bar + footer fade out after
// a few seconds of no mouse movement and reappear when the cursor moves. Click
// the video to toggle them on demand.
const controlsVisible = ref(true)
let hideTimer: ReturnType<typeof setTimeout> | null = null
function scheduleHide() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { controlsVisible.value = false }, 3000)
}
function showControls() {
  controlsVisible.value = true
  scheduleHide()
}
function toggleControls() {
  controlsVisible.value = !controlsVisible.value
  if (controlsVisible.value) scheduleHide()
  else if (hideTimer) clearTimeout(hideTimer)
}
onMounted(scheduleHide)
onBeforeUnmount(() => { offCommand(); ctx?.close().catch(() => {}); if (hideTimer) clearTimeout(hideTimer) })

const channelLabels: Record<string, string> = {
  stereo: 'Original (L+R)',
  left: 'Left channel',
  right: 'Right channel',
}
</script>

<template>
  <div class="mplayer" :class="{ 'controls-hidden': !controlsVisible }" @mousemove="showControls">
    <header class="mplayer__bar">
      <button class="icon-btn" @click="emit('close')"><i class="bi bi-arrow-left" /> Back</button>
      <div class="mplayer__title">
        <strong>{{ props.song.title }}</strong>
        <span>{{ props.song.artist }} · {{ props.song.source }}</span>
      </div>
      <div class="voice">
        <span class="label">Voice:</span>
        <div class="segmented">
          <button
            v-for="opt in (['stereo', 'left', 'right'] as const)"
            :key="opt"
            :class="{ active: channel === opt }"
            @click="channel = opt"
          >{{ opt === 'stereo' ? 'On' : opt === 'left' ? 'L' : 'R' }}</button>
        </div>
      </div>
    </header>

    <div class="stage" @click="toggleControls">
      <video v-if="isVideo" ref="mediaEl" :src="props.song.videoUrl" controls @play="onPlay" @pause="onPause" @ended="onEnded" @loadedmetadata="seekToStart" @timeupdate="onTimeUpdate" />
      <div v-else class="audio-stage">
        <div class="disc"><i class="bi bi-music-note-beamed" /></div>
        <audio ref="mediaEl" :src="props.song.audioUrl" controls @play="onPlay" @pause="onPause" @ended="onEnded" @loadedmetadata="seekToStart" @timeupdate="onTimeUpdate" />
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Full-bleed video (fills the window) with an overlay bar that auto-hides. */
.mplayer { position: relative; height: 100%; background: #000; overflow: hidden; }
.stage { position: absolute; inset: 0; background: #000; display: flex; align-items: center; justify-content: center; }
.stage video { width: 100%; height: 100%; object-fit: contain; }
.audio-stage { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 16px;
  background: radial-gradient(120% 100% at 50% 0%, var(--stage-1) 0%, var(--stage-2) 70%); width: 100%; height: 100%;
  justify-content: center; }
.disc { font-size: 84px; }
.audio-stage audio { width: 100%; max-width: 420px; }
.mplayer__bar { position: absolute; top: 0; left: 0; right: 0; z-index: 3; display: flex; align-items: center; gap: 14px;
  padding: 14px 18px; color: #fff; background: linear-gradient(to bottom, rgba(0,0,0,.75), transparent);
  transition: opacity .3s ease; }
.mplayer__title { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; flex: 1; }
.mplayer__title strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mplayer__title span { font-size: 13px; color: rgba(255,255,255,.7); }
.controls-hidden { cursor: none; }
.controls-hidden .mplayer__bar { opacity: 0; pointer-events: none; }
.voice { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.label { font-size: 14px; color: rgba(255,255,255,.8); }
.segmented { display: inline-flex; background: rgba(255,255,255,.14); border-radius: 999px; padding: 3px; }
.segmented button { border: none; background: none; color: #fff; padding: 6px 12px; border-radius: 999px;
  cursor: pointer; font-size: 13px; opacity: .7; }
.segmented button.active { background: var(--accent-grad); color: #fff; opacity: 1; font-weight: 600; }
.icon-btn { background: rgba(255,255,255,.14); border: none; color: #fff; cursor: pointer; font-size: 14px;
  padding: 8px 12px; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; }

@media (max-width: 560px) {
  .segmented { width: 100%; display: flex; }
  .segmented button { flex: 1; padding: 9px 6px; }
  .disc { font-size: 64px; }
}
</style>
