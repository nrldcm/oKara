// Generates the Windows .ico (used for the .exe icon and the app window
// header) plus PNG variants from build/icon.svg.
//
//   npm run icons
//
// Requires: sharp, png-to-ico (installed on demand; see package.json note).
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const here = dirname(fileURLToPath(import.meta.url))
const svgPath = join(here, 'icon.svg')
const iconsDir = join(here, 'icons')
const icoPath = join(here, 'icon.ico')

// Sizes embedded in the .ico. 16–256 covers taskbar, title-bar, alt-tab,
// Explorer list/detail/large-icon views, and high-DPI.
const sizes = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  await mkdir(iconsDir, { recursive: true })
  const svg = await readFile(svgPath)

  const pngPaths = []
  for (const size of sizes) {
    const out = join(iconsDir, `icon-${size}.png`)
    await sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out)
    pngPaths.push(out)
  }

  const ico = await pngToIco(pngPaths)
  await writeFile(icoPath, ico)
  console.log(`Wrote ${icoPath} (${sizes.join(', ')} px) and ${pngPaths.length} PNGs.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
