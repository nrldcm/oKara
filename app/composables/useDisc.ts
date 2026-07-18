export interface DiscTrack { title: string; url: string }
export interface InsertedDisc { root: string; kind: string; label: string; tracks: DiscTrack[] }

// Shared state for an inserted DVD/VCD disc (desktop). The main process polls
// the optical/removable drives and notifies on insertion, like a hardware
// player. State is app-wide so the banner and the Import tab share it.
export function useDisc() {
  const disc = useState<InsertedDisc | null>('okara-disc', () => null)
  const dismissed = useState<string | null>('okara-disc-dismissed', () => null)
  const listening = useState('okara-disc-listening', () => false)

  const showBanner = computed(() => !!disc.value && dismissed.value !== disc.value?.root)

  function ensureListener() {
    if (!import.meta.client || listening.value) return
    const okara = (window as any).okara
    if (!okara?.onDiscInserted) return
    listening.value = true
    okara.onDiscInserted((d: InsertedDisc) => { disc.value = d; dismissed.value = null })
    // Catch a disc that was already in the drive at launch.
    okara.detectDiscs?.().then((list: InsertedDisc[]) => {
      if (list && list.length && !disc.value) disc.value = list[0]
    }).catch(() => {})
  }

  async function rescan() {
    const okara = (window as any).okara
    const list: InsertedDisc[] = (await okara?.detectDiscs?.()) || []
    disc.value = list[0] || null
    dismissed.value = null
    return list.length
  }

  function dismiss() { dismissed.value = disc.value?.root ?? null }

  return { disc, showBanner, ensureListener, rescan, dismiss }
}
