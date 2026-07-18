import {
  dbClear, dbDelete, dbGetAll, dbPut,
  type SongSource, type StoredSong,
} from '~/utils/db'
import { demoSong } from '~/utils/demo'
import { parseUltraStar } from '~/utils/ultrastar'

export interface RuntimeSong extends StoredSong {
  audioUrl?: string
  videoUrl?: string
  coverUrl?: string
}

/** One import candidate: a browser File (web) or an on-disk library file. */
interface ImportEntry {
  name: string
  file?: File
  path?: string
}

/** Bridge surface provided by Electron preload / the Android shim. */
interface LibraryBridge {
  info(): Promise<{ dir: string; canChooseDir: boolean }>
  chooseDir(): Promise<{ dir: string } | null>
  pickImport(kind: 'files' | 'folder'): Promise<{ name: string; path: string }[]>
  importPaths(paths: string[]): Promise<{ name: string; path: string }[]>
  list(): Promise<{ name: string; path: string }[]>
  readText(path: string): Promise<string>
  deleteFiles(paths: string[]): Promise<void>
}

function bridge(): LibraryBridge | undefined {
  if (!import.meta.client) return undefined
  return (window as any).okara?.library
}

function toMediaUrl(path: string): string | undefined {
  return (window as any).okara?.toMediaUrl?.(path)
}

export function libraryFolderAvailable(): boolean {
  return !!bridge()
}

const AUDIO_EXT = ['mp3', 'm4a', 'ogg', 'oga', 'opus', 'wav', 'aac', 'flac']
const VIDEO_EXT = ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'mpg', 'mpeg', 'dat', 'vob', 'm4v']
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif']

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function ext(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
function stripExt(name: string): string {
  return baseName(name).replace(/\.[^.]+$/, '')
}

function toRuntime(song: StoredSong): RuntimeSong {
  const rt: RuntimeSong = { ...song }
  if (song.audioPath) rt.audioUrl = toMediaUrl(song.audioPath)
  else if (song.audio) rt.audioUrl = URL.createObjectURL(song.audio)
  if (song.videoPath) rt.videoUrl = toMediaUrl(song.videoPath)
  else if (song.video) rt.videoUrl = URL.createObjectURL(song.video)
  if (song.coverPath) rt.coverUrl = toMediaUrl(song.coverPath)
  else if (song.cover) rt.coverUrl = URL.createObjectURL(song.cover)
  return rt
}

function revoke(song: RuntimeSong) {
  for (const url of [song.audioUrl, song.videoUrl, song.coverUrl]) {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
}

async function readEntryText(e: ImportEntry): Promise<string> {
  if (e.file) return e.file.text()
  if (e.path) return bridge()!.readText(e.path)
  return ''
}

function assign(song: StoredSong, slot: 'audio' | 'video' | 'cover', entry?: ImportEntry) {
  if (!entry) return
  if (entry.path) {
    song[`${slot}Path`] = entry.path
    song.paths!.push(entry.path)
  } else if (entry.file) {
    song[slot] = entry.file
  }
}

async function detectSongs(entries: ImportEntry[], source: SongSource): Promise<StoredSong[]> {
  const pool = [...entries]
  const out: StoredSong[] = []
  const now = Date.now()

  const take = (pred: (e: ImportEntry) => boolean): ImportEntry | undefined => {
    const idx = pool.findIndex(pred)
    if (idx === -1) return undefined
    return pool.splice(idx, 1)[0]
  }

  const txts = entries.filter((e) => ext(e.name) === 'txt')
  for (const txtEntry of txts) {
    const i = pool.indexOf(txtEntry)
    if (i !== -1) pool.splice(i, 1)
    const txt = await readEntryText(txtEntry)
    const parsed = parseUltraStar(txt)

    const byName = (target?: string) =>
      target ? take((e) => baseName(e.name).toLowerCase() === baseName(target).toLowerCase()) : undefined

    const audio = byName(parsed.audioFile) || take((e) => AUDIO_EXT.includes(ext(e.name)))
    const video = byName(parsed.videoFile) || take((e) => VIDEO_EXT.includes(ext(e.name)))
    const cover = byName(parsed.coverFile) || take((e) => IMAGE_EXT.includes(ext(e.name)))

    const song: StoredSong = {
      id: uid(),
      number: 0,
      title: parsed.title || stripExt(txtEntry.name),
      artist: parsed.artist || 'Unknown',
      kind: 'ultrastar',
      source: source === 'Demo' ? 'UltraStar' : source,
      hasScoring: true,
      createdAt: now,
      txt,
      paths: txtEntry.path ? [txtEntry.path] : [],
    }
    assign(song, 'audio', audio)
    assign(song, 'video', video)
    assign(song, 'cover', cover)
    if (!song.paths!.length) delete song.paths
    out.push(song)
  }

  for (const e of [...pool]) {
    const x = ext(e.name)
    const kind = VIDEO_EXT.includes(x) ? 'video' : AUDIO_EXT.includes(x) ? 'audio' : null
    if (!kind) continue
    const song: StoredSong = {
      id: uid(),
      number: 0,
      title: stripExt(e.name),
      artist: source === 'Demo' ? 'Import' : source,
      kind,
      source: source === 'Demo' ? 'Other' : source,
      hasScoring: false,
      createdAt: now,
      paths: [],
    }
    assign(song, kind === 'video' ? 'video' : 'audio', e)
    if (!song.paths!.length) delete song.paths
    out.push(song)
  }

  return out
}

export function useLibrary() {
  const songs = useState<RuntimeSong[]>('okara-songs', () => [])
  const loaded = useState<boolean>('okara-songs-loaded', () => false)

  async function store(detected: StoredSong[]) {
    let n = nextNumber()
    for (const s of detected) { s.number = n++; await dbPut(s) }
    songs.value = [...detected.map(toRuntime), ...songs.value]
  }

  /**
   * Sync with the on-disk library folder: any file in the folder that no
   * stored song references yet gets imported (so bulk-copying files into the
   * folder, or reinstalling the app over an existing folder, just works).
   */
  async function scanFolder() {
    const lib = bridge()
    if (!lib) return
    try {
      const files = await lib.list()
      const known = new Set<string>()
      for (const s of songs.value) for (const p of s.paths ?? []) known.add(p)
      const fresh = files.filter((f) => !known.has(f.path))
      if (!fresh.length) return
      const detected = await detectSongs(fresh, 'Other')
      if (detected.length) await store(detected)
    } catch (e) {
      console.error('library folder scan failed', e)
    }
  }

  async function load() {
    if (loaded.value) return
    let stored = await dbGetAll()
    if (!stored.some((s) => s.id === 'demo-bahay-kubo')) {
      const demo = demoSong()
      await dbPut(demo)
      stored = [...stored, demo]
    }
    let maxN = stored.reduce((m, s) => Math.max(m, s.number || 0), 1000)
    for (const s of stored) {
      if (!s.number) { s.number = ++maxN; await dbPut(s) }
    }
    songs.value = stored
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toRuntime)
    loaded.value = true
    await scanFolder()
  }

  function nextNumber(): number {
    return songs.value.reduce((m, s) => Math.max(m, s.number || 0), 1000) + 1
  }

  /**
   * Optional "volume label" (e.g. "MegaVision Vol 3") prefixes titles so
   * generic DVD track names (AVSEQ01…) stay identifiable per volume, like a
   * songbook.
   */
  function applyLabel(detected: StoredSong[], label?: string) {
    const l = label?.trim()
    if (!l) return
    for (const s of detected) s.title = `${l} – ${s.title}`
  }

  /** Import browser File objects (drag-and-drop / file inputs on the web). */
  async function importFiles(files: File[], source: SongSource, label?: string): Promise<number> {
    const lib = bridge()
    if (lib) {
      // Copy the dropped files into the library folder first so they are
      // merged into the one big on-disk library.
      const getPath = (window as any).okara?.getPathForFile
      const paths: string[] = []
      let allResolved = true
      for (const f of files) {
        const p = getPath?.(f)
        if (p) paths.push(p)
        else allResolved = false
      }
      if (allResolved && paths.length) {
        const entries = await lib.importPaths(paths)
        const detected = await detectSongs(entries, source)
        applyLabel(detected, label)
        await store(detected)
        return detected.length
      }
      // Fall through: no real paths available (e.g. Android WebView files) —
      // keep them as blobs in IndexedDB rather than failing the import.
    }
    const detected = await detectSongs(files.map((f) => ({ name: f.name, file: f })), source)
    applyLabel(detected, label)
    await store(detected)
    return detected.length
  }

  /** Import via the native file/folder picker (desktop + Android). */
  async function importFromPicker(kind: 'files' | 'folder', source: SongSource, label?: string): Promise<number> {
    const lib = bridge()
    if (!lib) return 0
    const entries = await lib.pickImport(kind)
    if (!entries.length) return 0
    const detected = await detectSongs(entries, source)
    applyLabel(detected, label)
    await store(detected)
    return detected.length
  }

  /**
   * Import a DVD/VCD .iso: the desktop extracts each track and transcodes it to
   * MP4 in the library folder (native ffmpeg). `kind: 'iso' | 'dvd-video'`.
   */
  async function importDisc(kind: 'iso' | 'dvd-video', source: SongSource): Promise<number> {
    const lib = bridge() as any
    if (!lib?.importIso) return 0
    const entries: { name: string; path: string }[] =
      kind === 'iso' ? await lib.importIso() : await lib.importDvdVideo()
    if (!entries.length) return 0
    // Filenames already carry the disc name + track number, so no extra label.
    const detected = await detectSongs(entries, source)
    await store(detected)
    return detected.length
  }

  /**
   * Register disc/ISO tracks as lazy library songs — searchable right away
   * (number/title) and shown in the remote songbook, but their playable MP4 is
   * produced on first play. Deduped by a stable id from the source, so
   * re-loading the same ISO never creates duplicates.
   */
  async function addDiscTracks(tracks: { title: string; src: any }[], label?: string): Promise<number> {
    const known = new Set(songs.value.map((s) => s.id))
    let n = nextNumber()
    const fresh: StoredSong[] = []
    for (const t of tracks) {
      const src = t.src || {}
      const id = src.iso ? `disc:${src.iso}#${src.extent}`
        : src.file ? `disc:${src.file}`
        : `disc:${label || ''}:${t.title}`
      if (known.has(id)) continue
      known.add(id)
      fresh.push({
        id,
        number: n++,
        title: t.title,
        artist: label || 'Disc',
        kind: 'video',
        source: 'Other',
        hasScoring: false,
        createdAt: Date.now(),
        disc: { iso: src.iso, extent: src.extent, size: src.size, file: src.file },
      })
    }
    for (const s of fresh) await dbPut(s)
    songs.value = [...fresh.map(toRuntime), ...songs.value]
    return fresh.length
  }

  /**
   * Once a disc-ref song's MP4 exists in the library folder, promote it to a
   * normal file-backed song so it plays instantly and survives a restart.
   */
  async function markMaterialized(id: string, videoPath: string): Promise<string | undefined> {
    const song = songs.value.find((s) => s.id === id)
    if (!song) return undefined
    song.videoPath = videoPath
    song.videoUrl = toMediaUrl(videoPath)
    song.paths = [...(song.paths ?? []), videoPath]
    delete song.disc
    const { audioUrl, videoUrl, coverUrl, ...stored } = song
    await dbPut(stored)
    songs.value = [...songs.value]
    return song.videoUrl
  }

  /** Change a song's dial number (to match a DVD songbook). */
  async function renumber(id: string, number: number): Promise<string | null> {
    const taken = songs.value.find((s) => s.number === number && s.id !== id)
    if (taken) return `#${number} is already "${taken.title}"`
    const song = songs.value.find((s) => s.id === id)
    if (!song) return 'Song not found'
    song.number = number
    const { audioUrl, videoUrl, coverUrl, ...stored } = song
    await dbPut(stored)
    songs.value = [...songs.value]
    return null
  }

  function findByNumber(num: number): RuntimeSong | undefined {
    return songs.value.find((s) => s.number === num)
  }

  async function remove(id: string) {
    const target = songs.value.find((s) => s.id === id)
    if (target) {
      revoke(target)
      // The folder is the source of truth: deleting a folder-backed song
      // removes its files too, otherwise the next scan would re-import it.
      if (target.paths?.length) {
        try { await bridge()?.deleteFiles(target.paths) } catch (e) { console.error(e) }
      }
    }
    await dbDelete(id)
    songs.value = songs.value.filter((s) => s.id !== id)
  }

  async function clearAll() {
    const allPaths = songs.value.flatMap((s) => s.paths ?? [])
    if (allPaths.length) {
      try { await bridge()?.deleteFiles(allPaths) } catch (e) { console.error(e) }
    }
    songs.value.forEach(revoke)
    await dbClear()
    songs.value = []
    loaded.value = false
    await load()
  }

  return { songs, loaded, load, rescan: scanFolder, importFiles, importFromPicker, importDisc, addDiscTracks, markMaterialized, remove, clearAll, findByNumber, renumber }
}

/** Desktop app can transcode DVD/VCD to MP4 (native ffmpeg present). */
export function canConvertDiscs(): boolean {
  return import.meta.client && !!(window as any).okara?.library?.canConvert
}
