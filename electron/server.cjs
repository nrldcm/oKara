const http = require('http')
const https = require('https')
const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { WebSocketServer } = require('ws')
const selfsigned = require('selfsigned')

function lanIp() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address
    }
  }
  return '127.0.0.1'
}

// A self-signed cert so the remote can be served over HTTPS — browsers require
// a secure context for the phone-as-mic getUserMedia. The phone shows a
// one-time "not secure" warning to accept (expected for self-signed on a LAN).
let cachedCert = null
function selfSignedCert() {
  if (cachedCert) return cachedCert
  const attrs = [{ name: 'commonName', value: 'okara.local' }]
  const pems = selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames: [
      { type: 2, value: 'okara.local' },
      { type: 7, ip: lanIp() },
      { type: 7, ip: '127.0.0.1' },
    ] }],
  })
  cachedCert = { key: pems.private, cert: pems.cert }
  return cachedCert
}

function startRemoteServer({ port = 0, onCommand, onCountChange, onAudio } = {}) {
  const token = crypto.randomBytes(24).toString('hex')
  const remoteHtml = fs.readFileSync(path.join(__dirname, 'remote.html'), 'utf8')
  const clients = new Set()
  let lastState = null
  let lastSongs = null

  const handler = (req, res) => {
    const url = new URL(req.url, 'https://localhost')
    if (url.pathname === '/' || url.pathname === '/remote') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(remoteHtml)
      return
    }
    res.writeHead(404)
    res.end()
  }
  // HTTPS is required for the phone mic; fall back to HTTP if cert gen fails.
  let secure = true
  let server
  try {
    server = https.createServer(selfSignedCert(), handler)
  } catch {
    secure = false
    server = http.createServer(handler)
  }

  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname !== '/ws' || url.searchParams.get('t') !== token) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws)
      onCountChange?.(clients.size)
      if (lastState) ws.send(JSON.stringify({ type: 'state', state: lastState }))
      if (lastSongs) ws.send(JSON.stringify({ type: 'songs', songs: lastSongs }))
      ws.on('message', (data, isBinary) => {
        // Binary frames are phone-as-mic PCM (Int16 mono @ 16 kHz); text is JSON.
        if (isBinary) { onAudio?.(data); return }
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'cmd') onCommand?.({ action: msg.action, value: msg.value })
        } catch { /* ignore malformed */ }
      })
      ws.on('close', () => {
        clients.delete(ws)
        onCountChange?.(clients.size)
      })
    })
  })

  return new Promise((resolve, reject) => {
    server.on('error', reject) // e.g. EADDRINUSE on a fixed port
    server.listen(port || 0, '0.0.0.0', () => {
      const bound = server.address().port
      const ip = lanIp()
      const scheme = secure ? 'https' : 'http'
      resolve({
        token,
        port: bound,
        ip,
        secure,
        url: `${scheme}://${ip}:${bound}/?t=${token}`,
        close() {
          clients.forEach((c) => { try { c.terminate() } catch { /* already gone */ } })
          clients.clear()
          server.close()
        },
        broadcastState(state) {
          lastState = state
          const payload = JSON.stringify({ type: 'state', state })
          clients.forEach((c) => { if (c.readyState === 1) c.send(payload) })
        },
        broadcastSongs(songs) {
          lastSongs = songs
          const payload = JSON.stringify({ type: 'songs', songs })
          clients.forEach((c) => { if (c.readyState === 1) c.send(payload) })
        },
      })
    })
  })
}

module.exports = { startRemoteServer }
