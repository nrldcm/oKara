// Local HTTP server that live-transcodes a DVD/VCD track to fragmented MP4 and
// streams it to the host's <video> element — so a disc/ISO track plays
// immediately, no wait-for-full-conversion. ffmpeg converts on the fly as it
// plays. 127.0.0.1 only (host-local playback, never exposed to the LAN).
const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const { spawn } = require('child_process')
const { ffmpegPath } = require('./transcode.cjs')

const SECTOR = 2048

function ffmpegArgs(input) {
  return [
    // Robust input: bigger probe for VOB program streams, and skip corrupt /
    // out-of-order packets so a scratched or hard-to-read disc keeps playing
    // through the damage instead of breaking up (like a hardware player).
    '-probesize', '50M', '-analyzeduration', '100M',
    '-fflags', '+genpts+igndts+discardcorrupt',
    '-err_detect', 'ignore_err',
    '-i', input,
    // Deinterlace (DVD/VCD video is interlaced) — without this the combing
    // shows up as tearing that looks like a scratched disc. send_frame keeps
    // the frame rate so the live encode stays ahead of playback.
    '-filter_complex', '[0:v:0]bwdif=mode=send_frame[v]',
    '-map', '[v]',
    '-map', '0:a:0?',
    // veryfast (not ultrafast/zerolatency) — cleaner picture while still
    // encoding faster than real time so playback stays ahead.
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    '-max_muxing_queue_size', '1024',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4', 'pipe:1',
  ]
}

function startStreamServer(getAllowedRoots) {
  const token = crypto.randomBytes(16).toString('hex')

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname !== '/play' || url.searchParams.get('t') !== token) {
      res.writeHead(403); res.end(); return
    }
    const file = url.searchParams.get('file')
    const isoPath = url.searchParams.get('iso')

    // Only allow paths under roots we manage or a source the user picked.
    const okFile = (p) => p && getAllowedRoots().some((r) => require('path').resolve(p).startsWith(r))

    let ff
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' })

    if (isoPath && okFile(isoPath)) {
      const extent = parseInt(url.searchParams.get('extent'), 10)
      const size = parseInt(url.searchParams.get('size'), 10)
      ff = spawn(ffmpegPath(), ffmpegArgs('pipe:0'))
      pipeIsoTrack(isoPath, extent, size, ff.stdin)
    } else if (okFile(file)) {
      ff = spawn(ffmpegPath(), ffmpegArgs(file))
    } else {
      res.writeHead(400); res.end(); return
    }

    ff.stdout.pipe(res)
    ff.stderr.resume() // drain
    const kill = () => { try { ff.kill('SIGKILL') } catch { /* gone */ } }
    ff.on('error', kill)
    req.on('close', kill)
    res.on('close', kill)
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        token,
        port,
        streamUrl: (params) => {
          const q = new URLSearchParams({ t: token, ...params })
          return `http://127.0.0.1:${port}/play?${q.toString()}`
        },
        close: () => server.close(),
      })
    })
  })
}

// Read a track's sectors out of the ISO and feed ffmpeg's stdin, so a track
// plays without first extracting the whole (possibly 1 GB) file to disk.
function pipeIsoTrack(isoPath, extent, size, dest) {
  const fd = fs.openSync(isoPath, 'r')
  let remaining = size
  let lba = extent
  const buf = Buffer.alloc(SECTOR)
  const pump = () => {
    let ok = true
    while (remaining > 0 && ok) {
      fs.readSync(fd, buf, 0, SECTOR, lba * SECTOR)
      const n = Math.min(SECTOR, remaining)
      ok = dest.write(buf.subarray(0, n))
      remaining -= n
      lba++
    }
    if (remaining <= 0) { try { dest.end() } catch { /* */ } fs.closeSync(fd) }
    else dest.once('drain', pump)
  }
  dest.on('error', () => { try { fs.closeSync(fd) } catch { /* */ } })
  pump()
}

module.exports = { startStreamServer }
