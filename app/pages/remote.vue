<script setup lang="ts">
interface ReservedItem { number: number; title: string; artist: string }
interface State {
  hasSong: boolean; playing: boolean; title: string; artist: string
  volume: number; reserved: number; reservedList: ReservedItem[]; message: string; messageSeq: number
}

const state = ref<State>({
  hasSong: false, playing: false, title: '', artist: '', volume: 1,
  reserved: 0, reservedList: [], message: '', messageSeq: 0,
})
const connected = ref(false)
const tab = ref<'remote' | 'queue'>('remote')
const dialed = ref('')
const flash = ref('')
const confirmIdx = ref<number | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null
let channel: BroadcastChannel | null = null
let lastMsgSeq = 0

onMounted(() => {
  channel = new BroadcastChannel('okara-remote')
  channel.onmessage = (e) => {
    if (e.data?.type === 'state') {
      state.value = e.data.state
      connected.value = true
      confirmIdx.value = null
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
function press(d: string) { if (dialed.value.length < 6) dialed.value += d }
function backspace() { dialed.value = dialed.value.slice(0, -1) }
function clearDial() { dialed.value = '' }
function playNumber() { if (dialed.value) { cmd('play-number', Number(dialed.value)); clearDial() } }
function reserveNumber() { if (dialed.value) { cmd('reserve-number', Number(dialed.value)); clearDial() } }
function onVolume(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  state.value.volume = v
  cmd('volume', v)
}
function askRemove(i: number) { confirmIdx.value = i }
function doRemove(i: number) { cmd('reserve-remove', i); confirmIdx.value = null }
</script>

<template>
  <div class="remote-page">
    <div class="head">
      <h1>🎤 okara remote</h1>
    </div>

    <div class="tabs">
      <button :class="{ active: tab === 'remote' }" @click="tab = 'remote'">🎛️ Remote</button>
      <button :class="{ active: tab === 'queue' }" @click="tab = 'queue'">
        📋 Queue<span v-if="state.reserved" class="count">{{ state.reserved }}</span>
      </button>
    </div>

    <div class="now" :class="{ idle: !state.hasSong }">
      <template v-if="state.hasSong">
        <strong>{{ state.title }}</strong>
        <span>{{ state.artist }}</span>
      </template>
      <em v-else>Nothing playing</em>
    </div>

    <template v-if="tab === 'remote'">
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
    </template>

    <template v-else>
      <div class="queue">
        <p v-if="!state.reservedList.length" class="q-empty">No reserved songs. Dial a number and tap "Reserve".</p>
        <div v-for="(item, i) in state.reservedList" :key="i" class="q-item">
          <span class="q-num">#{{ item.number }}</span>
          <div class="q-info">
            <strong>{{ item.title }}</strong>
            <span>{{ item.artist }}</span>
          </div>
          <template v-if="confirmIdx === i">
            <span class="q-confirm">Remove?</span>
            <button class="q-btn yes" @click="doRemove(i)">Yes</button>
            <button class="q-btn no" @click="confirmIdx = null">No</button>
          </template>
          <template v-else>
            <button class="q-btn" :disabled="i === 0" @click="cmd('reserve-up', i)">▲</button>
            <button class="q-btn" :disabled="i === state.reservedList.length - 1" @click="cmd('reserve-down', i)">▼</button>
            <button class="q-btn del" @click="askRemove(i)">✕</button>
          </template>
        </div>
      </div>
    </template>

    <p class="flash" :class="{ show: flash }">{{ flash }}</p>
    <p class="status">{{ connected ? 'Connected' : 'Waiting for connection…' }}</p>
  </div>
</template>

<style scoped>
.remote-page { min-height: 100vh; min-height: 100dvh; background: var(--bg); color: var(--text);
  display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 20px 18px 30px;
  max-width: 460px; margin: 0 auto; }
.head { display: flex; align-items: center; justify-content: center; }
h1 { font-size: 20px; margin: 0; }
.tabs { display: flex; gap: 8px; width: 100%; }
.tabs button { flex: 1; padding: 10px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text); cursor: pointer; font-size: 14px; opacity: .7; display: flex; align-items: center;
  justify-content: center; gap: 6px; }
.tabs button.active { opacity: 1; background: var(--surface-2); font-weight: 600; }
.count { background: var(--accent); color: var(--on-accent); border-radius: 999px; font-size: 11px; padding: 1px 7px; }
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
.key { height: 60px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font-size: 24px; font-weight: 700; cursor: pointer; }
.key:active { background: var(--surface-2); }
.key.sub { font-size: 20px; color: var(--text-muted); }
.key:disabled { opacity: .4; }
.dial-actions { display: flex; gap: 12px; width: 100%; }
.act { flex: 1; height: 52px; border-radius: 14px; border: none; font-size: 17px; font-weight: 700; cursor: pointer; }
.act.play { background: var(--accent-grad); color: #fff; }
.act.reserve { background: var(--surface-2); color: var(--text); }
.act:disabled { opacity: .45; }
.transport { display: flex; align-items: center; gap: 16px; margin-top: 4px; }
.btn { border: 1px solid var(--border); border-radius: 50%; width: 60px; height: 60px; font-size: 22px;
  background: var(--surface); color: var(--text); cursor: pointer; }
.btn.big { width: 76px; height: 76px; font-size: 30px; background: var(--accent-grad); color: #fff; border: none; }
.row { display: flex; gap: 12px; width: 100%; }
.btn.wide { width: 100%; height: 50px; border-radius: 14px; font-size: 15px; }
.btn.stop { background: var(--danger); color: #fff; border: none; }
.vol { display: flex; align-items: center; gap: 12px; width: 100%; }
.vol input { flex: 1; accent-color: var(--accent); }
.queue { width: 100%; display: flex; flex-direction: column; gap: 10px; }
.q-empty { color: var(--text-faint); text-align: center; padding: 20px 0; }
.q-item { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 10px 12px; }
.q-num { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent); font-size: 14px; }
.q-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.q-info strong { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.q-info span { font-size: 12px; color: var(--text-muted); }
.q-btn { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg);
  color: var(--text); cursor: pointer; font-size: 15px; }
.q-btn:disabled { opacity: .3; }
.q-btn.del { color: var(--danger); }
.q-btn.yes { width: auto; padding: 0 14px; background: var(--danger); color: #fff; border: none; }
.q-btn.no { width: auto; padding: 0 14px; }
.q-confirm { font-size: 13px; color: var(--text-muted); }
.flash { min-height: 20px; color: var(--accent); font-size: 14px; font-weight: 600; opacity: 0; transition: opacity .2s; }
.flash.show { opacity: 1; }
.status { color: var(--text-faint); font-size: 13px; margin-top: auto; }
</style>
