const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { startRemoteServer } = require('./server.cjs')
const { registerLibraryIpc, readConfig, writeConfig } = require('./library.cjs')

let win = null
let remote = null

// Resolves in dev and inside the packaged asar (build/ is bundled — see
// electron-builder.yml `files`). Used for the window / taskbar header icon;
// the .exe icon itself is set by electron-builder from build/icon.ico.
const iconPath = path.join(__dirname, '..', 'build', 'icon.ico')

const remoteCallbacks = {
  onCommand: (cmd) => win?.webContents.send('okara:command', cmd),
  onCountChange: (n) => win?.webContents.send('okara:remote-count', n),
}

async function startRemote(port) {
  try {
    return await startRemoteServer({ port: port || 0, ...remoteCallbacks })
  } catch {
    // The fixed port was unavailable — fall back to an automatic one.
    return startRemoteServer({ port: 0, ...remoteCallbacks })
  }
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    backgroundColor: '#0d0d1a',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  remote = await startRemote(readConfig().remotePort)

  await win.loadFile(path.join(__dirname, '..', '.output', 'public', 'index.html'))
}

ipcMain.handle('okara:get-pairing', () => ({ url: remote?.url, token: remote?.token }))
ipcMain.on('okara:state', (_e, state) => remote?.broadcastState(state))
ipcMain.on('okara:songs', (_e, songs) => remote?.broadcastSongs(songs))
registerLibraryIpc(() => win)

ipcMain.handle('okara:get-remote-config', () => ({ port: readConfig().remotePort || 0 }))

// Change the remote server's port (0 = automatic) and restart it in place.
// Remotes reconnect via the refreshed QR; a new pairing token is issued.
ipcMain.handle('okara:set-remote-port', async (_e, port) => {
  const wanted = Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : 0
  const cfg = readConfig()
  cfg.remotePort = wanted
  writeConfig(cfg)
  try { remote?.close() } catch { /* already down */ }
  remote = await startRemote(wanted)
  const usedFallback = wanted !== 0 && remote.port !== wanted
  return {
    url: remote.url,
    token: remote.token,
    port: remote.port,
    error: usedFallback ? `Port ${wanted} is in use — using an automatic port instead.` : null,
  }
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
