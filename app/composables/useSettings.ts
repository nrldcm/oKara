export interface OkaraSettings {
  micDeviceId: string
  /** Default audio channel for playback songs: 'stereo' | 'left' | 'right'. */
  voiceChannel: 'stereo' | 'left' | 'right'
  scoringTolerance: 0 | 1 // extra semitone of leniency
}

const DEFAULTS: OkaraSettings = {
  micDeviceId: '',
  voiceChannel: 'stereo',
  scoringTolerance: 1,
}

const KEY = 'okara-settings'

export function useSettings() {
  const settings = useState<OkaraSettings>('okara-settings', () => ({ ...DEFAULTS }))
  const loaded = useState<boolean>('okara-settings-loaded', () => false)

  function load() {
    if (loaded.value) return
    if (import.meta.client) {
      try {
        const raw = localStorage.getItem(KEY)
        if (raw) settings.value = { ...DEFAULTS, ...JSON.parse(raw) }
      } catch { /* ignore */ }
    }
    loaded.value = true
  }

  function save() {
    if (import.meta.client) {
      localStorage.setItem(KEY, JSON.stringify(settings.value))
    }
  }

  watch(settings, save, { deep: true })

  return { settings, load }
}
