export type SongKind = 'ultrastar' | 'video' | 'audio'
export type SongSource = 'Demo' | 'UltraStar' | 'MegaVision' | 'Magic Sing' | 'Platinum' | 'TJ Media' | 'Other'

export interface StoredSong {
  id: string
  number: number
  title: string
  artist: string
  kind: SongKind
  source: SongSource
  hasScoring: boolean
  createdAt: number
  txt?: string
  audio?: Blob
  video?: Blob
  cover?: Blob
}

const DB_NAME = 'okara'
const DB_VERSION = 1
const STORE = 'songs'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE))
}

export async function dbGetAll(): Promise<StoredSong[]> {
  const store = await tx('readonly')
  return new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve((req.result as StoredSong[]).sort((a, b) => b.createdAt - a.createdAt))
    req.onerror = () => reject(req.error)
  })
}

export async function dbPut(song: StoredSong): Promise<void> {
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.put(song)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function dbDelete(id: string): Promise<void> {
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function dbClear(): Promise<void> {
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
