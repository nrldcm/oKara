<script setup lang="ts">
import { listMicrophones } from '~/composables/usePitch'
import { libraryFolderAvailable } from '~/composables/useLibrary'
import type { ThemeMode } from '~/composables/useTheme'

const { settings } = useSettings()
const { mode: themeMode, setMode: setThemeMode } = useTheme()
const { refreshPairing } = useRemote()
const emit = defineEmits<{ clear: [] }>()

const version = useRuntimeConfig().public.version
// Dev tools (error log) are hidden until toggled with Ctrl+Shift+Alt+F12.
const dev = useState('okara-dev', () => false)

const THEME_MODES: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'day', label: 'Day', icon: 'bi-sun-fill' },
  { value: 'night', label: 'Night', icon: 'bi-moon-stars-fill' },
  { value: 'system', label: 'System', icon: 'bi-circle-half' },
]

// Advanced settings modal (remote server port)
const showAdvanced = ref(false)
const hasRemoteConfig = ref(false)
const portMode = ref<'auto' | 'custom'>('auto')
const portValue = ref(3000)
const portBusy = ref(false)
const portMsg = ref('')

async function openAdvanced() {
  portMsg.value = ''
  const rc = (window as any).okara?.remoteConfig
  if (rc) {
    try {
      const cfg = await rc.get()
      portMode.value = cfg.port ? 'custom' : 'auto'
      if (cfg.port) portValue.value = cfg.port
    } catch { /* defaults */ }
  }
  showAdvanced.value = true
}

async function savePort() {
  const rc = (window as any).okara?.remoteConfig
  if (!rc) return
  const port = portMode.value === 'custom' ? portValue.value : 0
  if (portMode.value === 'custom' && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
    portMsg.value = 'Enter a port between 1024 and 65535.'
    return
  }
  portBusy.value = true
  portMsg.value = ''
  try {
    const res = await rc.setPort(port)
    await refreshPairing()
    portMsg.value = res?.error
      ? res.error
      : `Remote server restarted on port ${res.port}. Remotes must re-scan the QR.`
  } catch {
    portMsg.value = 'Failed to restart the remote server.'
  } finally {
    portBusy.value = false
  }
}

const mics = ref<MediaDeviceInfo[]>([])
const confirmClear = ref(false)
const libDir = ref('')
const libCanChoose = ref(false)
const hasLibFolder = ref(false)
const hasBtRoute = ref(false)
const btAvailable = ref(false)
const btOn = ref(false)
const btError = ref('')

async function refreshMics() {
  try { await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { /* */ }
  mics.value = await listMicrophones()
}

async function refreshBt() {
  const route = (window as any).okara?.micRoute
  if (!route) return
  hasBtRoute.value = true
  try {
    const st = await route.status()
    btAvailable.value = !!st.available
    btOn.value = !!st.on
  } catch { /* ignore */ }
}

async function toggleBt(e: Event) {
  const want = (e.target as HTMLInputElement).checked
  btError.value = ''
  try {
    const st = await (window as any).okara.micRoute.setBluetooth(want)
    btOn.value = !!st.on
    btAvailable.value = !!st.available
  } catch {
    btOn.value = false
    ;(e.target as HTMLInputElement).checked = false
    btError.value = 'No Bluetooth mic found — pair the headset/karaoke mic in Android Bluetooth settings first.'
  }
}

onMounted(async () => {
  refreshMics()
  refreshBt()
  hasRemoteConfig.value = !!(window as any).okara?.remoteConfig
  hasLibFolder.value = libraryFolderAvailable()
  if (hasLibFolder.value) {
    try {
      const info = await (window as any).okara.library.info()
      libDir.value = info.dir
      libCanChoose.value = !!info.canChooseDir
    } catch { /* ignore */ }
  }
})

async function chooseLibDir() {
  try {
    const res = await (window as any).okara.library.chooseDir()
    if (res?.dir) libDir.value = res.dir
  } catch { /* cancelled */ }
}

const hasLog = import.meta.client && !!(window as any).okara?.openLog
const logMsg = ref('')
async function openLog() {
  try { await (window as any).okara.openLog(); logMsg.value = '' }
  catch { logMsg.value = 'Could not open the log file.' }
}
async function copyLog() {
  try {
    const text = await (window as any).okara.readLog()
    if (!text) { logMsg.value = 'Log is empty — nothing to copy.'; return }
    await navigator.clipboard.writeText(text)
    logMsg.value = 'Log copied to clipboard — you can paste it to send in.'
  } catch { logMsg.value = 'Could not copy the log.' }
}

function doClear() {
  emit('clear')
  confirmClear.value = false
}
</script>

<template>
  <section class="set">
    <h1>Settings</h1>

    <details class="panel">
      <summary><i class="bi bi-plus-circle-fill" /> Import songs</summary>
      <div class="panel__body"><ImportView /></div>
    </details>

    <details class="panel">
      <summary><i class="bi bi-palette-fill" /> Theme</summary>
      <div class="panel__body">
        <div class="segmented">
          <button
            v-for="m in THEME_MODES"
            :key="m.value"
            :class="{ active: themeMode === m.value }"
            @click="setThemeMode(m.value)"
          ><i class="bi" :class="m.icon" /> {{ m.label }}</button>
        </div>
      </div>
    </details>

    <details class="panel">
      <summary><i class="bi bi-mic-fill" /> Microphone</summary>
      <div class="panel__body">
        <div class="row">
          <select v-model="settings.micDeviceId" class="input">
            <option value="">Default</option>
            <option v-for="m in mics" :key="m.deviceId" :value="m.deviceId">
              {{ m.label || 'Mic ' + m.deviceId.slice(0, 6) }}
            </option>
          </select>
          <button class="mini grad" @click="refreshMics">Refresh</button>
        </div>
        <template v-if="hasBtRoute">
          <label class="switch bt-switch">
            <input type="checkbox" :checked="btOn" @change="toggleBt" />
            Use a Bluetooth mic (headset / karaoke mic)
          </label>
          <p class="muted small">
            {{ btAvailable ? 'A Bluetooth mic is connected and ready.'
              : 'Pair the mic in Android Bluetooth settings, then turn this on.' }}
            Bluetooth mics use the voice link, so capture quality is call-grade.
          </p>
          <p v-if="btError" class="bt-err">{{ btError }}</p>
        </template>
      </div>
    </details>

    <details class="panel">
      <summary><i class="bi bi-soundwave" /> Playback &amp; scoring</summary>
      <div class="panel__body">
        <p class="lbl">Default channel (video/audio)</p>
        <div class="segmented">
          <button
            v-for="opt in (['stereo', 'left', 'right'] as const)"
            :key="opt"
            :class="{ active: settings.voiceChannel === opt }"
            @click="settings.voiceChannel = opt"
          >{{ opt === 'stereo' ? 'Original' : opt === 'left' ? 'Left' : 'Right' }}</button>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="settings.scoringTolerance === 1"
            @change="settings.scoringTolerance = ($event.target as HTMLInputElement).checked ? 1 : 0" />
          Allow ±1 semitone (easier to score)
        </label>
      </div>
    </details>

    <details class="panel">
      <summary><i class="bi bi-sliders" /> Vocal effects</summary>
      <div class="panel__body"><VocalFxPanel /></div>
    </details>

    <details class="panel">
      <summary><i class="bi bi-phone-fill" /> Phone remote</summary>
      <div class="panel__body"><RemotePanel /></div>
    </details>

    <details v-if="hasLibFolder" class="panel">
      <summary><i class="bi bi-folder-fill" /> Library folder</summary>
      <div class="panel__body">
        <p class="muted">
          Imported songs are copied into this folder — one big library that
          survives reinstalls. You can also bulk-copy song files straight into it;
          they are picked up on the next launch.
        </p>
        <div class="row">
          <code class="dir">{{ libDir || '…' }}</code>
          <button v-if="libCanChoose" class="mini grad" @click="chooseLibDir">Change…</button>
        </div>
        <p v-if="!libCanChoose" class="muted small">
          On Android the folder is fixed (app files → <em>library</em>, visible over
          USB). Back it up before uninstalling the app.
        </p>
        <p v-else class="muted small">
          Changing the folder does not move existing files — new imports go to the
          new folder; copy old files over manually if you want them rescanned there.
        </p>
      </div>
    </details>

    <details v-if="hasRemoteConfig" class="panel">
      <summary><i class="bi bi-gear-wide-connected" /> Advanced</summary>
      <div class="panel__body">
        <button class="mini grad" @click="openAdvanced">Remote server port…</button>
      </div>
    </details>

    <details class="panel danger">
      <summary><i class="bi bi-trash-fill" /> Clear library</summary>
      <div class="panel__body">
        <p>This <strong>permanently deletes every song</strong> — the database records <strong>and</strong> all files in the library folder. It can't be undone (only the built-in demo is restored).</p>
        <button v-if="!confirmClear" class="del" @click="confirmClear = true">Clear library</button>
        <div v-else class="confirm">
          <span>Delete all songs and their files?</span>
          <button class="del" @click="doClear">Yes, delete everything</button>
          <button class="mini" @click="confirmClear = false">No</button>
        </div>
      </div>
    </details>

    <details v-if="dev && hasLog" class="panel" open>
      <summary><i class="bi bi-bug-fill" /> Error log (dev)</summary>
      <div class="panel__body">
        <p class="muted small">Open or copy the log and send it in — it records the exact error.</p>
        <div class="log-btns">
          <button class="mini" @click="openLog"><i class="bi bi-file-earmark-text" /> Open log file</button>
          <button class="mini" @click="copyLog"><i class="bi bi-clipboard" /> Copy log</button>
        </div>
        <p v-if="logMsg" class="muted small">{{ logMsg }}</p>
      </div>
    </details>

    <details class="panel">
      <summary><i class="bi bi-info-circle-fill" /> About okara</summary>
      <div class="panel__body">
        <p class="muted">
          <strong>okara</strong> is an open karaoke player — UltraStar scoring,
          vocal effects, a phone remote, and a searchable songbook. Built by
          <strong>nrldcm</strong>.
        </p>
        <p class="muted small">© 2026 nrldcm · Released under the MIT License.</p>
        <h4 class="disc-title">Disclaimer</h4>
        <p class="muted small">
          okara was made so you can keep enjoying karaoke discs (CDs/VCDs/DVDs)
          you already own but can no longer play on aging physical players — it
          plays your own media files and does not include, host, or distribute any
          songs, lyrics, or karaoke content.
        </p>
        <p class="muted small">
          okara does not promote or encourage piracy. If you obtain or import
          copyrighted material without a licence, that is solely your
          responsibility — the developer neither provides such content nor endorses
          it. Only use files you legally own. The software is provided "as is",
          without warranty of any kind; the author is not liable for how it is
          used or for any content users add to it.
        </p>
      </div>
    </details>

    <p class="version">okara version {{ version }}</p>

    <Teleport to="body">
      <div v-if="showAdvanced" class="modal-backdrop" @click.self="showAdvanced = false">
        <div class="modal">
          <div class="modal__head">
            <h3><i class="bi bi-gear-wide-connected" /> Advanced settings</h3>
            <button class="modal__close" @click="showAdvanced = false"><i class="bi bi-x-lg" /></button>
          </div>

          <h4>Remote server port</h4>
          <p class="muted small">
            The port the phone remote connects to on this device. Auto picks a free
            port on every launch; set a fixed port if your network needs it.
            Changing it restarts the remote server — connected phones must re-scan
            the QR.
          </p>
          <label class="port-opt">
            <input type="radio" value="auto" v-model="portMode" /> Auto (random free port)
          </label>
          <label class="port-opt">
            <input type="radio" value="custom" v-model="portMode" /> Fixed port:
            <input
              type="number" min="1024" max="65535" v-model.number="portValue"
              class="port-input" :disabled="portMode !== 'custom'" placeholder="3000"
            />
          </label>

          <p v-if="portMsg" class="port-msg">{{ portMsg }}</p>

          <div class="modal__actions">
            <button class="mini" @click="showAdvanced = false">Close</button>
            <button class="save" :disabled="portBusy" @click="savePort">
              {{ portBusy ? 'Restarting…' : 'Save & restart server' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.set { padding: 4px 2px 40px; max-width: 720px; margin: 0 auto; }
h1 { font-size: 26px; margin: 0 0 24px; }

/* Collapsible panels (default closed). */
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  margin-bottom: 12px; overflow: hidden; }
.panel > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px;
  padding: 15px 18px; font-size: 15px; font-weight: 600; user-select: none; }
.panel > summary::-webkit-details-marker { display: none; }
.panel > summary::after { content: '\F282'; font-family: 'bootstrap-icons'; margin-left: auto; font-size: 12px;
  color: var(--text-faint); transition: transform .2s; font-weight: normal; }
.panel[open] > summary::after { transform: rotate(180deg); }
.panel > summary > .bi { background: var(--accent-grad); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; }
.panel__body { padding: 0 18px 18px; }
.panel.danger > summary > .bi { background: none; -webkit-text-fill-color: var(--danger); color: var(--danger); }
.lbl { font-size: 13px; color: var(--text-muted); margin: 0 0 8px; }
.bt-switch { margin-top: 16px; }
/* Import panel embeds ImportView — trim padding and drop its redundant title. */
.panel__body :deep(.imp) { padding: 0; max-width: none; }
.panel__body :deep(.imp) > h1 { display: none; }
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
.segmented button.active { background: var(--accent-grad); color: var(--on-accent); opacity: 1; font-weight: 600; }
.switch { display: flex; align-items: center; gap: 10px; cursor: pointer; color: var(--text); }
.danger p { color: var(--text-muted); font-size: 14px; margin: 0 0 12px; }
.muted { color: var(--text-muted); font-size: 14px; margin: 0 0 12px; line-height: 1.5; }
.muted.small { font-size: 12px; color: var(--text-faint); margin: 10px 0 0; line-height: 1.55; }
.disc-title { margin: 16px 0 0; font-size: 13px; color: var(--text-muted); }
.dir { flex: 1; min-width: 0; background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 14px; font-size: 13px; word-break: break-all; }
.bt-err { color: var(--danger); font-size: 13px; margin: 10px 0 0; }
.advanced-row { text-align: center; margin: 24px 0 8px; }
.advanced-btn { padding: 10px 18px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text-muted); cursor: pointer; font-size: 14px; }
.advanced-btn:hover { color: var(--text); }
.modal-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, .55);
  display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px 24px;
  width: 100%; max-width: 480px; box-shadow: var(--shadow, 0 20px 60px rgba(0,0,0,.4)); }
.modal__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.modal__head h3 { margin: 0; font-size: 17px; }
.modal__close { border: none; background: none; color: var(--text-muted); font-size: 17px; cursor: pointer; }
.modal h4 { margin: 0 0 8px; font-size: 14px; }
.port-opt { display: flex; align-items: center; gap: 8px; margin: 8px 0; cursor: pointer; font-size: 14px; }
.port-input { width: 110px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); }
.port-input:disabled { opacity: .4; }
.port-msg { font-size: 13px; color: var(--accent); margin: 10px 0 0; }
.modal__actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.save { padding: 10px 18px; border-radius: 999px; border: none; background: var(--accent-grad); color: var(--on-accent);
  font-weight: 600; cursor: pointer; }
.save:disabled { opacity: .5; }
.del { padding: 10px 18px; border-radius: 999px; border: none; background: var(--danger); color: #fff; cursor: pointer; }
.confirm { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.log-btns { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.about { text-align: center; color: var(--text-faint); font-size: 13px; margin-top: 30px; }
.version { text-align: center; color: var(--text-faint); font-size: 12px; margin: 6px 0 4px; opacity: .8; }

@media (max-width: 560px) {
  h1 { font-size: 22px; }
  .segmented { width: 100%; display: flex; }
  .segmented button { flex: 1; padding: 10px 8px; }
}
</style>
