// Generates all app icons from build/icon.svg (full tile) and
// build/icon-foreground.svg (glyph only):
//
//   • build/icon.ico            — Windows .exe / installer / window header
//   • build/icons/*.png         — intermediate PNGs (gitignored)
//   • android mipmaps + splash  — launcher icons, adaptive foreground, splash
//                                 (only when the android/ project exists)
//
//   npm run icons
//
// Requires: sharp, png-to-ico (devDependencies).
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const here = dirname(fileURLToPath(import.meta.url))
const svgPath = join(here, 'icon.svg')
const foregroundSvgPath = join(here, 'icon-foreground.svg')
const iconsDir = join(here, 'icons')
const icoPath = join(here, 'icon.ico')
const androidRes = join(here, '..', 'android', 'app', 'src', 'main', 'res')

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const SPLASH_BG = '#0d0d1a'

// Sizes embedded in the .ico. 16–256 covers taskbar, title-bar, alt-tab,
// Explorer list/detail/large-icon views, and high-DPI.
const icoSizes = [16, 24, 32, 48, 64, 128, 256]

// Android launcher icon size per density bucket; adaptive foreground is 1.5x.
const androidDensities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }

// Splash portrait size per density bucket (landscape swaps the two).
const splashPortrait = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
}

function renderSvg(svg, size) {
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer()
}

async function generateIco(svg) {
  const pngPaths = []
  for (const size of icoSizes) {
    const out = join(iconsDir, `icon-${size}.png`)
    await writeFile(out, await renderSvg(svg, size))
    pngPaths.push(out)
  }
  await writeFile(icoPath, await pngToIco(pngPaths))
  console.log(`Wrote ${icoPath} (${icoSizes.join(', ')} px)`)
}

async function generateAndroid(svg, foregroundSvg) {
  for (const [density, size] of Object.entries(androidDensities)) {
    const dir = join(androidRes, `mipmap-${density}`)
    await mkdir(dir, { recursive: true })
    const tile = await renderSvg(svg, size)
    await writeFile(join(dir, 'ic_launcher.png'), tile)
    await writeFile(join(dir, 'ic_launcher_round.png'), tile)

    // Adaptive foreground: glyph inside the ~61% safe zone of a 1.5x canvas.
    const canvas = Math.round(size * 1.5)
    const glyph = await renderSvg(foregroundSvg, Math.round(canvas * 0.55))
    const foreground = await sharp({
      create: { width: canvas, height: canvas, channels: 4, background: TRANSPARENT },
    })
      .composite([{ input: glyph, gravity: 'center' }])
      .png()
      .toBuffer()
    await writeFile(join(dir, 'ic_launcher_foreground.png'), foreground)
  }

  async function splash(width, height) {
    const glyph = await renderSvg(svg, Math.round(Math.min(width, height) * 0.3))
    return sharp({
      create: { width, height, channels: 4, background: SPLASH_BG },
    })
      .composite([{ input: glyph, gravity: 'center' }])
      .png()
      .toBuffer()
  }

  for (const [density, [w, h]] of Object.entries(splashPortrait)) {
    const portDir = join(androidRes, `drawable-port-${density}`)
    const landDir = join(androidRes, `drawable-land-${density}`)
    await mkdir(portDir, { recursive: true })
    await mkdir(landDir, { recursive: true })
    await writeFile(join(portDir, 'splash.png'), await splash(w, h))
    await writeFile(join(landDir, 'splash.png'), await splash(h, w))
  }
  await writeFile(join(androidRes, 'drawable', 'splash.png'), await splash(480, 320))
  console.log(`Wrote Android launcher icons + splash screens into ${androidRes}`)
}

async function main() {
  await mkdir(iconsDir, { recursive: true })
  const svg = await readFile(svgPath)
  await generateIco(svg)
  if (existsSync(androidRes)) {
    await generateAndroid(svg, await readFile(foregroundSvgPath))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
