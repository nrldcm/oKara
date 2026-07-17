<script setup lang="ts">
interface State {
  hasSong: boolean; playing: boolean; title: string; artist: string
  volume: number; reserved: number; message: string; messageSeq: number
}

const state = ref<State>({
  hasSong: false, playing: false, title: '', artist: '', volume: 1,
  reserved: 0, message: '', messageSeq: 0,
})
const connected = ref(false)
const dialed = ref('')
const flash = ref('')
let flashTimer: ReturnType<typeof setTimeout> | null = null
let channel: BroadcastChannel | null = null
let lastMsgSeq = 0

onMounted(() => {
  channel = new BroadcastChannel('okara-remote')
  channel.onmessage = (e) => {
    if (e.data?.type === 'state') {
      state.value = e.data.state
      connected.value = true
      if (state.value.messageSeq !== lastMsgSeq) {
        lastMsgSeq = state.value.messageSeq
        showFlash(state.value.message)
      }
    }
  }
  channel.postMessage({ type: 'hello' })
})
onBeforeUnmount(() => { channel?.close(); if (flashTimer) clearTimeout(flashTimer) })

function cmd(action: string, value?: number) {
  channel?.postMessage({ type: 'cmd', action, value })
}
function showFlash(msg: string) {
  flash.value = msg
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flash.value = '' }, 2600)
}
function press(d: string) {
  if (dialed.value.length < 6) dialed.value += d
}
function backspace() { dialed.value = dialed.value.slice(0, -1) }
function clearDial() { dialed.value = '' }
function playNumber() {
  if (!dialed.value) return
  cmd('play-number', Number(dialed.value))
  clearDial()
}
function reserveNumber() {
  if (!dialed.value) return
  cmd('reserve-number', Number(dialed.value))
  clearDial()
}
function onVolume(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  state.value.volume = v
  cmd('volume', v)
}
</script>

<template>
  <div class="remote-page">
    <div class="head">
      <h1>🎤 okara remote</h1>
      <span class="reserved" v-if="state.reserved">Reserved: {{ state.reserved }}</span>
    </div>

    <div class="now" :class="{ idle: !state.hasSong }">
      <template v-if="state.hasSong">
        <strong>{{ state.title }}</strong>
        <span>{{ state.artist }}</span>
      </template>
      <em v-else>Nothing playing</em>
    </div>

    <div class="display">
      <span class="num">{{ dialed || '––––' }}</span>
      <button class="bs" :disabled="!dialed" @click="backspace">⌫</button>
    </div>

    <div class="keypad">
      <button v-for="n in [1,2,3,4,5,6,7,8,9]" :key="n" class="key" @click="press(String(n))">{{ n }}</button>
      <button class="key sub" @click="clearDial">C</button>
      <button class="key" @click="press('0')">0</button>
      <button class="key sub" :disabled="!dialed" @click="backspace">⌫</button>
    </div>

    <div class="dial-actions">
      <button class="act play" :disabled="!dialed" @click="playNumber">▶ Play</button>
      <button class="act reserve" :disabled="!dialed" @click="reserveNumber">＋ Reserve</button>
    </div>

    <div class="transport">
      <button class="btn" @click="cmd('prev')">⏮</button>
      <button class="btn big" @click="cmd('toggle')">{{ state.playing ? '⏸' : '▶' }}</button>
      <button class="btn" @click="cmd('next')">⏭</button>
    </div>

    <div class="row">
      <button class="btn wide" @click="cmd('restart')">↻ Restart</button>
      <button class="btn wide stop" @click="cmd('stop')">⏹ Stop</button>
    </div>

    <label class="vol">
      🔉
      <input type="range" min="0" max="1" step="0.01" :value="state.volume" @input="onVolume" />
      🔊
    </label>

    <p class="flash" :class="{ show: flash }">{{ flash }}</p>
    <p class="status">{{ connected ? 'Connected' : 'Waiting for connection…' }}</p>
  </div>
</template>

<style scoped>
.remote-page { min-height: 100vh; min-height: 100dvh; background: var(--bg); color: var(--text);
  display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 22px 18px 30px;
  max-width: 460px; margin: 0 auto; }
.head { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; }
h1 { font-size: 20px; margin: 0; }
.reserved { font-size: 12px; background: var(--surface-2); border-radius: 999px; padding: 4px 10px; color: var(--text-muted); }
.now { text-align: center; display: flex; flex-direction: column; min-height: 44px; }
.now strong { font-size: 19px; }
.now span { color: var(--text-muted); }
.now.idle { color: var(--text-faint); }
.display { display: flex; align-items: center; gap: 10px; width: 100%; background: var(--surface);
  border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; }
.display .num { flex: 1; font-size: 34px; font-weight: 800; letter-spacing: 6px; font-variant-numeric: tabular-nums;
  text-align: center; color: var(--accent); }
.display .bs { border: none; background: none; color: var(--text-muted); font-size: 22px; cursor: pointer; }
.keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; width: 100%; }
.key { height: 62px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font-size: 24px; font-weight: 700; cursor: pointer; }
.key:active { background: var(--surface-2); }
.key.sub { font-size: 20px; color: var(--text-muted); }
.key:disabled { opacity: .4; }
.dial-actions { display: flex; gap: 12px; width: 100%; }
.act { flex: 1; height: 54px; border-radius: 14px; border: none; font-size: 17px; font-weight: 700; cursor: pointer; }
.act.play { background: var(--accent-grad); color: #fff; }
.act.reserve { background: var(--surface-2); color: var(--text); }
.act:disabled { opacity: .45; }
.transport { display: flex; align-items: center; gap: 16px; margin-top: 4px; }
.btn { border: 1px solid var(--border); border-radius: 50%; width: 62px; height: 62px; font-size: 22px;
  background: var(--surface); color: var(--text); cursor: pointer; }
.btn.big { width: 78px; height: 78px; font-size: 30px; background: var(--accent-grad); color: #fff; border: none; }
.row { display: flex; gap: 12px; width: 100%; }
.btn.wide { width: 100%; height: 50px; border-radius: 14px; font-size: 15px; }
.btn.stop { background: var(--danger); color: #fff; border: none; }
.vol { display: flex; align-items: center; gap: 12px; width: 100%; }
.vol input { flex: 1; accent-color: var(--accent); }
.flash { min-height: 20px; color: var(--accent); font-size: 14px; font-weight: 600; opacity: 0; transition: opacity .2s; }
.flash.show { opacity: 1; }
.status { color: var(--text-faint); font-size: 13px; }
</style>
