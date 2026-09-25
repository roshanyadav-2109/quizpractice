/**
 * Cuts a generated sheet of icons into one file per icon.
 *
 *   npm run icons:cut -- <sheet.png> <sheet number>
 *
 * The sheet is a grid three icons across, in the order design/icon-sheets.json
 * lists for that sheet. Each icon lands in public/art/<kind>/<slug>.png as a
 * 256×256 transparent square, and src/lib/art-manifest.json is rewritten so
 * the site knows which icons exist.
 *
 * A sheet with its background already removed is used as it is. An opaque one
 * has its white background cleared by flooding in from the edges, which keeps
 * the white fills inside the drawings.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const SIZE = 256
/** Transparent space kept around each drawing, as a share of its side. */
const MARGIN = 0.06
/** Alpha above which a pixel counts as part of a drawing. */
const SOLID = 40

interface SheetMap {
  reuse: Record<string, string>
  sheets: { sheet: number; files: string[] }[]
}

async function main() {
  const [input, sheetArg] = process.argv.slice(2)
  if (!input || !sheetArg) {
    console.error('Usage: npm run icons:cut -- <sheet.png> <sheet number>')
    process.exit(1)
  }

  const map = JSON.parse(readFileSync('design/icon-sheets.json', 'utf8')) as SheetMap
  const sheet = map.sheets.find((entry) => entry.sheet === Number(sheetArg))
  if (!sheet) {
    console.error(`No sheet ${sheetArg} in design/icon-sheets.json.`)
    process.exit(1)
  }

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const pixels = W * H

  let opaque = true
  for (let i = 0; i < pixels && opaque; i++) if (data[i * 4 + 3] < 250) opaque = false
  if (opaque) clearBackground(data, W, H)

  const solid = new Uint8Array(pixels)
  for (let i = 0; i < pixels; i++) solid[i] = data[i * 4 + 3] > SOLID ? 1 : 0

  const columns = 3
  const rows = Math.ceil(sheet.files.length / columns)
  const yCuts = cuts(H, rows, (y) => {
    let n = 0
    for (let x = 0; x < W; x++) n += solid[y * W + x]
    return n
  })
  // Each row is split on its own drawings, so a clear line in one row is not
  // lost to a drawing in another that strays across it. A last row with fewer
  // icons may be centred rather than on the grid, so it is split at the widest
  // gaps between its drawings instead.
  const rowCuts = (row: number) => {
    const count = Math.min(columns, sheet.files.length - row * columns)
    const amountAt = (x: number) => {
      let n = 0
      for (let y = yCuts[row]; y < yCuts[row + 1]; y++) n += solid[y * W + x]
      return n
    }
    if (count === columns) return cuts(W, count, amountAt)
    return gapCuts(W, count, amountAt) ?? cuts(W, count, amountAt)
  }

  for (const [index, file] of sheet.files.entries()) {
    const col = index % columns
    const row = Math.floor(index / columns)
    const across = rowCuts(row)
    const cell = { x0: across[col], x1: across[col + 1], y0: yCuts[row], y1: yCuts[row + 1] }
    const box = drawingBounds(data, solid, W, cell)
    if (!box) {
      console.log(`  ${file.padEnd(34)} empty cell, skipped`)
      continue
    }

    // Square around the drawing, with a margin, centred on it.
    const side = Math.ceil(Math.max(box.x1 - box.x0, box.y1 - box.y0) * (1 + 2 * MARGIN))
    const cx = (box.x0 + box.x1) / 2
    const cy = (box.y0 + box.y1) / 2
    const left = Math.round(cx - side / 2)
    const top = Math.round(cy - side / 2)

    const square = Buffer.alloc(side * side * 4)
    for (let y = 0; y < side; y++) {
      const sy = top + y
      if (sy < cell.y0 || sy >= cell.y1) continue
      for (let x = 0; x < side; x++) {
        const sx = left + x
        if (sx < cell.x0 || sx >= cell.x1) continue
        data.copy(square, (y * side + x) * 4, (sy * W + sx) * 4, (sy * W + sx) * 4 + 4)
      }
    }

    const out = join('public', 'art', `${file}.png`)
    mkdirSync(dirname(out), { recursive: true })
    await sharp(square, { raw: { width: side, height: side, channels: 4 } })
      .resize(SIZE, SIZE, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9, palette: false })
      .toFile(out)
    console.log(`  ${file.padEnd(34)} ${out}`)
  }

  writeManifest(map.reuse)
}

/**
 * Where to split a sheet into `count` bands: at the emptiest line near each
 * even division, so a drawing that strays past its share is not cut through.
 */
function cuts(length: number, count: number, amountAt: (i: number) => number): number[] {
  const profile = Array.from({ length }, (_, i) => amountAt(i))
  const result = [0]
  for (let k = 1; k < count; k++) {
    const target = Math.round((length * k) / count)
    const reach = Math.round(length / (count * 4))
    let best = target
    let bestScore = Infinity
    for (let i = Math.max(3, target - reach); i < Math.min(length - 3, target + reach); i++) {
      // Smoothed, so one clear line between two busy ones does not win.
      let score = 0
      for (let j = -3; j <= 3; j++) score += profile[i + j]
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    result.push(best)
  }
  result.push(length)
  return result
}

/**
 * Where to split a band into `count` pieces: through the middle of the widest
 * empty runs between drawings. Null when there are not enough of them.
 */
function gapCuts(length: number, count: number, amountAt: (i: number) => number): number[] | null {
  const runs: { start: number; end: number }[] = []
  let start = -1
  for (let i = 0; i <= length; i++) {
    const empty = i < length && amountAt(i) === 0
    if (empty && start === -1) start = i
    if (!empty && start !== -1) {
      // Only runs between drawings, not the margins at either end.
      if (start > 0 && i < length) runs.push({ start, end: i })
      start = -1
    }
  }
  if (runs.length < count - 1) return null
  const widest = runs
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, count - 1)
    .map((run) => Math.round((run.start + run.end) / 2))
    .sort((a, b) => a - b)
  return [0, ...widest, length]
}

/**
 * The extent of the drawing in one cell. Stray specks left by background
 * removal are erased; small pieces close to the drawing, such as the droplets
 * of an ink splash, are kept.
 */
function drawingBounds(
  data: Buffer,
  solid: Uint8Array,
  W: number,
  cell: { x0: number; x1: number; y0: number; y1: number },
) {
  const cw = cell.x1 - cell.x0
  const ch = cell.y1 - cell.y0
  const label = new Int32Array(cw * ch).fill(-1)
  const parts: { pixels: number[]; x0: number; x1: number; y0: number; y1: number }[] = []

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const at = y * cw + x
      if (label[at] !== -1 || !solid[(cell.y0 + y) * W + cell.x0 + x]) continue
      const part = { pixels: [] as number[], x0: x, x1: x, y0: y, y1: y }
      const stack = [at]
      label[at] = parts.length
      while (stack.length) {
        const p = stack.pop()!
        part.pixels.push(p)
        const px = p % cw
        const py = (p - px) / cw
        part.x0 = Math.min(part.x0, px)
        part.x1 = Math.max(part.x1, px)
        part.y0 = Math.min(part.y0, py)
        part.y1 = Math.max(part.y1, py)
        for (const [nx, ny] of [
          [px + 1, py],
          [px - 1, py],
          [px, py + 1],
          [px, py - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue
          const n = ny * cw + nx
          if (label[n] !== -1 || !solid[(cell.y0 + ny) * W + cell.x0 + nx]) continue
          label[n] = parts.length
          stack.push(n)
        }
      }
      parts.push(part)
    }
  }

  const major = parts.filter((part) => part.pixels.length >= cw * ch * 0.003)
  if (major.length === 0) return null
  const main = {
    x0: Math.min(...major.map((p) => p.x0)),
    x1: Math.max(...major.map((p) => p.x1)),
    y0: Math.min(...major.map((p) => p.y0)),
    y1: Math.max(...major.map((p) => p.y1)),
  }
  const pad = Math.max(main.x1 - main.x0, main.y1 - main.y0) * 0.08
  const near = (p: (typeof parts)[number]) =>
    p.x1 >= main.x0 - pad && p.x0 <= main.x1 + pad && p.y1 >= main.y0 - pad && p.y0 <= main.y1 + pad

  const box = { ...main }
  for (const part of parts) {
    if (major.includes(part)) continue
    if (near(part)) {
      box.x0 = Math.min(box.x0, part.x0)
      box.x1 = Math.max(box.x1, part.x1)
      box.y0 = Math.min(box.y0, part.y0)
      box.y1 = Math.max(box.y1, part.y1)
      continue
    }
    for (const p of part.pixels) {
      const px = p % cw
      const py = (p - px) / cw
      data[((cell.y0 + py) * W + cell.x0 + px) * 4 + 3] = 0
    }
  }

  return { x0: cell.x0 + box.x0, x1: cell.x0 + box.x1 + 1, y0: cell.y0 + box.y0, y1: cell.y0 + box.y1 + 1 }
}

/** Clears near-white connected to the sheet's edges; enclosed white stays. */
function clearBackground(data: Buffer, W: number, H: number) {
  const light = (i: number) => data[i * 4] > 235 && data[i * 4 + 1] > 235 && data[i * 4 + 2] > 235
  const seen = new Uint8Array(W * H)
  const stack: number[] = []
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x)
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1)
  while (stack.length) {
    const i = stack.pop()!
    if (seen[i] || !light(i)) continue
    seen[i] = 1
    data[i * 4 + 3] = 0
    const x = i % W
    if (x > 0) stack.push(i - 1)
    if (x < W - 1) stack.push(i + 1)
    if (i >= W) stack.push(i - W)
    if (i < W * (H - 1)) stack.push(i + W)
  }
}

/** Lists every icon in public/art, plus the reused ones, for the site to read. */
function writeManifest(reuse: Record<string, string>) {
  const root = join('public', 'art')
  const manifest: Record<string, string> = {}
  for (const kind of readdirSync(root, { withFileTypes: true })) {
    if (!kind.isDirectory()) continue
    for (const file of readdirSync(join(root, kind.name))) {
      if (file.endsWith('.png')) manifest[`${kind.name}/${file.slice(0, -4)}`] = `/art/${kind.name}/${file}`
    }
  }
  for (const [alias, source] of Object.entries(reuse)) {
    if (manifest[source]) manifest[alias] = manifest[source]
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(join('src', 'lib', 'art-manifest.json'), JSON.stringify(sorted, null, 2) + '\n')
  console.log(`\n${Object.keys(sorted).length} icon(s) in src/lib/art-manifest.json`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
