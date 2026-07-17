const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { startRemoteServer } = require('./server.cjs')
const { registerLibraryIpc } = require('./library.cjs')

let win = null
let remote = null

// Resolves in dev and inside the packaged asar (build/ is bundled — see
// electron-builder.yml `files`). Used for the window / taskbar header icon;
// the .exe icon itself is set by electron-builder from build/icon.ico.
const iconPath = path.join(__dirname, '..', 'build', 'icon.ico')

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

  remote = await startRemoteServer({
    onCommand: (cmd) => win?.webContents.send('okara:command', cmd),
    onCountChange: (n) => win?.webContents.send('okara:remote-count', n),
  })

  await win.loadFile(path.join(__dirname, '..', '.output', 'public', 'index.html'))
}

ipcMain.handle('okara:get-pairing', () => ({ url: remote?.url, token: remote?.token }))
ipcMain.on('okara:state', (_e, state) => remote?.broadcastState(state))
registerLibraryIpc(() => win)

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
