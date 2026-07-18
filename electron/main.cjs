const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { startRemoteServer } = require('./server.cjs')
const { registerLibraryIpc, readConfig, writeConfig, libraryDir, libraryTemp, uniqueDest } = require('./library.cjs')
const { startMediaServer } = require('./stream.cjs')
const isoLib = require('./iso.cjs')
const { transcode } = require('./transcode.cjs')
const { log, logPath } = require('./log.cjs')

// Keep the app alive if a background job (transcode, disc scan, socket) throws
// asynchronously — a single failed track should never take down the whole app
// (and lose the queue). Errors are logged, not fatal.
process.on('uncaughtException', (err) => { log('uncaughtException:', err) })
process.on('unhandledRejection', (reason) => { log('unhandledRejection:', reason) })

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

// Send to the renderer only when it's alive — a closed/reloaded window throws
// "Object has been destroyed" on .send, and some of these fire constantly
// (mic PCM, transcode progress), which must never crash the app.
function send(channel, payload) {
  try {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  } catch (e) { log('send failed', channel, e) }
}

const remoteCallbacks = {
  onCommand: (cmd) => send('okara:command', cmd),
  onCountChange: (n) => send('okara:remote-count', n),
  // Phone-as-mic PCM frames → renderer (as a transferable ArrayBuffer).
  onAudio: (buf) => {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    send('okara:mic-audio', ab)
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
  streamer = await startMediaServer(() => [os.tmpdir(), libraryDir(), libraryTemp(), ...allowedSources])
  // Clear leftover scratch files from a previous run (nothing is in use yet at
  // launch), so temp extractions/prepared clips don't pile up on the drive.
  try {
    const t = libraryTemp()
    for (const f of fs.readdirSync(t)) { try { fs.rmSync(path.join(t, f), { force: true, recursive: true }) } catch { /* */ } }
  } catch { /* no temp yet */ }
  setInterval(pollDiscs, 3000) // auto-detect inserted discs, like a DVD player

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

function walkVideosSized(dir, out = []) {
  try {
    for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, it.name)
      if (it.isDirectory()) walkVideosSized(p, out)
      else if (it.isFile() && isVid(p)) {
        try { if (fs.statSync(p).size > 1024 * 1024) out.push(p) } catch { /* skip */ }
      }
    }
  } catch { /* unreadable dir */ }
  return out
}

// Candidate mount points where an inserted disc shows up.
function discRoots() {
  if (process.platform === 'win32') {
    const roots = []
    for (let c = 68; c <= 90; c++) roots.push(String.fromCharCode(c) + ':\\') // D..Z (skip C: system)
    return roots
  }
  const roots = []
  for (const base of ['/media/' + (process.env.USER || ''), '/media', '/run/media', '/Volumes', '/mnt']) {
    try { for (const d of fs.readdirSync(base)) roots.push(path.join(base, d)) } catch { /* none */ }
  }
  return roots
}

// A mounted volume is a karaoke video disc if it has VIDEO_TS (DVD) or
// MPEGAV / MPEG2 / SEGMENT (VCD).
function discAt(root) {
  const has = (sub) => { try { return fs.existsSync(path.join(root, sub)) } catch { return false } }
  const kind = has('VIDEO_TS') || has('video_ts') ? 'DVD'
    : (has('MPEGAV') || has('mpegav') || has('MPEG2') || has('SEGMENT')) ? 'VCD'
    : null
  if (!kind) return null
  const files = walkVideosSized(root).sort()
  if (!files.length) return null
  allowedSources.add(path.resolve(root))
  return {
    root,
    kind,
    label: `${kind} · ${root}`,
    tracks: files.map((f) => ({ title: path.basename(f, path.extname(f)), src: { file: f } })),
  }
}

function scanDiscs() {
  const out = []
  for (const r of discRoots()) { const d = discAt(r); if (d) out.push(d) }
  return out
}

ipcMain.handle('okara:detect-discs', () => scanDiscs())

// Poll for a newly-inserted disc and notify the renderer (hardware-like).
let knownDiscs = new Set()
function pollDiscs() {
  const discs = scanDiscs()
  const roots = new Set(discs.map((d) => d.root))
  for (const d of discs) {
    if (!knownDiscs.has(d.root)) send('okara:disc-inserted', d)
  }
  knownDiscs = roots
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
      src: { iso: src, extent: v.extent, size: v.size },
    }))
    return { label, tracks }
  }
  const tracks = walkVideos(src).sort().map((f) => ({
    title: `${label} · ${path.basename(f)}`,
    src: { file: f },
  }))
  return { label, tracks }
})

// Prepare a disc/ISO track for smooth playback: transcode it to a complete
// temp MP4 (proper keyframes + deinterlaced), then return a file URL the
// player can seek. Progress is reported on okara:disc-progress.
let discTmpCount = 0
ipcMain.handle('okara:disc-prepare', async (_e, srcArg) => {
  const src = srcArg || {}
  // Extract/transcode on the library drive (usually more free space than C:).
  const tmpBase = path.join(libraryTemp(), `okara-play-${Date.now()}-${discTmpCount++}`)
  let input = src.file
  try {
    if (src.iso) {
      input = tmpBase + '.' + (isoLib.VIDEO_EXT.find((e) => true) || 'vob')
      await isoLib.extractFile(src.iso, src.extent, src.size, input)
    }
    if (!input || !fs.existsSync(input)) throw new Error('Track not found')
    const out = tmpBase + '.mp4'
    await transcode(input, out, (f) => send('okara:disc-progress', { fraction: f }))
    if (src.iso) { try { fs.unlinkSync(input) } catch { /* */ } }
    return { url: streamer.fileUrl(out) }
  } catch (e) {
    log('disc-prepare failed:', JSON.stringify(src), e)
    return { error: String((e && e.message) || e) }
  }
})

// Materialize a disc/ISO track into the LIBRARY folder (permanent): transcode
// once to a real MP4 so it survives restarts and never re-converts. Returns
// { path } (the library file). Used when a disc-ref library song is first
// played. Falls back to disc-prepare (temp) only if this fails.
const safeName = (s) => String(s || 'track').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'track'
ipcMain.handle('okara:disc-materialize', async (_e, srcArg, title) => {
  const src = srcArg || {}
  let tmp = null
  let dest = null
  try {
    let input = src.file
    if (src.iso) {
      tmp = path.join(libraryTemp(), `okara-mat-${Date.now()}-${discTmpCount++}.vob`)
      await isoLib.extractFile(src.iso, src.extent, src.size, tmp)
      input = tmp
    }
    if (!input || !fs.existsSync(input)) throw new Error('Track not found')
    dest = uniqueDest(libraryDir(), `${safeName(title)}.mp4`)
    await transcode(input, dest, (f) => send('okara:disc-progress', { fraction: f }))
    return { path: dest }
  } catch (e) {
    // A failed transcode leaves a truncated file inside the library — remove it
    // so it never shows up as a broken "song".
    if (dest) { try { fs.unlinkSync(dest) } catch { /* not created */ } }
    log('disc-materialize failed:', JSON.stringify(src), e)
    return { error: String((e && e.message) || e) }
  } finally {
    if (tmp) { try { fs.unlinkSync(tmp) } catch { /* */ } }
  }
})

// Error log access — the user can open the file or copy its text to send in.
ipcMain.handle('okara:log-path', () => logPath())
ipcMain.handle('okara:open-log', async () => {
  try {
    if (!fs.existsSync(logPath())) fs.writeFileSync(logPath(), '')
    await shell.openPath(logPath())
    return { ok: true, path: logPath() }
  } catch (e) { return { error: String((e && e.message) || e) } }
})
ipcMain.handle('okara:read-log', () => {
  try { return fs.readFileSync(logPath(), 'utf8').slice(-20000) } catch { return '' }
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
