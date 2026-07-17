export interface RemoteCommand {
  action:
    | 'play' | 'pause' | 'toggle' | 'restart' | 'stop' | 'next' | 'prev'
    | 'volume' | 'seek' | 'play-number' | 'reserve-number' | ''
  value?: number
  seq: number
}

export interface PlaybackState {
  hasSong: boolean
  playing: boolean
  title: string
  artist: string
  volume: number
  reserved: number
  message: string
  messageSeq: number
}

export function useRemoteBus() {
  const command = useState<RemoteCommand>('okara-remote-cmd', () => ({ action: '', seq: 0 }))
  const state = useState<PlaybackState>('okara-remote-state', () => ({
    hasSong: false, playing: false, title: '', artist: '', volume: 1,
    reserved: 0, message: '', messageSeq: 0,
  }))

  function dispatch(action: RemoteCommand['action'], value?: number) {
    command.value = { action, value, seq: command.value.seq + 1 }
  }

  function flash(message: string) {
    state.value = { ...state.value, message, messageSeq: state.value.messageSeq + 1 }
  }

  return { command, state, dispatch, flash }
}
