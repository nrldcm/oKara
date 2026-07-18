export interface RemoteCommand {
  action:
    | 'play' | 'pause' | 'toggle' | 'restart' | 'stop' | 'next' | 'prev'
    | 'volume' | 'seek' | 'play-number' | 'reserve-number'
    | 'reserve-remove' | 'reserve-up' | 'reserve-down'
    | 'mic-mode' | 'fx-monitor' | 'fx-preset' | 'fx-volume' | 'fx-reverb'
    | 'fx-echo' | 'fx-echo-time' | 'fx-bass' | 'fx-treble'
    | 'phone-mic-on' | 'phone-mic-off' | ''
  value?: number | string
  seq: number
}

export interface ReservedItem {
  number: number
  title: string
  artist: string
}

/** Mic/soundboard snapshot mirrored to remotes so their controls stay synced. */
export interface RemoteFxState {
  mode: string
  monitor: boolean
  preset: string
  volume: number
  reverb: number
  echo: number
  echoTime: number
  bass: number
  treble: number
}

export interface PlaybackState {
  hasSong: boolean
  playing: boolean
  title: string
  artist: string
  volume: number
  reserved: number
  reservedList: ReservedItem[]
  message: string
  messageSeq: number
  fx?: RemoteFxState
}

type CommandListener = (cmd: RemoteCommand) => void
const listeners = new Set<CommandListener>()

export function useRemoteBus() {
  const command = useState<RemoteCommand>('okara-remote-cmd', () => ({ action: '', seq: 0 }))
  const state = useState<PlaybackState>('okara-remote-state', () => ({
    hasSong: false, playing: false, title: '', artist: '', volume: 1,
    reserved: 0, reservedList: [], message: '', messageSeq: 0,
  }))

  function dispatch(action: RemoteCommand['action'], value?: number | string) {
    const cmd: RemoteCommand = { action, value, seq: command.value.seq + 1 }
    command.value = cmd
    // Deliver synchronously to every listener so rapid commands can't coalesce.
    listeners.forEach((l) => { try { l(cmd) } catch (e) { console.error(e) } })
  }

  function onCommand(cb: CommandListener) {
    listeners.add(cb)
    return () => { listeners.delete(cb) }
  }

  function flash(message: string) {
    state.value = { ...state.value, message, messageSeq: state.value.messageSeq + 1 }
  }

  return { command, state, dispatch, onCommand, flash }
}
