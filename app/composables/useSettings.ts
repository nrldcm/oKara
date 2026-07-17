export interface VocalFx {
  monitor: boolean
  volume: number
  reverb: number
  echo: number
  echoTime: number
  bass: number
  treble: number
  preset: string
  mode: string
}

export interface OkaraSettings {
  micDeviceId: string
  voiceChannel: 'stereo' | 'left' | 'right'
  scoringTolerance: 0 | 1
  fx: VocalFx
}

const DEFAULTS: OkaraSettings = {
  micDeviceId: '',
  voiceChannel: 'stereo',
  scoringTolerance: 1,
  fx: {
    monitor: false,
    volume: 0.85,
    reverb: 0.28,
    echo: 0.14,
    echoTime: 0.23,
    bass: 0,
    treble: 0,
    preset: 'Karaoke',
    mode: 'Karaoke',
  },
}

export const MIC_MODES: Record<string, Partial<VocalFx>> = {
  Off: { monitor: false },
  Clean: { monitor: true, reverb: 0.05, echo: 0, echoTime: 0.2, bass: 0, treble: 1 },
  Karaoke: { monitor: true, reverb: 0.3, echo: 0.16, echoTime: 0.23, bass: 2, treble: 2 },
  Pro: { monitor: true, reverb: 0.45, echo: 0.12, echoTime: 0.28, bass: 3, treble: 3 },
}

export function applyMicMode(fx: VocalFx, mode: string) {
  Object.assign(fx, MIC_MODES[mode])
  fx.mode = mode
  fx.preset = mode === 'Off' ? fx.preset : 'Custom'
}

export const FX_PRESETS: Record<string, Partial<VocalFx>> = {
  Off: { reverb: 0, echo: 0, bass: 0, treble: 0 },
  Karaoke: { reverb: 0.28, echo: 0.14, echoTime: 0.23, bass: 2, treble: 2 },
  'Echo Mic': { reverb: 0.2, echo: 0.38, echoTime: 0.28, bass: 1, treble: 3 },
  'Concert Hall': { reverb: 0.6, echo: 0.1, echoTime: 0.3, bass: 3, treble: 1 },
  Studio: { reverb: 0.16, echo: 0.05, echoTime: 0.18, bass: 0, treble: 2 },
}

const KEY = 'okara-settings'

export function useSettings() {
  const settings = useState<OkaraSettings>('okara-settings', () => structuredClone(DEFAULTS))
  const loaded = useState<boolean>('okara-settings-loaded', () => false)

  function load() {
    if (loaded.value) return
    if (import.meta.client) {
      try {
        const raw = localStorage.getItem(KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          settings.value = { ...DEFAULTS, ...parsed, fx: { ...DEFAULTS.fx, ...(parsed.fx ?? {}) } }
        }
      } catch { /* ignore */ }
    }
    loaded.value = true
  }

  function save() {
    if (!import.meta.client) return
    try { localStorage.setItem(KEY, JSON.stringify(settings.value)) } catch { /* private mode / quota */ }
  }

  watch(settings, save, { deep: true })

  return { settings, load }
}
