<script setup lang="ts">
import { listMicrophones } from '~/composables/usePitch'

const { settings } = useSettings()
const emit = defineEmits<{ clear: [] }>()

const mics = ref<MediaDeviceInfo[]>([])
const confirmClear = ref(false)

async function refreshMics() {
  try { await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { /* */ }
  mics.value = await listMicrophones()
}

onMounted(refreshMics)

function doClear() {
  emit('clear')
  confirmClear.value = false
}
</script>

<template>
  <section class="set">
    <h1>Settings</h1>

    <div class="block">
      <h3>Microphone</h3>
      <div class="row">
        <select v-model="settings.micDeviceId" class="input">
          <option value="">Default</option>
          <option v-for="m in mics" :key="m.deviceId" :value="m.deviceId">
            {{ m.label || 'Mic ' + m.deviceId.slice(0, 6) }}
          </option>
        </select>
        <button class="mini" @click="refreshMics">Refresh</button>
      </div>
    </div>

    <div class="block">
      <h3>Default channel (video/audio)</h3>
      <div class="segmented">
        <button
          v-for="opt in (['stereo', 'left', 'right'] as const)"
          :key="opt"
          :class="{ active: settings.voiceChannel === opt }"
          @click="settings.voiceChannel = opt"
        >{{ opt === 'stereo' ? 'Original' : opt === 'left' ? 'Left' : 'Right' }}</button>
      </div>
    </div>

    <div class="block">
      <h3>Scoring leniency</h3>
      <label class="switch">
        <input type="checkbox" :checked="settings.scoringTolerance === 1"
          @change="settings.scoringTolerance = ($event.target as HTMLInputElement).checked ? 1 : 0" />
        Allow ±1 semitone (easier to score)
      </label>
    </div>

    <div class="block">
      <RemotePanel />
    </div>

    <div class="block danger">
      <h3>Library</h3>
      <p>This deletes all imported songs (the demo stays).</p>
      <button v-if="!confirmClear" class="del" @click="confirmClear = true">Clear library</button>
      <div v-else class="confirm">
        <span>Are you sure?</span>
        <button class="del" @click="doClear">Yes, clear</button>
        <button class="mini" @click="confirmClear = false">No</button>
      </div>
    </div>

    <p class="about">okara · open karaoke — UltraStar player + pitch scoring + phone remote</p>
  </section>
</template>

<style scoped>
.set { padding: 4px 2px 40px; max-width: 720px; }
h1 { font-size: 26px; margin: 0 0 24px; }
.block { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 20px;
  margin-bottom: 16px; }
.block h3 { margin: 0 0 12px; font-size: 15px; }
.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.input { padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg);
  color: var(--text); min-width: 200px; flex: 1; }
.mini { padding: 10px 14px; border-radius: 999px; border: none; background: var(--surface-2); color: var(--text);
  cursor: pointer; }
.segmented { display: inline-flex; background: var(--bg); border: 1px solid var(--border); border-radius: 999px;
  padding: 4px; max-width: 100%; }
.segmented button { border: none; background: none; color: var(--text); padding: 8px 18px; border-radius: 999px;
  cursor: pointer; opacity: .6; }
.segmented button.active { background: var(--accent); color: var(--on-accent); opacity: 1; font-weight: 600; }
.switch { display: flex; align-items: center; gap: 10px; cursor: pointer; color: var(--text); }
.danger p { color: var(--text-muted); font-size: 14px; margin: 0 0 12px; }
.del { padding: 10px 18px; border-radius: 999px; border: none; background: var(--danger); color: #fff; cursor: pointer; }
.confirm { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.about { text-align: center; color: var(--text-faint); font-size: 13px; margin-top: 30px; }

@media (max-width: 560px) {
  h1 { font-size: 22px; }
  .segmented { width: 100%; display: flex; }
  .segmented button { flex: 1; padding: 10px 8px; }
}
</style>
