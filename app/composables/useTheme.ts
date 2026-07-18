export type Theme = 'light' | 'dark'
export type ThemeMode = 'day' | 'night' | 'system'

const MODE_KEY = 'okara-theme-mode'

export function useTheme() {
  // Day is the default look; Night and System are opt-in via Settings.
  const mode = useState<ThemeMode>('okara-theme-mode', () => 'day')
  const theme = useState<Theme>('okara-theme', () => 'light')

  function resolve(m: ThemeMode): Theme {
    if (m === 'night') return 'dark'
    if (m === 'day') return 'light'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function apply() {
    if (!import.meta.client) return
    theme.value = resolve(mode.value)
    document.documentElement.dataset.theme = theme.value
    try { localStorage.setItem(MODE_KEY, mode.value) } catch { /* ignore */ }
  }

  function setMode(m: ThemeMode) {
    mode.value = m
    apply()
  }

  function init() {
    if (!import.meta.client) return
    try {
      const saved = localStorage.getItem(MODE_KEY)
      if (saved === 'day' || saved === 'night' || saved === 'system') mode.value = saved
    } catch { /* ignore */ }
    window.matchMedia?.('(prefers-color-scheme: dark)')
      .addEventListener?.('change', () => { if (mode.value === 'system') apply() })
    apply()
  }

  /** Topbar quick toggle: flips between Day and Night (an explicit choice). */
  function toggle() {
    setMode(theme.value === 'light' ? 'night' : 'day')
  }

  return { theme, mode, init, toggle, setMode }
}
