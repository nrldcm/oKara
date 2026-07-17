<script setup lang="ts">
import { FX_PRESETS, MIC_MODES, applyMicMode } from '~/composables/useSettings'

const { settings } = useSettings()
const fx = computed(() => settings.value.fx)

function applyPreset(name: string) {
  Object.assign(settings.value.fx, FX_PRESETS[name])
  settings.value.fx.preset = name
}

function setMode(name: string) {
  applyMicMode(settings.value.fx, name)
}

const sliders: { key: 'volume' | 'reverb' | 'echo' | 'echoTime' | 'bass' | 'treble'; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: 'volume', label: 'Mic volume', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'reverb', label: 'Reverb', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'echo', label: 'Echo', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'echoTime', label: 'Echo time', min: 0.08, max: 0.6, step: 0.01, fmt: (v) => `${Math.round(v * 1000)}ms` },
  { key: 'bass', label: 'Bass', min: -12, max: 12, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v}dB` },
  { key: 'treble', label: 'Treble', min: -12, max: 12, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v}dB` },
]
</script>

<template>
  <div class="fx">
    <div class="modes">
      <span class="modes__label">Mic mode</span>
      <div class="segmented">
        <button
          v-for="name in Object.keys(MIC_MODES)"
          :key="name"
          :class="{ active: fx.mode === name }"
          @click="setMode(name)"
        >{{ name }}</button>
      </div>
    </div>

    <label class="monitor" :class="{ on: fx.monitor }">
      <input type="checkbox" v-model="fx.monitor" />
      <span>🎙️ Hear my voice (live monitor)</span>
    </label>
    <p v-if="fx.monitor" class="warn">Use earphones or keep the mic away from the speakers to avoid feedback.</p>

    <div class="presets">
      <button
        v-for="name in Object.keys(FX_PRESETS)"
        :key="name"
        class="preset"
        :class="{ active: fx.preset === name }"
        @click="applyPreset(name)"
      >{{ name }}</button>
    </div>

    <div class="grid">
      <label v-for="s in sliders" :key="s.key" class="slider">
        <span class="top"><span>{{ s.label }}</span><em>{{ s.fmt(fx[s.key]) }}</em></span>
        <input
          type="range" :min="s.min" :max="s.max" :step="s.step"
          v-model.number="fx[s.key]" @input="fx.preset = 'Custom'"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.fx { display: flex; flex-direction: column; gap: 14px; }
.modes { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.modes__label { font-size: 13px; color: var(--text-muted); }
.segmented { display: inline-flex; background: var(--bg); border: 1px solid var(--border); border-radius: 999px; padding: 4px; }
.segmented button { border: none; background: none; color: var(--text); padding: 8px 16px; border-radius: 999px;
  cursor: pointer; opacity: .6; font-size: 13px; }
.segmented button.active { background: var(--accent); color: var(--on-accent); opacity: 1; font-weight: 600; }
.monitor { display: flex; align-items: center; gap: 10px; cursor: pointer; font-weight: 600; }
.warn { font-size: 12px; color: var(--accent-2); margin-top: -8px; }
.presets { display: flex; gap: 8px; flex-wrap: wrap; }
.preset { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text); cursor: pointer; font-size: 13px; }
.preset.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px 20px; }
.slider { display: flex; flex-direction: column; gap: 6px; }
.slider .top { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-muted); }
.slider .top em { font-style: normal; font-variant-numeric: tabular-nums; color: var(--text); }
.slider input { width: 100%; accent-color: var(--accent); }
</style>
