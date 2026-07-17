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

const AUDIO_EXT = ['mp3', 'm4a', 'ogg', 'oga', 'opus', 'wav', 'aac', 'flac']
const VIDEO_EXT = ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'mpg', 'mpeg', 'dat', 'vob', 'm4v']
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif']

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
  if (song.audio) rt.audioUrl = URL.createObjectURL(song.audio)
  if (song.video) rt.videoUrl = URL.createObjectURL(song.video)
  if (song.cover) rt.coverUrl = URL.createObjectURL(song.cover)
  return rt
}

function revoke(song: RuntimeSong) {
  for (const url of [song.audioUrl, song.videoUrl, song.coverUrl]) {
    if (url) URL.revokeObjectURL(url)
  }
}

async function detectSongs(files: File[], source: SongSource): Promise<StoredSong[]> {
  const pool = [...files]
  const out: StoredSong[] = []
  const now = Date.now()

  const take = (pred: (f: File) => boolean): File | undefined => {
    const idx = pool.findIndex(pred)
    if (idx === -1) return undefined
    return pool.splice(idx, 1)[0]
  }

  const txts = files.filter((f) => ext(f.name) === 'txt')
  for (const txtFile of txts) {
    const i = pool.indexOf(txtFile)
    if (i !== -1) pool.splice(i, 1)
    const txt = await txtFile.text()
    const parsed = parseUltraStar(txt)

    const byName = (target?: string) =>
      target ? take((f) => baseName(f.name).toLowerCase() === baseName(target).toLowerCase()) : undefined

    const audio = byName(parsed.audioFile) || take((f) => AUDIO_EXT.includes(ext(f.name)))
    const video = byName(parsed.videoFile) || take((f) => VIDEO_EXT.includes(ext(f.name)))
    const cover = byName(parsed.coverFile) || take((f) => IMAGE_EXT.includes(ext(f.name)))

    out.push({
      id: crypto.randomUUID(),
      number: 0,
      title: parsed.title || stripExt(txtFile.name),
      artist: parsed.artist || 'Unknown',
      kind: 'ultrastar',
      source: source === 'Demo' ? 'UltraStar' : source,
      hasScoring: true,
      createdAt: now,
      txt,
      audio: audio ?? undefined,
      video: video ?? undefined,
      cover: cover ?? undefined,
    })
  }

  for (const f of [...pool]) {
    const e = ext(f.name)
    if (VIDEO_EXT.includes(e)) {
      out.push({
        id: crypto.randomUUID(),
        number: 0,
        title: stripExt(f.name),
        artist: source === 'Demo' ? 'Import' : source,
        kind: 'video',
        source: source === 'Demo' ? 'Other' : source,
        hasScoring: false,
        createdAt: now,
        video: f,
      })
    } else if (AUDIO_EXT.includes(e)) {
      out.push({
        id: crypto.randomUUID(),
        number: 0,
        title: stripExt(f.name),
        artist: source === 'Demo' ? 'Import' : source,
        kind: 'audio',
        source: source === 'Demo' ? 'Other' : source,
        hasScoring: false,
        createdAt: now,
        audio: f,
      })
    }
  }

  return out
}

export function useLibrary() {
  const songs = useState<RuntimeSong[]>('okara-songs', () => [])
  const loaded = useState<boolean>('okara-songs-loaded', () => false)

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
  }

  function nextNumber(): number {
    return songs.value.reduce((m, s) => Math.max(m, s.number || 0), 1000) + 1
  }

  async function importFiles(files: File[], source: SongSource): Promise<number> {
    const detected = await detectSongs(files, source)
    let n = nextNumber()
    for (const s of detected) { s.number = n++; await dbPut(s) }
    songs.value = [...detected.map(toRuntime), ...songs.value]
    return detected.length
  }

  function findByNumber(num: number): RuntimeSong | undefined {
    return songs.value.find((s) => s.number === num)
  }

  async function remove(id: string) {
    const target = songs.value.find((s) => s.id === id)
    if (target) revoke(target)
    await dbDelete(id)
    songs.value = songs.value.filter((s) => s.id !== id)
  }

  async function clearAll() {
    songs.value.forEach(revoke)
    await dbClear()
    songs.value = []
    loaded.value = false
    await load()
  }

  return { songs, loaded, load, importFiles, remove, clearAll, findByNumber }
}
