<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'
import type { SongSource } from '~/utils/db'

const library = useLibrary()
const { load: loadSettings } = useSettings()
const remote = useRemote()
const bus = useRemoteBus()
const { theme, init: initTheme, toggle: toggleTheme } = useTheme()

type View = 'library' | 'import' | 'settings'
const view = ref<View>('library')

const nowPlaying = ref<RuntimeSong | null>(null)
const queue = ref<RuntimeSong[]>([])
const index = ref(0)

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

watch(nowPlaying, (s) => {
  bus.state.value = {
    ...bus.state.value,
    hasSong: !!s,
    title: s?.title ?? '',
    artist: s?.artist ?? '',
    playing: false,
  }
})

watch(() => bus.command.value.seq, () => {
  const a = bus.command.value.action
  if (a === 'next') playNext()
  else if (a === 'prev') playPrev()
  else if (a === 'stop') stop()
})

async function onImport(files: File[], source: SongSource) {
  await library.importFiles(files, source)
}

async function onClear() {
  await library.clearAll()
}
</script>

<template>
  <div class="app">
    <nav class="topbar">
      <div class="brand">🎤 <span>okara</span></div>
      <div class="tabs">
        <button :class="{ active: view === 'library' }" @click="view = 'library'">Library</button>
        <button :class="{ active: view === 'import' }" @click="view = 'import'">Import</button>
        <button :class="{ active: view === 'settings' }" @click="view = 'settings'">Settings</button>
      </div>
      <div class="actions">
        <button v-if="remote.available.value" class="pill" @click="view = 'settings'">
          📱<span class="pill__label"> Remote</span>
        </button>
        <button class="pill icon" :title="theme === 'dark' ? 'Light mode' : 'Dark mode'" @click="toggleTheme">
          {{ theme === 'dark' ? '☀️' : '🌙' }}
        </button>
      </div>
    </nav>

    <main class="content">
      <LibraryView v-if="view === 'library'" :songs="library.songs.value" @play="play" @remove="library.remove" />
      <ImportView v-else-if="view === 'import'" @import="onImport" />
      <SettingsView v-else @clear="onClear" />
    </main>

    <div v-if="nowPlaying" class="stage-overlay">
      <KaraokePlayer v-if="nowPlaying.kind === 'ultrastar'" :key="nowPlaying.id" :song="nowPlaying" @close="stop" />
      <MediaPlayer v-else :key="nowPlaying.id" :song="nowPlaying" @close="stop" />
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

@media (max-width: 560px) {
  .topbar { gap: 10px; padding: 10px 14px; flex-wrap: wrap; }
  .brand { font-size: 18px; }
  .tabs { order: 3; width: 100%; }
  .tabs button { flex: 1; }
  .pill__label { display: none; }
  .content { padding: 16px 14px; }
}
</style>
