<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'
import { FX_PRESETS, MIC_MODES, applyMicMode } from '~/composables/useSettings'

const library = useLibrary()
const { settings, load: loadSettings } = useSettings()
const remote = useRemote()
const pitch = usePitch()
const importJob = useImportJob()
const bus = useRemoteBus()
const { theme, init: initTheme, toggle: toggleTheme } = useTheme()
const version = useRuntimeConfig().public.version

type View = 'library' | 'settings'
const view = ref<View>('library')
const showRemoteModal = ref(false)
const booting = ref(true) // startup splash

const nowPlaying = ref<RuntimeSong | null>(null)
const queue = ref<RuntimeSong[]>([])
const index = ref(0)
const reserved = ref<RuntimeSong[]>([])

// Dev-only tools (e.g. the error log) — toggled with Ctrl+Shift+Alt+F12.
const dev = useState('okara-dev', () => false)
function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.shiftKey && e.altKey && e.key === 'F12') { e.preventDefault(); dev.value = !dev.value }
}

onMounted(async () => {
  initTheme()
  loadSettings()
  importJob.ensureListener() // keep convert progress alive across tab switches
  ;(window as any).okara?.onDiscProgress?.((p: any) => { prepPct.value = Math.round((p.fraction ?? 0) * 100) })
  // When a background conversion finishes, pick up the new MP4s (covers a
  // refresh that happened mid-conversion).
  ;(window as any).okara?.library?.onImportDone?.(() => library.rescan())
  // Insert a disc → pop the player with its tracks, like a hardware DVD player.
  ;(window as any).okara?.onDiscInserted?.((d: any) => {
    if (d?.tracks?.length) { discList.value = { label: d.label, tracks: d.tracks }; showDisc.value = true }
  })
  window.addEventListener('keydown', onKeydown)
  await library.load()
  restoreQueue() // bring back a queue left over from a previous close/crash
  await remote.init()
  // Hold the splash briefly so it reads as a proper startup screen.
  setTimeout(() => { booting.value = false }, 900)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// A disc/ISO library song has no MP4 yet — produce it (transcode to the
// library folder, permanent) on first play, then it plays like any song.
async function resolvePlayable(song: RuntimeSong): Promise<RuntimeSong | null> {
  const okaraS = (window as any).okara
  // Raw disc video (VOB/DAT/MPEG…) imported without converting — play it via
  // the live stream server (transcode-on-the-fly). A cue song streams straight
  // from its timecode (dial a code → jump to that song). Fresh URL every time.
  if (song?.needsStream && song.videoPath && okaraS?.discStream) {
    const src: any = { file: song.videoPath }
    if (song.clip) {
      src.seek = song.clip.startSec
      if (song.clip.endSec != null) src.dur = Math.max(1, song.clip.endSec - song.clip.startSec)
    }
    const res = await okaraS.discStream(src)
    if (res?.url) { song.videoUrl = res.url; return song }
    prepError.value = res?.error || 'Could not start playback.'
    return null
  }
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
  // Exclude hidden clip-parents so Next/Prev never lands on a whole merged video.
  queue.value = library.songs.value.filter((s) => !s.clipParent)
  index.value = queue.value.findIndex((s) => s.id === resolved.id)
  nowPlaying.value = resolved
}

// Disc/ISO "materialize" progress overlay (for legacy lazy disc-ref songs that
// convert to the library folder on first play).
const preparing = ref(false)
const prepPct = ref(0)
const prepError = ref('')

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

function reserveSong(s: RuntimeSong) {
  if (!nowPlaying.value) { play(s); return }
  reserved.value.push(s)
  syncReserved()
  bus.flash(`Reserved: ${s.title}`)
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
  remote.publishSongs(list.filter((s) => !s.clipParent).map((s) => ({ n: s.number, t: s.title, a: s.artist })))
}, { deep: false, immediate: true })

async function onRenumber(id: string, n: number) {
  const err = await library.renumber(id, n)
  if (err) bus.flash(err)
}

// Cue-mapper: split a big merged video into searchable songs.
const mapperSong = ref<RuntimeSong | null>(null)
function openMapper(s: RuntimeSong) { mapperSong.value = s }
function onMapped(n: number) {
  mapperSong.value = null
  bus.flash(`Mapped ${n} song${n === 1 ? '' : 's'} — searchable now`)
}

// Instant disc/ISO player — streams a track live (like a hardware DVD player),
// no convert and no saved file.
const showDisc = ref(false)
const discList = ref<{ label: string; tracks: { title: string; src: unknown }[] } | null>(null)
const discMsg = ref('')
async function scanDisc() {
  discMsg.value = 'Scanning drives…'
  const list = (await (window as any).okara?.detectDiscs?.()) || []
  if (list[0]?.tracks?.length) { discList.value = { label: list[0].label, tracks: list[0].tracks }; discMsg.value = '' }
  else discMsg.value = 'No DVD/VCD disc found in a drive.'
}
async function openDisc(kind: 'iso' | 'folder') {
  discMsg.value = ''
  const r = await (window as any).okara?.discPick?.(kind)
  if (r?.tracks?.length) discList.value = { label: r.label, tracks: r.tracks }
  else if (r) discMsg.value = 'No playable video tracks found.'
}
async function playDiscTrack(track: { title: string; src: unknown }) {
  const res = await (window as any).okara?.discStream?.(track.src)
  if (!res?.url) { discMsg.value = res?.error || 'Could not start playback.'; return }
  showDisc.value = false
  queue.value = []
  nowPlaying.value = {
    id: `disc-${Date.now()}`, number: 0, title: track.title, artist: 'Disc',
    kind: 'video', source: 'Other', hasScoring: false, createdAt: Date.now(), videoUrl: res.url,
  } as RuntimeSong
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
      <button class="brand" title="Library" @click="view = 'library'"><i class="bi bi-mic-fill" /> <span>okara</span></button>
      <div class="actions">
        <button v-if="importJob.active.value" class="pill converting" title="Importing — click to view" @click="view = 'settings'">
          <i class="bi bi-arrow-repeat spin" /><span class="pill__label"> Importing {{ importJob.pct.value }}%</span>
        </button>
        <button class="pill" title="Play a disc / ISO" @click="showDisc = true">
          <i class="bi bi-disc-fill" /><span class="pill__label"> Disc</span>
        </button>
        <button v-if="remote.available.value" class="pill" @click="showRemoteModal = true">
          <i class="bi bi-phone-fill" /><span class="pill__label"> Remote</span>
        </button>
        <button class="pill icon" :class="{ active: view === 'settings' }" title="Settings" @click="view = view === 'settings' ? 'library' : 'settings'">
          <i class="bi bi-gear-fill" />
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
      <div class="content__inner">
        <LibraryView v-if="view === 'library'" :songs="library.songs.value" @play="play" @reserve="reserveSong" @remove="library.remove" @renumber="onRenumber" @map-cues="openMapper" @edit-meta="(p) => library.editMeta(p.id, p)" />
        <SettingsView v-else @clear="onClear" />
      </div>
    </main>

    <Transition name="splash">
      <div v-if="booting" class="splash">
        <div class="splash__logo"><i class="bi bi-mic-fill" /> <span>okara</span></div>
        <p class="splash__tag">open karaoke</p>
        <div class="splash__spin"><i class="bi bi-disc-fill spin" /></div>
        <p class="splash__ver">v{{ version }}</p>
      </div>
    </Transition>

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

    <SongMapper v-if="mapperSong" :song="mapperSong" @close="mapperSong = null" @saved="onMapped" />

    <Teleport to="body">
      <div v-if="showDisc" class="disc-modal-backdrop" @click.self="showDisc = false; discList = null">
        <div class="disc-modal">
          <button class="disc-modal__close" @click="showDisc = false; discList = null"><i class="bi bi-x-lg" /></button>
          <h3><i class="bi bi-disc-fill" /> Play a disc / ISO</h3>
          <p class="disc-modal__lead">Plays instantly like a DVD player — no importing, no waiting.</p>
          <div class="disc-modal__btns">
            <button class="grad" @click="scanDisc"><i class="bi bi-disc-fill" /> Scan inserted disc</button>
            <button @click="openDisc('iso')"><i class="bi bi-disc" /> Open .iso</button>
            <button @click="openDisc('folder')"><i class="bi bi-folder2-open" /> Open disc folder</button>
          </div>
          <p v-if="discMsg" class="disc-modal__msg">{{ discMsg }}</p>
          <div v-if="discList" class="disc-tracks">
            <p class="disc-tracks__label">{{ discList.label }} — {{ discList.tracks.length }} track{{ discList.tracks.length === 1 ? '' : 's' }}</p>
            <div v-for="(t, i) in discList.tracks" :key="i" class="disc-track" @click="playDiscTrack(t)">
              <span class="disc-track__no">{{ i + 1 }}</span>
              <strong class="disc-track__title">{{ t.title }}</strong>
              <span class="disc-track__play"><i class="bi bi-play-fill" /> Play</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="nowPlaying" class="stage-overlay">
      <KaraokePlayer v-if="nowPlaying.kind === 'ultrastar'" :key="nowPlaying.id" :song="nowPlaying" @close="stop" @ended="onEnded" />
      <MediaPlayer v-else :key="nowPlaying.id" :song="nowPlaying" @close="stop" @ended="onEnded" />
    </div>
  </div>
</template>

<style scoped>
.app { height: 100vh; height: 100dvh; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; gap: 16px; padding: 12px 18px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.brand { font-size: 20px; font-weight: 800; display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  border: none; background: none; cursor: pointer; padding: 0; }
.brand .bi-mic-fill { background: var(--accent-grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.brand span { background: var(--accent-grad); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; }
.actions { margin-left: auto; display: flex; gap: 8px; flex-shrink: 0; }
.pill { border: 1px solid var(--border); background: var(--surface); padding: 8px 14px; border-radius: 999px;
  cursor: pointer; font-size: 14px; }
.pill.icon { padding: 8px 12px; }
.pill.icon.active { background: var(--accent-grad); color: var(--on-accent); border-color: transparent; }
.pill.converting { background: var(--accent-grad); color: var(--on-accent); border-color: transparent; }
.spin { display: inline-block; animation: okspin 1s linear infinite; }
@keyframes okspin { to { transform: rotate(360deg); } }
/* Full-width scroll container → scrollbar sits at the window's right edge;
   inner wrapper centers the content. */
.content { flex: 1; overflow-y: auto; }
.content__inner { max-width: 1100px; width: 100%; margin: 0 auto; padding: 20px 22px; }

/* Startup splash */
.splash { position: fixed; inset: 0; z-index: 200; background: var(--bg); display: flex;
  flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.splash__logo { font-size: 44px; font-weight: 800; display: flex; align-items: center; gap: 12px; }
.splash__logo .bi-mic-fill, .splash__logo span { background: var(--accent-grad); -webkit-background-clip: text;
  background-clip: text; -webkit-text-fill-color: transparent; }
.splash__tag { color: var(--text-muted); font-size: 14px; letter-spacing: .04em; }
.splash__spin { margin-top: 20px; font-size: 28px; color: var(--accent); }
.splash__ver { position: absolute; bottom: 26px; color: var(--text-faint); font-size: 12px; }
.splash-enter-active, .splash-leave-active { transition: opacity .5s ease; }
.splash-enter-from, .splash-leave-to { opacity: 0; }
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
.disc-modal-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center; padding: 20px; }
.disc-modal { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  padding: 24px; width: 100%; max-width: 520px; max-height: 88vh; overflow-y: auto; box-shadow: var(--shadow); }
.disc-modal__close { position: absolute; top: 12px; right: 14px; border: none; background: none;
  color: var(--text-muted); font-size: 18px; cursor: pointer; }
.disc-modal h3 { margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
.disc-modal__lead { color: var(--text-muted); font-size: 13px; margin: 0 0 16px; }
.disc-modal__btns { display: flex; gap: 10px; flex-wrap: wrap; }
.disc-modal__btns button { padding: 10px 16px; border-radius: 999px; border: 1px solid var(--border);
  background: var(--surface-2); color: var(--text); cursor: pointer; font-size: 14px;
  display: inline-flex; align-items: center; gap: 8px; }
.disc-modal__msg { margin: 12px 0 0; font-size: 13px; color: var(--text-muted); }
.disc-tracks { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.disc-tracks__label { font-size: 12px; color: var(--text-faint); margin: 0 0 4px; }
.disc-track { display: flex; align-items: center; gap: 12px; background: var(--bg); border: 1px solid var(--border);
  border-radius: 12px; padding: 10px 14px; cursor: pointer; }
.disc-track:hover { border-color: var(--accent); }
.disc-track__no { width: 26px; text-align: center; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.disc-track__title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; }
.disc-track__play { background: var(--accent-grad); color: #fff; border-radius: 999px; padding: 5px 12px;
  font-size: 13px; display: inline-flex; align-items: center; gap: 4px; }

@media (max-width: 560px) {
  .topbar { gap: 10px; padding: 10px 14px; }
  .brand { font-size: 18px; }
  .pill__label { display: none; }
  .content__inner { padding: 16px 14px; }
}
</style>
