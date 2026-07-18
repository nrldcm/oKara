<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'
import { FX_PRESETS, MIC_MODES, applyMicMode } from '~/composables/useSettings'

const library = useLibrary()
const { settings, load: loadSettings } = useSettings()
const remote = useRemote()
const pitch = usePitch()
const importJob = useImportJob()
const discState = useDisc()
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
  importJob.ensureListener() // keep convert progress alive across tab switches
  discState.ensureListener() // auto-detect inserted DVD/VCD discs
  ;(window as any).okara?.onDiscProgress?.((p: any) => { prepPct.value = Math.round((p.fraction ?? 0) * 100) })
  // When a background conversion finishes, pick up the new MP4s (covers a
  // refresh that happened mid-conversion).
  ;(window as any).okara?.library?.onImportDone?.(() => library.rescan())
  await library.load()
  restoreQueue() // bring back a queue left over from a previous close/crash
  await remote.init()
})

// A disc/ISO library song has no MP4 yet — produce it (transcode to the
// library folder, permanent) on first play, then it plays like any song.
async function resolvePlayable(song: RuntimeSong): Promise<RuntimeSong | null> {
  if (!song?.disc || song.videoUrl) return song
  const okara = (window as any).okara
  if (!okara?.discMaterialize && !okara?.discPrepare) {
    prepError.value = 'This build is out of date. Update to okara v0.9.8+ to play disc/ISO tracks.'
    return null
  }
  preparing.value = true
  prepPct.value = 0
  prepError.value = ''
  try {
    if (okara.discMaterialize) {
      const res = await okara.discMaterialize(song.disc, song.title)
      if (res?.path) { await library.markMaterialized(song.id, res.path); return song }
      // On error, fall through to the temp path rather than aborting.
    }
    // Fallback: a temporary prepared file (not permanent).
    if (okara.discPrepare) {
      const res = await okara.discPrepare(song.disc)
      if (res?.url) { song.videoUrl = res.url; return song }
      prepError.value = res?.error || 'Could not prepare this track.'
    }
    return null
  } finally {
    preparing.value = false
  }
}

async function play(song: RuntimeSong) {
  const resolved = await resolvePlayable(song)
  if (!resolved) return
  queue.value = library.songs.value
  index.value = queue.value.findIndex((s) => s.id === resolved.id)
  nowPlaying.value = resolved
}

function playInsertedDisc() {
  const d = discState.disc.value
  if (d?.tracks?.length) { playDisc(d.tracks[0]); discState.dismiss() }
}

// Play a disc/ISO track: the host transcodes it to a clean temp MP4 first
// (proper keyframes, deinterlaced), then plays it — reliable, no datamoshing.
const preparing = ref(false)
const prepPct = ref(0)
const prepError = ref('')

async function playDisc(track: { title: string; src: unknown }) {
  // ISO tracks are auto-added to the library — if this one is there, play it
  // through the library path so it materializes (permanent) and persists.
  const src = (track.src || {}) as { iso?: string; extent?: number; file?: string }
  const libId = src.iso ? `disc:${src.iso}#${src.extent}` : src.file ? `disc:${src.file}` : null
  const libSong = libId ? library.songs.value.find((s) => s.id === libId) : null
  if (libSong) { await play(libSong); return }

  const okara = (window as any).okara
  // Older builds have no discPrepare — tell the user to update instead of
  // doing nothing when Play is pressed.
  if (!okara?.discPrepare) {
    prepError.value = 'This build is out of date. Update to okara v0.9.8+ to play from a disc/ISO.'
    return
  }
  preparing.value = true
  prepPct.value = 0
  prepError.value = ''
  try {
    const res = await okara.discPrepare(track.src)
    if (res?.url) {
      queue.value = []
      nowPlaying.value = {
        id: `disc-${Date.now()}`,
        number: 0,
        title: track.title,
        artist: 'Disc',
        kind: 'video',
        source: 'Other',
        hasScoring: false,
        createdAt: Date.now(),
        videoUrl: res.url,
      } as RuntimeSong
    } else {
      prepError.value = res?.error || 'Could not prepare this track.'
    }
  } finally {
    preparing.value = false
  }
}

async function playNext() {
  if (reserved.value.length) {
    const next = reserved.value.shift()!
    syncReserved()
    const resolved = await resolvePlayable(next)
    if (resolved) nowPlaying.value = resolved
    return
  }
  if (!queue.value.length) return
  index.value = (index.value + 1) % queue.value.length
  const resolved = await resolvePlayable(queue.value[index.value])
  if (resolved) nowPlaying.value = resolved
}

async function playPrev() {
  if (!queue.value.length) return
  index.value = (index.value - 1 + queue.value.length) % queue.value.length
  const resolved = await resolvePlayable(queue.value[index.value])
  if (resolved) nowPlaying.value = resolved
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
  persistQueue()
}

// Restore point: keep the queue (and current song) in localStorage so a crash
// or close doesn't lose what was lined up — no need to re-add everything.
const QUEUE_KEY = 'okara-queue-v1'
function persistQueue() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify({
      reserved: reserved.value.map((s) => s.id),
      now: nowPlaying.value?.id ?? null,
    }))
  } catch { /* storage full / unavailable */ }
}
function restoreQueue() {
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as { reserved?: string[] }
    const byId = new Map(library.songs.value.map((s) => [s.id, s]))
    const restored = (data.reserved || []).map((id) => byId.get(id)).filter(Boolean) as RuntimeSong[]
    if (restored.length) { reserved.value = restored; syncReserved() }
    // Playback is not auto-resumed — only the queue is restored.
  } catch { /* corrupt payload */ }
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
  persistQueue()
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
        <button v-if="importJob.active.value" class="pill converting" title="Converting a disc — click to view" @click="view = 'import'">
          <i class="bi bi-arrow-repeat spin" /><span class="pill__label"> Converting {{ importJob.pct.value }}%</span>
        </button>
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

    <div v-if="discState.showBanner.value" class="disc-banner">
      <i class="bi bi-disc-fill" />
      <span class="disc-banner__label"><strong>{{ discState.disc.value?.kind }} inserted</strong> — {{ discState.disc.value?.tracks.length }} track{{ discState.disc.value?.tracks.length === 1 ? '' : 's' }}</span>
      <button class="disc-banner__play" @click="playInsertedDisc"><i class="bi bi-play-fill" /> Play</button>
      <button class="disc-banner__browse" @click="view = 'import'">Browse</button>
      <button class="disc-banner__close" @click="discState.dismiss()"><i class="bi bi-x-lg" /></button>
    </div>

    <main class="content">
      <LibraryView v-if="view === 'library'" :songs="library.songs.value" @play="play" @remove="library.remove" @renumber="onRenumber" />
      <ImportView v-else-if="view === 'import'" @play-disc="playDisc" />
      <SettingsView v-else @clear="onClear" />
    </main>

    <div v-if="preparing" class="prep-overlay">
      <div class="prep-box">
        <i class="bi bi-disc-fill spin" />
        <h3>Preparing track…</h3>
        <p>Converting for smooth playback (deinterlaced, clean keyframes).</p>
        <div class="prep-bar"><div class="prep-fill" :style="{ width: prepPct + '%' }" /></div>
        <span class="prep-pct">{{ prepPct }}%</span>
      </div>
    </div>
    <p v-if="prepError" class="prep-error">{{ prepError }}</p>

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
.pill.converting { border-color: var(--accent); color: var(--accent); }
.spin { display: inline-block; animation: okspin 1s linear infinite; }
@keyframes okspin { to { transform: rotate(360deg); } }
.content { flex: 1; overflow-y: auto; padding: 20px 22px; max-width: 1100px; width: 100%; margin: 0 auto; }
.disc-banner { display: flex; align-items: center; gap: 12px; padding: 10px 18px;
  background: var(--accent-grad); color: #fff; }
.disc-banner .bi-disc-fill { font-size: 20px; }
.disc-banner__label { flex: 1; font-size: 14px; }
.disc-banner__play { border: none; background: rgba(255,255,255,.95); color: #111; border-radius: 999px;
  padding: 7px 16px; font-weight: 700; cursor: pointer; }
.disc-banner__browse { border: 1px solid rgba(255,255,255,.7); background: transparent; color: #fff;
  border-radius: 999px; padding: 7px 14px; cursor: pointer; }
.disc-banner__close { border: none; background: none; color: #fff; cursor: pointer; font-size: 15px; opacity: .85; }
.prep-overlay { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.7); display: flex;
  align-items: center; justify-content: center; }
.prep-box { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px 32px;
  text-align: center; max-width: 380px; width: 90%; }
.prep-box .bi-disc-fill { font-size: 40px; color: var(--accent); }
.prep-box h3 { margin: 12px 0 4px; }
.prep-box p { color: var(--text-muted); font-size: 13px; margin: 0 0 16px; }
.prep-bar { height: 8px; border-radius: 999px; background: var(--bg); overflow: hidden; }
.prep-fill { height: 100%; background: var(--accent-grad); transition: width .2s; }
.prep-pct { font-size: 12px; color: var(--text-muted); }
.prep-error { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 60;
  background: var(--danger); color: #fff; padding: 10px 18px; border-radius: 999px; font-size: 14px; }
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
