// Local media server: serves a finished MP4 (with HTTP Range for seeking) to
// the host's <video>. Disc/ISO tracks are transcoded to a complete temp MP4
// first (proper keyframes + moov) and played from here — live-streaming a
// half-formed fMP4 into <video> produced datamoshing (missing keyframes), so
// we play a real file instead. 127.0.0.1 only (host-local, never on the LAN).
const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

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

module.exports = { startMediaServer }
