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
      <h3>Mikropono</h3>
      <select v-model="settings.micDeviceId" class="input">
        <option value="">Default</option>
        <option v-for="m in mics" :key="m.deviceId" :value="m.deviceId">
          {{ m.label || 'Mic ' + m.deviceId.slice(0, 6) }}
        </option>
      </select>
      <button class="mini" @click="refreshMics">I-refresh</button>
    </div>

    <div class="block">
      <h3>Default na channel (video/audio)</h3>
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
        Payagan ang ±1 semitone (mas madaling makakuha ng puntos)
      </label>
    </div>

    <div class="block">
      <RemotePanel />
    </div>

    <div class="block danger">
      <h3>Library</h3>
      <p>Buburahin ang lahat ng na-import na kanta (mananatili ang demo).</p>
      <button v-if="!confirmClear" class="del" @click="confirmClear = true">Burahin ang library</button>
      <div v-else class="confirm">
        <span>Sigurado ka?</span>
        <button class="del" @click="doClear">Oo, burahin</button>
        <button class="mini" @click="confirmClear = false">Hindi</button>
      </div>
    </div>

    <p class="about">okara · open karaoke — UltraStar player + pitch scoring + phone remote</p>
  </section>
</template>

<style scoped>
.set { padding: 8px 4px 40px; max-width: 720px; }
h1 { font-size: 26px; margin: 0 0 24px; }
.block { background: #14142a; border-radius: 14px; padding: 16px 20px; margin-bottom: 16px; }
.block h3 { margin: 0 0 12px; font-size: 15px; }
.input { padding: 10px 14px; border-radius: 10px; border: 1px solid #2a2a44; background: #0d0d1a; color: #fff;
  min-width: 220px; }
.mini { margin-left: 10px; padding: 8px 14px; border-radius: 999px; border: none; background: #23233a; color: #fff;
  cursor: pointer; }
.segmented { display: inline-flex; background: #0d0d1a; border-radius: 999px; padding: 4px; }
.segmented button { border: none; background: none; color: #fff; padding: 8px 18px; border-radius: 999px;
  cursor: pointer; opacity: .6; }
.segmented button.active { background: #ff5da2; opacity: 1; font-weight: 600; }
.switch { display: flex; align-items: center; gap: 10px; cursor: pointer; opacity: .85; }
.danger p { opacity: .6; font-size: 14px; margin: 0 0 12px; }
.del { padding: 9px 18px; border-radius: 999px; border: none; background: #e0455e; color: #fff; cursor: pointer; }
.confirm { display: flex; align-items: center; gap: 10px; }
.about { text-align: center; opacity: .4; font-size: 13px; margin-top: 30px; }
</style>
