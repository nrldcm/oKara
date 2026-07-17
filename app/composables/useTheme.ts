export type Theme = 'light' | 'dark'

export function useTheme() {
  const theme = useState<Theme>('okara-theme', () => 'dark')

  function apply(t: Theme) {
    if (!import.meta.client) return
    document.documentElement.dataset.theme = t
    try { localStorage.setItem('okara-theme', t) } catch { /* ignore */ }
  }

  function init() {
    if (!import.meta.client) return
    const current = document.documentElement.dataset.theme
    theme.value = current === 'light' ? 'light' : 'dark'
  }

  function toggle() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    apply(theme.value)
  }

  return { theme, init, toggle }
}
