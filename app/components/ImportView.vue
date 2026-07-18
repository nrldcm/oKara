<script setup lang="ts">
import type { SongSource } from '~/utils/db'
import { libraryFolderAvailable, canConvertDiscs } from '~/composables/useLibrary'

const library = useLibrary()

// UltraStar songs (.txt) are auto-detected and get scoring; everything else is
// tagged "Other" and can be relabelled per song, so no brand picker is needed.
const source: SongSource = 'Other'
const dragging = ref(false)
const busy = ref(false)
const result = ref<string | null>(null)
const failed = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const hasFolder = ref(false)
const folderDir = ref('')
const canConvert = ref(false)

// Shared, tab-switch-proof convert job (state lives outside this component).
const job = useImportJob()
const converting = job.active

function cancelImport() { job.cancel() }

onMounted(async () => {
  hasFolder.value = libraryFolderAvailable()
  canConvert.value = canConvertDiscs()
  job.ensureListener()
  if (hasFolder.value) {
    try { folderDir.value = (await (window as any).okara.library.info()).dir } catch { /* ignore */ }
  }
})

function importDisc(kind: 'iso' | 'dvd-video') {
  job.runDisc(kind, source)
}

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
  run(() => library.importFiles(files, source))
}

function pickNative(kind: 'files' | 'folder') {
  run(() => library.importFromPicker(kind, source))
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
      Add karaoke discs (below) or drag in files. Songs go into your one big
      library — mix any brand (MegaVision / Platinum / Magic Sing / TJ Media).
      Set each song's number/title/artist in the Library (✎). For full scoring,
      add an <strong>UltraStar</strong> song (.txt + audio).
    </p>

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
      <p v-if="busy && !converting" class="status">Importing…</p>
      <p v-else-if="result" class="status" :class="failed ? 'err' : 'ok'">{{ result }}</p>
    </div>

    <div v-if="canConvert" class="dvd">
      <h3><i class="bi bi-disc-fill" /> DVD / VCD disc</h3>
      <p class="dvd__lead">
        Add an old karaoke <strong>disc image (.iso)</strong> or its raw
        <strong>VOB/DAT</strong> video files to your library — <strong>no
        conversion</strong>, so it's added quickly. Songs are searchable by
        number/title/artist and play by streaming on the fly (like a DVD player).
      </p>
      <div class="dvd__btns">
        <button :disabled="converting" @click="importDisc('iso')"><i class="bi bi-disc" /> Add .iso image</button>
        <button class="ghost" :disabled="converting" @click="importDisc('dvd-video')"><i class="bi bi-film" /> Add VOB/DAT files</button>
      </div>
      <div v-if="converting" class="conv">
        <div class="conv__bar"><div class="conv__fill" :style="{ width: job.pct.value + '%' }" /></div>
        <p class="conv__text">{{ job.text.value }} <span v-if="job.pct.value">— {{ job.pct.value }}%</span></p>
        <div v-if="job.tracks.value.length" class="conv__tracks">
          <div v-for="(t, i) in job.tracks.value" :key="t.name + i" class="conv__track">
            <div class="conv__track-head">
              <span class="conv__track-name">{{ t.name }}</span>
              <span class="conv__track-pct">{{ Math.round((t.fraction || 0) * 100) }}%</span>
            </div>
            <div class="conv__subbar"><div class="conv__subfill" :style="{ width: Math.round((t.fraction || 0) * 100) + '%' }" /></div>
          </div>
        </div>
        <div class="conv__foot">
          <span class="conv__keep">You can switch tabs or play a song — the conversion keeps running.</span>
          <button class="conv__cancel" @click="cancelImport"><i class="bi bi-x-circle" /> Cancel import</button>
        </div>
      </div>
      <p v-else-if="job.message.value" class="status" :class="job.failed.value ? 'err' : 'ok'">{{ job.message.value }}</p>
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
.dvd { margin-top: 26px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 20px; }
.dvd h3 { margin: 0 0 8px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
.dvd__lead { color: var(--text-muted); font-size: 14px; line-height: 1.55; margin: 0 0 14px; }
.dvd__btns { display: flex; gap: 12px; flex-wrap: wrap; }
.dvd__btns button { padding: 11px 18px; border-radius: 999px; border: none; background: var(--accent);
  color: var(--on-accent); font-weight: 600; cursor: pointer; }
.dvd__btns .ghost { background: var(--surface-2); color: var(--text); }
.dvd__btns button:disabled { opacity: .5; }
.conv { margin-top: 16px; }
.conv__bar { height: 8px; border-radius: 999px; background: var(--bg); overflow: hidden; }
.conv__fill { height: 100%; background: var(--accent-grad); transition: width .2s; }
.conv__text { font-size: 13px; color: var(--text-muted); margin-top: 8px; }
.conv__tracks { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.conv__track-head { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--text-faint); margin-bottom: 3px; }
.conv__track-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv__track-pct { flex: none; font-variant-numeric: tabular-nums; }
.conv__subbar { height: 5px; border-radius: 999px; background: var(--bg); overflow: hidden; }
.conv__subfill { height: 100%; background: var(--accent-grad); transition: width .2s; }
.conv__foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
.conv__keep { font-size: 12px; color: var(--text-faint); }
.conv__cancel { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 999px;
  padding: 6px 14px; cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
.conv__cancel:hover { border-color: var(--accent); color: var(--accent); }
.note { margin-top: 30px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 20px; }
.note h3 { margin: 0 0 8px; font-size: 15px; }
.note ul { margin: 0; padding-left: 18px; line-height: 1.7; color: var(--text-muted); font-size: 14px; }

@media (max-width: 560px) {
  h1 { font-size: 22px; }
  .drop { padding: 30px 14px; }
  .drop__btns button { flex: 1; }
}
</style>
