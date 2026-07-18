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
    list: () => ipcRenderer.invoke('okara:lib-list'),
    readText: (p) => ipcRenderer.invoke('okara:lib-read-text', p),
    deleteFiles: (paths) => ipcRenderer.invoke('okara:lib-delete', paths),
  },
})
