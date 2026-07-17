<script setup lang="ts">
interface State { hasSong: boolean; playing: boolean; title: string; artist: string; volume: number }

const state = ref<State>({ hasSong: false, playing: false, title: '', artist: '', volume: 1 })
const connected = ref(false)
let channel: BroadcastChannel | null = null

onMounted(() => {
  channel = new BroadcastChannel('okara-remote')
  channel.onmessage = (e) => {
    if (e.data?.type === 'state') { state.value = e.data.state; connected.value = true }
  }
  channel.postMessage({ type: 'hello' })
})
onBeforeUnmount(() => channel?.close())

function cmd(action: string, value?: number) {
  channel?.postMessage({ type: 'cmd', action, value })
}
function onVolume(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  state.value.volume = v
  cmd('volume', v)
}
</script>

<template>
  <div class="remote-page">
    <h1>🎤 okara remote</h1>

    <div class="now" :class="{ idle: !state.hasSong }">
      <template v-if="state.hasSong">
        <strong>{{ state.title }}</strong>
        <span>{{ state.artist }}</span>
      </template>
      <em v-else>Walang tumutugtog</em>
    </div>

    <div class="pad">
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

    <p class="status">{{ connected ? 'Konektado' : 'Naghihintay ng koneksyon…' }}</p>
  </div>
</template>

<style scoped>
.remote-page { min-height: 100vh; background: #0d0d1a; color: #fff; display: flex; flex-direction: column;
  align-items: center; gap: 22px; padding: 30px 20px; }
h1 { font-size: 22px; margin: 0; }
.now { text-align: center; display: flex; flex-direction: column; min-height: 48px; }
.now strong { font-size: 20px; }
.now span { opacity: .6; }
.now.idle { opacity: .5; }
.pad { display: flex; align-items: center; gap: 18px; }
.btn { border: none; border-radius: 50%; width: 72px; height: 72px; font-size: 26px; background: #1c1c33;
  color: #fff; cursor: pointer; }
.btn.big { width: 96px; height: 96px; font-size: 36px; background: linear-gradient(135deg, #ff5da2, #ff9d5d); }
.row { display: flex; gap: 14px; width: 100%; max-width: 340px; }
.btn.wide { width: 100%; height: 54px; border-radius: 14px; font-size: 16px; }
.btn.stop { background: #e0455e; }
.vol { display: flex; align-items: center; gap: 12px; width: 100%; max-width: 340px; }
.vol input { flex: 1; }
.status { opacity: .5; font-size: 13px; margin-top: auto; }
</style>
