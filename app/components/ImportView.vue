<script setup lang="ts">
import type { SongSource } from '~/utils/db'

const emit = defineEmits<{ import: [files: File[], source: SongSource] }>()

const source = ref<SongSource>('UltraStar')
const dragging = ref(false)
const busy = ref(false)
const result = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)

const sources: { value: SongSource; label: string; hint: string }[] = [
  { value: 'UltraStar', label: 'UltraStar', hint: '.txt + audio — may scoring' },
  { value: 'Magic Sing', label: 'Magic Sing', hint: 'video files mula DVD' },
  { value: 'Platinum', label: 'Platinum', hint: 'video files mula DVD' },
  { value: 'MegaVision', label: 'MegaVision', hint: 'video files mula DVD' },
  { value: 'Other', label: 'Iba pa', hint: 'kahit anong audio/video' },
]

async function handle(files: File[]) {
  if (!files.length) return
  busy.value = true
  result.value = null
  const count = await new Promise<number>((resolve) => {
    emit('import', files, source.value)
    setTimeout(() => resolve(files.length), 0)
  })
  busy.value = false
  result.value = `Na-import: ${count} file${count > 1 ? 's' : ''}. Nasa Library na. 🎉`
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
    <h1>Import ng kanta</h1>
    <p class="lead">
      I-drag ang mga file dito o pumili sa ibaba. Para sa DVD ng karaoke machine
      (Magic Sing / Platinum / MegaVision), i-import ang mga <strong>video file</strong> nito
      — mapapatugtog sila na may voice on/off. Para sa full scoring, gumamit ng
      <strong>UltraStar</strong> na kanta (.txt + audio).
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

    <div
      class="drop"
      :class="{ over: dragging, busy }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="drop__icon">⬇️</div>
      <p><strong>I-drag ang files dito</strong></p>
      <div class="drop__btns">
        <button @click="fileInput?.click()">Pumili ng files</button>
        <button class="ghost" @click="folderInput?.click()">Pumili ng folder</button>
      </div>
      <p v-if="busy" class="status">Ini-import…</p>
      <p v-else-if="result" class="status ok">{{ result }}</p>
    </div>

    <input ref="fileInput" type="file" multiple hidden
      accept=".txt,audio/*,video/*,.dat,.vob,.mpg,.mpeg" @change="onPick" />
    <input ref="folderInput" type="file" hidden webkitdirectory multiple @change="onPick" />

    <div class="note">
      <h3>Paalala tungkol sa DVD/chip data</h3>
      <ul>
        <li>Video files (.mp4, .avi, .mpg, .dat, .vob) mula sa DVD — ✅ ma-import at ma-play.</li>
        <li>Naka-encrypt na chip data (hal. Magic Sing cartridge) — ❌ hindi ma-extract; proprietary ito.</li>
        <li>Gamitin lang ang mga file na legal mong pag-aari.</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.imp { padding: 4px 2px 40px; max-width: 760px; }
h1 { font-size: 26px; margin: 0 0 8px; }
.lead { color: var(--text-muted); line-height: 1.55; margin-bottom: 22px; }
.field { margin-bottom: 22px; }
.field > span { display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 10px; }
.chips { display: flex; gap: 10px; flex-wrap: wrap; }
.chip { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 14px;
  border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
.chip.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
.chip em { font-size: 11px; color: var(--text-faint); font-style: normal; }
.drop { border: 2px dashed var(--border); border-radius: 18px; padding: 40px 20px; text-align: center; transition: .15s; }
.drop.over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
.drop__icon { font-size: 40px; }
.drop__btns { display: flex; gap: 12px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
.drop__btns button { padding: 11px 20px; border-radius: 999px; border: none; background: var(--accent);
  color: var(--on-accent); font-weight: 600; cursor: pointer; }
.drop__btns .ghost { background: var(--surface-2); color: var(--text); }
.status { margin-top: 14px; color: var(--text-muted); }
.status.ok { color: var(--ok); }
.note { margin-top: 30px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 20px; }
.note h3 { margin: 0 0 8px; font-size: 15px; }
.note ul { margin: 0; padding-left: 18px; line-height: 1.7; color: var(--text-muted); font-size: 14px; }

@media (max-width: 560px) {
  h1 { font-size: 22px; }
  .drop { padding: 30px 14px; }
  .drop__btns button { flex: 1; }
}
</style>
