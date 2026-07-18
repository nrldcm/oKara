<script setup lang="ts">
import type { SongSource } from '~/utils/db'
import { libraryFolderAvailable } from '~/composables/useLibrary'

const library = useLibrary()

const source = ref<SongSource>('UltraStar')
const volumeLabel = ref('')
const dragging = ref(false)
const busy = ref(false)
const result = ref<string | null>(null)
const failed = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const hasFolder = ref(false)
const folderDir = ref('')

onMounted(async () => {
  hasFolder.value = libraryFolderAvailable()
  if (hasFolder.value) {
    try { folderDir.value = (await (window as any).okara.library.info()).dir } catch { /* ignore */ }
  }
})

const sources: { value: SongSource; label: string; hint: string }[] = [
  { value: 'UltraStar', label: 'UltraStar', hint: '.txt + audio — has scoring' },
  { value: 'Magic Sing', label: 'Magic Sing', hint: 'video files from DVD' },
  { value: 'Platinum', label: 'Platinum', hint: 'video files from DVD' },
  { value: 'MegaVision', label: 'MegaVision', hint: 'video files from DVD' },
  { value: 'TJ Media', label: 'TJ Media', hint: 'video files from DVD' },
  { value: 'Other', label: 'Other', hint: 'any audio/video' },
]

function report(count: number) {
  if (count > 0) {
    result.value = `Imported ${count} file${count > 1 ? 's' : ''}. It's in your Library now.`
      + (hasFolder.value ? ' Files were copied into your library folder.' : '')
  } else {
    failed.value = true
    result.value = 'No supported songs found in that selection.'
  }
}

async function run(fn: () => Promise<number>) {
  busy.value = true
  result.value = null
  failed.value = false
  try {
    report(await fn())
  } catch {
    failed.value = true
    result.value = 'Import failed — storage may be full.'
  } finally {
    busy.value = false
  }
}

function handle(files: File[]) {
  if (!files.length) return
  run(() => library.importFiles(files, source.value, volumeLabel.value))
}

function pickNative(kind: 'files' | 'folder') {
  run(() => library.importFromPicker(kind, source.value, volumeLabel.value))
}

function onDrop(e: DragEvent) {
  dragging.value = false
  handle(Array.from(e.dataTransfer?.files ?? []))
}
function onPick(e: Event) {
  handle(Array.from((e.target as HTMLInputElement).files ?? []))
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<template>
  <section class="imp">
    <h1>Import songs</h1>
    <p class="lead">
      Drag files here or pick them below. For karaoke machine DVDs
      (Magic Sing / Platinum / MegaVision / TJ Media), import their
      <strong>video files</strong> — they play back with voice on/off. For full
      scoring, use an <strong>UltraStar</strong> song (.txt + audio).
    </p>

    <div class="field">
      <span>Source / brand</span>
      <div class="chips">
        <button
          v-for="s in sources"
          :key="s.value"
          class="chip"
          :class="{ active: source === s.value }"
          @click="source = s.value"
        >
          <strong>{{ s.label }}</strong>
          <em>{{ s.hint }}</em>
        </button>
      </div>
    </div>

    <div class="field">
      <span>Volume label (optional) — prefixes song titles, e.g. "MegaVision Vol 3 – AVSEQ01"</span>
      <input v-model="volumeLabel" class="label-input" placeholder="e.g. MegaVision Vol 3" maxlength="40" />
    </div>

    <div
      class="drop"
      :class="{ over: dragging, busy }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="drop__icon"><i class="bi bi-cloud-arrow-down" /></div>
      <p><strong>Drag files here</strong></p>
      <div class="drop__btns">
        <template v-if="hasFolder">
          <button @click="pickNative('files')">Choose files</button>
          <button class="ghost" @click="pickNative('folder')">Choose folder</button>
        </template>
        <template v-else>
          <button @click="fileInput?.click()">Choose files</button>
          <button class="ghost" @click="folderInput?.click()">Choose folder</button>
        </template>
      </div>
      <p v-if="hasFolder && folderDir" class="lib-note">
        <i class="bi bi-folder-check" /> Imports are copied into your library folder:
        <code>{{ folderDir }}</code>
      </p>
      <p v-if="busy" class="status">Importing…</p>
      <p v-else-if="result" class="status" :class="failed ? 'err' : 'ok'">{{ result }}</p>
    </div>

    <input ref="fileInput" type="file" multiple hidden
      accept=".txt,audio/*,video/*,.dat,.vob,.mpg,.mpeg" @change="onPick" />
    <input ref="folderInput" type="file" hidden webkitdirectory multiple @change="onPick" />

    <div class="note">
      <h3>About DVD / chip data</h3>
      <ul>
        <li>Video files (.mp4, .avi, .mpg, .dat, .vob) from a DVD — ✅ import and play.</li>
        <li>Encrypted chip data (e.g. Magic Sing / TJ cartridge) — ❌ can't be extracted; it's proprietary.</li>
        <li>Only use files you legally own.</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.imp { padding: 4px 2px 40px; max-width: 760px; margin: 0 auto; }
h1 { font-size: 26px; margin: 0 0 8px; }
.lead { color: var(--text-muted); line-height: 1.55; margin-bottom: 22px; }
.field { margin-bottom: 22px; }
.field > span { display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 10px; }
.chips { display: flex; gap: 10px; flex-wrap: wrap; }
.chip { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 14px;
  border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
.chip.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
.chip em { font-size: 11px; color: var(--text-faint); font-style: normal; }
.label-input { width: 100%; max-width: 360px; padding: 11px 15px; border-radius: 12px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font-size: 14px; }
.drop { border: 2px dashed var(--border); border-radius: 18px; padding: 40px 20px; text-align: center; transition: .15s; }
.drop.over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
.drop__icon { font-size: 40px; }
.drop__btns { display: flex; gap: 12px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
.drop__btns button { padding: 11px 20px; border-radius: 999px; border: none; background: var(--accent);
  color: var(--on-accent); font-weight: 600; cursor: pointer; }
.drop__btns .ghost { background: var(--surface-2); color: var(--text); }
.status { margin-top: 14px; color: var(--text-muted); }
.status.ok { color: var(--ok); }
.status.err { color: var(--danger); }
.lib-note { margin-top: 14px; font-size: 12px; color: var(--text-faint); word-break: break-all; }
.lib-note code { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 1px 6px; }
.note { margin-top: 30px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 20px; }
.note h3 { margin: 0 0 8px; font-size: 15px; }
.note ul { margin: 0; padding-left: 18px; line-height: 1.7; color: var(--text-muted); font-size: 14px; }

@media (max-width: 560px) {
  h1 { font-size: 22px; }
  .drop { padding: 30px 14px; }
  .drop__btns button { flex: 1; }
}
</style>
