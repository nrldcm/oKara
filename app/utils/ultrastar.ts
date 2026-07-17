export type NoteType = 'normal' | 'golden' | 'freestyle' | 'rap' | 'goldenRap'

export interface Note {
  type: NoteType
  startBeat: number
  length: number
  /** Relative pitch as stored in the file (semitone offset). */
  pitch: number
  text: string
}

export interface Line {
  notes: Note[]
  startBeat: number
  endBeat: number
}

export interface UltraStarSong {
  title: string
  artist: string
  audioFile?: string
  videoFile?: string
  coverFile?: string
  bpm: number
  gap: number
  lines: Line[]
  notes: Note[]
  headers: Record<string, string>
}

const NOTE_PREFIXES = new Set([':', '*', 'F', 'R', 'G'])

function noteTypeFor(prefix: string): NoteType {
  switch (prefix) {
    case '*': return 'golden'
    case 'F': return 'freestyle'
    case 'R': return 'rap'
    case 'G': return 'goldenRap'
    default: return 'normal'
  }
}

export function parseUltraStar(content: string): UltraStarSong {
  const song: UltraStarSong = {
    title: '',
    artist: '',
    bpm: 120,
    gap: 0,
    lines: [],
    notes: [],
    headers: {},
  }

  const rawLines = content.split(/\r?\n/)
  const flat: Note[] = []
  const parsedLines: Line[] = []
  let current: Note[] = []

  const flushLine = (endBeat?: number) => {
    if (!current.length) return
    const last = current[current.length - 1]
    parsedLines.push({
      notes: current,
      startBeat: current[0].startBeat,
      endBeat: endBeat ?? last.startBeat + last.length,
    })
    current = []
  }

  for (const raw of rawLines) {
    const line = raw.replace(/﻿/g, '')
    if (!line.trim()) continue

    if (line.startsWith('#')) {
      const idx = line.indexOf(':')
      if (idx === -1) continue
      const tag = line.slice(1, idx).trim().toUpperCase()
      const value = line.slice(idx + 1).trim()
      switch (tag) {
        case 'TITLE': song.title = value; break
        case 'ARTIST': song.artist = value; break
        case 'MP3':
        case 'AUDIO': song.audioFile = value; break
        case 'VIDEO': song.videoFile = value; break
        case 'COVER': song.coverFile = value; break
        case 'BPM': song.bpm = parseFloat(value.replace(',', '.')) || 120; break
        case 'GAP': song.gap = parseFloat(value.replace(',', '.')) || 0; break
        default: song.headers[tag] = value
      }
      continue
    }

    const prefix = line[0]
    if (prefix === 'E') { flushLine(); break }

    if (prefix === '-') {
      const parts = line.trim().split(/\s+/)
      const breakBeat = parts.length > 1 ? parseInt(parts[1], 10) : undefined
      flushLine(Number.isFinite(breakBeat as number) ? breakBeat : undefined)
      continue
    }

    if (NOTE_PREFIXES.has(prefix)) {
      const m = line.match(/^([:*FRG])\s+(-?\d+)\s+(\d+)\s+(-?\d+)\s?(.*)$/)
      if (!m) continue
      const note: Note = {
        type: noteTypeFor(m[1]),
        startBeat: parseInt(m[2], 10),
        length: parseInt(m[3], 10),
        pitch: parseInt(m[4], 10),
        text: m[5] ?? '',
      }
      current.push(note)
      flat.push(note)
    }
  }

  flushLine()
  song.lines = parsedLines
  song.notes = flat
  return song
}

/** UltraStar BPM counts quarter-beats, so one beat lasts 60000 / (BPM * 4) ms. */
export function msPerBeat(bpm: number): number {
  return 60000 / (bpm * 4)
}

export function beatToMs(beat: number, bpm: number, gap: number): number {
  return gap + beat * msPerBeat(bpm)
}
