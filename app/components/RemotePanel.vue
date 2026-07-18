<script setup lang="ts">
const { available, pairing, connected, init, refreshPairing } = useRemote()
const { theme } = useTheme()
const canvas = ref<HTMLCanvasElement | null>(null)
let poll: ReturnType<typeof setInterval> | null = null

const offline = computed(() => pairing.value?.hasNetwork === false)

async function renderQr() {
  if (!pairing.value || !canvas.value) return
  const QR = (await import('qrcode')).default
  const dark = theme.value === 'dark'
  await QR.toCanvas(canvas.value, pairing.value.url, {
    width: 200,
    margin: 1,
    color: {
      dark: dark ? '#0e0e18' : '#191a2e',
      light: '#ffffff',
    },
  })
}

onMounted(async () => {
  await init()
  await refreshPairing()
  await nextTick()
  await renderQr()
  // Hotspot toggles fire no network callback — keep re-checking while
  // offline so the QR fixes itself the moment the hotspot/Wi-Fi is up.
  poll = setInterval(() => { if (offline.value) refreshPairing() }, 5000)
})
onBeforeUnmount(() => { if (poll) clearInterval(poll) })
watch([pairing, theme], renderQr)
</script>

<template>
  <div class="remote">
    <h3>Phone remote</h3>
    <p class="desc">
      Scan the QR with your phone to turn it into a remote control — play, pause,
      next, previous, stop, volume, browse/search the songbook, and even
      <strong>sing using the phone as the microphone</strong>.
    </p>
    <p class="secure-note">
      <i class="bi bi-shield-lock" /> The remote is served over HTTPS with a
      self-signed certificate (needed so the phone mic works). Your phone will
      show a one-time <em>"Not secure / proceed"</em> warning — tap
      <strong>Advanced → Proceed</strong> to continue. It's your own device on
      your own network; nothing leaves the LAN.
    </p>

    <div v-if="available && offline" class="offline">
      <p class="offline__title"><i class="bi bi-wifi-off" /> No Wi-Fi network</p>
      <p class="offline__body">
        The phone remote needs the phone and this device on the same network —
        internet is <strong>not</strong> required. Either:
      </p>
      <ul class="offline__list">
        <li>Turn on <strong>Wi-Fi</strong> and join your network, or</li>
        <li>Turn on this device's <strong>Hotspot</strong> and connect the phone
          to it (works anywhere, no router needed).</li>
      </ul>
      <button class="retry" @click="refreshPairing()"><i class="bi bi-arrow-clockwise" /> Check again</button>
    </div>

    <div v-else-if="available" class="pair">
      <div class="qr-wrap"><canvas ref="canvas" class="qr" /></div>
      <div class="pair__info">
        <p>
          <span class="badge" :class="pairing?.mode">
            {{ pairing?.mode === 'lan' ? 'LAN pairing' : 'Same-device (demo)' }}
          </span>
        </p>
        <p class="url">{{ pairing?.url }}</p>
        <p class="conn">
          <span class="dot" :class="{ on: connected > 0 }" />
          {{ connected }} connected
        </p>
        <p v-if="pairing?.mode === 'local'" class="hint">
          Web mode: opens on the same device (new tab). For scan-from-phone, use the
          desktop app (Electron) — secure LAN pairing with a token.
        </p>
        <p v-else class="hint">
          Secure: needs a one-time token from the QR, and the connection is LAN-only.
          No internet? Use this device's Hotspot — connect the phone to it and scan again.
        </p>
      </div>
    </div>
    <p v-else class="unavailable">Remote isn't available in this environment.</p>
  </div>
</template>

<style scoped>
.remote h3 { margin: 0 0 6px; font-size: 15px; }
.desc { color: var(--text-muted); font-size: 14px; line-height: 1.5; margin-bottom: 12px; }
.secure-note { font-size: 12px; color: var(--text-faint); line-height: 1.5; margin-bottom: 16px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.pair { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.qr-wrap { background: #fff; border-radius: 12px; padding: 8px; line-height: 0; }
.qr { border-radius: 6px; }
.pair__info { flex: 1; min-width: 200px; }
.badge { font-size: 11px; padding: 3px 10px; border-radius: 999px; color: #052; }
.badge.lan { background: var(--ok); color: #042; }
.badge.local { background: var(--surface-2); color: var(--text); }
.url { font-family: monospace; font-size: 12px; color: var(--text-muted); word-break: break-all; margin: 10px 0; }
.conn { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
.conn .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text-faint); }
.conn .dot.on { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
.hint { font-size: 12px; color: var(--text-faint); margin-top: 10px; line-height: 1.5; }
.unavailable { color: var(--text-faint); font-size: 14px; }
.offline { background: var(--bg); border: 1px dashed var(--border); border-radius: 14px; padding: 16px 18px; }
.offline__title { font-weight: 700; display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
.offline__body { color: var(--text-muted); font-size: 14px; margin: 0 0 8px; line-height: 1.5; }
.offline__list { margin: 0 0 14px; padding-left: 20px; color: var(--text-muted); font-size: 14px; line-height: 1.7; }
.retry { padding: 9px 16px; border-radius: 999px; border: none; background: var(--accent); color: var(--on-accent);
  font-weight: 600; cursor: pointer; }

@media (max-width: 560px) {
  .pair { justify-content: center; }
}
</style>
