<script setup lang="ts">
const { available, pairing, connected, init } = useRemote()
const canvas = ref<HTMLCanvasElement | null>(null)

async function renderQr() {
  if (!pairing.value || !canvas.value) return
  const QR = (await import('qrcode')).default
  await QR.toCanvas(canvas.value, pairing.value.url, {
    width: 220,
    margin: 1,
    color: { dark: '#0d0d1a', light: '#ffffff' },
  })
}

onMounted(async () => {
  await init()
  await nextTick()
  await renderQr()
})
watch(pairing, renderQr)
</script>

<template>
  <div class="remote">
    <h3>Phone remote</h3>
    <p class="desc">
      I-scan ang QR gamit ang phone para gawing remote control — play, pause, next,
      previous, stop, at volume, tulad ng tunay na karaoke remote.
    </p>

    <div v-if="available" class="pair">
      <canvas ref="canvas" class="qr" />
      <div class="pair__info">
        <p class="mode">
          <span class="badge" :class="pairing?.mode">{{ pairing?.mode === 'lan' ? 'LAN pairing' : 'Same-device (demo)' }}</span>
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
.remote { background: #14142a; border-radius: 14px; padding: 18px 20px; }
.remote h3 { margin: 0 0 6px; font-size: 16px; }
.desc { opacity: .65; font-size: 14px; line-height: 1.5; margin-bottom: 16px; }
.pair { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.qr { border-radius: 12px; background: #fff; padding: 8px; }
.pair__info { flex: 1; min-width: 200px; }
.badge { font-size: 11px; padding: 3px 10px; border-radius: 999px; }
.badge.lan { background: #4be07a; color: #052; }
.badge.local { background: #34345a; }
.url { font-family: monospace; font-size: 12px; opacity: .7; word-break: break-all; margin: 10px 0; }
.conn { display: flex; align-items: center; gap: 8px; font-size: 13px; opacity: .8; }
.conn .dot { width: 9px; height: 9px; border-radius: 50%; background: #555; }
.conn .dot.on { background: #4be07a; box-shadow: 0 0 8px #4be07a; }
.hint { font-size: 12px; opacity: .5; margin-top: 10px; line-height: 1.5; }
.unavailable { opacity: .5; font-size: 14px; }
</style>
