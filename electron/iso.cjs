// Minimal ISO9660 reader — extracts the video files from a DVD/VCD .iso
// (VIDEO_TS/*.VOB, MPEGAV/*.DAT, etc.) without any native dependency. Handles
// the common single-extent, ISO9660 case that karaoke discs use. UDF-only
// discs are not supported (rare for karaoke).
const fs = require('fs')

const SECTOR = 2048

function readSector(fd, lba) {
  const buf = Buffer.alloc(SECTOR)
  fs.readSync(fd, buf, 0, SECTOR, lba * SECTOR)
  return buf
}

// A directory record: name, extent LBA, byte length, is-directory flag.
function parseDirRecord(buf, offset) {
  const len = buf[offset]
  if (len === 0) return null
  const extent = buf.readUInt32LE(offset + 2)
  const size = buf.readUInt32LE(offset + 10)
  const flags = buf[offset + 25]
  const idLen = buf[offset + 32]
  const idBytes = buf.subarray(offset + 33, offset + 33 + idLen)
  let name
  if (idLen === 1 && (idBytes[0] === 0 || idBytes[0] === 1)) {
    name = idBytes[0] === 0 ? '.' : '..'
  } else {
    name = idBytes.toString('latin1').split(';')[0] // strip ";1" version
  }
  return { len, extent, size, isDir: (flags & 2) !== 0, name }
}

function readDir(fd, lba, size) {
  const out = []
  const sectors = Math.ceil(size / SECTOR)
  for (let s = 0; s < sectors; s++) {
    const buf = readSector(fd, lba + s)
    let off = 0
    while (off < SECTOR) {
      const rec = parseDirRecord(buf, off)
      if (!rec) break // 0-length → rest of this sector is padding
      if (rec.name !== '.' && rec.name !== '..') out.push(rec)
      off += rec.len
    }
  }
  return out
}

/** List every file in the ISO as { path, extent, size }. */
function listFiles(isoPath) {
  const fd = fs.openSync(isoPath, 'r')
  try {
    // Primary Volume Descriptor lives at sector 16; its root directory record
    // is a 34-byte structure at offset 156.
    const pvd = readSector(fd, 16)
    if (pvd.toString('latin1', 1, 6) !== 'CD001') throw new Error('Not an ISO9660 image')
    const root = parseDirRecord(pvd, 156)
    const files = []
    const walk = (lba, size, prefix) => {
      for (const rec of readDir(fd, lba, size)) {
        const p = prefix ? `${prefix}/${rec.name}` : rec.name
        if (rec.isDir) walk(rec.extent, rec.size, p)
        else files.push({ path: p, extent: rec.extent, size: rec.size })
      }
    }
    walk(root.extent, root.size, '')
    return files
  } finally {
    fs.closeSync(fd)
  }
}

/** Copy one file out of the ISO to destPath, streaming sector by sector. */
function extractFile(isoPath, extent, size, destPath) {
  const fd = fs.openSync(isoPath, 'r')
  const out = fs.openSync(destPath, 'w')
  try {
    let remaining = size
    let lba = extent
    const buf = Buffer.alloc(SECTOR)
    while (remaining > 0) {
      fs.readSync(fd, buf, 0, SECTOR, lba * SECTOR)
      const n = Math.min(SECTOR, remaining)
      fs.writeSync(out, buf, 0, n)
      remaining -= n
      lba++
    }
  } finally {
    fs.closeSync(fd)
    fs.closeSync(out)
  }
}

// Video payloads on karaoke discs.
const VIDEO_EXT = ['vob', 'dat', 'mpg', 'mpeg', 'm2v', 'mpv', 'avi', 'mp4', 'vro']

function videoFiles(isoPath) {
  return listFiles(isoPath)
    .filter((f) => VIDEO_EXT.includes((f.path.split('.').pop() || '').toLowerCase()))
    // Skip tiny menu/segment stubs; keep real clips (> 1 MB).
    .filter((f) => f.size > 1024 * 1024)
    .sort((a, b) => a.path.localeCompare(b.path))
}

module.exports = { listFiles, extractFile, videoFiles, VIDEO_EXT }
