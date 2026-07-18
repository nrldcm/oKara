const { app, dialog, ipcMain } = require('electron')
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const crypto = require('crypto')
const iso = require('./iso.cjs')
const { log } = require('./log.cjs')

// Content fingerprint: size + hash of the head and tail. Fast and identifies
// the same track regardless of filename, so re-importing a disc won't duplicate.
function contentKeyFromFd(fd, start, size) {
  const h = crypto.createHash('sha1')
  const n1 = Math.min(65536, size)
  const b1 = Buffer.alloc(n1); fs.readSync(fd, b1, 0, n1, start); h.update(b1)
  if (size > 131072) { const b2 = Buffer.alloc(65536); fs.readSync(fd, b2, 0, 65536, start + size - 65536); h.update(b2) }
  h.update('|' + size)
  return h.digest('hex')
}
function isoTrackKey(isoPath, extent, size) {
  const fd = fs.openSync(isoPath, 'r')
  try { return contentKeyFromFd(fd, extent * 2048, size) } catch { return null } finally { try { fs.closeSync(fd) } catch { /* */ } }
}
function fileContentKey(p) {
  const fd = fs.openSync(p, 'r')
  try { return contentKeyFromFd(fd, 0, fs.fstatSync(fd).size) } catch { return null } finally { try { fs.closeSync(fd) } catch { /* */ } }
}

// The on-disk song library: every import is copied here so the whole
// collection lives in one folder that survives reinstalls. The location is
// customizable and remembered in userData/okara-config.json.

const configPath = () => path.join(app.getPath('userData'), 'okara-config.json')

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2))
}

// The user picks ONE base directory; okara creates two folders inside it — a
// "Library" folder for songs and a "Temp" folder for temporary files (ISO
// extraction, prepared clips). Keeping temp beside the library (same drive)
// means the system drive (C:) never bloats. `baseDir` is the picked directory;
// `libraryDir` (legacy) is a directly-chosen songs folder from older versions.
function baseDir() {
  const cfg = readConfig()
  return cfg.baseDir || null
}

function ensureDir(dir, fallback) {
  try { fs.mkdirSync(dir, { recursive: true }); return dir }
  catch (e) {
    log('dir not writable, using default:', dir, e)
    fs.mkdirSync(fallback, { recursive: true })
    return fallback
  }
}

function libraryDir() {
  const cfg = readConfig()
  const fallback = path.join(app.getPath('music'), 'okara', 'Library')
  const dir = cfg.baseDir ? path.join(cfg.baseDir, 'Library')
    : cfg.libraryDir ? cfg.libraryDir // legacy: songs directly in a chosen folder
    : path.join(app.getPath('music'), 'okara-library') // legacy default
  return ensureDir(dir, fallback)
}

/** Copy src into the library dir, renaming on collision ("song (2).mp4"). */
async function copyIn(src) {
  const dir = libraryDir()
  const base = path.basename(src)
  const parsed = path.parse(base)
  let dest = path.join(dir, base)
  for (let i = 2; fs.existsSync(dest); i++) {
    if (path.resolve(src) === path.resolve(dest)) break // already in the library
    dest = path.join(dir, `${parsed.name} (${i})${parsed.ext}`)
  }
  if (path.resolve(src) !== path.resolve(dest)) await fsp.copyFile(src, dest)
  return { name: path.basename(dest), path: dest }
}

async function walkFiles(dir) {
  const out = []
  const items = await fsp.readdir(dir, { withFileTypes: true })
  for (const it of items) {
    if (it.name.startsWith('.')) continue // skip hidden helpers (e.g. .okara-tmp)
    const p = path.join(dir, it.name)
    if (it.isDirectory()) out.push(...await walkFiles(p))
    else if (it.isFile()) out.push(p)
  }
  return out
}

// Mark a folder hidden on Windows (dot-prefix already hides it on macOS/Linux
// and keeps it out of the song scan; Windows needs the hidden attribute too).
function hideDir(dir) {
  if (process.platform !== 'win32') return
  try { require('child_process').execFile('attrib', ['+h', dir]) } catch { /* best effort */ }
}

// A hidden `.okara-tmp` temp folder beside the library (same drive), for
// extracting ISO tracks and prepared clips — so extraction never fills the
// system drive (C:). With a picked base directory it is `<base>/.okara-tmp`;
// otherwise `.okara-tmp` inside the (legacy/default) library folder.
function libraryTemp() {
  const base = baseDir()
  const dir = base ? path.join(base, '.okara-tmp') : path.join(libraryDir(), '.okara-tmp')
  try { fs.mkdirSync(dir, { recursive: true }); hideDir(dir) } catch { /* falls back below */ }
  return fs.existsSync(dir) ? dir : os.tmpdir()
}

function insideLibrary(p) {
  const rel = path.relative(libraryDir(), path.resolve(p))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function uniqueDest(dir, name) {
  const parsed = path.parse(name)
  let dest = path.join(dir, name)
  for (let i = 2; fs.existsSync(dest); i++) dest = path.join(dir, `${parsed.name} (${i})${parsed.ext}`)
  return dest
}

// DVD/VCD video extensions accepted for raw import (played via live streaming).
const TRANSCODE_EXT = ['vob', 'dat', 'mpg', 'mpeg', 'm2v', 'mpv', 'vro']
const ext = (p) => (p.split('.').pop() || '').toLowerCase()

/**
 * Import DVD/VCD .iso files WITHOUT converting: extract each raw video track
 * (VOB/DAT/…) into the library folder as-is. Fast (I/O only, no transcode) —
 * playback streams the raw file on the fly. Returns library entries.
 */
async function importIsosRaw(isoPaths, onProgress, signal, knownKeys) {
  const dir = libraryDir()
  const known = new Set(knownKeys || [])
  const out = []
  const jobs = []
  const reserved = new Set()
  let skipped = 0
  for (const isoPath of isoPaths) {
    let vids = []
    try { vids = iso.videoFiles(isoPath) } catch (e) { log('videoFiles failed for', isoPath, e); vids = [] }
    if (!vids.length) log('no video tracks found in', isoPath)
    const label = path.parse(isoPath).name
    vids.forEach((v, i) => {
      const key = isoTrackKey(isoPath, v.extent, v.size)
      if (key && known.has(key)) { skipped++; return } // already in the library
      if (key) known.add(key) // also dedup within this import batch
      const e = ext(v.path) || 'vob'
      let dest = uniqueDest(dir, `${label}-${String(i + 1).padStart(2, '0')}.${e}`)
      while (reserved.has(dest)) { const p = path.parse(dest); dest = uniqueDest(dir, `${p.name} (x)${p.ext}`) }
      reserved.add(dest)
      jobs.push({ isoPath, v, label, i, dest, key })
    })
  }
  if (skipped) log(`skipped ${skipped} already-imported track(s)`)
  const total = jobs.length
  let done = 0
  for (const job of jobs) {
    if (signal?.aborted) break
    try {
      await iso.extractFile(job.isoPath, job.v.extent, job.v.size, job.dest,
        (f) => onProgress?.({ index: done, total, name: path.basename(job.dest), fraction: f }))
      out.push({ name: path.basename(job.dest), path: job.dest, key: job.key })
    } catch (e) {
      try { await fsp.unlink(job.dest) } catch { /* not created */ }
      log('raw extract failed:', job.dest, e)
      onProgress?.({ index: done, total, name: path.basename(job.v.path), error: String(e && e.message || e) })
    } finally {
      done++
      onProgress?.({ index: done, total, name: `${total - done} track${total - done === 1 ? '' : 's'} left`, fraction: 0 })
    }
  }
  return out
}

/** Copy picked DVD/VCD video files into the library folder as-is (no convert). */
async function copyVideosRaw(paths, onProgress, knownKeys) {
  const known = new Set(knownKeys || [])
  const out = []
  const total = paths.length
  let done = 0
  for (const src of paths) {
    try {
      const key = fileContentKey(src)
      if (key && known.has(key)) { done++; continue } // already imported
      if (key) known.add(key)
      onProgress?.({ index: done, total, name: path.basename(src), fraction: 0 })
      const entry = await copyIn(src)
      out.push({ ...entry, key })
    } catch (e) {
      onProgress?.({ index: done, total, name: path.basename(src), error: String(e && e.message || e) })
    } finally { done++ }
  }
  return out
}

function registerLibraryIpc(getWindow) {
  ipcMain.handle('okara:lib-info', () => ({ dir: libraryDir(), canChooseDir: true }))

  ipcMain.handle('okara:lib-choose-dir', async () => {
    const res = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose a folder for okara (a Library folder is made inside it)',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: baseDir() || path.dirname(libraryDir()),
    })
    if (res.canceled || !res.filePaths[0]) return null
    const cfg = readConfig()
    // Switch to the base-directory model: songs go in <base>/Library and temp
    // files in <base>/.okara-tmp. Drop any legacy direct libraryDir.
    cfg.baseDir = res.filePaths[0]
    delete cfg.libraryDir
    writeConfig(cfg)
    return { dir: libraryDir() }
  })

  ipcMain.handle('okara:lib-pick-import', async (_e, kind) => {
    const res = await dialog.showOpenDialog(getWindow(), {
      title: kind === 'folder' ? 'Import a folder of songs' : 'Import song files',
      properties: kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
    })
    if (res.canceled || !res.filePaths.length) return []
    const sources = kind === 'folder' ? await walkFiles(res.filePaths[0]) : res.filePaths
    const out = []
    for (const src of sources) out.push(await copyIn(src))
    return out
  })

  ipcMain.handle('okara:lib-import-paths', async (_e, paths) => {
    const out = []
    for (const src of paths ?? []) {
      if (typeof src === 'string' && fs.existsSync(src) && fs.statSync(src).isFile()) {
        out.push(await copyIn(src))
      }
    }
    return out
  })

  ipcMain.handle('okara:lib-list', async () => {
    const files = await walkFiles(libraryDir())
    return files.map((p) => ({ name: path.basename(p), path: p }))
  })

  ipcMain.handle('okara:lib-read-text', async (_e, p) => {
    if (typeof p !== 'string' || !insideLibrary(p)) return ''
    return fsp.readFile(p, 'utf8')
  })

  // Wipe the whole library folder (every file + subfolder), used by "Clear
  // library" so no orphan media is left behind — not just the tracked paths.
  ipcMain.handle('okara:lib-clear-folder', async () => {
    const dir = libraryDir()
    try {
      for (const name of await fsp.readdir(dir)) {
        try { await fsp.rm(path.join(dir, name), { recursive: true, force: true }) } catch { /* keep going */ }
      }
    } catch (e) { log('clear library folder failed:', e) }
  })

  ipcMain.handle('okara:lib-delete', async (_e, paths) => {
    for (const p of paths ?? []) {
      if (typeof p === 'string' && insideLibrary(p)) {
        try { await fsp.unlink(p) } catch { /* already gone */ }
      }
    }
  })

  // The current convert job lives in the main process, so it survives a
  // renderer refresh (the ffmpeg child keeps running here) and a reloaded
  // renderer can query it to restore the progress UI.
  let currentJob = null
  // Sending to a renderer that has been closed/reloaded throws ("Object has
  // been destroyed"). With the parallel importer firing progress constantly,
  // an unguarded send could reject the whole import — so guard every send.
  const sendToWin = (win, channel, payload) => {
    try {
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    } catch (e) { log('send failed', channel, e) }
  }
  const progress = (win, p) => {
    currentJob = { ...p, active: true }
    sendToWin(win, 'okara:import-progress', p)
  }

  // Abort controller for the in-flight import, so the renderer can cancel it.
  let importAbort = null

  async function runJob(win, fn) {
    currentJob = { active: true, index: 0, total: 0, name: '', fraction: 0 }
    try {
      return await fn()
    } catch (e) {
      log('import job failed:', e)
      throw e
    } finally {
      currentJob = null
      importAbort = null
      // Tell the renderer to rescan the library folder so freshly-converted
      // MP4s appear even if the page was refreshed mid-conversion.
      sendToWin(win, 'okara:import-done')
    }
  }

  ipcMain.handle('okara:import-status', () => currentJob)

  // Cancel the running import: abort kills ffmpeg and stops the worker loop.
  ipcMain.handle('okara:import-cancel', () => { importAbort?.abort() })

  ipcMain.handle('okara:lib-import-iso', async (_e, knownKeys) => {
    const win = getWindow()
    const res = await dialog.showOpenDialog(win, {
      title: 'Import DVD/VCD disc image (.iso)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Disc image', extensions: ['iso'] }],
    })
    if (res.canceled || !res.filePaths.length) return []
    importAbort = new AbortController()
    // Raw extract — no conversion; playback streams the file live.
    return runJob(win, () => importIsosRaw(res.filePaths, (p) => progress(win, p), importAbort.signal, knownKeys))
  })

  ipcMain.handle('okara:lib-import-dvd-video', async (_e, knownKeys) => {
    const win = getWindow()
    const res = await dialog.showOpenDialog(win, {
      title: 'Import DVD/VCD video files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'DVD/VCD video', extensions: TRANSCODE_EXT }],
    })
    if (res.canceled || !res.filePaths.length) return []
    importAbort = new AbortController()
    // Copy raw — no conversion; playback streams the file live.
    return runJob(win, () => copyVideosRaw(res.filePaths, (p) => progress(win, p), knownKeys))
  })
}

module.exports = { registerLibraryIpc, libraryDir, libraryTemp, uniqueDest, pathToFileURL, readConfig, writeConfig }
