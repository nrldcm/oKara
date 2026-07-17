<script setup lang="ts">
const { available, pairing, connected, init } = useRemote()
const { theme } = useTheme()
const canvas = ref<HTMLCanvasElement | null>(null)

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
  await nextTick()
  await renderQr()
})
watch([pairing, theme], renderQr)
</script>

<template>
  <div class="remote">
    <h3>Phone remote</h3>
    <p class="desc">
      I-scan ang QR gamit ang phone para gawing remote control — play, pause, next,
      previous, stop, at volume, tulad ng tunay na karaoke remote.
    </p>

    <div v-if="available" class="pair">
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
          {{ connected }} naka-konekta
        </p>
        <p v-if="pairing?.mode === 'local'" class="hint">
          Web mode: bukas sa parehong device (bagong tab). Para sa scan-from-phone,
          gamitin ang desktop app (Electron) — secure LAN pairing na may token.
        </p>
        <p v-else class="hint">
          Secure: kailangan ng one-time token mula sa QR, at LAN-only lang ang koneksyon.
        </p>
      </div>
    </div>
    <p v-else class="unavailable">Hindi available ang remote sa environment na ito.</p>
  </div>
</template>

<style scoped>
.remote h3 { margin: 0 0 6px; font-size: 15px; }
.desc { color: var(--text-muted); font-size: 14px; line-height: 1.5; margin-bottom: 16px; }
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

@media (max-width: 560px) {
  .pair { justify-content: center; }
}
</style>
