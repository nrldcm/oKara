const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('okara', {
  isElectron: true,
  getPairing: () => ipcRenderer.invoke('okara:get-pairing'),
  onCommand: (cb) => ipcRenderer.on('okara:command', (_e, cmd) => cb(cmd)),
  onRemoteCount: (cb) => ipcRenderer.on('okara:remote-count', (_e, n) => cb(n)),
  sendState: (state) => ipcRenderer.send('okara:state', state),
})
