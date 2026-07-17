import { Capacitor, registerPlugin } from '@capacitor/core'

interface RemoteServerPlugin {
  getPairing(): Promise<{ url: string; token: string; hasNetwork: boolean }>
  sendState(options: { state: unknown }): Promise<void>
  addListener(event: 'command', cb: (cmd: { action: string; value?: unknown }) => void): Promise<unknown>
  addListener(event: 'remoteCount', cb: (data: { count: number }) => void): Promise<unknown>
  addListener(event: 'networkChanged', cb: () => void): Promise<unknown>
}

interface MicRoutePlugin {
  status(): Promise<{ available: boolean; on: boolean }>
  setBluetooth(options: { on: boolean }): Promise<{ available: boolean; on: boolean }>
}

interface LibraryEntry { name: string; path: string }

interface LibraryNativePlugin {
  info(): Promise<{ dir: string; canChooseDir: boolean }>
  chooseDir(): Promise<{ dir: string } | null>
  pickImport(options: { kind: 'files' | 'folder' }): Promise<{ files: LibraryEntry[] }>
  list(): Promise<{ files: LibraryEntry[] }>
  readText(options: { path: string }): Promise<{ text: string }>
  deleteFiles(options: { paths: string[] }): Promise<void>
}

// On Android the native plugins play the role of the Electron main process:
// RemoteServer runs the LAN HTTP+WebSocket server for the QR phone remote,
// Library manages the on-disk song folder. Expose them under the same
// window.okara bridge the app already uses (see electron/preload.cjs) so the
// web code works unchanged.
export default defineNuxtPlugin(() => {
  if (!Capacitor.isNativePlatform()) return

  const remote = registerPlugin<RemoteServerPlugin>('RemoteServer')
  const library = registerPlugin<LibraryNativePlugin>('Library')
  const micRoute = registerPlugin<MicRoutePlugin>('MicRoute')

  ;(window as any).okara = {
    isElectron: true,
    getPairing: () => remote.getPairing(),
    onCommand: (cb: (cmd: { action: string; value?: unknown }) => void) => {
      remote.addListener('command', cb)
    },
    onRemoteCount: (cb: (n: number) => void) => {
      remote.addListener('remoteCount', (data) => cb(data.count))
    },
    onNetworkChanged: (cb: () => void) => {
      remote.addListener('networkChanged', cb)
    },
    sendState: (state: unknown) => {
      remote.sendState({ state })
    },

    micRoute: {
      status: () => micRoute.status(),
      setBluetooth: (on: boolean) => micRoute.setBluetooth({ on }),
    },

    toMediaUrl: (path: string) => Capacitor.convertFileSrc(path),
    getPathForFile: () => '', // WebView Files carry no real paths; imports use the native picker

    library: {
      info: () => library.info(),
      chooseDir: () => library.chooseDir(),
      pickImport: (kind: 'files' | 'folder') => library.pickImport({ kind }).then((r) => r.files ?? []),
      importPaths: () => Promise.resolve([]),
      list: () => library.list().then((r) => r.files ?? []),
      readText: (path: string) => library.readText({ path }).then((r) => r.text ?? ''),
      deleteFiles: (paths: string[]) => library.deleteFiles({ paths }),
    },
  }
})
