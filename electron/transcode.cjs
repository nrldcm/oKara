// Transcodes DVD/VCD video (MPEG-2 VOB, MPEG-1 DAT, etc.) to MP4 (H.264 + AAC)
// with a bundled ffmpeg, so it plays in the Chromium/WebView player like any
// other import. Stereo channels are preserved for the voice-on/off trick.
const { spawn } = require('child_process')
const fs = require('fs')

function ffmpegPath() {
  // @ffmpeg-installer resolves a platform binary from npm (no external
  // download). In a packaged app the path points inside app.asar.unpacked.
  let p = require('@ffmpeg-installer/ffmpeg').path
  return p.replace('app.asar' + require('path').sep, 'app.asar.unpacked' + require('path').sep)
    .replace('app.asar/', 'app.asar.unpacked/')
}

/**
 * Transcode `input` → `output` (.mp4). onProgress(fraction 0..1) is called as
 * it runs (parsed from ffmpeg's time= against the probed duration).
 * Resolves on success, rejects on failure.
 *
 * opts: { preset, threads } — `preset` is the x264 speed/quality preset
 * (default 'superfast', a good speed/quality balance for DVD/VCD); `threads`
 * caps ffmpeg's encode threads so several parallel transcodes don't fight over
 * every core (0 = ffmpeg auto, use all cores — best for a single track).
 */
function transcode(input, output, onProgress, opts = {}) {
  const preset = opts.preset || 'superfast'
  const threads = String(opts.threads == null ? 0 : opts.threads)
  return new Promise((resolve, reject) => {
    probeDuration(input).then((durationSec) => {
      const args = [
        '-y',
        // Robust input for DVD/VCD program streams — skip corrupt/out-of-order
        // packets so a scratched disc still converts cleanly.
        '-probesize', '50M', '-analyzeduration', '100M',
        '-fflags', '+genpts+igndts+discardcorrupt',
        '-err_detect', 'ignore_err',
        '-i', input,
        // Deinterlace DVD/VCD video — otherwise the interlacing combing looks
        // like a scratched disc on playback.
        '-filter_complex', '[0:v:0]bwdif=mode=send_frame[v]',
        '-map', '[v]',
        '-map', '0:a:0?',
        '-threads', threads,
        '-c:v', 'libx264',
        '-preset', preset,
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2', // keep stereo for the L/R minus-one trick
        '-max_muxing_queue_size', '1024',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart',
        output,
      ]
      const ff = spawn(ffmpegPath(), args)
      let stderr = ''
      ff.stderr.on('data', (d) => {
        stderr += d.toString()
        const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(d.toString())
        if (m && durationSec > 0 && onProgress) {
          const t = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])
          onProgress(Math.min(0.999, t / durationSec))
        }
      })
      ff.on('error', reject)
      ff.on('close', (code) => {
        if (code === 0) { onProgress && onProgress(1); resolve(output) }
        else reject(new Error('ffmpeg failed (' + code + '): ' + stderr.slice(-500)))
      })
    }).catch(reject)
  })
}

function probeDuration(input) {
  return new Promise((resolve) => {
    const ff = spawn(ffmpegPath(), ['-i', input])
    let s = ''
    ff.stderr.on('data', (d) => { s += d.toString() })
    ff.on('error', () => resolve(0))
    ff.on('close', () => {
      const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(s)
      resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0)
    })
  })
}

module.exports = { transcode, ffmpegPath }
