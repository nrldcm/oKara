<script setup lang="ts">
interface ReservedItem { number: number; title: string; artist: string }
interface FxState {
  mode: string; monitor: boolean; preset: string; volume: number
  reverb: number; echo: number; echoTime: number; bass: number; treble: number
}
interface State {
  hasSong: boolean; playing: boolean; title: string; artist: string
  volume: number; reserved: number; reservedList: ReservedItem[]; message: string; messageSeq: number
  fx?: FxState
}

const state = ref<State>({
  hasSong: false, playing: false, title: '', artist: '', volume: 1,
  reserved: 0, reservedList: [], message: '', messageSeq: 0,
})
const connected = ref(false)
const tab = ref<'remote' | 'queue' | 'mic'>('remote')

const MIC_MODES = ['Off', 'Clean', 'Karaoke', 'Pro']
const FX_PRESETS = ['Off', 'Karaoke', 'Echo Mic', 'Concert Hall', 'Studio']
const FX_SLIDERS: { action: string; key: keyof FxState; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { action: 'fx-volume', key: 'volume', label: 'Mic volume', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { action: 'fx-reverb', key: 'reverb', label: 'Reverb', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { action: 'fx-echo', key: 'echo', label: 'Echo', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { action: 'fx-echo-time', key: 'echoTime', label: 'Echo time', min: 0.08, max: 0.6, step: 0.01, fmt: (v) => `${Math.round(v * 1000)}ms` },
  { action: 'fx-bass', key: 'bass', label: 'Bass', min: -12, max: 12, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v}dB` },
  { action: 'fx-treble', key: 'treble', label: 'Treble', min: -12, max: 12, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v}dB` },
]
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

function cmd(action: string, value?: number | string) {
  channel?.postMessage({ type: 'cmd', action, value })
}
function onFxSlider(action: string, key: keyof FxState, e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (state.value.fx) (state.value.fx as any)[key] = v
  cmd(action, v)
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
      <h1><i class="bi bi-mic-fill" /> okara remote</h1>
    </div>

    <div class="tabs">
      <button :class="{ active: tab === 'remote' }" @click="tab = 'remote'"><i class="bi bi-grid-3x3-gap-fill" /> Remote</button>
      <button :class="{ active: tab === 'queue' }" @click="tab = 'queue'">
        <i class="bi bi-list-ul" /> Queue<span v-if="state.reserved" class="count">{{ state.reserved }}</span>
      </button>
      <button :class="{ active: tab === 'mic' }" @click="tab = 'mic'"><i class="bi bi-mic-fill" /> Mic</button>
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
        <button class="bs" :disabled="!dialed" @click="backspace"><i class="bi bi-backspace-fill" /></button>
      </div>

      <div class="keypad">
        <button v-for="n in [1,2,3,4,5,6,7,8,9]" :key="n" class="key" @click="press(String(n))">{{ n }}</button>
        <button class="key sub" @click="clearDial">C</button>
        <button class="key" @click="press('0')">0</button>
        <button class="key sub" :disabled="!dialed" @click="backspace"><i class="bi bi-backspace-fill" /></button>
      </div>

      <div class="dial-actions">
        <button class="act play" :disabled="!dialed" @click="playNumber"><i class="bi bi-play-fill" /> Play</button>
        <button class="act reserve" :disabled="!dialed" @click="reserveNumber"><i class="bi bi-plus-lg" /> Reserve</button>
      </div>

      <div class="transport">
        <button class="btn" @click="cmd('prev')"><i class="bi bi-skip-start-fill" /></button>
        <button class="btn big" @click="cmd('toggle')"><i class="bi" :class="state.playing ? 'bi-pause-fill' : 'bi-play-fill'" /></button>
        <button class="btn" @click="cmd('next')"><i class="bi bi-skip-end-fill" /></button>
      </div>

      <div class="row">
        <button class="btn wide" @click="cmd('restart')"><i class="bi bi-arrow-clockwise" /> Restart</button>
        <button class="btn wide stop" @click="cmd('stop')"><i class="bi bi-stop-fill" /> Stop</button>
      </div>

      <label class="vol">
        <i class="bi bi-volume-down-fill" />
        <input type="range" min="0" max="1" step="0.01" :value="state.volume" @input="onVolume" />
        <i class="bi bi-volume-up-fill" />
      </label>
    </template>

    <template v-else-if="tab === 'mic'">
      <div v-if="!state.fx" class="queue">
        <p class="q-empty">Mic controls unavailable — update the host app.</p>
      </div>
      <div v-else class="mic">
        <div class="mic-modes">
          <button
            v-for="m in MIC_MODES" :key="m"
            class="mode" :class="{ active: state.fx.mode === m, off: m === 'Off' }"
            @click="cmd('mic-mode', m)"
          >
            <i class="bi" :class="m === 'Off' ? 'bi-mic-mute-fill' : 'bi-mic-fill'" />
            {{ m }}
          </button>
        </div>
        <p v-if="state.fx.mode === 'Off'" class="mic-hint">Mic is off — no speaker feedback.</p>
        <p v-else-if="state.fx.monitor" class="mic-hint warn">Live monitor is on — keep the mic away from the speakers.</p>

        <label class="monitor" :class="{ on: state.fx.monitor }">
          <input type="checkbox" :checked="state.fx.monitor"
            @change="cmd('fx-monitor', ($event.target as HTMLInputElement).checked ? 1 : 0)" />
          <span><i class="bi bi-headphones" /> Hear my voice (live monitor)</span>
        </label>

        <div class="presets">
          <button
            v-for="p in FX_PRESETS" :key="p"
            class="preset" :class="{ active: state.fx.preset === p }"
            @click="cmd('fx-preset', p)"
          >{{ p }}</button>
        </div>

        <div class="sliders">
          <label v-for="s in FX_SLIDERS" :key="s.action" class="fx-slider">
            <span class="top"><span>{{ s.label }}</span><em>{{ s.fmt(Number(state.fx[s.key])) }}</em></span>
            <input
              type="range" :min="s.min" :max="s.max" :step="s.step"
              :value="state.fx[s.key]" @input="onFxSlider(s.action, s.key, $event)"
            />
          </label>
        </div>
      </div>
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
            <button class="q-btn" :disabled="i === 0" @click="cmd('reserve-up', i)"><i class="bi bi-caret-up-fill" /></button>
            <button class="q-btn" :disabled="i === state.reservedList.length - 1" @click="cmd('reserve-down', i)"><i class="bi bi-caret-down-fill" /></button>
            <button class="q-btn del" @click="askRemove(i)"><i class="bi bi-x-lg" /></button>
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
.mic { width: 100%; display: flex; flex-direction: column; gap: 14px; }
.mic-modes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.mode { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 6px;
  border-radius: 14px; border: 1px solid var(--border); background: var(--surface); color: var(--text);
  cursor: pointer; font-size: 13px; font-weight: 600; }
.mode i { font-size: 18px; }
.mode.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.mode.off.active { background: var(--danger); border-color: var(--danger); color: #fff; }
.mic-hint { font-size: 12px; color: var(--text-muted); text-align: center; margin: -6px 0 0; }
.mic-hint.warn { color: var(--accent-2, var(--accent)); }
.monitor { display: flex; align-items: center; gap: 10px; cursor: pointer; font-weight: 600; }
.presets { display: flex; gap: 8px; flex-wrap: wrap; }
.preset { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text); cursor: pointer; font-size: 13px; }
.preset.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.sliders { display: flex; flex-direction: column; gap: 12px; }
.fx-slider { display: flex; flex-direction: column; gap: 6px; }
.fx-slider .top { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-muted); }
.fx-slider .top em { font-style: normal; font-variant-numeric: tabular-nums; color: var(--text); }
.fx-slider input { width: 100%; accent-color: var(--accent); }
</style>
