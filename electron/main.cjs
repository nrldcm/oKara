const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { startRemoteServer } = require('./server.cjs')

let win = null
let remote = null

async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    backgroundColor: '#0d0d1a',
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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
