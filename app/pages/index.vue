<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'
import { FX_PRESETS, MIC_MODES, applyMicMode } from '~/composables/useSettings'

const library = useLibrary()
const { settings, load: loadSettings } = useSettings()
const remote = useRemote()
const pitch = usePitch()
const bus = useRemoteBus()
const { theme, init: initTheme, toggle: toggleTheme } = useTheme()

type View = 'library' | 'import' | 'settings'
const view = ref<View>('library')
const showRemoteModal = ref(false)

const nowPlaying = ref<RuntimeSong | null>(null)
const queue = ref<RuntimeSong[]>([])
const index = ref(0)
const reserved = ref<RuntimeSong[]>([])

onMounted(async () => {
  initTheme()
  loadSettings()
  await library.load()
  await remote.init()
})

function play(song: RuntimeSong) {
  queue.value = library.songs.value
  index.value = queue.value.findIndex((s) => s.id === song.id)
  nowPlaying.value = song
}

function playNext() {
  if (reserved.value.length) { nowPlaying.value = reserved.value.shift()!; syncReserved(); return }
  if (!queue.value.length) return
  index.value = (index.value + 1) % queue.value.length
  nowPlaying.value = queue.value[index.value]
}

function playPrev() {
  if (!queue.value.length) return
  index.value = (index.value - 1 + queue.value.length) % queue.value.length
  nowPlaying.value = queue.value[index.value]
}

function stop() {
  nowPlaying.value = null
}

function onEnded() {
  if (reserved.value.length) playNext()
}

function playNumber(num?: number) {
  const s = num != null ? library.findByNumber(num) : undefined
  if (s) play(s)
  else bus.flash(`Song #${num} not found`)
}

function reserveNumber(num?: number) {
  const s = num != null ? library.findByNumber(num) : undefined
  if (!s) { bus.flash(`Song #${num} not found`); return }
  if (!nowPlaying.value) { play(s); return }
  reserved.value.push(s)
  syncReserved()
  bus.flash(`Reserved: ${s.title}`)
}

function reservedPayload() {
  return reserved.value.map((s) => ({ number: s.number, title: s.title, artist: s.artist }))
}

function syncReserved() {
  bus.state.value = { ...bus.state.value, reserved: reserved.value.length, reservedList: reservedPayload() }
}

function removeReserved(i?: number) {
  if (i == null || i < 0 || i >= reserved.value.length) return
  reserved.value.splice(i, 1)
  syncReserved()
}

function moveReserved(i?: number, dir = 0) {
  if (i == null) return
  const j = i + dir
  if (j < 0 || j >= reserved.value.length) return
  const a = reserved.value
  ;[a[i], a[j]] = [a[j], a[i]]
  syncReserved()
}

watch(nowPlaying, (s) => {
  bus.state.value = {
    ...bus.state.value,
    hasSong: !!s,
    title: s?.title ?? '',
    artist: s?.artist ?? '',
    playing: false,
    reserved: reserved.value.length,
    reservedList: reservedPayload(),
  }
})

// Publish the songbook (number/title/artist) to remotes so phones can browse
// and search the library directly.
watch(library.songs, (list) => {
  remote.publishSongs(list.map((s) => ({ n: s.number, t: s.title, a: s.artist })))
}, { deep: false, immediate: true })

async function onRenumber(id: string, n: number) {
  const err = await library.renumber(id, n)
  if (err) bus.flash(err)
}

// Mirror the mic/soundboard settings into the remote state so the phone's
// Mic tab always shows what the host is using.
watch(() => settings.value.fx, (fx) => {
  bus.state.value = {
    ...bus.state.value,
    fx: {
      mode: fx.mode, monitor: fx.monitor, preset: fx.preset, volume: fx.volume,
      reverb: fx.reverb, echo: fx.echo, echoTime: fx.echoTime, bass: fx.bass, treble: fx.treble,
    },
  }
}, { deep: true, immediate: true })

function asNumber(v: number | string | undefined): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function setFx(key: 'volume' | 'reverb' | 'echo' | 'echoTime' | 'bass' | 'treble', v?: number | string) {
  const n = asNumber(v)
  if (n == null) return
  settings.value.fx[key] = n
  settings.value.fx.preset = 'Custom'
}

const offCommand = bus.onCommand((c) => {
  switch (c.action) {
    case 'next': playNext(); break
    case 'prev': playPrev(); break
    case 'stop': stop(); break
    case 'play-number': playNumber(asNumber(c.value)); break
    case 'reserve-number': reserveNumber(asNumber(c.value)); break
    case 'reserve-remove': removeReserved(asNumber(c.value)); break
    case 'reserve-up': moveReserved(asNumber(c.value), -1); break
    case 'reserve-down': moveReserved(asNumber(c.value), 1); break
    case 'mic-mode':
      if (typeof c.value === 'string' && c.value in MIC_MODES) {
        applyMicMode(settings.value.fx, c.value)
        bus.flash(c.value === 'Off' ? 'Mic off' : `Mic: ${c.value}`)
      }
      break
    case 'fx-monitor': settings.value.fx.monitor = c.value === 1 || c.value === '1'; break
    case 'fx-preset':
      if (typeof c.value === 'string' && c.value in FX_PRESETS) {
        Object.assign(settings.value.fx, FX_PRESETS[c.value])
        settings.value.fx.preset = c.value
      }
      break
    case 'fx-volume': setFx('volume', c.value); break
    case 'fx-reverb': setFx('reverb', c.value); break
    case 'fx-echo': setFx('echo', c.value); break
    case 'fx-echo-time': setFx('echoTime', c.value); break
    case 'fx-bass': setFx('bass', c.value); break
    case 'fx-treble': setFx('treble', c.value); break
    case 'phone-mic-on': pitch.setExternal(true); bus.flash('Phone mic connected'); break
    case 'phone-mic-off': pitch.setExternal(false); bus.flash('Phone mic disconnected'); break
  }
})
onBeforeUnmount(offCommand)

async function onClear() {
  await library.clearAll()
}
</script>

<template>
  <div class="app">
    <nav class="topbar">
      <div class="brand"><i class="bi bi-mic-fill" /> <span>okara</span></div>
      <div class="tabs">
        <button :class="{ active: view === 'library' }" @click="view = 'library'">Library</button>
        <button :class="{ active: view === 'import' }" @click="view = 'import'">Import</button>
        <button :class="{ active: view === 'settings' }" @click="view = 'settings'">Settings</button>
      </div>
      <div class="actions">
        <button v-if="remote.available.value" class="pill" @click="showRemoteModal = true">
          <i class="bi bi-phone-fill" /><span class="pill__label"> Remote</span>
        </button>
        <button class="pill icon" :title="theme === 'dark' ? 'Light mode' : 'Dark mode'" @click="toggleTheme">
          <i class="bi" :class="theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill'" />
        </button>
      </div>
    </nav>

    <Teleport to="body">
      <div v-if="showRemoteModal" class="remote-modal-backdrop" @click.self="showRemoteModal = false">
        <div class="remote-modal">
          <button class="remote-modal__close" @click="showRemoteModal = false"><i class="bi bi-x-lg" /></button>
          <RemotePanel />
        </div>
      </div>
    </Teleport>

    <main class="content">
      <LibraryView v-if="view === 'library'" :songs="library.songs.value" @play="play" @remove="library.remove" @renumber="onRenumber" />
      <ImportView v-else-if="view === 'import'" />
      <SettingsView v-else @clear="onClear" />
    </main>

    <div v-if="nowPlaying" class="stage-overlay">
      <KaraokePlayer v-if="nowPlaying.kind === 'ultrastar'" :key="nowPlaying.id" :song="nowPlaying" @close="stop" @ended="onEnded" />
      <MediaPlayer v-else :key="nowPlaying.id" :song="nowPlaying" @close="stop" @ended="onEnded" />
    </div>
  </div>
</template>

<style scoped>
.app { height: 100vh; height: 100dvh; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; gap: 16px; padding: 12px 18px; border-bottom: 1px solid var(--border); }
.brand { font-size: 20px; font-weight: 800; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.brand span { background: var(--accent-grad); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; }
.tabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs button { border: none; background: none; opacity: .55; padding: 8px 15px; border-radius: 999px;
  cursor: pointer; font-size: 15px; white-space: nowrap; }
.tabs button.active { opacity: 1; background: var(--surface-2); font-weight: 600; }
.actions { margin-left: auto; display: flex; gap: 8px; flex-shrink: 0; }
.pill { border: 1px solid var(--border); background: var(--surface); padding: 8px 14px; border-radius: 999px;
  cursor: pointer; font-size: 14px; }
.pill.icon { padding: 8px 12px; }
.content { flex: 1; overflow-y: auto; padding: 20px 22px; max-width: 1100px; width: 100%; margin: 0 auto; }
.stage-overlay { position: fixed; inset: 0; z-index: 50; background: var(--bg); }
.remote-modal-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, .55);
  display: flex; align-items: center; justify-content: center; padding: 20px; }
.remote-modal { position: relative; background: var(--surface); border: 1px solid var(--border);
  border-radius: 16px; padding: 24px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,.4); }
.remote-modal__close { position: absolute; top: 12px; right: 14px; border: none; background: none;
  color: var(--text-muted); font-size: 18px; cursor: pointer; z-index: 1; }

@media (max-width: 560px) {
  .topbar { gap: 10px; padding: 10px 14px; flex-wrap: wrap; }
  .brand { font-size: 18px; }
  .tabs { order: 3; width: 100%; }
  .tabs button { flex: 1; }
  .pill__label { display: none; }
  .content { padding: 16px 14px; }
}
</style>
