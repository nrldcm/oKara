export interface PairingInfo {
  url: string
  token: string
  mode: 'lan' | 'local'
}

export function useRemote() {
  const bus = useRemoteBus()
  const available = useState('okara-remote-available', () => false)
  const pairing = useState<PairingInfo | null>('okara-remote-pairing', () => null)
  const connected = useState('okara-remote-connected', () => 0)
  const inited = useState('okara-remote-inited', () => false)

  // Strip Vue reactivity so the state is structured-clone friendly (postMessage/IPC).
  const plain = (s: PlaybackState) => JSON.parse(JSON.stringify(s)) as PlaybackState

  async function init() {
    if (!import.meta.client || inited.value) return
    inited.value = true
    const bridge = (window as any).okara

    if (bridge?.isElectron) {
      const info = await bridge.getPairing()
      pairing.value = { ...info, mode: 'lan' }
      available.value = true
      bridge.onCommand((cmd: RemoteCommand) => bus.dispatch(cmd.action, cmd.value))
      bridge.onRemoteCount?.((n: number) => { connected.value = n })
      watch(bus.state, (s) => bridge.sendState(plain(s)), { deep: true, immediate: true })
      return
    }

    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('okara-remote')
      pairing.value = {
        url: `${location.origin}${location.pathname}#/remote`,
        token: 'local',
        mode: 'local',
      }
      available.value = true
      channel.onmessage = (e) => {
        const d = e.data
        if (d?.type === 'cmd') bus.dispatch(d.action, d.value)
        if (d?.type === 'hello') channel.postMessage({ type: 'state', state: plain(bus.state.value) })
      }
      watch(bus.state, (s) => channel.postMessage({ type: 'state', state: plain(s) }), { deep: true })
    }
  }

  return { available, pairing, connected, init, bus }
}
