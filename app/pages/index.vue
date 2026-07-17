<script setup lang="ts">
import type { RuntimeSong } from '~/composables/useLibrary'
import type { SongSource } from '~/utils/db'

const library = useLibrary()
const { settings, load: loadSettings } = useSettings()
const remote = useRemote()
const bus = useRemoteBus()

type View = 'library' | 'import' | 'settings'
const view = ref<View>('library')

const nowPlaying = ref<RuntimeSong | null>(null)
const queue = ref<RuntimeSong[]>([])
const index = ref(0)

onMounted(async () => {
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
      <button v-if="remote.available.value" class="remote-pill" @click="view = 'settings'">
        📱 Remote
      </button>
    </nav>

    <main class="content">
      <LibraryView v-if="view === 'library'" :songs="library.songs.value" @play="play" @remove="library.remove" />
      <ImportView v-else-if="view === 'import'" @import="onImport" />
      <SettingsView v-else :key="'settings'" @clear="onClear" />
    </main>

    <div v-if="nowPlaying" class="stage-overlay">
      <KaraokePlayer v-if="nowPlaying.kind === 'ultrastar'" :key="nowPlaying.id" :song="nowPlaying" @close="stop" />
      <MediaPlayer v-else :key="nowPlaying.id" :song="nowPlaying" @close="stop" />
    </div>
  </div>
</template>

<style scoped>
.app { height: 100vh; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; gap: 24px; padding: 14px 22px; border-bottom: 1px solid #1c1c33; }
.brand { font-size: 20px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
.brand span { background: linear-gradient(135deg, #ff5da2, #ff9d5d); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; }
.tabs { display: flex; gap: 6px; }
.tabs button { border: none; background: none; color: #fff; opacity: .55; padding: 8px 16px; border-radius: 999px;
  cursor: pointer; font-size: 15px; }
.tabs button.active { opacity: 1; background: #1c1c33; font-weight: 600; }
.remote-pill { margin-left: auto; border: 1px solid #2a2a44; background: #14142a; color: #fff; padding: 8px 16px;
  border-radius: 999px; cursor: pointer; }
.content { flex: 1; overflow-y: auto; padding: 20px 22px; max-width: 1100px; width: 100%; margin: 0 auto; }
.stage-overlay { position: fixed; inset: 0; z-index: 50; background: #0d0d1a; }
</style>
