const { app, dialog, ipcMain } = require('electron')
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const iso = require('./iso.cjs')
const { transcode } = require('./transcode.cjs')

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

function libraryDir() {
  const cfg = readConfig()
  const dir = cfg.libraryDir || path.join(app.getPath('music'), 'okara-library')
  fs.mkdirSync(dir, { recursive: true })
  return dir
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
    const p = path.join(dir, it.name)
    if (it.isDirectory()) out.push(...await walkFiles(p))
    else if (it.isFile()) out.push(p)
  }
  return out
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

// DVD/VCD codecs the browser can't play → must be transcoded to MP4 on import.
const TRANSCODE_EXT = ['vob', 'dat', 'mpg', 'mpeg', 'm2v', 'mpv', 'vro']
const ext = (p) => (p.split('.').pop() || '').toLowerCase()

/**
 * Import DVD/VCD .iso files: extract each video track, transcode it to MP4 in
 * the library folder, and report progress. Returns library entries.
 */
// How many tracks to transcode at once. ffmpeg itself is multi-threaded, so we
// keep the pool modest to avoid oversubscribing the CPU while still finishing a
// multi-track disc far faster than one-at-a-time.
function importConcurrency(jobCount) {
  const cores = os.cpus()?.length || 2
  return Math.max(1, Math.min(4, Math.floor(cores / 2), jobCount))
}

async function importIsos(isoPaths, onProgress) {
  const dir = libraryDir()
  const out = []
  // First tally the work so progress can span all tracks across all discs.
  const jobs = []
  const reserved = new Set() // dest names claimed up front so parallel workers never collide
  for (const isoPath of isoPaths) {
    let vids = []
    try { vids = iso.videoFiles(isoPath) } catch { vids = [] }
    const label = path.parse(isoPath).name
    vids.forEach((v, i) => {
      // Pre-assign each track's library destination sequentially (single
      // thread) so concurrent transcodes can't both pick the same filename.
      let dest = uniqueDest(dir, `${label}-${String(i + 1).padStart(2, '0')}.mp4`)
      while (reserved.has(dest)) {
        const p = path.parse(dest)
        dest = uniqueDest(dir, `${p.name} (x)${p.ext}`)
      }
      reserved.add(dest)
      jobs.push({ isoPath, v, label, i, dest })
    })
  }
  const total = jobs.length
  if (!total) return out

  // Aggregate progress across parallel jobs: overall = (done + Σ active
  // fractions) / total, matching the renderer's (index + fraction)/total.
  let done = 0
  const active = new Map() // job index → current fraction 0..1
  const emit = (name, error) => onProgress?.({
    index: done,
    total,
    name,
    error,
    fraction: [...active.values()].reduce((a, b) => a + b, 0),
  })

  const runJob = async (job, slot) => {
    const tmp = path.join(os.tmpdir(), `okara-${Date.now()}-${slot}-${job.i}.${ext(job.v.path)}`)
    active.set(slot, 0)
    try {
      iso.extractFile(job.isoPath, job.v.extent, job.v.size, tmp)
      await transcode(tmp, job.dest, (f) => { active.set(slot, f); emit(path.basename(job.dest)) })
      out.push({ name: path.basename(job.dest), path: job.dest })
    } catch (e) {
      // Drop the truncated output so a failed track never lands in the library.
      try { await fsp.unlink(job.dest) } catch { /* not created */ }
      emit(path.basename(job.v.path), String(e && e.message || e))
    } finally {
      try { await fsp.unlink(tmp) } catch { /* already gone */ }
      active.delete(slot)
      done++
      emit(`${total - done} track${total - done === 1 ? '' : 's'} left`)
    }
  }

  // Fixed pool of workers pulling from the shared job list.
  const conc = importConcurrency(total)
  let next = 0
  const worker = async (slot) => {
    while (next < jobs.length) {
      const job = jobs[next++]
      await runJob(job, slot)
    }
  }
  await Promise.all(Array.from({ length: conc }, (_, s) => worker(s)))
  return out
}

/** Transcode picked DVD/VCD video files to MP4 in the library folder. */
async function transcodeVideos(paths, onProgress) {
  const dir = libraryDir()
  const out = []
  const total = paths.length
  let done = 0
  for (const src of paths) {
    const dest = uniqueDest(dir, `${path.parse(src).name}.mp4`)
    try {
      await transcode(src, dest, (f) => onProgress?.({ index: done, total, name: path.basename(dest), fraction: f }))
      out.push({ name: path.basename(dest), path: dest })
    } catch (e) {
      onProgress?.({ index: done, total, name: path.basename(src), error: String(e && e.message || e) })
    } finally {
      done++
    }
  }
  return out
}

function registerLibraryIpc(getWindow) {
  ipcMain.handle('okara:lib-info', () => ({ dir: libraryDir(), canChooseDir: true }))

  ipcMain.handle('okara:lib-choose-dir', async () => {
    const res = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose the okara library folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: libraryDir(),
    })
    if (res.canceled || !res.filePaths[0]) return null
    const cfg = readConfig()
    cfg.libraryDir = res.filePaths[0]
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
  const progress = (win, p) => {
    currentJob = { ...p, active: true }
    if (win) win.webContents.send('okara:import-progress', p)
  }

  async function runJob(win, fn) {
    currentJob = { active: true, index: 0, total: 0, name: '', fraction: 0 }
    try {
      return await fn()
    } finally {
      currentJob = null
      // Tell the renderer to rescan the library folder so freshly-converted
      // MP4s appear even if the page was refreshed mid-conversion.
      if (win) win.webContents.send('okara:import-done')
    }
  }

  ipcMain.handle('okara:import-status', () => currentJob)

  ipcMain.handle('okara:lib-import-iso', async () => {
    const win = getWindow()
    const res = await dialog.showOpenDialog(win, {
      title: 'Import DVD/VCD disc image (.iso)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Disc image', extensions: ['iso'] }],
    })
    if (res.canceled || !res.filePaths.length) return []
    return runJob(win, () => importIsos(res.filePaths, (p) => progress(win, p)))
  })

  ipcMain.handle('okara:lib-import-dvd-video', async () => {
    const win = getWindow()
    const res = await dialog.showOpenDialog(win, {
      title: 'Import DVD/VCD video files (converted to MP4)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'DVD/VCD video', extensions: TRANSCODE_EXT }],
    })
    if (res.canceled || !res.filePaths.length) return []
    return runJob(win, () => transcodeVideos(res.filePaths, (p) => progress(win, p)))
  })
}

module.exports = { registerLibraryIpc, libraryDir, uniqueDest, pathToFileURL, readConfig, writeConfig }
