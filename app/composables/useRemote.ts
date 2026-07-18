export interface PairingInfo {
  url: string
  token: string
  mode: 'lan' | 'local'
  // undefined = unknown/always-on (Electron); false = no Wi-Fi/hotspot (Android)
  hasNetwork?: boolean
}

/** Compact songbook entry sent to remotes: number / title / artist. */
export interface RemoteSongEntry {
  n: number
  t: string
  a: string
}

// Module-scoped: useRemote() is called from several components but only one
// BroadcastChannel exists (web demo mode).
let localChannel: BroadcastChannel | null = null

/** Int16 mono PCM (as sent by the phone) → Float32 for the pitch detector. */
function pcm16ToFloat32(buf: ArrayBuffer): Float32Array {
  const i16 = new Int16Array(buf)
  const f32 = new Float32Array(i16.length)
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768
  return f32
}
const PHONE_MIC_RATE = 16000

export function useRemote() {
  const bus = useRemoteBus()
  const pitch = usePitch()
  const available = useState('okara-remote-available', () => false)
  const pairing = useState<PairingInfo | null>('okara-remote-pairing', () => null)
  const connected = useState('okara-remote-connected', () => 0)
  const inited = useState('okara-remote-inited', () => false)
  const lastSongs = useState<RemoteSongEntry[]>('okara-remote-songs', () => [])

  // Strip Vue reactivity so the state is structured-clone friendly (postMessage/IPC).
  const plain = (s: PlaybackState) => JSON.parse(JSON.stringify(s)) as PlaybackState

  /** Push the songbook to every connected remote (and to late joiners). */
  function publishSongs(songs: RemoteSongEntry[]) {
    lastSongs.value = songs
    const payload = JSON.parse(JSON.stringify(songs))
    const bridge = (window as any).okara
    if (bridge?.isElectron) bridge.sendSongs?.(payload)
    else localChannel?.postMessage({ type: 'songs', songs: payload })
  }

  /** Re-read the pairing URL — the LAN IP changes when Wi-Fi/hotspot toggles. */
  async function refreshPairing() {
    const bridge = (window as any).okara
    if (!bridge?.isElectron) return
    try {
      const info = await bridge.getPairing()
      if (!pairing.value || pairing.value.url !== info.url || pairing.value.hasNetwork !== info.hasNetwork) {
        pairing.value = { ...info, mode: 'lan' }
      }
    } catch { /* server not up yet */ }
  }

  async function init() {
    if (!import.meta.client || inited.value) return
    inited.value = true
    const bridge = (window as any).okara

    if (bridge?.isElectron) {
      await refreshPairing()
      available.value = true
      bridge.onCommand((cmd: RemoteCommand) => bus.dispatch(cmd.action, cmd.value))
      bridge.onRemoteCount?.((n: number) => { connected.value = n })
      // Phone-as-mic: streamed PCM frames feed the pitch detector.
      bridge.onMicAudio?.((pcm: ArrayBuffer) => pitch.feedExternal(pcm16ToFloat32(pcm), PHONE_MIC_RATE))
      // Wi-Fi came or went: give the interfaces a beat to settle, then
      // refresh the QR. (Hotspot toggles don't fire this — RemotePanel also
      // re-polls while there's no network.)
      bridge.onNetworkChanged?.(() => { setTimeout(refreshPairing, 1200) })
      watch(bus.state, (s) => bridge.sendState(plain(s)), { deep: true, immediate: true })
      return
    }

    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('okara-remote')
      localChannel = channel
      pairing.value = {
        url: `${location.origin}${location.pathname}#/remote`,
        token: 'local',
        mode: 'local',
      }
      available.value = true
      channel.onmessage = (e) => {
        const d = e.data
        if (d?.type === 'cmd') bus.dispatch(d.action, d.value)
        if (d?.type === 'mic' && d.pcm) pitch.feedExternal(pcm16ToFloat32(d.pcm), PHONE_MIC_RATE)
        if (d?.type === 'hello') {
          channel.postMessage({ type: 'state', state: plain(bus.state.value) })
          channel.postMessage({ type: 'songs', songs: JSON.parse(JSON.stringify(lastSongs.value)) })
        }
      }
      watch(bus.state, (s) => channel.postMessage({ type: 'state', state: plain(s) }), { deep: true })
    }
  }

  return { available, pairing, connected, init, refreshPairing, publishSongs, bus }
}
