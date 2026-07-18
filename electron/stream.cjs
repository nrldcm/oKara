// Local media servers on 127.0.0.1 (host-local, never on the LAN).
//
//  • startMediaServer — serves a finished MP4 with HTTP Range (seekable), used
//    for materialized library files.
//  • startStreamServer — LIVE transcodes a disc/ISO track to a fragmented MP4
//    and streams it to the host <video> so it starts playing within ~1–2s,
//    like inserting a disc in a hardware player. No file is written. Clean
//    fragments (frag_keyframe+empty_moov) + regular keyframes avoid the old
//    "datamosh" that a half-formed fMP4 caused.
const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { ffmpegPath } = require('./transcode.cjs')
let log = () => {}
try { ({ log } = require('./log.cjs')) } catch { /* optional */ }

const SECTOR = 2048

function startMediaServer(getAllowedRoots) {
  const token = crypto.randomBytes(16).toString('hex')

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname !== '/file' || url.searchParams.get('t') !== token) {
      res.writeHead(403); res.end(); return
    }
    const file = url.searchParams.get('path')
    const allowed = file && getAllowedRoots().some((r) => path.resolve(file).startsWith(r))
    if (!allowed) { res.writeHead(403); res.end(); return }

    let stat
    try { stat = fs.statSync(file) } catch { res.writeHead(404); res.end(); return }

    const range = req.headers.range
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range)
      const start = parseInt(m[1], 10)
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1
      res.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1,
      })
      fs.createReadStream(file, { start, end }).pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': stat.size,
      })
      fs.createReadStream(file).pipe(res)
    }
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        token,
        port,
        fileUrl: (p) => `http://127.0.0.1:${port}/file?t=${token}&path=${encodeURIComponent(p)}`,
        close: () => server.close(),
      })
    })
  })
}

// ffmpeg args to live-transcode DVD/VCD program streams → fragmented MP4 on
// stdout, fast enough for real-time (ultrafast/zerolatency) and deinterlaced.
function streamArgs(inputArg) {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-probesize', '50M', '-analyzeduration', '100M',
    '-fflags', '+genpts+igndts+discardcorrupt', '-err_detect', 'ignore_err',
    '-i', inputArg,
    '-filter_complex', '[0:v:0]bwdif=mode=send_frame[v]',
    '-map', '[v]', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '500000',
    'pipe:1',
  ]
}

function startStreamServer(getAllowedRoots) {
  const token = crypto.randomBytes(16).toString('hex')

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname !== '/stream' || url.searchParams.get('t') !== token) {
      res.writeHead(403); res.end(); return
    }
    const file = url.searchParams.get('path')
    const iso = url.searchParams.get('iso')
    const extent = parseInt(url.searchParams.get('extent') || '0', 10)
    const size = parseInt(url.searchParams.get('size') || '0', 10)
    const src = iso || file
    const roots = getAllowedRoots()
    if (!src || !roots.some((r) => path.resolve(src).startsWith(path.resolve(r)))) {
      res.writeHead(403); res.end(); return
    }

    // ISO track → feed the extent byte range to ffmpeg stdin; disc/plain file →
    // read directly by path.
    let stdin = null
    const ff = spawn(ffmpegPath(), streamArgs(iso ? 'pipe:0' : file))
    if (iso) {
      stdin = fs.createReadStream(iso, { start: extent * SECTOR, end: extent * SECTOR + size - 1 })
      stdin.on('error', () => {})
      ff.stdin.on('error', () => {}) // EPIPE when playback stops
      stdin.pipe(ff.stdin)
    }

    let err = ''
    ff.stderr.on('data', (d) => { err += d.toString() })
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' })
    ff.stdout.pipe(res)

    const cleanup = () => {
      try { ff.kill('SIGKILL') } catch { /* gone */ }
      try { stdin && stdin.destroy() } catch { /* */ }
    }
    req.on('close', cleanup)
    ff.on('error', (e) => { log('stream ffmpeg error:', e); try { res.end() } catch { /* */ } })
    ff.on('close', (code) => {
      if (code && code !== 0 && code !== 255) log('stream ffmpeg exit', code, err.slice(-800))
      try { res.end() } catch { /* */ }
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        token,
        port,
        streamUrl: (s) => s && s.iso
          ? `http://127.0.0.1:${port}/stream?t=${token}&iso=${encodeURIComponent(s.iso)}&extent=${s.extent}&size=${s.size}`
          : `http://127.0.0.1:${port}/stream?t=${token}&path=${encodeURIComponent(s.file)}`,
        close: () => server.close(),
      })
    })
  })
}

module.exports = { startMediaServer, startStreamServer }
