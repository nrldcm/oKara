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

function startRemoteServer({ onCommand, onCountChange } = {}) {
  const token = crypto.randomBytes(24).toString('hex')
  const remoteHtml = fs.readFileSync(path.join(__dirname, 'remote.html'), 'utf8')
  const clients = new Set()
  let lastState = null

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

  return new Promise((resolve) => {
    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address()
      const ip = lanIp()
      resolve({
        token,
        port,
        ip,
        url: `http://${ip}:${port}/?t=${token}`,
        broadcastState(state) {
          lastState = state
          const payload = JSON.stringify({ type: 'state', state })
          clients.forEach((c) => { if (c.readyState === 1) c.send(payload) })
        },
      })
    })
  })
}

module.exports = { startRemoteServer }
