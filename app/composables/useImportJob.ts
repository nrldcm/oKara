import type { SongSource } from '~/utils/db'

// Shared import/convert job state so a running DVD/VCD transcode survives tab
// switches and starting a song — the work runs in the Electron main process and
// keeps going regardless of which view is mounted. State lives in useState
// (app-wide singletons), and the native progress listener is registered once.
export function useImportJob() {
  const active = useState('okara-import-active', () => false)
  const text = useState('okara-import-text', () => '')
  const pct = useState('okara-import-pct', () => 0)
  // Live per-track sub-progress for the parallel encodes (name + 0..1 fraction).
  const tracks = useState<{ name: string; fraction: number }[]>('okara-import-tracks', () => [])
  const message = useState<string | null>('okara-import-message', () => null)
  const failed = useState('okara-import-failed', () => false)
  const listening = useState('okara-import-listening', () => false)

  function applyProgress(p: any) {
    tracks.value = Array.isArray(p.tracks) ? p.tracks : []
    const doneN = p.index ?? 0
    text.value = p.error
      ? `Skipped ${p.name}: ${p.error}`
      : tracks.value.length
        ? `Converting — ${doneN} of ${p.total} done, ${tracks.value.length} in progress…`
        : `Converting ${doneN}/${p.total}…`
    pct.value = Math.round(((doneN + (p.fraction ?? 0)) / Math.max(1, p.total)) * 100)
  }

  /** Register the main→renderer progress listener once, for the app's lifetime. */
  function ensureListener() {
    if (!import.meta.client || listening.value) return
    const lib = (window as any).okara?.library
    if (!lib?.onProgress) return
    listening.value = true
    lib.onProgress((p: any) => applyProgress(p))
    // The convert job runs in the main process, so it survives a page refresh.
    // Restore the indicator by querying the current job on load.
    lib.importStatus?.().then((status: any) => {
      if (status && status.active) { active.value = true; applyProgress(status) }
    }).catch(() => {})
  }

  /**
   * Run a disc import; state is shared so the UI can show it from any tab, and
   * completion still records even if the Import tab was unmounted mid-run.
   */
  async function runDisc(kind: 'iso' | 'dvd-video', source: SongSource) {
    const library = useLibrary()
    ensureListener()
    active.value = true
    failed.value = false
    message.value = null
    text.value = 'Choose the disc image / files…'
    pct.value = 0
    try {
      const count = await library.importDisc(kind, source)
      if (count > 0) {
        message.value = `Converted and imported ${count} track${count > 1 ? 's' : ''} into your library.`
      } else {
        message.value = 'No video tracks were imported (cancelled, or nothing convertible found).'
        failed.value = true
      }
    } catch {
      message.value = 'Conversion failed.'
      failed.value = true
    } finally {
      active.value = false
      tracks.value = []
    }
  }

  return { active, text, pct, tracks, message, failed, ensureListener, runDisc }
}
