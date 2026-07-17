import { Capacitor, registerPlugin } from '@capacitor/core'

interface RemoteServerPlugin {
  getPairing(): Promise<{ url: string; token: string }>
  sendState(options: { state: unknown }): Promise<void>
  addListener(event: 'command', cb: (cmd: { action: string; value?: unknown }) => void): Promise<unknown>
  addListener(event: 'remoteCount', cb: (data: { count: number }) => void): Promise<unknown>
}

// On Android the native RemoteServer plugin plays the role of the Electron
// main process: it runs the LAN HTTP+WebSocket server for the QR phone
// remote. Expose it under the same window.okara bridge the app already uses
// (see electron/preload.cjs) so useRemote() works unchanged.
export default defineNuxtPlugin(() => {
  if (!Capacitor.isNativePlatform()) return

  const remote = registerPlugin<RemoteServerPlugin>('RemoteServer')

  ;(window as any).okara = {
    isElectron: true,
    getPairing: () => remote.getPairing(),
    onCommand: (cb: (cmd: { action: string; value?: unknown }) => void) => {
      remote.addListener('command', cb)
    },
    onRemoteCount: (cb: (n: number) => void) => {
      remote.addListener('remoteCount', (data) => cb(data.count))
    },
    sendState: (state: unknown) => {
      remote.sendState({ state })
    },
  }
})
