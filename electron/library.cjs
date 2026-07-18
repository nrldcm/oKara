const { app, dialog, ipcMain } = require('electron')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { pathToFileURL } = require('url')

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
}

module.exports = { registerLibraryIpc, libraryDir, pathToFileURL, readConfig, writeConfig }
