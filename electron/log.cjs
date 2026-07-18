// Simple persistent logger. Errors (failed conversions, uncaught exceptions)
// are appended to a plain-text file in the app's userData folder so the user
// can open it and send it in when something goes wrong. Also mirrored to the
// console for `--enable-logging` runs.
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let logFile = null
function logPath() {
  if (!logFile) logFile = path.join(app.getPath('userData'), 'okara-log.txt')
  return logFile
}

function stamp() {
  try { return new Date().toISOString() } catch { return '' }
}

function log(...parts) {
  const line = `[${stamp()}] ${parts.map((p) => (p && p.stack) || String(p)).join(' ')}\n`
  try { fs.appendFileSync(logPath(), line) } catch { /* disk full / unwritable */ }
  try { console.error('[okara]', ...parts) } catch { /* */ }
}

module.exports = { log, logPath }
