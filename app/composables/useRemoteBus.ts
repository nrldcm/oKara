export interface RemoteCommand {
  action: 'play' | 'pause' | 'toggle' | 'restart' | 'stop' | 'next' | 'prev' | 'volume' | 'seek' | ''
  value?: number
  seq: number
}

export interface PlaybackState {
  hasSong: boolean
  playing: boolean
  title: string
  artist: string
  volume: number
}

export function useRemoteBus() {
  const command = useState<RemoteCommand>('okara-remote-cmd', () => ({ action: '', seq: 0 }))
  const state = useState<PlaybackState>('okara-remote-state', () => ({
    hasSong: false, playing: false, title: '', artist: '', volume: 1,
  }))

  function dispatch(action: RemoteCommand['action'], value?: number) {
    command.value = { action, value, seq: command.value.seq + 1 }
  }

  return { command, state, dispatch }
}
