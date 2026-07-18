const { contextBridge, ipcRenderer, webUtils } = require('electron')
const { pathToFileURL } = require('url')

contextBridge.exposeInMainWorld('okara', {
  isElectron: true,
  getPairing: () => ipcRenderer.invoke('okara:get-pairing'),
  onCommand: (cb) => ipcRenderer.on('okara:command', (_e, cmd) => cb(cmd)),
  onRemoteCount: (cb) => ipcRenderer.on('okara:remote-count', (_e, n) => cb(n)),
  onMicAudio: (cb) => ipcRenderer.on('okara:mic-audio', (_e, buf) => cb(buf)),
  sendState: (state) => ipcRenderer.send('okara:state', state),
  sendSongs: (songs) => ipcRenderer.send('okara:songs', songs),

  // Media in the on-disk library plays straight from file:// URLs.
  toMediaUrl: (p) => pathToFileURL(p).href,
  // Real filesystem path of a dragged-in File, so imports can be copied
  // into the library folder without shuttling bytes through the renderer.
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return '' }
  },

  remoteConfig: {
    get: () => ipcRenderer.invoke('okara:get-remote-config'),
    setPort: (port) => ipcRenderer.invoke('okara:set-remote-port', port),
  },

  library: {
    info: () => ipcRenderer.invoke('okara:lib-info'),
    chooseDir: () => ipcRenderer.invoke('okara:lib-choose-dir'),
    pickImport: (kind) => ipcRenderer.invoke('okara:lib-pick-import', kind),
    importPaths: (paths) => ipcRenderer.invoke('okara:lib-import-paths', paths),
    importIso: () => ipcRenderer.invoke('okara:lib-import-iso'),
    importDvdVideo: () => ipcRenderer.invoke('okara:lib-import-dvd-video'),
    importStatus: () => ipcRenderer.invoke('okara:import-status'),
    onImportDone: (cb) => {
      const h = () => cb()
      ipcRenderer.on('okara:import-done', h)
      return () => ipcRenderer.removeListener('okara:import-done', h)
    },
    canConvert: true, // native ffmpeg is available on the desktop app
    onProgress: (cb) => {
      const h = (_e, p) => cb(p)
      ipcRenderer.on('okara:import-progress', h)
      return () => ipcRenderer.removeListener('okara:import-progress', h)
    },
    list: () => ipcRenderer.invoke('okara:lib-list'),
    readText: (p) => ipcRenderer.invoke('okara:lib-read-text', p),
    deleteFiles: (paths) => ipcRenderer.invoke('okara:lib-delete', paths),
  },
})
