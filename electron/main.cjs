const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { startRemoteServer } = require('./server.cjs')
const { registerLibraryIpc, readConfig, writeConfig, libraryDir } = require('./library.cjs')
const { startStreamServer } = require('./stream.cjs')
const isoLib = require('./iso.cjs')

let win = null
let remote = null
let streamer = null
// Sources the user explicitly opened for "play from disc/ISO" — allowed for
// the local transcode-stream server.
const allowedSources = new Set()

// Resolves in dev and inside the packaged asar (build/ is bundled — see
// electron-builder.yml `files`). Used for the window / taskbar header icon;
// the .exe icon itself is set by electron-builder from build/icon.ico.
const iconPath = path.join(__dirname, '..', 'build', 'icon.ico')

const remoteCallbacks = {
  onCommand: (cmd) => win?.webContents.send('okara:command', cmd),
  onCountChange: (n) => win?.webContents.send('okara:remote-count', n),
  // Phone-as-mic PCM frames → renderer (as a transferable ArrayBuffer).
  onAudio: (buf) => {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    win?.webContents.send('okara:mic-audio', ab)
  },
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
  streamer = await startStreamServer(() => [os.tmpdir(), libraryDir(), ...allowedSources])

  // Block all page reloads — a refresh would restart the app and abort an
  // in-progress disc conversion / import. Covers F5, Ctrl/Cmd+R,
  // Ctrl+Shift+R, and Ctrl+F5.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = (input.key || '').toLowerCase()
    const mod = input.control || input.meta
    if (key === 'f5' || (mod && key === 'r')) event.preventDefault()
  })

  await win.loadFile(path.join(__dirname, '..', '.output', 'public', 'index.html'))
}

// --- Direct play from a disc / ISO (live streaming transcode) ---

const VIDEO_EXT = ['vob', 'dat', 'mpg', 'mpeg', 'm2v', 'mpv', 'vro', 'avi', 'mp4', 'mkv', 'm4v']
const isVid = (p) => VIDEO_EXT.includes((p.split('.').pop() || '').toLowerCase())

function walkVideos(dir, out = []) {
  for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, it.name)
    if (it.isDirectory()) walkVideos(p, out)
    else if (it.isFile() && isVid(p)) out.push(p)
  }
  return out
}

ipcMain.handle('okara:disc-pick', async (_e, kind) => {
  const isIso = kind === 'iso'
  const res = await dialog.showOpenDialog(win, {
    title: isIso ? 'Play from disc image (.iso)' : 'Play from disc folder (VIDEO_TS / MPEGAV)',
    properties: isIso ? ['openFile'] : ['openDirectory'],
    filters: isIso ? [{ name: 'Disc image', extensions: ['iso'] }] : undefined,
  })
  if (res.canceled || !res.filePaths.length) return null
  const src = res.filePaths[0]
  allowedSources.add(path.resolve(src))
  const label = path.parse(src).name
  if (isIso) {
    const tracks = isoLib.videoFiles(src).map((v, i) => ({
      title: `${label}-${String(i + 1).padStart(2, '0')}`,
      url: streamer.streamUrl({ iso: src, extent: String(v.extent), size: String(v.size) }),
    }))
    return { label, tracks }
  }
  const tracks = walkVideos(src).sort().map((f) => ({
    title: `${label} · ${path.basename(f)}`,
    url: streamer.streamUrl({ file: f }),
  }))
  return { label, tracks }
})

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

// Remove the default menu so its Reload/Force-Reload accelerators (Ctrl+R,
// Ctrl+Shift+R) are gone too. Edit shortcuts (copy/paste) still work in inputs.
Menu.setApplicationMenu(null)

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
