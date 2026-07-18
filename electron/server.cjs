const http = require('http')
const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { WebSocketServer } = require('ws')

function lanIp() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address
    }
  }
  return '127.0.0.1'
}

function startRemoteServer({ port = 0, onCommand, onCountChange } = {}) {
  const token = crypto.randomBytes(24).toString('hex')
  const remoteHtml = fs.readFileSync(path.join(__dirname, 'remote.html'), 'utf8')
  const clients = new Set()
  let lastState = null
  let lastSongs = null

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/' || url.pathname === '/remote') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(remoteHtml)
      return
    }
    res.writeHead(404)
    res.end()
  })

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
      ws.on('message', (data) => {
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
      resolve({
        token,
        port: bound,
        ip,
        url: `http://${ip}:${bound}/?t=${token}`,
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
