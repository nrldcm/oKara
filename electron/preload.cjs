const { contextBridge, ipcRenderer, webUtils } = require('electron')

// Build a file:// URL from an absolute path WITHOUT url.pathToFileURL, which is
// not available in Electron's sandboxed preload (calling it throws
// "pathToFileURL is not a function", which used to break every file-backed
// import). Handles Windows drive paths (D:\a\b) and POSIX paths (/a/b).
function fileUrl(p) {
  const s = String(p).replace(/\\/g, '/')
  const encoded = s.split('/').map((seg) => (/^[a-zA-Z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join('/')
  return s.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`
}

contextBridge.exposeInMainWorld('okara', {
  isElectron: true,
  getPairing: () => ipcRenderer.invoke('okara:get-pairing'),
  onCommand: (cb) => ipcRenderer.on('okara:command', (_e, cmd) => cb(cmd)),
  onRemoteCount: (cb) => ipcRenderer.on('okara:remote-count', (_e, n) => cb(n)),
  onMicAudio: (cb) => ipcRenderer.on('okara:mic-audio', (_e, buf) => cb(buf)),
  sendState: (state) => ipcRenderer.send('okara:state', state),
  sendSongs: (songs) => ipcRenderer.send('okara:songs', songs),

  // Media in the on-disk library plays straight from file:// URLs.
  toMediaUrl: (p) => fileUrl(p),
  // Real filesystem path of a dragged-in File, so imports can be copied
  // into the library folder without shuttling bytes through the renderer.
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return '' }
  },

  remoteConfig: {
    get: () => ipcRenderer.invoke('okara:get-remote-config'),
    setPort: (port) => ipcRenderer.invoke('okara:set-remote-port', port),
  },

  // Error log (so the user can open it / copy it and send it in).
  logPath: () => ipcRenderer.invoke('okara:log-path'),
  openLog: () => ipcRenderer.invoke('okara:open-log'),
  readLog: () => ipcRenderer.invoke('okara:read-log'),

  // Play from a disc / ISO. discPick returns { label, tracks:[{title,src}] } to
  // list; discStream returns { url } for a <video> to stream a track live.
  discPick: (kind) => ipcRenderer.invoke('okara:disc-pick', kind),
  // Inspect a disc/ISO for a songbook index file (lists all files + previews).
  discInspect: () => ipcRenderer.invoke('okara:disc-inspect'),
  // Instant streaming play (no convert/wait) — returns { url } for a <video>.
  discStream: (src) => ipcRenderer.invoke('okara:disc-stream', src),
  // Detect inserted DVD/VCD discs in the optical/removable drives.
  detectDiscs: () => ipcRenderer.invoke('okara:detect-discs'),
  onDiscInserted: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('okara:disc-inserted', h)
    return () => ipcRenderer.removeListener('okara:disc-inserted', h)
  },

  library: {
    info: () => ipcRenderer.invoke('okara:lib-info'),
    chooseDir: () => ipcRenderer.invoke('okara:lib-choose-dir'),
    pickImport: (kind) => ipcRenderer.invoke('okara:lib-pick-import', kind),
    importPaths: (paths) => ipcRenderer.invoke('okara:lib-import-paths', paths),
    importIso: (knownKeys) => ipcRenderer.invoke('okara:lib-import-iso', knownKeys),
    importDvdVideo: (knownKeys) => ipcRenderer.invoke('okara:lib-import-dvd-video', knownKeys),
    importStatus: () => ipcRenderer.invoke('okara:import-status'),
    cancelImport: () => ipcRenderer.invoke('okara:import-cancel'),
    clearFolder: () => ipcRenderer.invoke('okara:lib-clear-folder'),
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
